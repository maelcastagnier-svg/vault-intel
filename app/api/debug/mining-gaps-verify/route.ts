// Route de debug temporaire -- verification des 6 nouveaux blocs Mining
// (Ice/Sand/Red Sand/Gravel/Mycelium/Glowstone Dust) apres l'audit Collections
// officielles du 25 aout. Scope volontairement etroit (ces 6 blocs seuls,
// pas computeAndPersistAllMiningRankings() qui timeout desormais a 300s sur
// les 39 blocs -- voir maxDuration bump sur pluton-mining-refresh) -- meme
// pattern DELETE-scope-puis-INSERT que la fonction partagee, juste restreint
// a ces 6 block_id. Le cron nightly (maxDuration=400) recalculera l'ensemble
// complet, y compris ces 6 blocs, a son prochain passage. A supprimer apres
// verification.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { computeMiningRanking, MINING_TIER_KEYS } from '../../../../lib/pluton-mining'
import { loadSevenTierConfig } from '../../../../lib/pluton-engine'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const NEW_BLOCK_IDS = ['ICE', 'SAND', 'RED_SAND', 'GRAVEL', 'MYCELIUM', 'GLOWSTONE_DUST']

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { data: blocks } = await supabase
      .from('pluton_target_blocks')
      .select('id, block_id')
      .eq('activity_key', 'mining')
      .in('block_id', NEW_BLOCK_IDS)
    const blockIds = (blocks || []).map(b => b.id)
    if (blockIds.length > 0) {
      const { data: staleRankings } = await supabase
        .from('pluton_rankings')
        .select('setup_id')
        .in('target_block_id', blockIds)
      const staleSetupIds = (staleRankings || []).map(r => r.setup_id).filter(Boolean)
      await supabase.from('pluton_rankings').delete().in('target_block_id', blockIds)
      if (staleSetupIds.length > 0) await supabase.from('pluton_setups').delete().in('id', staleSetupIds)
    }

    const sevenTierConfig = await loadSevenTierConfig()
    const out: any[] = []
    for (const tier of MINING_TIER_KEYS) {
      for (const blockId of NEW_BLOCK_IDS) {
        const result = await computeMiningRanking(tier, blockId, sevenTierConfig[tier])
        if (!result.top_setup) {
          out.push({ tier, block_id: blockId, has_setup: false })
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
            total_mining_speed: Math.round(s.total_mining_speed),
            total_mining_fortune: Math.round(s.total_mining_fortune),
            total_breaking_power: s.total_breaking_power,
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

        out.push({ tier, block_id: blockId, has_setup: true, coins_per_hour_raw_block_only: s.coins_per_hour_raw_block_only, tool: s.tool_item_id, armor: s.armor_set })
      }
    }
    return NextResponse.json({ success: true, combos: out.length, with_setup: out.filter(r => r.has_setup).length, results: out })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
