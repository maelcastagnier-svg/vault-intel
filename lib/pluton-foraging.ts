// lib/pluton-foraging.ts
// Pluton Foraging (17 aout) -- meme discipline que lib/pluton-mining.ts et
// lib/pluton-farming.ts (jamais de constante de jeu reconstituee de memoire,
// tout source wiki officiel/Supabase), mecanique hybride des deux precedentes :
//
// - Comme Mining : une vraie stat de gear (Sweep) determine le rendement PAR
//   ACTION (logs par swing), via une formule reelle sourcee wiki "Sweep" --
//   Logs = 4*log10(1 + max(0, (Sweep+sqrt(Sweep)-Toughness)/Toughness^0.511)^1.9),
//   plafonne a 35 logs bonus + 1 log garanti = 36 logs/swing max (page wiki
//   "Sweep", tabber "Values"/description). Toughness = la meme stat que
//   Mining's Block Strength, cote-arbre (Fig Trunk=10, Mangrove Trunk/Root=50,
//   Helix=150 -- valeurs Trunk/dominantes deja stockees dans
//   pluton_target_blocks.block_strength au moment de la cartographie Foraging).
// - Comme Farming : AUCUNE stat de gear ne determine la cadence de swing --
//   confirme par l'absence totale d'un stat "Foraging Speed"/"Axe Speed" dans
//   toute la cartographie Sweep/Foraging Fortune (contrairement a Mining Speed,
//   bel et bien une vraie stat cote serveur). Decision explicite de
//   l'utilisateur (17 aout, generalisation de la regle actee le 5 aout pour
//   Farming) : reutiliser le meme plafond moteur Minecraft (20 actions/seconde,
//   20 TPS) comme debit universel de swing, qu'il soit atteint par un joueur
//   manuel optimal ou une macro -- aucune des deux methodes ne peut depasser ce
//   plafond physique, donc il sert de ceiling commun sans arbitrer laquelle est
//   utilisee (meme raisonnement que CROPS_PER_SECOND_ENGINE_CAP de Farming).
// - Foraging Fortune (stat separee de Sweep, "100 FF = chance de +1 log",
//   formule identique a Mining/Farming Fortune : ExpectedLogs = LogsPerSwing *
//   (1 + FF/100)) multiplie le rendement par swing, exactement comme Mining
//   Fortune multiplie le nombre de drops par bloc casse.
//
// Design reel confirme en sourcant (pas suppose) : le gear Torrhus/Helix
// (Toughness=150, le plus eleve) investit à 100% en Sweep, ZERO Foraging
// Fortune (absent de la table wiki "Foraging Fortune#Armor"/"#Tools") --
// coherent avec un bloc a tres haute resistance ou le vrai goulot d'etranglement
// est le rendement par swing, pas le multiplicateur de drop.
//
// MVP volontairement simplifie (documente, pas cache) :
// - Ordre de coupe (Trunk->Branches pour Fig, Branches->Trunk->Roots pour
//   Mangrove) et jet de hache : les deux infligent -50% Sweep si mal executes
//   (wiki "Sweep"). Assume toujours l'ordre optimal / jamais de jet de hache --
//   meme hypothese "joueur optimal" que le reste du calculateur Pluton.
// - Gecko Shard (Echo of Sharpening, +2%/niveau, max +20%) et Tiamat Shard
//   (Echo of Echoes, +5%/niveau, max +50%) multiplient Crow/Heron/Vulture
//   Sharpening en cascade (Tiamat boost Gecko, Gecko boost Crow/Heron/Vulture)
//   -- systeme d'Attribute Shards a slots/niveaux propre, pas encore construit
//   cote Pluton (aucune table `attribute_shard_loadouts` n'existe). Sharpening
//   modelise ici a sa valeur de base max SANS cette amplification -- gap
//   documente, meme categorie que le taux de coffre au tresor jamais modelise
//   par Mining.
// - Phanpyre/Groundhog Shard (jour/nuit), Tadgang Shard (scale avec collection
//   d'attributs communs non cataloguee), Mochibear/Bambuleaf Shard (melee/jet,
//   croisement Combat ambigu) et Agatha Starlyn Personal Best (conditionnel
//   Jacob's Contest) exclus -- situationnels/non verifies, meme discipline que
//   les "Temporary Sources" deja exclues par Farming.
// - Spruce Axe (outil starter, +4 Sweep) exclu du solveur : non trouve dans
//   item_stats/price_history_ah_variant_base (outil de tutoriel donne
//   gratuitement, jamais tradeable), coherent avec l'exclusion deja actee de
//   LEAFLET/PARK Armor (non-tradeable) pour Foraging Fortune.

import { createClient } from '@supabase/supabase-js'
import { loadPricedItems, type PricedItem } from './gear-pricing'
import { TIER_CONFIG, type TierKey } from './money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const FORAGING_TARGET_BLOCK_IDS = ['FIG_LOG', 'MANGROVE_LOG', 'HELIX_LOG'] as const
// Basic foraging deja accessible EARLY (TIER_CONFIG.early.access), contrairement
// a Farming ou Garden est explicitement interdit -- les 4 tiers reels sont
// eligibles, le filtre de budget suffit a exclure naturellement le gear
// hors de portee (meme mecanisme que Mining, aucun forbidden explicite requis).
export const FORAGING_TIER_KEYS: TierKey[] = ['early', 'mid', 'end', 'late']

// Plafond moteur Minecraft (20 TPS) -- voir doc d'en-tete, identique au
// principe deja valide et approuve par l'utilisateur pour Farming.
const SWING_PER_SECOND_ENGINE_CAP = 20
const ACTIONS_PER_HOUR_FIXED = SWING_PER_SECOND_ENGINE_CAP * 3600 // 72 000
const BONUS_LOGS_CAP = 35 // + 1 log garanti = 36 logs/swing max (wiki "Sweep")

// Logs par swing = 1 (garanti) + bonus, formule reelle wiki "Sweep#Formula".
// max(0, ...) avant l'exposant 1.9 -- evite un NaN si Sweep < Toughness (le
// bonus est alors legitimement nul, pas une puissance de nombre negatif).
export function computeLogsPerSwing(sweep: number, toughness: number): number {
  if (toughness <= 0) return 1
  const raw = (sweep + Math.sqrt(Math.max(0, sweep)) - toughness) / Math.pow(toughness, 0.511)
  if (raw <= 0) return 1
  const bonus = 4 * Math.log10(1 + Math.pow(raw, 1.9))
  return 1 + Math.min(BONUS_LOGS_CAP, bonus)
}

// Sharpening Attribute Shards -- Crow(+5/niveau max+50 vs Fig), Heron(+10/niveau
// max+100 vs Mangrove), Vulture(+15/niveau max+150 vs Helix), wiki "Sweep#Sources"
// -- bonus cible-specifique (comme Farming's Crop Fortune vs FF generique),
// valeur de base max SANS l'amplification Gecko/Tiamat (voir doc d'en-tete).
const SHARPENING_SHARD_MAX: Record<string, number> = {
  FIG_LOG: 50, MANGROVE_LOG: 100, HELIX_LOG: 150,
}
// Sweep Booster (enchant), Swoop (Tree Gift Milestone) et Long-Expired Century
// Cake (consommable, effet maintenu) sont deja des lignes stat_bonus_sources
// (equip_slot='passive') appliquees a TOUS les tiers via
// applyForagingPetsAndAccessories -- PAS repetes ici. Bug reel trouve en
// verifiant en prod (17 aout) : une premiere version les re-additionnait dans
// cette couche, comptant leur +64 en double a END/LATE (confirme par calcul
// manuel sur le total_sweep persiste : 308+114 au lieu de 308+50 attendu).
// Seul le Sharpening Shard (cible-specifique, jamais dans stat_bonus_sources
// faute de colonne target_block) appartient a cette couche.
function maxInvestmentSweepBonus(blockId: string): number {
  return SHARPENING_SHARD_MAX[blockId] ?? 0
}

export type ForagingRankingResult = {
  target_block: string
  target_block_id: number
  tier: TierKey
  top_setup: {
    armor_set: string
    tool: string
    tool_item_id: string
    total_sweep: number
    total_foraging_fortune: number
    real_cost: number
    logs_per_swing: number
    actions_per_hour: number
    yield_per_hour: number
    coins_per_hour_raw_block_only: number
    pet?: { source_id: string; rarity: string | null; sweep: number } | null
    pet_candidates_checked?: number
    accessories?: { source_id: string; equip_slot: string; sweep: number }[]
    max_investment_sweep_bonus?: number
  } | null
  eligible_combos_count: number
  total_combos_checked: number
}

// Pets (competitifs, un seul actif) + accessoires (competition REELLE par
// equip_slot ici, contrairement a Mining ou chaque slot n'avait qu'un seul
// candidat connu -- Necklace/Belt/Bracelet ont chacun 2 items reels en
// concurrence, voir migration insert_pluton_foraging_extra_gear) -- pilote
// par stat_bonus_sources, jamais une liste presupposee.
export type ForagingPetAndAccessoryLayer = {
  best_pet: { source_id: string; rarity: string | null; sweep: number } | null
  pet_candidates_checked: number
  accessories: { source_id: string; equip_slot: string; sweep: number }[]
  total_sweep: number
}

export async function applyForagingPetsAndAccessories(
  baseSweep: number,
  toughness: number,
  sellPrice: number
): Promise<ForagingPetAndAccessoryLayer> {
  const { data: sources } = await supabase
    .from('stat_bonus_sources')
    .select('source_id, equip_slot, stat_name, rarity, bonus_numeric')
    .eq('stat_name', 'sweep')
    .in('equip_slot', ['pet', 'necklace', 'cloak', 'belt', 'bracelet', 'passive'])

  const rows = sources || []

  // Accessoires + enchant/milestone/consommable ('passive') -- best-per-slot
  // reel (Honeycomb Necklace bat Mangrove Locket, Torrhus Belt bat Moonglade
  // Belt, Veilshroom Bracelet bat Mangrove Grippers -- valeurs verifiees en
  // base, pas devinees), 'passive' n'a qu'un candidat par source_id donc
  // toujours additif (pas de competition, plusieurs sources 'passive'
  // distinctes coexistent : enchant + milestone + consommable).
  const bestBySlot = new Map<string, { source_id: string; equip_slot: string; sweep: number }>()
  for (const r of rows) {
    if (r.equip_slot === 'pet') continue
    const key = r.equip_slot === 'passive' ? `passive:${r.source_id}` : r.equip_slot
    const val = Number(r.bonus_numeric) || 0
    const current = bestBySlot.get(key)
    if (!current || val > current.sweep) {
      bestBySlot.set(key, { source_id: r.source_id, equip_slot: r.equip_slot, sweep: val })
    }
  }
  const accessories = Array.from(bestBySlot.values())
  const accSweep = accessories.reduce((s, a) => s + a.sweep, 0)

  // Pets -- compares sur leur impact REEL en coins/h (formule Sweep non
  // lineaire, meme methode que Mining/applyPetsAndAccessories).
  const petRows = rows.filter(r => r.equip_slot === 'pet')
  let bestPet: ForagingPetAndAccessoryLayer['best_pet'] = null
  let bestScore = -1
  const petIds = new Set(petRows.map(r => `${r.source_id}:${r.rarity}`))
  for (const key of petIds) {
    const [source_id, rarity] = key.split(':')
    const sweep = Number(petRows.find(r => r.source_id === source_id && r.rarity === rarity)?.bonus_numeric || 0)
    const testSweep = baseSweep + accSweep + sweep
    const logsPerSwing = computeLogsPerSwing(testSweep, toughness)
    const score = ACTIONS_PER_HOUR_FIXED * logsPerSwing * sellPrice
    if (score > bestScore) {
      bestScore = score
      bestPet = { source_id, rarity: rarity === 'null' ? null : rarity, sweep }
    }
  }

  return {
    best_pet: bestPet,
    pet_candidates_checked: petIds.size,
    accessories,
    total_sweep: baseSweep + accSweep + (bestPet?.sweep || 0),
  }
}

export async function computeForagingRanking(tier: TierKey, blockId: string): Promise<ForagingRankingResult> {
  const [{ data: block }, { data: toolStats }, { data: armorStats }, priced] = await Promise.all([
    supabase.from('pluton_target_blocks').select('*').eq('activity_key', 'foraging').eq('block_id', blockId).single(),
    supabase.from('pluton_foraging_tool_stats').select('*').eq('verified', true),
    supabase.from('pluton_foraging_armor_stats').select('*'),
    loadPricedItems(),
  ])

  if (!block) throw new Error(`Unknown target block: ${blockId}`)

  const toughness = Number(block.block_strength) || 1
  const priceById = new Map<string, PricedItem>(priced.map(p => [p.item_id, p]))
  const tierConfig = TIER_CONFIG[tier]
  const armorMax = tierConfig.max_gear_cost * 3
  const toolMax = tierConfig.max_gear_cost * 3
  // Pas de plancher de prix -- meme raisonnement que Mining (5 aout) :
  // Foraging n'a que 3 sets d'armure et 6 outils reels connus (categorie
  // clairsemee), un plancher exclurait a tort le meilleur set/outil reel a
  // un tier donne au lieu de filtrer du gear sous-optimal.

  const combos: {
    armor_set: string; tool: string; tool_item_id: string
    total_sweep: number; total_foraging_fortune: number
    real_cost: number
  }[] = []
  let totalChecked = 0

  for (const armor of armorStats || []) {
    const pieces = [armor.helmet_item_id, armor.chestplate_item_id, armor.leggings_item_id, armor.boots_item_id]
    const piecePrices = pieces.map(id => priceById.get(id)?.price)
    if (piecePrices.some(p => p === undefined)) continue
    const armorCost = piecePrices.reduce((s, p) => s! + p!, 0)!
    if (armorCost > armorMax) continue

    for (const tool of toolStats || []) {
      totalChecked++
      const toolPrice = priceById.get(tool.item_id)?.price
      if (toolPrice === undefined || toolPrice > toolMax) continue

      combos.push({
        armor_set: armor.set_name,
        tool: tool.display_name,
        tool_item_id: tool.item_id,
        total_sweep: Number(armor.set_sweep) + Number(tool.base_sweep),
        total_foraging_fortune: Number(armor.set_foraging_fortune) + Number(tool.base_foraging_fortune),
        real_cost: armorCost + toolPrice,
      })
    }
  }

  // Prix reel deja calcule au moment de la cartographie (effective_sell_price,
  // meme convention que Mining pour les gemmes) -- prix Bazaar du log brut.
  const sellPrice = block.effective_sell_price != null ? Number(block.effective_sell_price) : 0

  function scoreYield(sweep: number, ff: number) {
    const logsPerSwing = computeLogsPerSwing(sweep, toughness)
    const yieldPerHour = ACTIONS_PER_HOUR_FIXED * logsPerSwing * (1 + ff / 100)
    const coinsPerHourRawBlockOnly = yieldPerHour * sellPrice
    return { logsPerSwing, yieldPerHour, coinsPerHourRawBlockOnly }
  }

  const scored = combos
    .map(c => ({ ...c, ...scoreYield(c.total_sweep, c.total_foraging_fortune) }))
    .sort((a, b) => b.coinsPerHourRawBlockOnly - a.coinsPerHourRawBlockOnly)

  let topSetup: any = scored[0] ?? null
  if (topSetup) {
    const layer = await applyForagingPetsAndAccessories(topSetup.total_sweep, toughness, sellPrice)
    let finalSweep = layer.total_sweep
    let finalFF = topSetup.total_foraging_fortune
    let maxInvestmentBonus: number | undefined

    if (tier === 'end' || tier === 'late') {
      maxInvestmentBonus = maxInvestmentSweepBonus(blockId)
      finalSweep += maxInvestmentBonus
    }

    const { logsPerSwing, yieldPerHour, coinsPerHourRawBlockOnly } = scoreYield(finalSweep, finalFF)
    topSetup = {
      ...topSetup,
      total_sweep: finalSweep,
      total_foraging_fortune: finalFF,
      pet: layer.best_pet,
      pet_candidates_checked: layer.pet_candidates_checked,
      accessories: layer.accessories,
      max_investment_sweep_bonus: maxInvestmentBonus,
      logs_per_swing: logsPerSwing,
      actions_per_hour: ACTIONS_PER_HOUR_FIXED,
      yield_per_hour: yieldPerHour,
      coins_per_hour_raw_block_only: coinsPerHourRawBlockOnly,
    }
  }

  return {
    target_block: block.block_name,
    target_block_id: block.id,
    tier,
    top_setup: topSetup,
    eligible_combos_count: combos.length,
    total_combos_checked: totalChecked,
  }
}

export type PersistedForagingResult = {
  tier: TierKey
  block_id: string
  target_block: string
  has_setup: boolean
  coins_per_hour_raw_block_only: number | null
}

export async function computeAndPersistAllForagingRankings(): Promise<PersistedForagingResult[]> {
  const out: PersistedForagingResult[] = []

  await supabase.from('pluton_rankings').delete().eq('activity_key', 'foraging')
  await supabase.from('pluton_setups').delete().eq('activity_key', 'foraging')

  for (const tier of FORAGING_TIER_KEYS) {
    for (const blockId of FORAGING_TARGET_BLOCK_IDS) {
      const result = await computeForagingRanking(tier, blockId)

      if (!result.top_setup) {
        out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: false, coins_per_hour_raw_block_only: null })
        continue
      }

      const s = result.top_setup
      const { data: setupRow, error: setupErr } = await supabase
        .from('pluton_setups')
        .insert({
          activity_key: 'foraging',
          tier,
          investment_level: 'optimal',
          armor_set_prefix: s.armor_set,
          tool_item_id: s.tool_item_id,
          // Colonnes reutilisees (entieres cote DB) -- total_mining_speed porte
          // le Sweep total, total_mining_fortune la Foraging Fortune totale
          // (meme convention de reutilisation deja appliquee par Farming pour
          // ses propres stats non-Mining).
          total_mining_speed: Math.round(s.total_sweep),
          total_mining_fortune: Math.round(s.total_foraging_fortune),
          total_breaking_power: 0,
          real_cost: s.real_cost,
          pet_id: s.pet?.source_id ?? null,
          pet_rarity: s.pet?.rarity ?? null,
          accessories: s.accessories ?? [],
        })
        .select('id')
        .single()
      if (setupErr || !setupRow) throw new Error(`pluton_setups insert failed for ${tier}/${blockId}: ${setupErr?.message}`)

      const { error: rankErr } = await supabase
        .from('pluton_rankings')
        .insert({
          activity_key: 'foraging',
          tier,
          target_block_id: result.target_block_id,
          setup_id: setupRow.id,
          rank: 1,
          mining_time_seconds: 1 / SWING_PER_SECOND_ENGINE_CAP,
          actions_per_hour: s.actions_per_hour,
          yield_per_hour: s.yield_per_hour,
          coins_per_hour_raw_block_only: s.coins_per_hour_raw_block_only,
        })
      if (rankErr) throw new Error(`pluton_rankings insert failed for ${tier}/${blockId}: ${rankErr.message}`)

      out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: true, coins_per_hour_raw_block_only: s.coins_per_hour_raw_block_only })
    }
  }

  return out
}
