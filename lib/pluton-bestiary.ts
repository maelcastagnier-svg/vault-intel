// lib/pluton-bestiary.ts
// Pluton Combat -- grind mob generique (21 aout). 3e item du lot de
// fermeture de backlog (voir plan). Reutilise la formule de combat deja
// promue dans lib/pluton-engine.ts (computeCombatDps, extraite de
// pluton-slayer.ts/pluton-sea-creatures.ts).
//
// Source : zone_mob_stats (107 lignes, 9 zones, texte brut wiki -- PAS de
// colonne numerique propre, hp/damage sont des chaines contenant parfois
// des templates wiki {{hp|X|icononly=yes}}, des listes multi-niveaux
// separees par "/" ou ";", ou des valeurs non numeriques comme "10 Hits"/
// "?"/"(Abilities)"). Verifie AVANT de coder (pas suppose) : game_drops
// (source_type='mob', 167 lignes) N'EST PAS une table de drops d'item --
// c'est le regroupement de variantes de mobs par bracket Bestiary
// (item_id='ZOMBIE_SOLDIER' y designe une CATEGORIE de mob, pas un objet
// lootable) -- une premiere lecture superficielle avait cru le contraire,
// corrige avant tout calcul. La seule source de vrais drops reste le texte
// libre de zone_mob_stats.drops.
//
// **Portee volontairement bornee** (documentee, pas cachee) : seuls les
// mobs dont hp est un nombre simple parseable (pas multi-niveau, pas "X
// Hits", pas "?") ET qui ont au moins un drop GARANTI (jamais "0-Nx", qui
// n'a aucune probabilite chiffree sourcee nulle part -- meme regle que le
// pool RNG deja exclu de Slayer coins_per_hour_boss_phase_only) sont
// retenus. Les drops "0-1x Item" (chance non chiffree) sont explicitement
// exclus de l'esperance plutot qu'une probabilite inventee -- meme
// discipline que le gap RNG deja documente sur Slayer/Mining/Fishing.
import { createClient } from '@supabase/supabase-js'
import {
  computeCombatDps, fetchReforges, pickBestReforge, recombobulatedRarity, JASPER_PERFECT_BY_RARITY, ART_OF_WAR_STRENGTH, WITHER_FORBIDDEN_STRENGTH_MAX,
  SEVEN_TIER_KEYS, type SevenTier, oldTierBucket,
  SHARPNESS_PCT_BY_TIER, SMITE_PCT_BY_TIER, CRITICAL_PCT_BY_TIER, POTATO_BOOK_USES_BY_TIER,
} from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Gate GEAR reel (progression Undead Sword->Revenant->Reaper, gatee par
// collection pas par prix) -- pas interpolable, reste sur l'ancien bucket
// 4-tiers via oldTierBucket() (meme pattern que pluton-sea-creatures.ts).
const COMBAT_GEAR_BY_OLD_TIER: Record<'early' | 'mid' | 'end' | 'late', { weaponId: string; armorPrefix: string | null }> = {
  early: { weaponId: 'UNDEAD_SWORD', armorPrefix: null },
  mid: { weaponId: 'REVENANT_SWORD', armorPrefix: 'REVENANT' },
  end: { weaponId: 'REAPER_SWORD', armorPrefix: 'REAPER' },
  late: { weaponId: 'REAPER_SWORD', armorPrefix: 'REAPER' },
}
const COMBAT_GEAR_BY_TIER = (tier: SevenTier) => COMBAT_GEAR_BY_OLD_TIER[oldTierBucket(tier)]

// Couche NBT (22 aout, recadrage "aucune activite Combat laissee de cote") --
// Bestiary reutilise le meme gear que la chaine Zombie (UNDEAD_SWORD/
// REVENANT_SWORD/REAPER_SWORD + REVENANT/REAPER armor) mais appelait
// computeCombatDps() avec 0 des couches NBT desormais construites pour
// Slayer (Sharpness/Smite/Critical/reforge/recombobulator/gemmes/Art of
// War/Potato Books) -- trou reel trouve en auditant "les 5 Slayers sont-ils
// vraiment la seule activite Combat ?" (non -- Dungeons et Bestiary aussi,
// tous deux 'built'). Memes constantes/valeurs deja sourcees et verifiees
// pour Zombie (lib/pluton-combat.ts/pluton-slayer.ts), reutilisees telles
// quelles via lib/pluton-engine.ts (partagees avec Slayer/Sea Creatures,
// migrees au systeme 7-tiers le 23 aout).
const POTATO_BOOK_BONUS_PER_USE = 2
const WEAPON_RARITY: Record<string, string> = { UNDEAD_SWORD: 'COMMON', REVENANT_SWORD: 'RARE', REAPER_SWORD: 'EPIC' }
const ARMOR_RARITY: Record<string, string> = { REVENANT: 'EPIC', REAPER: 'LEGENDARY' }
const GEMSTONE_JASPER_SLOTS: Record<string, number> = { REAPER_SWORD: 1 } // Reaper Falchion, verifie 22 aout
const GEMSTONE_JASPER_SLOTS_ARMOR: Record<string, number> = { REAPER: 1 } // Reaper Armor, verifie 22 aout

// Parse un champ hp/damage brut en nombre, ou null si non parseable de
// facon fiable (multi-niveau, "Hits", "?", "(Abilities)"...).
function parseSimpleNumeric(raw: string | null): number | null {
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (/hits|\?|abilities|infoneeded/.test(lower)) return null
  if (raw.includes('/') || raw.includes(';')) return null // multi-niveau ou multi-valeur -- non gere ici
  // Bug reel trouve en verifiant en prod (21 aout) : la 1re version de ce
  // regex ne capturait pas le point decimal ("2.5M" -> lisait "2" puis
  // s'arretait avant "." -- valeur non multipliee par M car le caractere
  // suivant immediat etait "." pas "m"). Regex etendu pour inclure un
  // decimal optionnel avant de chercher le suffixe K/M/B.
  const m = raw.match(/\d[\d ,]*(?:\.\d+)?|\d/)
  if (!m) return null
  let num = parseFloat(m[0].replace(/[ ,]/g, ''))
  if (!isFinite(num)) return null
  const after = raw.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 1).toLowerCase()
  if (after === 'k') num *= 1e3
  else if (after === 'm') num *= 1e6
  else if (after === 'b') num *= 1e9
  return num
}

type DropEntry = { itemName: string; qty: number }

// Parse la colonne drops (2 formats reels observes) :
// "1x Item; 2x Item2; 0-1x Item3" (liste ; -separee, "0-" = non garanti,
// exclu) OU "ItemName|amount=N" / "ItemName|amount=N-M" (format template
// single-item). Ne retient que les entrees GARANTIES (pas de "0-").
function parseGuaranteedDrops(raw: string | null): DropEntry[] {
  if (!raw) return []
  const out: DropEntry[] = []
  const pipeMatch = raw.match(/^(.+?)\|amount=(\d+)(?:-(\d+))?$/)
  if (pipeMatch) {
    const min = parseInt(pipeMatch[2], 10)
    const max = pipeMatch[3] ? parseInt(pipeMatch[3], 10) : min
    if (min > 0) out.push({ itemName: pipeMatch[1].trim(), qty: (min + max) / 2 })
    return out
  }
  for (const part of raw.split(';')) {
    const seg = part.trim()
    const m = seg.match(/^(\d+)(?:-(\d+))?x\s+(.+)$/)
    if (!m) continue
    const min = parseInt(m[1], 10)
    const max = m[2] ? parseInt(m[2], 10) : min
    if (min > 0) out.push({ itemName: m[3].trim(), qty: (min + max) / 2 })
  }
  return out
}

async function buildItemNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const { data } = await supabase.from('items_catalog').select('item_id, item_name')
  for (const row of data || []) {
    if (row.item_name) map.set(row.item_name.trim().toLowerCase(), row.item_id)
  }
  return map
}

export type BestiaryMobResult = {
  id: number
  zone_page: string
  name: string
  hp: number
  is_undead: boolean
  guaranteed_ev: number
  skipped_reason?: string
}

export async function computeBestiaryCandidates(): Promise<BestiaryMobResult[]> {
  const { data: mobs } = await supabase.from('zone_mob_stats').select('id, zone_page, name, hp, drops')
  if (!mobs) return []
  const nameMap = await buildItemNameMap()

  const allPriceIds = new Set<string>()
  const parsed = (mobs as { id: number; zone_page: string; name: string; hp: string | null; drops: string | null }[]).map(m => {
    const hp = parseSimpleNumeric(m.hp)
    const drops = parseGuaranteedDrops(m.drops).map(d => ({ ...d, item_id: nameMap.get(d.itemName.toLowerCase()) || null }))
    for (const d of drops) if (d.item_id) allPriceIds.add(d.item_id)
    return { id: m.id, zone_page: m.zone_page, name: m.name, hp, drops }
  })

  const since = new Date(Date.now() - 5 * 86_400_000).toISOString().split('T')[0]
  const { data: priceRows } = await supabase
    .from('price_history')
    .select('item_id, sell_price, bucket_date')
    .in('item_id', Array.from(allPriceIds))
    .gte('bucket_date', since)
    .gt('sell_price', 0)
    .order('bucket_date', { ascending: false })
  const priceCache = new Map<string, number>()
  for (const row of priceRows || []) if (!priceCache.has(row.item_id)) priceCache.set(row.item_id, Number(row.sell_price))

  const results: BestiaryMobResult[] = []
  for (const m of parsed) {
    if (m.hp == null) { results.push({ id: m.id, zone_page: m.zone_page, name: m.name, hp: 0, is_undead: false, guaranteed_ev: 0, skipped_reason: 'hp_unparseable' }); continue }
    const pricedDrops = m.drops.filter(d => d.item_id && priceCache.has(d.item_id))
    if (pricedDrops.length === 0) { results.push({ id: m.id, zone_page: m.zone_page, name: m.name, hp: m.hp, is_undead: false, guaranteed_ev: 0, skipped_reason: 'no_priced_guaranteed_drop' }); continue }
    const ev = pricedDrops.reduce((sum, d) => sum + d.qty * (priceCache.get(d.item_id!) || 0), 0)
    const isUndead = /zombie|skeleton|wither|husk|ghoul/i.test(m.name)
    results.push({ id: m.id, zone_page: m.zone_page, name: m.name, hp: m.hp, is_undead: isUndead, guaranteed_ev: ev })
  }
  return results
}

export async function computeAndPersistBestiaryRankings(): Promise<{ candidates: number; viable: number }> {
  const candidates = await computeBestiaryCandidates()
  const viable = candidates.filter(c => c.hp > 0 && c.guaranteed_ev > 0)

  const { data: existingBlocks } = await supabase
    .from('pluton_target_blocks').select('id').eq('activity_key', 'combat').like('block_id', 'BESTIARY_%')
  const existingIds = (existingBlocks || []).map(b => b.id)
  if (existingIds.length > 0) {
    await supabase.from('pluton_rankings').delete().in('target_block_id', existingIds)
    await supabase.from('pluton_setups').delete().eq('activity_key', 'combat').contains('accessories', [{ source_id: '__bestiary_method__' }])
    await supabase.from('pluton_target_blocks').delete().in('id', existingIds)
  }

  const [{ data: weapons }, { data: armors }] = await Promise.all([
    supabase.from('pluton_slayer_weapon_stats').select('*').eq('slayer_key', 'zombie'),
    supabase.from('pluton_slayer_armor_stats').select('*').eq('slayer_key', 'zombie'),
  ])
  const weaponById = new Map((weapons || []).map((w: any) => [w.item_id, w]))
  const armorByPrefix = new Map((armors || []).map((a: any) => [a.set_prefix, a]))

  for (const c of viable) {
    // Suffixe par id reel (zone_mob_stats.id) -- plusieurs lignes peuvent
    // partager le meme (zone,name) avec des paliers/drops reellement
    // distincts (ex: 3 lignes "Zealot" dans The End, pas des doublons mais
    // 3 variantes reelles) -- meme discipline "multi-methodes" que Dungeons
    // plutot que de laisser la contrainte UNIQUE(activity_key,block_id) en
    // supprimer silencieusement 2 sur 3.
    const blockIdSafe = `BESTIARY_${c.zone_page}_${c.name}_${c.id}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    const { data: block, error: blockErr } = await supabase
      .from('pluton_target_blocks')
      .insert({
        activity_key: 'combat',
        block_id: blockIdSafe,
        block_name: `Bestiary -- ${c.name} (${c.zone_page})`,
        block_strength: 0,
        required_breaking_power: 0,
        sell_item_id: 'NONE',
        base_drop_count: 1,
        pricing_note: `Grind mob generique (21 aout, couche NBT completee 22 aout). HP reel=${c.hp} (source zone_mob_stats, sourcage wiki). EV=${c.guaranteed_ev.toFixed(2)} = somme des drops GARANTIS uniquement (Bazaar sell_price reel) -- les drops "0-Nx" (chance non chiffree cote wiki) sont exclus, meme discipline que le gap RNG deja documente sur Slayer/Mining/Fishing. Gear Zombie Slayer reutilise pour le DPS/TTK, bonus Undead applique si le nom du mob correspond a un type non-mort (Zombie/Skeleton/Wither/Husk/Ghoul). Setup complet : Sharpness+Smite(si Undead)+Critical, reforge arme+armure (recherche reelle), Recombobulator 3000, gemme Jasper (Reaper uniquement), Hot/Fuming Potato Book, The Art of War -- memes valeurs sourcees que lib/pluton-slayer.ts.`,
      })
      .select('id')
      .single()
    if (blockErr || !block) continue

    const entries = await Promise.all(SEVEN_TIER_KEYS.map(async tier => {
      const gear = COMBAT_GEAR_BY_TIER(tier)
      const weapon = weaponById.get(gear.weaponId)
      const armor = gear.armorPrefix ? armorByPrefix.get(gear.armorPrefix) : null
      if (!weapon) return null
      const baseStrength = Number(weapon.base_strength) + (armor ? Number(armor.set_strength) : 0)
      const mults = c.is_undead
        ? [1 + Number(weapon.mob_type_damage_bonus_pct) / 100, armor ? 1 + Number(armor.mob_type_damage_bonus_pct) / 100 : 1]
        : []

      // Sharpness (toujours) + Smite (si mob Undead) + Critical + Art of War
      // + gemme Jasper (Reaper uniquement) + Potato Books -- memes valeurs
      // que Slayer, voir doc des constantes.
      const sharpnessPct = SHARPNESS_PCT_BY_TIER[tier]
      const smitePct = c.is_undead ? SMITE_PCT_BY_TIER[tier] : 0
      const criticalPct = CRITICAL_PCT_BY_TIER[tier]
      const potatoUses = POTATO_BOOK_USES_BY_TIER[tier]
      const potatoFlat = potatoUses * POTATO_BOOK_BONUS_PER_USE

      const weaponRarity = WEAPON_RARITY[gear.weaponId]
      const weaponRecombRarity = weaponRarity ? recombobulatedRarity(weaponRarity) : undefined
      const armorRarity = gear.armorPrefix ? ARMOR_RARITY[gear.armorPrefix] : undefined
      const armorRecombRarity = armorRarity ? recombobulatedRarity(armorRarity) : undefined

      let gemstoneStrength = 0
      if (GEMSTONE_JASPER_SLOTS[gear.weaponId] && weaponRecombRarity) {
        gemstoneStrength += GEMSTONE_JASPER_SLOTS[gear.weaponId] * JASPER_PERFECT_BY_RARITY[weaponRecombRarity]
      }
      if (gear.armorPrefix && GEMSTONE_JASPER_SLOTS_ARMOR[gear.armorPrefix] && armorRecombRarity) {
        gemstoneStrength += GEMSTONE_JASPER_SLOTS_ARMOR[gear.armorPrefix] * JASPER_PERFECT_BY_RARITY[armorRecombRarity]
      }

      const strengthBeforeReforge = baseStrength + gemstoneStrength + potatoFlat + ART_OF_WAR_STRENGTH + WITHER_FORBIDDEN_STRENGTH_MAX
      const baseDamage = Number(weapon.base_damage) + potatoFlat
      const additivePct = sharpnessPct + smitePct

      const scoreWeapon = (d: { strength: number; crit_chance: number; crit_damage: number; bonus_attack_speed: number }) =>
        computeCombatDps(baseDamage, strengthBeforeReforge + d.strength, mults, additivePct, criticalPct + d.crit_damage, d.crit_chance, d.bonus_attack_speed)
      const weaponReforges = weaponRecombRarity ? await fetchReforges('SWORD/ROD', weaponRecombRarity) : []
      const bestWeaponReforge = pickBestReforge(weaponReforges, 1, scoreWeapon)

      let armorDelta = { strength: 0, crit_chance: 0, crit_damage: 0, bonus_attack_speed: 0 }
      if (armorRecombRarity) {
        const armorReforges = await fetchReforges('ARMOR', armorRecombRarity)
        const wStrength = strengthBeforeReforge + (bestWeaponReforge?.delta.strength || 0)
        const wCC = bestWeaponReforge?.delta.crit_chance || 0
        const wCD = criticalPct + (bestWeaponReforge?.delta.crit_damage || 0)
        const wAS = bestWeaponReforge?.delta.bonus_attack_speed || 0
        const scoreArmor = (d: { strength: number; crit_chance: number; crit_damage: number; bonus_attack_speed: number }) =>
          computeCombatDps(baseDamage, wStrength + d.strength, mults, additivePct, wCD + d.crit_damage, wCC + d.crit_chance, wAS + d.bonus_attack_speed)
        const best = pickBestReforge(armorReforges, 4, scoreArmor)
        if (best) armorDelta = best.delta
      }

      const finalStrength = strengthBeforeReforge + (bestWeaponReforge?.delta.strength || 0) + armorDelta.strength
      const finalCC = (bestWeaponReforge?.delta.crit_chance || 0) + armorDelta.crit_chance
      const finalCD = criticalPct + (bestWeaponReforge?.delta.crit_damage || 0) + armorDelta.crit_damage
      const finalAS = (bestWeaponReforge?.delta.bonus_attack_speed || 0) + armorDelta.bonus_attack_speed

      const dps = computeCombatDps(baseDamage, finalStrength, mults, additivePct, finalCD, finalCC, finalAS)
      const ttk = c.hp / dps
      return { tier, ttk, weaponName: weapon.display_name, armorName: armor?.set_name ?? null }
    }))
    const entriesFiltered = entries.filter((e): e is NonNullable<typeof e> => e !== null)

    const { data: insertedSetups, error: setupErr } = await supabase
      .from('pluton_setups')
      .insert(entriesFiltered.map(e => ({
        activity_key: 'combat',
        tier: e.tier,
        investment_level: 'optimal',
        armor_set_prefix: e.armorName ?? `Aucune (${e.weaponName} seul)`,
        tool_item_id: 'ZOMBIE_SLAYER_GEAR_REUSED',
        total_mining_speed: 0,
        total_mining_fortune: 0,
        total_breaking_power: 0,
        real_cost: 0,
        accessories: [{ source_id: '__bestiary_method__', is_undead: c.is_undead, nbt: 'sharpness+smite+critical+reforge+recomb+art_of_war+gemme+potato' }],
      })))
      .select('id')
    if (setupErr || !insertedSetups) continue

    const rankingsToInsert = entriesFiltered.map((e, i) => ({
      activity_key: 'combat',
      tier: e.tier,
      target_block_id: block.id,
      setup_id: insertedSetups[i].id,
      rank: 1,
      mining_time_seconds: e.ttk,
      actions_per_hour: 3600 / Math.max(e.ttk, 0.01),
      yield_per_hour: 3600 / Math.max(e.ttk, 0.01),
      coins_per_hour_raw_block_only: (3600 / Math.max(e.ttk, 0.01)) * c.guaranteed_ev,
    }))
    await supabase.from('pluton_rankings').insert(rankingsToInsert)
  }

  return { candidates: candidates.length, viable: viable.length }
}
