// lib/pluton-dungeons-boss-armor.ts
// Dungeons -- Boss Armor craft margin (31 aout, nuit) -- ferme le backlog
// `dungeons_boss_armor_craft` documente depuis le 27 aout ("marge verifiee
// reelle et positive, mais coins/h non calculable sans inventer un taux
// d'ecoulement de vente AH").
//
// Mecanique reelle sourcee (game_mechanics_misc key='goldor_s_armor', meme
// gabarit confirme pour storm_s_armor/necron -- via Necromancer Lord -- et
// Maxor implicitement par le meme Crafting Recipe Table) : chaque piece
// Goldor's/Storm's/Maxor's/Necron's se craft a l'etabli (table 3x3, PAS le
// Forge -- aucun forge_time_hours, combine instantane comme l'Enclume des
// Enchanted Books) depuis 1x piece Wither de base + 8x Giant Fragment
// specifique au boss :
//   Goldor's (TANK_WITHER_*)  <- 8x GIANT_FRAGMENT_BOULDER ("Jolly Pink Rock")
//   Storm's  (WISE_WITHER_*)  <- 8x GIANT_FRAGMENT_LASER   ("L.A.S.R.'s Eye")
//   Maxor's  (SPEED_WITHER_*) <- 8x GIANT_FRAGMENT_BIGFOOT ("Bigfoot's Bola")
//   Necron's (POWER_WITHER_*) <- 8x GIANT_FRAGMENT_DIAMOND ("Diamante's Handle")
// (mapping item_id confirme via items_catalog, pas suppose depuis le nom
// d'affichage -- Hypixel utilise des ids internes sans rapport visuel ici).
//
// Bottleneck reel : la piece Wither de base ET le set final ne se vendent
// QUE via AH (jamais vu au Bazaar dans price_history) -- contrairement aux
// Enchanted Books, le cycle n'est pas 100% instantane, il attend un
// acheteur. Le 27 aout ce gap etait reste ouvert faute d'un taux
// d'ecoulement SOURCE (rule #7 -- jamais invente). Ferme ici avec un taux
// REEL et non invente : `price_history_ah.sold_count` (deja collecte,
// jamais exploite comme cadence avant) donne le nombre reel de ventes AH
// completees par jour sur 90 jours glissants -- moyenne historique de
// marche, pas une supposition. C'est le bottleneck (largement plus lent
// que l'achat Bazaar des fragments ou le craft instantane), donc
// actions_per_hour = ventes_reelles/heure directement.
//
// Cout ingredients : fragments achetes au Bazaar (buy_price instantane,
// meme convention que Forge/Enchanted Books) ; piece Wither de base achetee
// via AH (aucun Bazaar) -- valorisee a son PRIX DE VENTE MOYEN REEL sur 90j
// (avg_sold_price, pas un buy_price de listing actif qui peut etre un
// outlier isole -- meme metrique utilisee cote revenu pour coherence
// methodologique, jamais deux conventions differentes sur le meme concept).
//
// Gear-independant (comme Enchanted Books) : meme resultat sur les 7 tiers
// Pluton -- coherent avec `lib/pluton-dungeons.ts` qui donne deja acces a
// Floor VII a tous les tiers (gap deja documente, pas aggrave ici).
import { createClient } from '@supabase/supabase-js'
import { SEVEN_TIER_KEYS } from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SETS = [
  { setName: 'Goldor', prefix: 'TANK_WITHER', baseParent: 'WITHER', fragmentId: 'GIANT_FRAGMENT_BOULDER', fragmentName: "Jolly Pink Rock" },
  { setName: 'Storm', prefix: 'WISE_WITHER', baseParent: 'WITHER', fragmentId: 'GIANT_FRAGMENT_LASER', fragmentName: "L.A.S.R.'s Eye" },
  { setName: 'Maxor', prefix: 'SPEED_WITHER', baseParent: 'WITHER', fragmentId: 'GIANT_FRAGMENT_BIGFOOT', fragmentName: "Bigfoot's Bola" },
  { setName: 'Necron', prefix: 'POWER_WITHER', baseParent: 'WITHER', fragmentId: 'GIANT_FRAGMENT_DIAMOND', fragmentName: "Diamante's Handle" },
] as const

const PIECES = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'] as const

export async function computeAndPersistDungeonsBossArmorCraftRankings(): Promise<{ pieces_evaluated: number; pieces_priced: number }> {
  const fragmentIds = SETS.map(s => s.fragmentId)
  const baseWitherIds = PIECES.map(p => `WITHER_${p}`)
  const outputIds = SETS.flatMap(s => PIECES.map(p => `${s.prefix}_${p}`))

  // Cout fragments -- Bazaar instabuy, prix frais (meme convention Forge/Enchanting).
  const { data: fragRows } = await supabase
    .from('price_history')
    .select('item_id, buy_price, bucket_date')
    .in('item_id', fragmentIds)
    .order('bucket_date', { ascending: false })
  const fragmentBuyPrice = new Map<string, number>()
  for (const r of (fragRows || [])) {
    if (!fragmentBuyPrice.has(r.item_id) && Number(r.buy_price) > 0) fragmentBuyPrice.set(r.item_id, Number(r.buy_price))
  }

  // Cout piece Wither de base + revenu piece finale -- AH uniquement, prix
  // de vente moyen reel sur 90 jours (pas un buy_price de listing isole).
  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString().split('T')[0]
  const { data: ahRows } = await supabase
    .from('price_history_ah')
    .select('base_item_id, avg_sold_price, sold_count, bucket_date')
    .in('base_item_id', [...baseWitherIds, ...outputIds])
    .gte('bucket_date', since90)

  const avgSoldPrice = new Map<string, { sum: number; n: number }>()
  const soldCount = new Map<string, number>()
  for (const r of (ahRows || [])) {
    if (r.avg_sold_price != null && Number(r.avg_sold_price) > 0) {
      const cur = avgSoldPrice.get(r.base_item_id) || { sum: 0, n: 0 }
      cur.sum += Number(r.avg_sold_price)
      cur.n += 1
      avgSoldPrice.set(r.base_item_id, cur)
    }
    if (r.sold_count != null) {
      soldCount.set(r.base_item_id, (soldCount.get(r.base_item_id) || 0) + Number(r.sold_count))
    }
  }
  const avgSold = (itemId: string): number | null => {
    const v = avgSoldPrice.get(itemId)
    return v && v.n > 0 ? v.sum / v.n : null
  }

  type PieceCalc = { setName: string; piece: string; outputId: string; margin: number; salesPerHour: number; coinsPerHour: number }
  const calcs: PieceCalc[] = []

  for (const set of SETS) {
    const fragCost = fragmentBuyPrice.get(set.fragmentId)
    if (!fragCost) continue
    for (const piece of PIECES) {
      const baseId = `WITHER_${piece}`
      const outputId = `${set.prefix}_${piece}`
      const baseCost = avgSold(baseId)
      const outputRevenue = avgSold(outputId)
      const sold90 = soldCount.get(outputId)
      if (!baseCost || !outputRevenue || !sold90 || sold90 <= 0) continue // gap honnete -- pas de prix/volume reel, jamais invente
      const cost = 8 * fragCost + baseCost
      const margin = outputRevenue - cost
      const salesPerHour = sold90 / 90 / 24
      calcs.push({ setName: set.setName, piece, outputId, margin, salesPerHour, coinsPerHour: margin * salesPerHour })
    }
  }

  if (calcs.length === 0) throw new Error('Aucune piece Boss Armor priceable -- verifier price_history/price_history_ah')

  // Delete-puis-insert scope a un block_id dedie (prefixe DUNGEONS_BOSS_ARMOR_)
  // -- additif, ne touche a aucun autre block Dungeons existant.
  const blockIds = calcs.map(c => `DUNGEONS_BOSS_ARMOR_${c.setName.toUpperCase()}_${c.piece}`)
  const { data: existingBlocks } = await supabase.from('pluton_target_blocks').select('id, block_id').eq('activity_key', 'dungeons').in('block_id', blockIds)
  const existingIds = (existingBlocks || []).map(b => b.id)
  if (existingIds.length > 0) {
    await supabase.from('pluton_rankings').delete().in('target_block_id', existingIds)
    await supabase.from('pluton_setups').delete().eq('activity_key', 'dungeons').in('tool_item_id', ['BOSS_ARMOR_CRAFT_NO_TOOL'])
    await supabase.from('pluton_target_blocks').delete().in('id', existingIds)
  }

  const blockRows = calcs.map(c => ({
    activity_key: 'dungeons',
    block_id: `DUNGEONS_BOSS_ARMOR_${c.setName.toUpperCase()}_${c.piece}`,
    block_name: `${c.setName}'s ${c.piece.charAt(0) + c.piece.slice(1).toLowerCase()} (craft Table 3x3)`,
    block_strength: 0,
    required_breaking_power: 0,
    sell_item_id: c.outputId,
    base_drop_count: 1,
    effective_sell_price: c.margin > 0 ? c.margin : 0,
    pricing_note: `Marge crafting_margin (31 aout, nuit) : 8x fragment specifique (Bazaar buy_price) + 1x piece Wither de base (AH avg_sold_price 90j) -> ${c.outputId} (AH avg_sold_price 90j). Marge=${c.margin.toFixed(0)}/craft. Cadence = taux de vente AH REEL observe (price_history_ah.sold_count, 90j glissants, ${c.salesPerHour.toFixed(4)} ventes/h) -- bottleneck reel (achat Bazaar+craft instantanes, largement plus rapides), jamais invente.`,
  }))
  const { data: insertedBlocks, error: blockErr } = await supabase.from('pluton_target_blocks').insert(blockRows).select('id, block_id')
  if (blockErr || !insertedBlocks) throw new Error(`Boss armor blocks insert failed: ${blockErr?.message}`)
  const blockIdByKey = new Map(insertedBlocks.map(b => [b.block_id, b.id]))

  const setupRows: any[] = []
  for (const c of calcs) {
    for (const tier of SEVEN_TIER_KEYS) {
      setupRows.push({
        activity_key: 'dungeons',
        tier,
        investment_level: 'optimal',
        armor_set_prefix: 'Aucune (craft Table 3x3, gear-independant)',
        tool_item_id: 'BOSS_ARMOR_CRAFT_NO_TOOL',
        total_mining_speed: 0,
        total_mining_fortune: 0,
        total_breaking_power: 0,
        real_cost: 0,
        accessories: [{ source_id: '__dungeons_boss_armor_craft__', set: c.setName, piece: c.piece }],
        _blockKey: `DUNGEONS_BOSS_ARMOR_${c.setName.toUpperCase()}_${c.piece}`,
      })
    }
  }
  const clean = setupRows.map(({ _blockKey, ...rest }) => rest)
  const { data: insertedSetups, error: setupErr } = await supabase.from('pluton_setups').insert(clean).select('id')
  if (setupErr || !insertedSetups) throw new Error(`Boss armor setups insert failed: ${setupErr?.message}`)

  const rankingRows = setupRows.map((s, i) => {
    const c = calcs.find(x => `DUNGEONS_BOSS_ARMOR_${x.setName.toUpperCase()}_${x.piece}` === s._blockKey)!
    return {
      activity_key: 'dungeons',
      tier: s.tier,
      target_block_id: blockIdByKey.get(s._blockKey)!,
      setup_id: insertedSetups[i].id,
      rank: 1,
      mining_time_seconds: c.salesPerHour > 0 ? 3600 / c.salesPerHour : 0,
      actions_per_hour: c.salesPerHour,
      yield_per_hour: c.salesPerHour,
      coins_per_hour_raw_block_only: c.coinsPerHour,
    }
  })
  const { error: rankErr } = await supabase.from('pluton_rankings').insert(rankingRows)
  if (rankErr) throw new Error(`Boss armor rankings insert failed: ${rankErr.message}`)

  return { pieces_evaluated: SETS.length * PIECES.length, pieces_priced: calcs.length }
}
