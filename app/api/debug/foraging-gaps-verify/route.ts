// Route de debug temporaire -- verification des 6 nouveaux bois de base
// (Oak/Spruce/Birch/Jungle/Acacia/Dark Oak) apres l'audit Collections
// officielles du 25 aout. Scope volontairement etroit (ces 6 blocs seuls,
// pas computeAndPersistAllForagingRankings() -- meme lecon que le timeout
// rencontre sur Mining) -- delete+insert manuel scope a ces 6 block_id
// seuls (pas de delete blanket activity_key ici, contrairement a la
// fonction partagee -- les 15 blocs existants restent intacts). Le cron
// nightly (maxDuration=240) recalculera l'ensemble complet a son prochain
// passage. A supprimer apres verification.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { computeForagingRanking, FORAGING_TIER_KEYS } from '../../../../lib/pluton-foraging'
import { loadSevenTierConfig } from '../../../../lib/pluton-engine'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const NEW_BLOCK_IDS = ['OAK_LOG', 'SPRUCE_LOG', 'BIRCH_LOG', 'JUNGLE_LOG', 'ACACIA_LOG', 'DARK_OAK_LOG']

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { data: blocks } = await supabase
      .from('pluton_target_blocks')
      .select('id, block_id')
      .eq('activity_key', 'foraging')
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
    for (const tier of FORAGING_TIER_KEYS) {
      for (const blockId of NEW_BLOCK_IDS) {
        const result = await computeForagingRanking(tier, blockId, sevenTierConfig[tier])
        if (!result.top_setup) {
          out.push({ tier, block_id: blockId, has_setup: false })
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
            mining_time_seconds: 1 / 20,
            actions_per_hour: s.actions_per_hour,
            yield_per_hour: s.yield_per_hour,
            coins_per_hour_raw_block_only: s.coins_per_hour_raw_block_only,
          })
        if (rankErr) throw new Error(`pluton_rankings insert failed for ${tier}/${blockId}: ${rankErr.message}`)

        out.push({ tier, block_id: blockId, has_setup: true, coins_per_hour_raw_block_only: s.coins_per_hour_raw_block_only, tool: s.tool_item_id, armor: s.armor_set, sweep: s.total_sweep })
      }
    }
    return NextResponse.json({ success: true, combos: out.length, with_setup: out.filter(r => r.has_setup).length, results: out })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
