// lib/pluton-dungeons-perfect-armor.ts
// Dungeons -- Perfect Armor craft margin (31 aout, nuit) -- ferme le
// backlog `dungeons_perfect_armor_progression` (46 items) trouve par
// l'agent de recherche du meme soir.
//
// Mecanique reelle sourcee (game_mechanics_misc key='perfect_armor',
// sections "Crafting"/"Upgrading"/"Materials Needed") : Perfect Armor
// (Helmet/Chestplate/Leggings/Boots) se CRAFTE, ce n'est PAS un drop.
// Tier I -- craft initial a la Table 3x3, cout EN ENCHANTED DIAMOND BLOCK
// different par piece (recompte exact depuis la grille de craft wikitext,
// somme=24 confirmee par la table "Materials Needed" du wiki) :
//   Helmet=5, Chestplate=8, Leggings=7, Boots=4
// Tier II->XII -- chaque palier = +4 Enchanted Diamond Block/piece (confirme
// "Upgrade (1 piece) = 4 EDB", "Upgrade (full set) = 16 EDB" = 4x4 pieces).
// Cout cumule pour atteindre le tier N (1<=N<=12) = coutTierI + 4*(N-1).
//
// **Tier XIII explicitement HORS SCOPE, gap documente pas invente** :
// necessite 4x Perfectly Cut Diamond/piece (au lieu d'Enchanted Diamond
// Block), lui-meme un craft imbrique (Refined Diamond + Diamond Essence)
// dont aucun prix Bazaar/AH n'a ete trouve ce soir (price_history vide sur
// PERFECTLY_CUT_DIAMOND) -- plutot que de deviner ce cout, les tiers I-XII
// seuls sont evalues.
//
// Craft/upgrade instantane (Table 3x3, comme le Boss Armor Wither du meme
// soir) -- bottleneck reel = vente AH (aucun Bazaar sur Perfect Armor,
// confirme price_history vide). Meme methodologie que lib/pluton-dungeons-
// boss-armor.ts : cadence de vente REELLE via price_history_ah.sold_count
// (90j glissants), jamais inventee. Recherche reelle du meilleur tier par
// piece (1-12, celui qui maximise le profit reel) -- pas un tier fixe
// suppose optimal, meme discipline "recherche sur l'espace des candidats"
// que le reste de Pluton.
import { createClient } from '@supabase/supabase-js'
import { SEVEN_TIER_KEYS } from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PIECE_TIER1_EDB_COST: Record<string, number> = { HELMET: 5, CHESTPLATE: 8, LEGGINGS: 7, BOOTS: 4 }
const MAX_TIER = 12 // Tier XIII hors scope (Perfectly Cut Diamond non price)

export async function computeAndPersistDungeonsPerfectArmorRankings(): Promise<{ pieces_evaluated: number; pieces_priced: number }> {
  const { data: edbRows } = await supabase
    .from('price_history')
    .select('buy_price, bucket_date')
    .eq('item_id', 'ENCHANTED_DIAMOND_BLOCK')
    .order('bucket_date', { ascending: false })
    .limit(1)
  const edbPrice = Number(edbRows?.[0]?.buy_price) || 0
  if (!edbPrice) throw new Error('Enchanted Diamond Block non price -- impossible de calculer le cout')

  const pieceNames = Object.keys(PIECE_TIER1_EDB_COST)
  const allOutputIds = pieceNames.flatMap(p => Array.from({ length: MAX_TIER }, (_, i) => `PERFECT_${p}_${i + 1}`))

  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString().split('T')[0]
  const { data: ahRows } = await supabase
    .from('price_history_ah')
    .select('base_item_id, avg_sold_price, sold_count')
    .in('base_item_id', allOutputIds)
    .gte('bucket_date', since90)

  const avgSoldPrice = new Map<string, { sum: number; n: number }>()
  const soldCount = new Map<string, number>()
  for (const r of (ahRows || [])) {
    if (r.avg_sold_price != null && Number(r.avg_sold_price) > 0) {
      const cur = avgSoldPrice.get(r.base_item_id) || { sum: 0, n: 0 }
      cur.sum += Number(r.avg_sold_price); cur.n += 1
      avgSoldPrice.set(r.base_item_id, cur)
    }
    if (r.sold_count != null) soldCount.set(r.base_item_id, (soldCount.get(r.base_item_id) || 0) + Number(r.sold_count))
  }
  const avgSold = (id: string): number | null => { const v = avgSoldPrice.get(id); return v && v.n > 0 ? v.sum / v.n : null }

  type PieceCalc = { piece: string; bestTier: number; margin: number; salesPerHour: number; coinsPerHour: number; outputId: string }
  const calcs: PieceCalc[] = []

  for (const piece of pieceNames) {
    let best: PieceCalc | null = null
    for (let tier = 1; tier <= MAX_TIER; tier++) {
      const outputId = `PERFECT_${piece}_${tier}`
      const revenue = avgSold(outputId)
      const sold90 = soldCount.get(outputId)
      if (!revenue || !sold90 || sold90 <= 0) continue // gap honnete -- pas de prix/volume reel a ce tier
      const edbCount = PIECE_TIER1_EDB_COST[piece] + 4 * (tier - 1)
      const cost = edbCount * edbPrice
      const margin = revenue - cost
      const salesPerHour = sold90 / 90 / 24
      const coinsPerHour = margin * salesPerHour
      if (!best || coinsPerHour > best.coinsPerHour) {
        best = { piece, bestTier: tier, margin, salesPerHour, coinsPerHour, outputId }
      }
    }
    if (best) calcs.push(best)
  }

  if (calcs.length === 0) throw new Error('Aucune piece Perfect Armor priceable -- verifier price_history_ah')

  const blockIds = calcs.map(c => `DUNGEONS_PERFECT_ARMOR_${c.piece}`)
  const { data: existingBlocks } = await supabase.from('pluton_target_blocks').select('id').eq('activity_key', 'dungeons').in('block_id', blockIds)
  const existingIds = (existingBlocks || []).map(b => b.id)
  if (existingIds.length > 0) {
    await supabase.from('pluton_rankings').delete().in('target_block_id', existingIds)
    await supabase.from('pluton_setups').delete().eq('activity_key', 'dungeons').eq('tool_item_id', 'PERFECT_ARMOR_CRAFT_NO_TOOL')
    await supabase.from('pluton_target_blocks').delete().in('id', existingIds)
  }

  const blockRows = calcs.map(c => ({
    activity_key: 'dungeons',
    block_id: `DUNGEONS_PERFECT_ARMOR_${c.piece}`,
    block_name: `Perfect ${c.piece.charAt(0) + c.piece.slice(1).toLowerCase()} -- Tier ${c.bestTier} (craft Table 3x3)`,
    block_strength: 0,
    required_breaking_power: 0,
    sell_item_id: c.outputId,
    base_drop_count: 1,
    effective_sell_price: c.margin > 0 ? c.margin : 0,
    pricing_note: `Marge crafting_margin (31 aout, nuit) : recherche reelle sur les tiers I-XII, meilleur trouve = Tier ${c.bestTier} (Enchanted Diamond Block x${PIECE_TIER1_EDB_COST[c.piece] + 4 * (c.bestTier - 1)} @ ${edbPrice.toFixed(0)}/u -> ${c.outputId} @ ${(c.margin + (PIECE_TIER1_EDB_COST[c.piece] + 4 * (c.bestTier - 1)) * edbPrice).toFixed(0)} AH avg_sold_price 90j). Marge=${c.margin.toFixed(0)}/piece. Cadence = taux de vente AH REEL (price_history_ah.sold_count, 90j glissants, ${c.salesPerHour.toFixed(4)} ventes/h) -- bottleneck reel, craft instantane. Tier XIII hors scope (Perfectly Cut Diamond non price).`,
  }))
  const { data: insertedBlocks, error: blockErr } = await supabase.from('pluton_target_blocks').insert(blockRows).select('id, block_id')
  if (blockErr || !insertedBlocks) throw new Error(`Perfect armor blocks insert failed: ${blockErr?.message}`)
  const blockIdByKey = new Map(insertedBlocks.map(b => [b.block_id, b.id]))

  const setupRows: any[] = []
  for (const c of calcs) {
    for (const tier of SEVEN_TIER_KEYS) {
      setupRows.push({
        activity_key: 'dungeons', tier, investment_level: 'optimal',
        armor_set_prefix: 'Aucune (craft Table 3x3, gear-independant)',
        tool_item_id: 'PERFECT_ARMOR_CRAFT_NO_TOOL',
        total_mining_speed: 0, total_mining_fortune: 0, total_breaking_power: 0, real_cost: 0,
        accessories: [{ source_id: '__dungeons_perfect_armor_craft__', piece: c.piece, best_tier: c.bestTier }],
        _blockKey: `DUNGEONS_PERFECT_ARMOR_${c.piece}`,
      })
    }
  }
  const clean = setupRows.map(({ _blockKey, ...rest }) => rest)
  const { data: insertedSetups, error: setupErr } = await supabase.from('pluton_setups').insert(clean).select('id')
  if (setupErr || !insertedSetups) throw new Error(`Perfect armor setups insert failed: ${setupErr?.message}`)

  const rankingRows = setupRows.map((s, i) => {
    const c = calcs.find(x => `DUNGEONS_PERFECT_ARMOR_${x.piece}` === s._blockKey)!
    return {
      activity_key: 'dungeons', tier: s.tier,
      target_block_id: blockIdByKey.get(s._blockKey)!,
      setup_id: insertedSetups[i].id, rank: 1,
      mining_time_seconds: c.salesPerHour > 0 ? 3600 / c.salesPerHour : 0,
      actions_per_hour: c.salesPerHour, yield_per_hour: c.salesPerHour,
      coins_per_hour_raw_block_only: c.coinsPerHour,
    }
  })
  const { error: rankErr } = await supabase.from('pluton_rankings').insert(rankingRows)
  if (rankErr) throw new Error(`Perfect armor rankings insert failed: ${rankErr.message}`)

  return { pieces_evaluated: pieceNames.length, pieces_priced: calcs.length }
}
