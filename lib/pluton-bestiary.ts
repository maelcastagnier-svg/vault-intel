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
import { computeCombatDps } from './pluton-engine'
import type { TierKey } from './money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const COMBAT_GEAR_BY_TIER: Record<TierKey, { weaponId: string; armorPrefix: string | null }> = {
  early: { weaponId: 'UNDEAD_SWORD', armorPrefix: null },
  mid: { weaponId: 'REVENANT_SWORD', armorPrefix: 'REVENANT' },
  end: { weaponId: 'REAPER_SWORD', armorPrefix: 'REAPER' },
  late: { weaponId: 'REAPER_SWORD', armorPrefix: 'REAPER' },
}

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
        pricing_note: `Grind mob generique (21 aout). HP reel=${c.hp} (source zone_mob_stats, sourcage wiki). EV=${c.guaranteed_ev.toFixed(2)} = somme des drops GARANTIS uniquement (Bazaar sell_price reel) -- les drops "0-Nx" (chance non chiffree cote wiki) sont exclus, meme discipline que le gap RNG deja documente sur Slayer/Mining/Fishing. Gear Zombie Slayer reutilise pour le DPS/TTK, bonus Undead applique si le nom du mob correspond a un type non-mort (Zombie/Skeleton/Wither/Husk/Ghoul).`,
      })
      .select('id')
      .single()
    if (blockErr || !block) continue

    const entries = (['early', 'mid', 'end', 'late'] as TierKey[]).map(tier => {
      const gear = COMBAT_GEAR_BY_TIER[tier]
      const weapon = weaponById.get(gear.weaponId)
      const armor = gear.armorPrefix ? armorByPrefix.get(gear.armorPrefix) : null
      if (!weapon) return null
      const strength = Number(weapon.base_strength) + (armor ? Number(armor.set_strength) : 0)
      const mults = c.is_undead
        ? [1 + Number(weapon.mob_type_damage_bonus_pct) / 100, armor ? 1 + Number(armor.mob_type_damage_bonus_pct) / 100 : 1]
        : []
      const dps = computeCombatDps(Number(weapon.base_damage), strength, mults)
      const ttk = c.hp / dps
      return { tier, ttk, weaponName: weapon.display_name, armorName: armor?.set_name ?? null }
    }).filter((e): e is NonNullable<typeof e> => e !== null)

    const { data: insertedSetups, error: setupErr } = await supabase
      .from('pluton_setups')
      .insert(entries.map(e => ({
        activity_key: 'combat',
        tier: e.tier,
        investment_level: 'optimal',
        armor_set_prefix: e.armorName ?? `Aucune (${e.weaponName} seul)`,
        tool_item_id: 'ZOMBIE_SLAYER_GEAR_REUSED',
        total_mining_speed: 0,
        total_mining_fortune: 0,
        total_breaking_power: 0,
        real_cost: 0,
        accessories: [{ source_id: '__bestiary_method__', is_undead: c.is_undead }],
      })))
      .select('id')
    if (setupErr || !insertedSetups) continue

    const rankingsToInsert = entries.map((e, i) => ({
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
