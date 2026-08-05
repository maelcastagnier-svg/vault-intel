import { NextResponse } from 'next/server'
import { computeMiningRanking, MINING_TARGET_BLOCK_IDS } from '../../../../lib/pluton-mining'
import type { TierKey } from '../../../../lib/money-making-constants'

export const maxDuration = 60

const TIERS: TierKey[] = ['mid', 'end', 'late']

export async function GET() {
  const results: any = {}
  for (const tier of TIERS) {
    const perBlock = []
    for (const blockId of MINING_TARGET_BLOCK_IDS) {
      perBlock.push(await computeMiningRanking(tier, blockId))
    }
    perBlock.sort((a, b) => (b.top_setup?.coins_per_hour_raw_block_only ?? -1) - (a.top_setup?.coins_per_hour_raw_block_only ?? -1))
    results[tier] = perBlock
  }
  return NextResponse.json(results)
}
