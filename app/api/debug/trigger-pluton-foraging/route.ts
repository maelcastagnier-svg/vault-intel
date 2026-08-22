// app/api/debug/trigger-pluton-foraging/route.ts
// Route de debug temporaire (Phase 5 -- verification HOTF Foraging). Supprimee apres validation.
import { NextResponse } from 'next/server'
import { computeForagingRanking, computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'

export const maxDuration = 120

export async function GET(request: Request) {
  const url = new URL(request.url)
  const dryTier = url.searchParams.get('dryTier')
  const dryBlock = url.searchParams.get('dryBlock')
  if (dryTier && dryBlock) {
    const result = await computeForagingRanking(dryTier as any, dryBlock)
    return NextResponse.json({ success: true, result })
  }
  const result = await computeAndPersistAllForagingRankings()
  return NextResponse.json({ success: true, count: result.length, result })
}
