// app/api/player/sync/route.ts
// Sync compte joueur Hypixel → player_data
// GET /api/player/sync?username=Steve
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { decodeItemListBytes } from '../../../../lib/skyblock-item-decoder'
import { createClient as createServerSupabaseClient } from '../../../../lib/supabase-server'

export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

// ── Helpers ───────────────────────────────────────────────────
function calcSkillLevel(xp: number, caps: number[]): number {
  let level = 0
  let total = 0
  for (const cap of caps) {
    total += cap
    if (xp >= total) level++
    else break
  }
  return level
}

// XP requis par level pour les skills standards
const SKILL_XP = [50,125,200,300,500,750,1000,1500,2000,3500,5000,7500,10000,15000,20000,30000,50000,75000,100000,200000,300000,400000,500000,600000,700000,800000,900000,1000000,1100000,1200000,1300000,1400000,1500000,1600000,1700000,1800000,1900000,2000000,2100000,2200000,2300000,2400000,2500000,2600000,2750000,2900000,3100000,3400000,3700000,4000000,4300000,4600000,4900000,5200000,5500000,5800000,6100000,6400000,6700000,7000000]
const RUNECRAFTING_XP = [50,100,125,160,200,250,315,400,500,625,785,1000,1250,1600,2000,2465,3125,4000,5000,6200,7800,9800,12200,15200,19050,23750,30000,38000,48000,60000,75000,93500,116500,145000,181000,226000,282000,352000,440000,550000]

function getSkillLevel(skillName: string, xp: number): number {
  const xpTable = skillName === 'RUNECRAFTING' ? RUNECRAFTING_XP : SKILL_XP
  return calcSkillLevel(xp, xpTable)
}

// Decode un blob NBT multi-items en liste plate (inventaire, enderchest, accessory bag...)
// Garde variant_key_full/variant_key_base : cles de jointure prix (price_history_ah),
// sans elles le calcul de networth ne peut matcher aucun prix.
function decodeItemList(bytesBase64: string | undefined) {
  if (!bytesBase64) return []
  return decodeItemListBytes(bytesBase64)
    .map((item, index) => item ? { slot: index, ...item } : null)
    .filter((item): item is NonNullable<typeof item> => !!item)
    .map(item => ({
      slot:             item.slot,
      item_id:          item.item_id,
      item_name:        item.item_name,
      item_count:       item.item_count,
      reforge:          item.reforge,
      stars:            item.total_stars,
      is_recomb:        item.is_recomb,
      enchantments:     item.enchantments,
      gems:             item.gems,
      variant_key_full: item.variant_key_full,
      variant_key_base: item.variant_key_base,
    }))
}

// Champs minimaux necessaires pour pricer un item (utilise par calculateNetworth)
type PriceableItem = { item_id: string; variant_key_full: string; variant_key_base: string; item_count: number }

// Seuils networth alignes sur les bandes deja validees de Money Making (TIER_CONFIG,
// money-making-agent/route.ts) — 0-50M/50M-500M/500M-5B/5B+ — plutot que d'en inventer
// de nouveaux. Remplace les anciens seuils (5M/100M/1B) calibres a l'epoque ou
// networth = purse+bank uniquement, desormais obsoletes puisque networth inclut le gear.
// Amelioration incrementale, pas la version finale : a terme game_stage devrait etre un
// score composite (skills + catacombs/slayer + qualite reelle du gear), pas juste
// networth+avgSkill — voir CLAUDE.md.
function detectGameStage(skills: Record<string, number>, slayers: Record<string, number>, networth: number): string {
  const avgSkill  = Object.values(skills).reduce((s, v) => s + v, 0) / Object.keys(skills).length
  const maxSlayer = Math.max(...Object.values(slayers))

  if (networth < 50_000_000   || avgSkill < 10) return 'EARLY'
  if (networth < 500_000_000  || avgSkill < 25) return 'MID'
  if (networth < 5_000_000_000 || avgSkill < 40) return 'END'
  return 'LATE'
}

// ── Networth ──────────────────────────────────────────────────
type CategoryBreakdown = { value: number; items_priced: number; items_unpriced: number }
type NetworthBreakdown = {
  total: number
  purse: number
  bank: number
  items_total: number
  categories: Record<string, CategoryBreakdown>
  calculated_at: string
}

// Garde la ligne au bucket_date le plus recent par cle (evite un ORDER BY + DISTINCT ON
// cote SQL, fait ici cote JS sur un resultat deja filtre/petit)
function pickLatestPriceByKey(rows: { key: string; price: number; date: string }[]): Map<string, number> {
  const latest = new Map<string, { price: number; date: string }>()
  for (const r of rows) {
    if (r.price <= 0) continue
    const prev = latest.get(r.key)
    if (!prev || r.date > prev.date) latest.set(r.key, { price: r.price, date: r.date })
  }
  return new Map(Array.from(latest, ([k, v]) => [k, v.price]))
}

function betterPrice(sellPrice: any, avgPrice: any): number {
  const sell = Number(sellPrice) || 0
  if (sell > 0) return sell
  return Number(avgPrice) || 0
}

// Calcule le networth complet (purse+bank+items) en 2 requetes batch (pas une par item) :
// 1) price_history_ah_variants pour tous les item_id concernes (variant_key exact, puis
//    variant_key_base en repli) 2) price_history (source BAZAAR) pour les item_id restants,
//    non trouves en AH. Jamais bloquant : un item sans prix trouve vaut 0, ne fait pas echouer
//    le sync.
// IMPORTANT : price_history_ah (sans suffixe) n'est PAS utilisable ici — ses rows DAILY sont
// une moyenne unique par item toutes variantes confondues, ecrites avec un variant_key
// placeholder ('nostar_norecomb_noreforge', voir ah-aggregate/route.ts) qui ne correspond a
// aucun etat reel d'item. Seule price_history_ah_variants contient un variant_key/variant_key_base
// fiable par variante (deja filtre scan_count >= 3 a l'ecriture).
async function calculateNetworth(
  supabase: any,
  purse: number,
  bank: number,
  categorizedItems: Record<string, PriceableItem[]>
): Promise<NetworthBreakdown> {
  const allItems     = Object.values(categorizedItems).flat()
  const uniqueItemIds = Array.from(new Set(allItems.map(i => i.item_id)))
  const emptyCategories = Object.fromEntries(
    Object.keys(categorizedItems).map(k => [k, { value: 0, items_priced: 0, items_unpriced: 0 } as CategoryBreakdown])
  )

  if (uniqueItemIds.length === 0) {
    return { total: purse + bank, purse, bank, items_total: 0, categories: emptyCategories, calculated_at: new Date().toISOString() }
  }

  const sinceDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // ── Tier 1+2 : price_history_ah_variants, exact (variant_key) puis base (variant_key_base) ──
  const { data: ahRows } = await supabase
    .from('price_history_ah_variants')
    .select('base_item_id, variant_key, variant_key_base, sell_price, avg_price, bucket_date')
    .in('base_item_id', uniqueItemIds)
    .gte('bucket_date', sinceDate)

  const exactRows: { key: string; price: number; date: string }[] = []
  const baseRows:  { key: string; price: number; date: string }[] = []
  const itemIdsWithAhPrice = new Set<string>()

  for (const row of (ahRows || []) as any[]) {
    const price = betterPrice(row.sell_price, row.avg_price)
    if (price <= 0) continue
    exactRows.push({ key: `${row.base_item_id}|${row.variant_key}`, price, date: row.bucket_date })
    itemIdsWithAhPrice.add(row.base_item_id)
    if (row.variant_key_base) {
      baseRows.push({ key: `${row.base_item_id}|${row.variant_key_base}`, price, date: row.bucket_date })
    }
  }

  const exactPriceMap = pickLatestPriceByKey(exactRows)
  const basePriceMap  = pickLatestPriceByKey(baseRows)

  // ── Tier 3 : price_history (BAZAAR), uniquement pour les item_id absents de l'AH ──
  const bazaarCandidateIds = uniqueItemIds.filter(id => !itemIdsWithAhPrice.has(id))
  let bazaarPriceMap = new Map<string, number>()

  if (bazaarCandidateIds.length > 0) {
    const { data: bazaarRows } = await supabase
      .from('price_history')
      .select('item_id, sell_price, avg_price, bucket_date')
      .eq('source', 'BAZAAR')
      .in('item_id', bazaarCandidateIds)
      .gte('bucket_date', sinceDate)

    const rows = ((bazaarRows || []) as any[])
      .map(row => ({ key: row.item_id, price: betterPrice(row.sell_price, row.avg_price), date: row.bucket_date }))
    bazaarPriceMap = pickLatestPriceByKey(rows)
  }

  const priceForItem = (item: PriceableItem): number => {
    const exact = exactPriceMap.get(`${item.item_id}|${item.variant_key_full}`)
    if (exact !== undefined) return exact
    const base = basePriceMap.get(`${item.item_id}|${item.variant_key_base}`)
    if (base !== undefined) return base
    return bazaarPriceMap.get(item.item_id) ?? 0
  }

  const categories: Record<string, CategoryBreakdown> = {}
  let itemsTotal = 0

  for (const [category, items] of Object.entries(categorizedItems)) {
    let value = 0, priced = 0, unpriced = 0
    for (const item of items) {
      const unitPrice = priceForItem(item)
      if (unitPrice > 0) { value += unitPrice * (item.item_count || 1); priced++ }
      else { unpriced++ }
    }
    categories[category] = { value: Math.round(value), items_priced: priced, items_unpriced: unpriced }
    itemsTotal += value
  }

  return {
    total:       Math.round(purse + bank + itemsTotal),
    purse, bank,
    items_total: Math.round(itemsTotal),
    categories,
    calculated_at: new Date().toISOString(),
  }
}

// ── Handler ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Auth de base : il faut une session Vault reelle pour appeler cette route.
  // user_id vient de la session authentifiee, plus jamais d'un query param
  // falsifiable. Ne resout pas encore "quel compte Hypixel appartient a quel
  // utilisateur" (aucun flux de liaison n'existe pour l'instant — voir CLAUDE.md),
  // mais ferme deja l'abus anonyme total.
  const serverClient = await createServerSupabaseClient()
  const { data: { user: authUser } } = await serverClient.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const username  = req.nextUrl.searchParams.get('username')
  const userId    = authUser.id
  const profileId = req.nextUrl.searchParams.get('profile_id')
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })

  try {
    // 1. UUID depuis Mojang API (pas Hypixel)
    const mojangRes  = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`
    )
    if (!mojangRes.ok) return NextResponse.json({ error: 'Player not found on Mojang' }, { status: 404 })
    const mojangData = await mojangRes.json()
    const uuid = mojangData.id
      ? `${mojangData.id.slice(0,8)}-${mojangData.id.slice(8,12)}-${mojangData.id.slice(12,16)}-${mojangData.id.slice(16,20)}-${mojangData.id.slice(20)}`
      : null
    if (!uuid) return NextResponse.json({ error: 'Invalid username' }, { status: 404 })
    if (!uuid) return NextResponse.json({ error: 'Invalid username' }, { status: 404 })

    // 2. Profil Skyblock
    const profileRes  = await fetch(
      `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`,
      { headers: { 'API-Key': HYPIXEL_KEY } }
    )
    const profileData = await profileRes.json()
    const profiles    = profileData.profiles || []

    // Un joueur a potentiellement plusieurs profils Skyblock (coop, iles abandonnees, etc.),
    // chacun avec sa propre progression stockee independamment (voir profile_id sur player_data).
    // Si profile_id est fourni explicitement, on cible ce profil precis. Sinon, on prend le profil
    // "selected" cote Hypixel — ca reflete le profil que le joueur a actuellement ouvert en jeu,
    // c'est le bon defaut, pas un fallback approximatif.
    const profile = profileId
      ? profiles.find((p: any) => p.profile_id === profileId)
      : profiles.find((p: any) => p.selected) || profiles[profiles.length - 1]
    if (!profile) return NextResponse.json({ error: 'No matching Skyblock profile found' }, { status: 404 })

    const member = profile.members?.[uuid.replace(/-/g, '')]
    if (!member) return NextResponse.json({ error: 'Player data not found in profile' }, { status: 404 })

    // 3. Extrait les skills
    const skillXP: Record<string, number> = {}
    const skillLevels: Record<string, number> = {}
    const SKILLS = ['FARMING','MINING','COMBAT','FORAGING','FISHING','ENCHANTING','ALCHEMY','CARPENTRY','RUNECRAFTING','SOCIAL','TAMING']
    for (const skill of SKILLS) {
      const xp = member.player_data?.experience?.[`SKILL_${skill}`] ?? 0
      skillXP[skill.toLowerCase()]     = xp
      skillLevels[skill.toLowerCase()] = getSkillLevel(skill, xp)
    }

    // 4. Extrait les slayers
    const slayers: Record<string, any> = {}
    const slayerData = member.slayer?.slayer_bosses || {}
    for (const [name, data] of Object.entries(slayerData as Record<string, any>)) {
      slayers[name.toLowerCase()] = {
        xp:    data.xp ?? 0,
        kills: Object.entries(data).filter(([k]) => k.startsWith('boss_kills_tier')).reduce((s, [, v]) => s + (v as number), 0)
      }
    }

    // 5. Extrait les dungeons
    const dungeons: Record<string, any> = {}
    const dungeonData = member.dungeons?.dungeon_types || {}
    for (const [type, data] of Object.entries(dungeonData as Record<string, any>)) {
      dungeons[type] = {
        highest_floor: Math.max(-1, ...Object.keys(data.highest_tier_completed ? { [data.highest_tier_completed]: 1 } : {}).map(Number)),
        experience:    data.experience ?? 0,
        runs:          Object.values(data.times_played || {}).reduce((s: number, v) => s + (v as number), 0),
      }
    }

    // 5b. Heart of the Mountain / Skill Tree (mining + foraging) — vérifié contre le code
    // source de hypixel-api-reborn : les perks/nodes ne vivent PAS dans member.mining_core
    // (qui ne contient que powder/crystals/forge) mais dans member.skill_tree, un champ
    // séparé. On stocke les niveaux de node bruts (ex: mining_speed:9) plutôt que de
    // dériver un "tier" — la table XP→tier (getLevelByXp type mining_tree) n'a pas de
    // source vérifiée en interne, donc pas codée en dur ici (règle : jamais de constante
    // de jeu reconstituée de mémoire).
    function extractSkillTree(tree: 'mining' | 'foraging', tokenKey: 'mountain' | 'forest') {
      const nodes = member.skill_tree?.nodes?.[tree] || {}
      return {
        nodes:            Object.fromEntries(Object.entries(nodes).filter(([k]) => !k.startsWith('toggle_'))),
        experience:       member.skill_tree?.experience?.[tree] ?? 0,
        tokens_spent:     member.skill_tree?.tokens_spent?.[tokenKey] ?? 0,
        selected_ability: member.skill_tree?.selected_ability?.[tree] ?? null,
      }
    }
    const powderOf = (type: string) => ({
      powder: member.mining_core?.[`powder_${type}`] ?? 0,
      spent:  member.mining_core?.[`powder_spent_${type}`] ?? 0,
    })
    const hotmProgress = {
      mining:          extractSkillTree('mining', 'mountain'),
      foraging:        extractSkillTree('foraging', 'forest'),
      powder: {
        mithril:  powderOf('mithril'),
        gemstone: powderOf('gemstone'),
        glacite:  powderOf('glacite'),
      },
      pickaxe_ability: member.mining_core?.selected_pickaxe_ability ?? null,
    }

    // 6. Collections
    const collections: Record<string, number> = member.collection || {}

    // 7. Pets
    const pets = (member.pets_data?.pets || []).slice(0, 20).map((p: any) => ({
      type:     p.type,
      tier:     p.tier,
      level:    p.exp,
      active:   p.active ?? false,
      heldItem: p.heldItem,
    }))

    // 8. Inventaire summary (items équipés)
    const inventorySummary = {
      armor:     member.inventory?.inv_armor?.data ? 'has_armor' : null,
      equipment: member.inventory?.equipment_contents?.data ? 'has_equipment' : null,
      wardrobe:  member.inventory?.wardrobe_contents?.data ? 'has_wardrobe' : null,
    }

    // 8b. Armure équipée décodée (NBT, réutilise le décodeur ah-collect en mode multi-items)
    // Ordre confirmé sur un vrai profil : slot 0=boots, 1=leggings, 2=chestplate, 3=helmet.
    // On dérive quand même le "slot" depuis le suffixe de item_id plutôt que l'index brut,
    // pour rester correct si Hypixel change un jour l'ordre.
    const ARMOR_SLOT_SUFFIXES: Record<string, string> = {
      HELMET: 'helmet', CHESTPLATE: 'chestplate', LEGGINGS: 'leggings', BOOTS: 'boots',
    }
    const armorData = member.inventory?.inv_armor?.data
    const equippedArmor: Record<string, any> = {}
    if (armorData) {
      const decoded = decodeItemListBytes(armorData)
      decoded.forEach((item, index) => {
        if (!item) return
        const suffix = Object.keys(ARMOR_SLOT_SUFFIXES).find(s => item.item_id.endsWith(`_${s}`))
        const slotKey = suffix ? ARMOR_SLOT_SUFFIXES[suffix] : `slot_${index}`
        equippedArmor[slotKey] = {
          item_id:          item.item_id,
          item_name:        item.item_name,
          reforge:          item.reforge,
          stars:            item.total_stars,
          is_recomb:        item.is_recomb,
          enchantments:     item.enchantments,
          gems:             item.gems,
          item_count:       1,
          variant_key_full: item.variant_key_full,
          variant_key_base: item.variant_key_base,
        }
      })
    }

    // 8c. Accessory bag décodé (member.inventory.bag_contents.talisman_bag.data)
    const bagData = member.inventory?.bag_contents?.talisman_bag?.data
    const equippedAccessories = bagData
      ? decodeItemListBytes(bagData)
          .filter((item): item is NonNullable<typeof item> => !!item)
          .map(item => ({
            item_id:          item.item_id,
            item_name:        item.item_name,
            reforge:          item.reforge,
            stars:            item.total_stars,
            is_recomb:        item.is_recomb,
            enchantments:     item.enchantments,
            gems:             item.gems,
            item_count:       1,
            variant_key_full: item.variant_key_full,
            variant_key_base: item.variant_key_base,
          }))
      : []

    // 8d. Inventaire principal + enderchest décodés (member.inventory.inv_contents / ender_chest_contents)
    const inventoryItems  = decodeItemList(member.inventory?.inv_contents?.data)
    const enderChestItems = decodeItemList(member.inventory?.ender_chest_contents?.data)

    // 8f. Personal Vault (feature nommee "Vault", distincte des coffres poses sur l'ile —
    // ces derniers ne sont pas exposes par l'API Hypixel, voir CLAUDE.md)
    const personalVaultItems = decodeItemList(member.inventory?.personal_vault_contents?.data)

    // 8e. Backpacks (backpack_icons + backpack_contents, mappes par la meme cle slot —
    // verifie explicitement, pas suppose par ordre de tableau)
    const backpackIcons    = member.inventory?.backpack_icons || {}
    const backpackContents = member.inventory?.backpack_contents || {}
    const backpacks = Object.keys(backpackIcons)
      .filter(slot => backpackContents[slot]?.data)
      .map(slot => {
        const iconData = backpackIcons[slot]?.data
        const icon = iconData ? decodeItemListBytes(iconData).find(i => i) : null
        return {
          slot:           Number(slot),
          icon_item_id:   icon?.item_id ?? null,
          icon_item_name: icon?.item_name ?? null,
          items:          decodeItemList(backpackContents[slot]?.data),
        }
      })

    // 8g. Wardrobe (tenues sauvegardees, member.loadout.armor — objet indexe par slot "1".."27",
    // PAS des doublons de inv_armor : une tenue non portee est invisible partout ailleurs)
    const decodeOne = (bytesBase64: string | undefined) =>
      bytesBase64 ? decodeItemListBytes(bytesBase64).find(i => i) ?? null : null

    const loadoutArmor = member.loadout?.armor || {}
    const wardrobeSlots = Object.entries(loadoutArmor)
      .map(([key, slotData]: [string, any]) => {
        const helmet     = decodeOne(slotData?.HELMET?.data)
        const chestplate = decodeOne(slotData?.CHESTPLATE?.data)
        const leggings   = decodeOne(slotData?.LEGGINGS?.data)
        const boots      = decodeOne(slotData?.BOOTS?.data)
        return { slot: Number(key), helmet, chestplate, leggings, boots }
      })
      .filter(s => s.helmet || s.chestplate || s.leggings || s.boots)
      .map(s => {
        const piece = (item: typeof s.helmet) => item ? {
          item_id: item.item_id, item_name: item.item_name, reforge: item.reforge, stars: item.total_stars,
          enchantments: item.enchantments, gems: item.gems, item_count: 1,
          variant_key_full: item.variant_key_full, variant_key_base: item.variant_key_base,
        } : null
        return {
          slot:       s.slot,
          helmet:     piece(s.helmet),
          chestplate: piece(s.chestplate),
          leggings:   piece(s.leggings),
          boots:      piece(s.boots),
        }
      })

    // 9. Networth complet — purse+bank + valeur de marche de tous les items decodes
    const purse = Math.round(member.currencies?.coin_purse ?? 0)
    const bank  = Math.round(profile.banking?.balance ?? 0)

    const categorizedItems: Record<string, PriceableItem[]> = {
      equipped_armor:       Object.values(equippedArmor) as PriceableItem[],
      equipped_accessories: equippedAccessories as PriceableItem[],
      inventory_items:      inventoryItems as PriceableItem[],
      ender_chest_items:    enderChestItems as PriceableItem[],
      backpacks:            backpacks.flatMap(bp => bp.items) as PriceableItem[],
      personal_vault_items: personalVaultItems as PriceableItem[],
      wardrobe_slots:       wardrobeSlots.flatMap(s => [s.helmet, s.chestplate, s.leggings, s.boots])
                               .filter((p): p is NonNullable<typeof p> => !!p) as PriceableItem[],
    }

    const networthBreakdown = await calculateNetworth(supabase, purse, bank, categorizedItems)
    const networth = networthBreakdown.total

    // 10. Fairy souls
    const fairySouls = member.fairy_soul?.total_collected ?? 0

    // 11. Game stage
    const maxSlayerXP = Math.max(...Object.values(slayers).map((s: any) => s.xp || 0))
    const gameStage   = detectGameStage(skillLevels, Object.fromEntries(Object.entries(slayers).map(([k, v]: any) => [k, v.xp])), networth)

    // 12. Skin URL
    const skinUrl = `https://crafatar.com/renders/body/${uuid}?overlay=true&scale=4`

    // 13. Upsert dans player_data
    const playerRecord = {
      user_id:           userId || null,
      hypixel_username:  username,
      hypixel_uuid:      uuid,
      profile_id:        profile.profile_id,
      purse,
      bank,
      networth,
      networth_breakdown: networthBreakdown,
      skills:            skillLevels,
      slayers,
      dungeons,
      collections,
      pets,
      inventory_summary: inventorySummary,
      equipped_armor:        equippedArmor,
      equipped_accessories:  equippedAccessories,
      inventory_items:       inventoryItems,
      ender_chest_items:     enderChestItems,
      backpacks:             backpacks,
      personal_vault_items:  personalVaultItems,
      wardrobe_slots:        wardrobeSlots,
      hotm_progress:         hotmProgress,
      fairy_souls:       fairySouls,
      skin_url:          skinUrl,
      game_stage:        gameStage,
      raw_profile:       { skills_xp: skillXP },
      last_synced:       new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }

    const { error } = await supabase
      .from('player_data')
      .upsert(playerRecord, { onConflict: 'hypixel_uuid,profile_id' })

    if (error) throw error

    return NextResponse.json({
      success:    true,
      username,
      uuid,
      profile_id: profile.profile_id,
      cute_name:  profile.cute_name ?? null,
      game_stage: gameStage,
      skills:     skillLevels,
      networth,
      networth_breakdown: networthBreakdown,
      hotm_progress: hotmProgress,
      skin_url:   skinUrl,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}