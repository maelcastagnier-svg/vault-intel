// lib/pluton-mining.ts
// Bloc 8 (audit 8 blocs), 31 juillet -- Pluton, calculateur Mining. 100%
// déterministe (SQL/JS pur), zéro appel Claude à l'exécution -- voir
// CLAUDE.md pour la contrainte explicite de l'utilisateur.
//
// Formules utilisées (toutes sourcées des pages wiki déjà en cache, voir
// 8.2 -- jamais reconstituées de mémoire) :
// - Mining Time (ticks) = round(Block Strength * 30 / Mining Speed)
// - Softcap : "Softcap = floor((20/3) * Block Strength) + 1" -- bug réel
//   trouvé en testant le cas concret Mithril MID (31 juillet) : cette
//   formule est exprimée en unités de MINING SPEED (le seuil de vitesse
//   minimum pour atteindre le plancher de 4 ticks), PAS un nombre de ticks
//   -- confirmé par les exemples du wiki (colonne "Softcap" = 54/101/134/
//   3334 pour Netherrack/Stone/Cobblestone/Obsidian, des ordres de grandeur
//   de vitesse, pas de ticks). Comparer directement raw ticks à cette
//   valeur (comme fait dans une 1re version) gonflait artificiellement le
//   temps de minage à des centaines de secondes par bloc quelle que soit la
//   vitesse réelle -- le vrai plancher est simplement 4 ticks, littéral,
//   jamais recalculé par bloc.
// - Mining Fortune : chaque 100 = +1 drop garanti, le reste = % de chance
//
// MVP volontairement simplifié (documenté, pas caché) :
// - Bypass instamine (30x/60x Block Strength) PAS implémenté -- les deux
//   pages wiki sourcées se contredisent sur le multiplicateur exact pour un
//   minerai (30x vs 60x), et à MID tier la vitesse nécessaire pour l'atteindre
//   (15-30k+) est de toute façon hors de portée -- non pertinent pour ce
//   premier calcul, à trancher si un calcul LATE tier s'en approche un jour.
// - Un seul palier d'investissement calculé ('optimal', prix blended de
//   base -- pas de variation étoiles/reforge) -- les 3 paliers Budget/
//   Optimal/Endgame validés en 8.1 seront ajoutés en généralisant, pas
//   nécessaires pour valider le mécanisme sur un premier cas concret.
// - Armure ne contribue jamais de Breaking Power (confirmé par la page
//   wiki "Breaking Power" -- seuls les outils en donnent).
//
// coins_per_hour_raw_block_only (PAS coins_per_hour) -- champ nommé
// explicitement ainsi (31 juillet) après un vrai caveat soulevé par
// l'utilisateur : ce chiffre ne compte QUE la vente du bloc brut lui-même
// au Bazaar, jamais les vrais à-côtés de valeur du minage réel (coffres au
// trésor Crystal Hollows, Mithril/Gemstone/Glacite Powder, Mining Fiesta).
// Recherché avant d'écarter (pas juste supposé hors scope) : le vrai
// contenu des tables de loot des coffres existe déjà en cache
// (game_mechanics_misc.crystal_hollows_mithril_deposits_loot -- table
// pondérée réelle) mais le TAUX d'obtention d'un coffre par bloc miné
// n'est sourcé nulle part dans le cache -- vérifié explicitement contre
// 'treasure_chance', qui s'avère être un stat Fishing sans rapport avec
// le minage. Sans ce taux, inclure la table de loot reviendrait à deviner
// un nombre (interdit par la règle 7). Mining Fiesta (Refined Mineral/
// Glossy Gemstone) est en plus un bonus d'event borné dans le temps
// (~11h40 réelles par mandat de maire), pas un taux permanent -- l'inclure
// dans un coins/h "à l'instant T" le représenterait à tort comme toujours
// actif. Mithril Powder est une monnaie HotM non tradeable (plafond 2Md),
// aucune valeur marché directe. Les trois écartés explicitement plutôt que
// forcés -- vraie extension future (8.x), pas un chantier "rapide".
import { createClient } from '@supabase/supabase-js'
import { loadPricedItems, type PricedItem } from './gear-pricing'
import { TIER_CONFIG, type TierKey } from './money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type MiningRankingResult = {
  target_block: string
  target_block_id: number
  tier: string
  top_setup: {
    armor_set: string
    tool: string
    tool_item_id: string
    total_mining_speed: number
    total_mining_fortune: number
    total_breaking_power: number
    real_cost: number
    mining_time_seconds: number
    actions_per_hour: number
    yield_per_hour: number
    coins_per_hour_raw_block_only: number
  } | null
  eligible_combos_count: number
  total_combos_checked: number
}

export const MINING_TARGET_BLOCK_IDS = [
  'COAL_ORE', 'IRON_ORE', 'GOLD_ORE', 'DIAMOND_ORE',
  'MITHRIL_ORE', 'TITANIUM_ORE', 'RUBY_GEMSTONE', 'JADE_GEMSTONE', 'GLACITE',
] as const

export const MINING_TIER_KEYS: TierKey[] = ['early', 'mid', 'end', 'late']

export async function computeMiningRanking(tier: TierKey, blockId: string): Promise<MiningRankingResult> {
  const [{ data: block }, { data: toolStats }, { data: armorStats }, priced] = await Promise.all([
    supabase.from('pluton_target_blocks').select('*').eq('activity_key', 'mining').eq('block_id', blockId).single(),
    supabase.from('pluton_mining_tool_stats').select('*').eq('verified', true),
    supabase.from('pluton_mining_armor_stats').select('*'),
    loadPricedItems(),
  ])

  if (!block) throw new Error(`Unknown target block: ${blockId}`)

  const priceById = new Map<string, PricedItem>(priced.map(p => [p.item_id, p]))
  const tierConfig = TIER_CONFIG[tier]
  const armorMin = tierConfig.max_gear_cost / 25
  const armorMax = tierConfig.max_gear_cost * 3
  const toolMax  = tierConfig.max_gear_cost * 3 // pas de plancher pour les outils, voir 8.3

  const combos: {
    armor_set: string; tool: string; tool_item_id: string
    total_mining_speed: number; total_mining_fortune: number; total_breaking_power: number
    real_cost: number
  }[] = []
  let totalChecked = 0

  for (const armor of armorStats || []) {
    const pieces = [armor.helmet_item_id, armor.chestplate_item_id, armor.leggings_item_id, armor.boots_item_id]
    const piecePrices = pieces.map(id => priceById.get(id)?.price)
    if (piecePrices.some(p => p === undefined)) continue // un ou plusieurs items sans prix réel récent -- skip, jamais inventé
    const armorCost = piecePrices.reduce((s, p) => s! + p!, 0)!
    if (armorCost < armorMin || armorCost > armorMax) continue

    for (const tool of toolStats || []) {
      totalChecked++
      const toolPrice = priceById.get(tool.item_id)?.price
      if (toolPrice === undefined || toolPrice > toolMax) continue

      const totalBP = tool.base_breaking_power
      if (totalBP < block.required_breaking_power) continue // filtre d'éligibilité, 8.2

      combos.push({
        armor_set: armor.set_name,
        tool: tool.display_name,
        tool_item_id: tool.item_id,
        total_mining_speed:   armor.set_mining_speed + tool.base_mining_speed,
        total_mining_fortune: Number(armor.set_mining_fortune) + Number(tool.base_mining_fortune),
        total_breaking_power: totalBP,
        real_cost: armorCost + toolPrice,
      })
    }
  }

  // Le drop d'un bloc miné se vend au Bazaar (MITHRIL_ORE, GLACITE, gemmes
  // brutes...), jamais sur l'AH -- bug réel trouvé en testant : loadPricedItems()
  // ne lit que price_history_ah (armure/outils), donnant un sellPrice de 0
  // silencieux et un coins_per_hour toujours nul. Prix Bazaar réel requis séparément.
  const { data: bazaarPriceRow } = await supabase
    .from('price_history')
    .select('sell_price, bucket_date')
    .eq('item_id', block.sell_item_id)
    .gt('sell_price', 0)
    .order('bucket_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sellPrice = Number(bazaarPriceRow?.sell_price) || 0

  const scored = combos
    .filter(c => c.total_mining_speed > 0)
    .map(c => {
      const miningTimeTicks = Math.round((block.block_strength * 30) / c.total_mining_speed)
      // Plancher littéral de 4 ticks (0.2s) -- jamais plus rapide sans
      // instamine (non implémenté cette passe, voir en-tête de fichier).
      const effectiveTicks = Math.max(miningTimeTicks, 4)
      const miningTimeSeconds = effectiveTicks / 20
      const actionsPerHour = 3600 / miningTimeSeconds
      const yieldPerHour = actionsPerHour * (1 + c.total_mining_fortune / 100)
      const coinsPerHourRawBlockOnly = yieldPerHour * sellPrice
      return { ...c, mining_time_seconds: miningTimeSeconds, actions_per_hour: actionsPerHour, yield_per_hour: yieldPerHour, coins_per_hour_raw_block_only: coinsPerHourRawBlockOnly }
    })
    .sort((a, b) => b.coins_per_hour_raw_block_only - a.coins_per_hour_raw_block_only)

  return {
    target_block: block.block_name,
    target_block_id: block.id,
    tier,
    top_setup: scored[0] ?? null,
    eligible_combos_count: combos.length,
    total_combos_checked: totalChecked,
  }
}

// Généralise computeMiningRanking() aux 9 blocs cibles x 4 tiers (31
// juillet, Bloc 8 -- après validation du cas concret Mithril MID) et
// persiste le résultat dans pluton_setups/pluton_rankings. Même limite de
// scope que le MVP validé : un seul palier d'investissement ('optimal'),
// et seul le TOP 1 setup par (tier, bloc) est retenu -- pluton_rankings
// admet une colonne `rank` pour un futur top N, pas construit cette passe,
// jamais fabriqué au-delà du setup réellement calculé comme meilleur.
// Certaines combinaisons (bloc à forte Breaking Power requise à un tier
// bas budget) produiront honnêtement top_setup:null / eligible_combos:0
// -- pas persistées (rien à classer), pas un bug.
export type PersistedMiningResult = {
  tier: TierKey
  block_id: string
  target_block: string
  has_setup: boolean
  coins_per_hour_raw_block_only: number | null
}

export async function computeAndPersistAllMiningRankings(): Promise<PersistedMiningResult[]> {
  const out: PersistedMiningResult[] = []

  for (const tier of MINING_TIER_KEYS) {
    for (const blockId of MINING_TARGET_BLOCK_IDS) {
      const result = await computeMiningRanking(tier, blockId)

      if (!result.top_setup) {
        out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: false, coins_per_hour_raw_block_only: null })
        continue
      }

      const s = result.top_setup
      const { data: setupRow, error: setupErr } = await supabase
        .from('pluton_setups')
        .insert({
          activity_key: 'mining',
          tier,
          investment_level: 'optimal',
          armor_set_prefix: s.armor_set,
          tool_item_id: s.tool_item_id,
          total_mining_speed: s.total_mining_speed,
          total_mining_fortune: s.total_mining_fortune,
          total_breaking_power: s.total_breaking_power,
          real_cost: s.real_cost,
        })
        .select('id')
        .single()
      if (setupErr || !setupRow) throw new Error(`pluton_setups insert failed for ${tier}/${blockId}: ${setupErr?.message}`)

      const { error: rankErr } = await supabase
        .from('pluton_rankings')
        .insert({
          activity_key: 'mining',
          tier,
          target_block_id: result.target_block_id,
          setup_id: setupRow.id,
          rank: 1,
          mining_time_seconds: s.mining_time_seconds,
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
