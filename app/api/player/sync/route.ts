// app/api/player/sync/route.ts
// Sync compte joueur Hypixel → player_data
// GET /api/player/sync?username=Steve
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { decodeItemListBytes } from '../../../../lib/skyblock-item-decoder'
import { requirePlan } from '../../../../lib/get-plan'
import { runEvolveSkills } from '../../cron/evolve-skills/route'
import { getSkillLevel } from '../../../../lib/skill-xp'

// 300s pour couvrir le sync lui-meme + la generation Skills chainee ci-dessous
// (meme plafond que evolve-skills seul avant ce chainage). Conformite API Hypixel :
// runEvolveSkills n'est plus jamais declenche par un cron/timer, uniquement ici,
// juste apres un sync reussi et explicitement demande par le joueur.
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

// ── Helpers ───────────────────────────────────────────────────
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
  // Evolve (Skills, chaine ci-dessous via runEvolveSkills) reserve Pro+. Verifie a chaque
  // appel, pas seulement a la liaison du compte Hypixel.
  const gate = await requirePlan('pro')
  if (!gate.ok) return gate.response

  const { data: link } = await supabase
    .from('hypixel_account_links')
    .select('hypixel_uuid, hypixel_username')
    .eq('user_id', gate.user.id)
    .single()
  if (!link) return NextResponse.json({ error: 'No Hypixel account linked. Link one first via /api/link-hypixel-account' }, { status: 400 })

  const username  = link.hypixel_username
  const userId    = gate.user.id
  const profileId = req.nextUrl.searchParams.get('profile_id')

  try {
    // UUID deja resolu et fige au moment de la liaison — pas besoin de rappeler Mojang.
    const uuid = link.hypixel_uuid

    // 2. Profil Skyblock
    const profileRes  = await fetch(
      `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`,
      { headers: { 'API-Key': HYPIXEL_KEY } }
    )
    const profileData = await profileRes.json()

    // Detection explicite cle invalide/expiree — avant, un 403/401 silencieux se traduisait
    // juste en "profiles: []" puis "No matching Skyblock profile found", indiscernable d'un
    // vrai probleme de profil (confirme le 23 juillet : c'est exactement ce qui s'est passe
    // en Phase 2 du chantier collecte totale, decouvert seulement par audit manuel).
    if (profileRes.status === 401 || profileRes.status === 403 || profileData.success === false) {
      const message = 'HYPIXEL_API_KEY invalide ou expiree — a regenerer sur developer.hypixel.net'
      await supabase.from('sync_log').insert({
        job_name:     'player-sync',
        finished_at:  new Date().toISOString(),
        status:       'error',
        rows_written: 0,
        error:        message,
        details:      { http_status: profileRes.status, cause: profileData.cause || null, hypixel_uuid: uuid, hypixel_username: username },
      })
      return NextResponse.json({ error: message }, { status: 502 })
    }

    const profiles = profileData.profiles || []

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

    // 5c. Classes de donjon (Phase 1 du chantier collecte totale) — vérifié sur un vrai
    // profil (Cucumber) : member.dungeons.player_classes est un objet {healer/mage/
    // berserk/archer/tank: {experience}}, aucun champ "level" fourni par l'API. Catacombs
    // et les classes utilisent chacun leur propre courbe XP→niveau, distincte des skills
    // classiques — aucune source vérifiée en interne pour cette courbe (pas dans
    // /v2/resources/skyblock/skills, pas dans une table interne), donc XP brute stockée
    // sans niveau dérivé, même principe que hotm_progress. selected_dungeon_class est un
    // bonus utile (classe actuellement équipée par le joueur).
    const dungeonClassData = member.dungeons?.player_classes || {}
    dungeons.classes = Object.fromEntries(
      Object.entries(dungeonClassData as Record<string, any>).map(([className, data]) => [
        className,
        { experience: data.experience ?? 0 },
      ])
    )
    dungeons.selected_class = member.dungeons?.selected_dungeon_class ?? null

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

    // Chaine la generation des cartes Skills juste apres un sync reussi, filtree sur
    // ce seul profil — jamais sur l'ensemble de player_data, jamais sur un timer (voir
    // commentaire en tete de evolve-skills/route.ts). Echec non bloquant : le sync a
    // reussi independamment, une erreur Claude ne doit pas transformer une reponse
    // reussie en 500.
    let skillCards: { success: boolean; error?: string } = { success: false }
    try {
      const result = await runEvolveSkills([profile.profile_id])
      skillCards = { success: !('error' in result) }
    } catch (e: any) {
      console.error('runEvolveSkills chained call failed:', e.message)
      skillCards = { success: false, error: e.message }
    }

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
      skill_cards_generated: skillCards.success,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}