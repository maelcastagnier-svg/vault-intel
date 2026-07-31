// lib/pluton-mining.ts
// Bloc 8 (audit 8 blocs), 31 juillet -- Pluton, calculateur Mining. 100%
// déterministe (SQL/JS pur), zéro appel Claude à l'exécution -- voir
// CLAUDE.md pour la contrainte explicite de l'utilisateur.
//
// Formules utilisées (toutes sourcées des pages wiki déjà en cache, voir
// 8.2 -- jamais reconstituées de mémoire) :
// - Mining Time (ticks) = round(Block Strength * 30 / Mining Speed)
// - Softcap (ticks)     = floor((20/3) * Block Strength) + 1  [jamais < 4 ticks]
// - Mining Fortune      : chaque 100 = +1 drop garanti, le reste = % de chance
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
import { createClient } from '@supabase/supabase-js'
import { loadPricedItems, type PricedItem } from './gear-pricing'
import { TIER_CONFIG, type TierKey } from './money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type MiningRankingResult = {
  target_block: string
  tier: string
  top_setup: {
    armor_set: string
    tool: string
    total_mining_speed: number
    total_mining_fortune: number
    total_breaking_power: number
    real_cost: number
    mining_time_seconds: number
    actions_per_hour: number
    yield_per_hour: number
    coins_per_hour: number
  } | null
  eligible_combos_count: number
  total_combos_checked: number
}

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
    armor_set: string; tool: string
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
      const softcapTicks = Math.floor((20 / 3) * block.block_strength) + 1
      const effectiveTicks = Math.max(miningTimeTicks, softcapTicks, 4)
      const miningTimeSeconds = effectiveTicks / 20
      const actionsPerHour = 3600 / miningTimeSeconds
      const yieldPerHour = actionsPerHour * (1 + c.total_mining_fortune / 100)
      const coinsPerHour = yieldPerHour * sellPrice
      return { ...c, mining_time_seconds: miningTimeSeconds, actions_per_hour: actionsPerHour, yield_per_hour: yieldPerHour, coins_per_hour: coinsPerHour }
    })
    .sort((a, b) => b.coins_per_hour - a.coins_per_hour)

  return {
    target_block: block.block_name,
    tier,
    top_setup: scored[0] ?? null,
    eligible_combos_count: combos.length,
    total_combos_checked: totalChecked,
  }
}
