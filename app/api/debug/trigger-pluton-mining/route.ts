// app/api/debug/trigger-pluton-mining/route.ts
// Route de debug temporaire (Phase 5 -- verification Recombobulator sur les
// sockets de gemmes Mining). Supprimee apres validation.
import { NextResponse } from 'next/server'
import { computeMiningRanking, computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'

export const maxDuration = 60

export async function GET(request: Request) {
  const url = new URL(request.url)
  const dryTier = url.searchParams.get('dryTier')
  const dryBlock = url.searchParams.get('dryBlock')
  if (dryTier && dryBlock) {
    const result = await computeMiningRanking(dryTier as any, dryBlock)
    return NextResponse.json({ success: true, result })
  }
  const result = await computeAndPersistAllMiningRankings()
  return NextResponse.json({ success: true, count: result.length, result })
}
