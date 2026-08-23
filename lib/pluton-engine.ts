// lib/pluton-engine.ts
// Moteur partage Pluton (21 aout) -- extrait du code copie-colle identifie
// par audit sur les 6 calculateurs existants (Mining/Farming/Foraging/
// Fishing/Slayer/Dungeons). Les formules de RENDEMENT restent bespoke par
// activite (tick/softcap Mining, engine-cap+pest Farming, Sweep Foraging,
// multi-roll Fishing, DPS/TTK Slayer, EV-coffre-ancree-score Dungeons -- un
// solveur generique unique n'est pas realiste sans inventer de raccourcis,
// confirme par audit). Ce qui EST generalisable sans rien inventer :
// lookup de prix Bazaar/AH batche, calcul d'esperance sur une table de
// loot ponderee, et la persistance delete-puis-rebuild vers
// pluton_setups/pluton_rankings. Premiere consommation : Kuudra
// (lib/pluton-kuudra.ts), meme mecanique EV-sur-table-de-loot que Dungeons.
import { createClient } from '@supabase/supabase-js'
import { SEVEN_TIER_KEYS, buildSevenTierConfig, type SevenTierConfig, type MilestoneTierRow } from './money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================
// Migration 4 tiers (early/mid/end/late) -> 7 tiers reels (starter->master),
// 23 aout -- correction explicite de l'utilisateur : "on a 7 tiers de money
// making maintenant... je ne veux plus de trou". L'infrastructure 7-tiers
// (SEVEN_TIER_KEYS/buildSevenTierConfig, lib/money-making-constants.ts)
// existait deja (17 aout) mais n'etait consommee QUE par l'ancien systeme
// Money Making (money-making-agent/setup-generate-agent) -- jamais par
// aucun calculateur Pluton, qui tournaient tous encore sur les 4 anciens
// tiers. Chaque calculateur Pluton migre desormais vers SEVEN_TIER_KEYS,
// avec un budget/cible reellement distinct par tier (interpolation
// proportionnelle sur les vraies bornes networth de `milestone_tier_totals`,
// jamais un chiffre invente -- voir buildSevenTierConfig).
//
// Mapping vers l'ancien decoupage (pour la logique de gating "investissement
// max" deja validee formule par formule, PAS reinventee ici -- seule la
// granularite du budget change, jamais les formules elles-memes) :
// early={starter,amateur}, mid={intermediate,skilled}, end={expert,
// professional}, late={master}.
export type SevenTier = (typeof SEVEN_TIER_KEYS)[number]
export { SEVEN_TIER_KEYS }

export async function loadSevenTierConfig(): Promise<Record<SevenTier, SevenTierConfig>> {
  const { data, error } = await supabase
    .from('milestone_tier_totals')
    .select('tier, tier_order, networth_min, networth_max, money_making_tier_key')
    .order('tier_order')
  if (error || !data || data.length === 0) throw new Error(`milestone_tier_totals load failed: ${error?.message}`)
  return buildSevenTierConfig(data as MilestoneTierRow[]) as Record<SevenTier, SevenTierConfig>
}

// Meme frontiere qualitative que l'ancien tier==='end'||tier==='late' (couche
// "investissement maximal atteignable" -- HOTM/HOTF/Essence Shops/gemmes
// parfaites/reforges haut de gamme...), reappliquee aux 3 tiers reels qui
// correspondent (Expert/Professional=ancien "end", Master=ancien "late").
export const INVESTMENT_MAX_TIERS: ReadonlySet<SevenTier> = new Set(['expert', 'professional', 'master'])
// Ancien tier==='mid'.
export const MID_INVESTMENT_TIERS: ReadonlySet<SevenTier> = new Set(['intermediate', 'skilled'])
// Ancien tier==='early'.
export const EARLY_INVESTMENT_TIERS: ReadonlySet<SevenTier> = new Set(['starter', 'amateur'])

// Pour les paliers de gear GATES (collection-gated, pas un budget continu --
// ex: Undead Sword->Revenant Falchion->Reaper Falchion des 5 Slayers/
// Bestiary/Sea Creature kills) : impossible d'interpoler un objet
// intermediaire qui n'existe pas dans le jeu, donc les 2 tiers reels qui
// partagent le meme ancien money_making_tier_key heritent du MEME palier de
// gear (seul le budget/les NBT annexes -- reforge/enchants/gemmes -- varient
// reellement entre eux, voir les paliers gradues dedies plus bas).
export function oldTierBucket(tier: SevenTier): 'early' | 'mid' | 'end' | 'late' {
  if (EARLY_INVESTMENT_TIERS.has(tier)) return 'early'
  if (MID_INVESTMENT_TIERS.has(tier)) return 'mid'
  if (tier === 'master') return 'late'
  return 'end' // expert, professional
}

// ============================================================
// Paliers NBT Combat partages (Sharpness/Smite/Critical/Potato Books) --
// dupliques a l'identique dans pluton-combat.ts/pluton-slayer.ts/
// pluton-bestiary.ts/pluton-sea-creatures.ts jusqu'au 23 aout, centralises
// ici lors de la migration 7 tiers pour eviter 4 copies divergentes.
// Interpolation sur 7 paliers, ancres reelles des 4 anciens tiers
// PRESERVEES EXACTEMENT (amateur=ancien early, skilled=ancien mid,
// professional ET master=ancien end/late -- jamais une valeur inventee,
// seule la granularite entre les anciennes ancres est nouvelle).
export const SHARPNESS_PCT_BY_TIER: Record<SevenTier, number> = {
  starter: 10, amateur: 15, intermediate: 22, skilled: 30, expert: 40, professional: 50, master: 50,
}
export const SMITE_PCT_BY_TIER: Record<SevenTier, number> = {
  starter: 10, amateur: 15, intermediate: 22, skilled: 30, expert: 40, professional: 50, master: 50,
}
export const CRITICAL_PCT_BY_TIER: Record<SevenTier, number> = {
  starter: 20, amateur: 30, intermediate: 40, skilled: 50, expert: 75, professional: 100, master: 100,
}
export const POTATO_BOOK_USES_BY_TIER: Record<SevenTier, number> = {
  starter: 3, amateur: 5, intermediate: 8, skilled: 10, expert: 13, professional: 15, master: 15,
}

// Charge le prix le plus recent de chaque item_id demande en 2 requetes
// batchees (Bazaar d'abord, fallback AH nostar_norecomb) plutot qu'un
// aller-retour par item -- meme pattern que loadPricedItems
// (lib/gear-pricing.ts), deja validee en prod sur Dungeons (resout le
// timeout 504 systematique trouve le 18 aout : ~centaines de requetes
// sequentielles -> quelques requetes batchees).
export async function loadPriceCache(itemIds: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(itemIds)).filter(Boolean)
  if (ids.length === 0) return new Map()
  const since = new Date(Date.now() - 5 * 86_400_000).toISOString().split('T')[0]

  const [{ data: bazaarRows }, { data: ahRows }] = await Promise.all([
    supabase.from('price_history')
      .select('item_id, sell_price, bucket_date')
      .in('item_id', ids)
      .gte('bucket_date', since)
      .gt('sell_price', 0)
      .order('bucket_date', { ascending: false }),
    supabase.from('price_history_ah_variant_base')
      .select('base_item_id, avg_price, bucket_date')
      .in('base_item_id', ids)
      .eq('variant_key_base', 'nostar_norecomb')
      .gte('bucket_date', since)
      .order('bucket_date', { ascending: false }),
  ])

  const cache = new Map<string, number>()
  for (const row of ahRows || []) {
    if (!cache.has(row.base_item_id)) cache.set(row.base_item_id, Number(row.avg_price))
  }
  // Bazaar ecrase l'AH si present (source primaire pour les items
  // consommables) -- premiere ligne rencontree par item = la plus recente
  // grace au tri desc, donc un set() inconditionnel reecrirait avec des
  // lignes plus vieilles au fil de la boucle. On ecrase l'entree AH une
  // seule fois (au premier Bazaar vu pour cet item), puis on ignore le reste.
  const bazaarSeen = new Set<string>()
  for (const row of bazaarRows || []) {
    if (bazaarSeen.has(row.item_id)) continue
    bazaarSeen.add(row.item_id)
    cache.set(row.item_id, Number(row.sell_price))
  }
  return cache
}

// Une ligne generique de table de loot ponderee : chance% -> qty*price en
// esperance, plus un cout additionnel conditionnel optionnel (ex: "Added
// Cost" des coffres Dungeons/Kuudra -- paye seulement si l'item roll).
export type WeightedLootRow = {
  entry_item_id: string | null
  entry_qty: number | string
  chance_pct: number | string
  added_cost?: number | string
}

export type LootTableEV = { expectedValue: number; expectedAddedCost: number }

// Calcule l'esperance de valeur (et de surcout conditionnel) d'une table de
// loot ponderee deja chargee, contre un cache de prix deja charge -- aucun
// acces DB ici, tout est synchrone/en memoire. Reutilise par Dungeons
// (implicitement, meme calcul) et Kuudra (explicitement).
export function expectedValueFromLootTable(rows: WeightedLootRow[], priceCache: Map<string, number>): LootTableEV {
  let expectedValue = 0
  let expectedAddedCost = 0
  for (const row of rows) {
    if (!row.entry_item_id) continue
    const chance = Number(row.chance_pct) / 100
    const price = priceCache.get(row.entry_item_id) || 0
    expectedValue += chance * Number(row.entry_qty) * price
    const addedCost = Number(row.added_cost || 0)
    if (addedCost > 0) expectedAddedCost += chance * addedCost
  }
  return { expectedValue, expectedAddedCost }
}

// Une ligne a persister : le setup (colonnes generiques deja reutilisees
// par toutes les activites -- total_mining_speed/fortune/breaking_power
// portent des stats non-mining selon l'activite, convention deja en place)
// + les colonnes de classement associees.
export type PersistEntry = {
  tier: string
  targetBlockId: number
  setup: {
    investment_level?: string
    armor_set_prefix: string
    tool_item_id: string
    total_mining_speed?: number
    total_mining_fortune?: number
    total_breaking_power?: number
    real_cost?: number
    pet_id?: string | null
    pet_rarity?: string | null
    accessories?: any
  }
  ranking: {
    time_seconds: number
    actions_per_hour: number
    yield_per_hour: number
    coins_per_hour: number
  }
}

// Delete-puis-rebuild + insert groupe vers pluton_setups/pluton_rankings --
// generalise le pattern deja identique dans les 6 calculateurs (derniere
// version optimisee : Dungeons, 2 inserts groupes au lieu d'un aller-retour
// par combo). Retourne les ids de setup inseres si l'appelant en a besoin.
export async function persistSetupsAndRankings(activityKey: string, entries: PersistEntry[]): Promise<void> {
  await supabase.from('pluton_rankings').delete().eq('activity_key', activityKey)
  await supabase.from('pluton_setups').delete().eq('activity_key', activityKey)
  if (entries.length === 0) return

  const setupsToInsert = entries.map(e => ({
    activity_key: activityKey,
    tier: e.tier,
    investment_level: e.setup.investment_level ?? 'optimal',
    armor_set_prefix: e.setup.armor_set_prefix,
    tool_item_id: e.setup.tool_item_id,
    total_mining_speed: e.setup.total_mining_speed ?? 0,
    total_mining_fortune: e.setup.total_mining_fortune ?? 0,
    total_breaking_power: e.setup.total_breaking_power ?? 0,
    real_cost: e.setup.real_cost ?? 0,
    pet_id: e.setup.pet_id ?? null,
    pet_rarity: e.setup.pet_rarity ?? null,
    accessories: e.setup.accessories ?? null,
  }))

  const { data: insertedSetups, error: setupErr } = await supabase
    .from('pluton_setups')
    .insert(setupsToInsert)
    .select('id')
  if (setupErr || !insertedSetups) throw new Error(`pluton_setups batch insert failed (${activityKey}): ${setupErr?.message}`)

  const rankingsToInsert = entries.map((e, i) => ({
    activity_key: activityKey,
    tier: e.tier,
    target_block_id: e.targetBlockId,
    setup_id: insertedSetups[i].id,
    rank: 1,
    mining_time_seconds: e.ranking.time_seconds,
    actions_per_hour: e.ranking.actions_per_hour,
    yield_per_hour: e.ranking.yield_per_hour,
    coins_per_hour_raw_block_only: e.ranking.coins_per_hour,
  }))
  const { error: rankErr } = await supabase.from('pluton_rankings').insert(rankingsToInsert)
  if (rankErr) throw new Error(`pluton_rankings batch insert failed (${activityKey}): ${rankErr.message}`)
}

// Formule de degats generale (wiki "Damage"/"Damage Calculation"), deja
// dupliquee 2x a l'identique (lib/pluton-slayer.ts, lib/pluton-sea-
// creatures.ts -- fichiers deja valides en prod, non retouches pour eviter
// tout risque de regression). Extraite ici (21 aout) pour que Bestiary (3e
// consommateur) ne la triple pas.
// DamageDealt = (5+BaseDamage+Flat) x (1+Strength/100) x AdditiveMult x
// MultiplicativeMult x (1+CritDamage/100 si critique), ExpectedDamage =
// NonCrit x (1+(CritChance/100)x(CritDamage/100)).
const BASE_STRENGTH = 0
const BASE_CRIT_CHANCE = 30
const BASE_CRIT_DAMAGE = 50
const COMBAT_LEVEL_60_DAMAGE_ADDITIVE_PCT = 210
const COMBAT_LEVEL_60_CRIT_CHANCE_BONUS = 30

export function computeAttacksPerSecond(bonusAttackSpeed: number): number {
  const ticks = Math.max(1, Math.floor(10 / (1 + bonusAttackSpeed / 100)))
  return 20 / ticks
}

// 22 aout -- etendu avec additionalCritChancePct/bonusAttackSpeed (absents
// jusqu'ici, trou reel trouve en construisant la recherche de reforge
// ci-dessous : aucun moyen de composer un bonus Crit Chance ni une vitesse
// d'attaque non-nulle). Retro-compatible (nouveaux parametres optionnels,
// defaut 0 -- Bestiary, seul autre appelant, inchange). Crit Chance
// plafonnee a 100 (reelle limite du jeu, jamais verifiee avant -- sans
// consequence tant qu'aucune source ne depassait 100, mais Sharp/Pure
// reforge + Critical enchant peuvent reellement y arriver).
export function computeCombatDps(baseDamage: number, strength: number, multiplicativeFactors: number[], additionalAdditivePct: number = 0, additionalCritDamagePct: number = 0, additionalCritChancePct: number = 0, bonusAttackSpeed: number = 0): number {
  const multiplicativeMult = multiplicativeFactors.reduce((a, b) => a * b, 1)
  const nonCrit = (5 + baseDamage) * (1 + (BASE_STRENGTH + strength) / 100) * (1 + (COMBAT_LEVEL_60_DAMAGE_ADDITIVE_PCT + additionalAdditivePct) / 100) * multiplicativeMult
  const critChance = Math.min(100, BASE_CRIT_CHANCE + COMBAT_LEVEL_60_CRIT_CHANCE_BONUS + additionalCritChancePct)
  const expectedPerHit = nonCrit * (1 + (critChance / 100) * ((BASE_CRIT_DAMAGE + additionalCritDamagePct) / 100))
  return expectedPerHit * computeAttacksPerSecond(bonusAttackSpeed)
}

// Reforges -- recherche reelle sur l'espace des candidats (22 aout, suite
// au recadrage "ne rien laisser a moitie" de l'utilisateur). Jusqu'ici
// AUCUN calculateur Combat n'appliquait de reforge du tout (trou reel
// trouve en auditant, pas seulement "pas encore fait" -- absent des deux
// fichiers). Plutot que supposer un reforge "evident" (Heroic/Legendary),
// le moteur simule le DPS de CHAQUE reforge candidat (table `reforges`,
// meme rarete que l'item, x1 pour une arme/x4 pour un set d'armure complet
// -- 4 pieces identiques reforgees, simplification documentee faute de
// differenciation par piece dans ce modele) et retient le meilleur reel --
// confirme en pratique que le "meilleur" reforge depend de la rarete de
// l'item (paliers d'Attack Speed via floor(10/(1+AS/100)) creent des sauts
// non-lineaires, ex: "Fast" domine sur une arme EPIC grace au palier
// AS=40->ticks=7, mais rien ne garantit que ce soit vrai a toute rarete)
// -- jamais une reforge fixee en dur.
export type ReforgeStatDelta = { strength: number; crit_chance: number; crit_damage: number; bonus_attack_speed: number }
export type ReforgeCandidate = { name: string; raw: Record<string, number> }

export async function fetchReforges(itemTypes: 'SWORD/ROD' | 'ARMOR', rarity: string): Promise<ReforgeCandidate[]> {
  const { data } = await supabase.from('reforges').select('reforge_name, stats').eq('item_types', itemTypes).eq('rarity', rarity)
  return (data || []).map((r: any) => ({ name: r.reforge_name, raw: r.stats || {} }))
}

export function pickBestReforge(
  candidates: ReforgeCandidate[],
  countMultiplier: number,
  scoreFn: (delta: ReforgeStatDelta) => number
): { name: string; delta: ReforgeStatDelta } | null {
  let best: { name: string; delta: ReforgeStatDelta; score: number } | null = null
  for (const c of candidates) {
    const delta: ReforgeStatDelta = {
      strength: (c.raw.strength || 0) * countMultiplier,
      crit_chance: (c.raw.crit_chance || 0) * countMultiplier,
      crit_damage: (c.raw.crit_damage || 0) * countMultiplier,
      bonus_attack_speed: (c.raw.bonus_attack_speed || 0) * countMultiplier,
    }
    const score = scoreFn(delta)
    if (!best || score > best.score) best = { name: c.name, delta, score }
  }
  return best ? { name: best.name, delta: best.delta } : null
}

// Recombobulator 3000 -- sourcee wiki ("increases the effect of Reforges
// and Gemstones applied to the item"), toujours applique ici : aucun
// downside reel documente ("Reforges peuvent etre appliques avant ou apres,
// profitent quand meme du bonus de rarete"), strictement benefique des que
// la rarete suivante existe. Decale la rarete d'1 cran pour le lookup
// reforge ET gemstone -- reutilise les memes tables deja sourcees (aucune
// nouvelle donnee inventee, juste la ligne de rarete suivante des memes
// tables `reforges`/`gemstones`).
// Etendu a DIVINE (22 aout, trouve en auditant Mining) : la chaine complete
// sourcee wiki va au-dela de MYTHIC (Mythic->Divine->Special->Very Special),
// et au moins un item reel du jeu (Divan's Drill) a une rarete de BASE
// MYTHIC (confirme explicitement par le wiki Recombobulator : "The only
// items with an intentional base Mythic rarity are Divan's Drill...") --
// recombobulatedRarity('MYTHIC') doit donc pouvoir avancer vers DIVINE, pas
// rester bloque. La table `gemstones` a bien des lignes DIVINE (confirme).
const RARITY_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'DIVINE']
export function recombobulatedRarity(rarity: string): string {
  const idx = RARITY_ORDER.indexOf(rarity)
  return idx >= 0 && idx < RARITY_ORDER.length - 1 ? RARITY_ORDER[idx + 1] : rarity
}

// Jasper PERFECT par rarete -- sourcee table `gemstones` (verifiee 22 aout,
// meme requete que lib/pluton-mining.ts), partagee ici pour eviter de la
// re-hardcoder par fichier/par item a chaque fois qu'un emplacement Jasper
// reel est trouve.
export const JASPER_PERFECT_BY_RARITY: Record<string, number> = {
  COMMON: 6, UNCOMMON: 7, RARE: 9, EPIC: 11, LEGENDARY: 13, MYTHIC: 16,
}

// Citrine PERFECT par rarete (Foraging Fortune) -- sourcee table `gemstones`
// (verifiee 22 aout, meme requete que Jasper/Aquamarine).
export const CITRINE_PERFECT_BY_RARITY: Record<string, number> = {
  COMMON: 3, UNCOMMON: 4, RARE: 5, EPIC: 6, LEGENDARY: 8, MYTHIC: 10,
}

// The Art of War -- sourcee wiki ("can be applied to Weapons/Axes via un
// Anvil to grant +5 Strength, once per item"). Universel, cout unique
// modique, aucun downside -- applique par defaut a toute arme comme
// Recombobulator.
export const ART_OF_WAR_STRENGTH = 5

// Wither Essence Shop, perk "Forbidden Strength" (22 aout, trouve en
// auditant les 11 Essence Shops suite a question utilisateur HOTM/HOTF) --
// +1/2/3/4/5 Force (5 paliers), AUCUNE restriction de lieu (contrairement
// aux perks soeurs Health/Defense/Speed/Intelligence de la meme boutique,
// non traques par Pluton -- Force est la seule stat combat pertinente
// parmi les 5, verifie via lecture complete des 2 pages Wither+Undead
// Essence Shop). Essence non-tradeable (aucun item_id catalogue, confirme
// avant de coder) -- traite comme HOTM/HOTF : niveau max assume
// atteignable, jamais de prix sur la monnaie elle-meme. Universel Combat
// (Slayer x5/Bestiary/Sea Creature), applique par defaut comme Art of War.
export const WITHER_FORBIDDEN_STRENGTH_MAX = 5

// Extrait les stats reelles d'un item directement depuis pluton_elements
// (Systeme A, 21 aout) -- 1er vrai consommateur en lecture live, remplace
// les tables dediees (pluton_slayer_weapon_stats etc.) comme source de
// verite pour la refonte "1 calculateur par skill" (plan reconnexion
// Systeme A/B). Format des lignes wiki_haiku_extract : element_name =
// "<ItemName> -- <StatName> <valeur>", raw_data.bonus_raw = valeur brute
// ("+120", "+200%", "30").
//
// **Bug reel trouve et corrige en verifiant Reaper Falchion en prod (21
// aout)** : `stat_name` n'est PAS unique par concept -- le meme stat_name
// "Damage" porte a la fois la valeur PLATE (+120, note vide) et le bonus
// vs type de mob (+200%, note="against Undead mobs") pour la meme arme.
// Une 1re version dedupliquait par stat_name (Map), perdant silencieusement
// l'une des deux lignes selon l'ordre de retour SQL -- moitie du DPS reel
// selon quelle ligne survivait. Corrige : retourne TOUS les stats (tableau,
// pas de dedup), `condition_note` inclus, l'appelant (findMobTypeBonus,
// etc.) filtre sur le texte reel (stat_name OU condition_note), jamais sur
// stat_name seul.
export type GearStat = { statName: string; value: number; isPercent: boolean; raw: string; note: string }

export async function getGearStatsFromElements(itemName: string, activity?: string): Promise<GearStat[]> {
  let query = supabase.from('pluton_elements')
    .select('stat_name, raw_data')
    .eq('source_table', 'wiki_haiku_extract')
    .ilike('element_name', `${itemName} -- %`)
  if (activity) query = query.eq('activity', activity)
  const { data } = await query
  const stats: GearStat[] = []
  for (const row of data || []) {
    const statName = row.stat_name as string | null
    const bonusRaw = (row.raw_data as any)?.bonus_raw as string | undefined
    const note = ((row.raw_data as any)?.condition_note as string | undefined) || ''
    if (!statName || !bonusRaw) continue
    const isPercent = bonusRaw.includes('%')
    const value = parseFloat(bonusRaw.replace(/[+%]/g, ''))
    if (!isFinite(value)) continue
    stats.push({ statName, value, isPercent, raw: bonusRaw, note })
  }
  return stats
}

// Trouve la valeur PLATE d'un stat nomme (ex: "Damage", "Strength") --
// exclut explicitement les lignes dont condition_note mentionne un type de
// mob (celles-la sont un bonus conditionnel, pas la valeur de base), pour
// eviter de reprendre par erreur la ligne "+200% against Undead mobs"
// comme si c'etait le "Damage" plat de l'arme.
export function findBaseStat(stats: GearStat[], statName: string): number {
  const row = stats.find(s => s.statName.toLowerCase() === statName.toLowerCase() && !/\bvs\b|\bto\b.*mobs?|\bagainst\b/i.test(s.note))
  return row?.value ?? 0
}

// Trouve la valeur d'un stat "mob-type bonus" (ex: "+200% vs Undead") parmi
// les stats d'un item -- cherche dans stat_name ET condition_note (le
// meme stat_name "Damage" porte souvent a la fois la valeur plate et le
// bonus conditionnel, distingues uniquement par condition_note).
export function findMobTypeBonus(stats: GearStat[], mobTypeKeyword: string): number {
  const kw = mobTypeKeyword.toLowerCase()
  for (const stat of stats) {
    const haystack = `${stat.statName} ${stat.note}`.toLowerCase()
    const mentionsDamage = haystack.includes('damage')
    const mentionsRelation = haystack.includes(' to ') || haystack.includes(' vs ') || haystack.includes('against ')
    if (mentionsDamage && mentionsRelation && haystack.includes(kw)) return stat.value
  }
  return 0
}
