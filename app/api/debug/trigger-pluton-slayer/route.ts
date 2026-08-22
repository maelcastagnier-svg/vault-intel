// app/api/debug/trigger-pluton-slayer/route.ts
// Route de debug temporaire (Phase 5 -- verification Bane Essence Shop
// Spider). Supprimee apres validation.
import { NextResponse } from 'next/server'
import { computeSlayerRanking, computeAndPersistAllSlayerRankings } from '../../../../lib/pluton-slayer'

export const maxDuration = 120

export async function GET(request: Request) {
  const url = new URL(request.url)
  const dryTier = url.searchParams.get('dryTier')
  const dryBlock = url.searchParams.get('dryBlock')
  if (dryTier && dryBlock) {
    const result = await computeSlayerRanking(dryTier as any, dryBlock)
    return NextResponse.json({ success: true, result })
  }
  const result = await computeAndPersistAllSlayerRankings()
  return NextResponse.json({ success: true, count: result.length, result })
}
