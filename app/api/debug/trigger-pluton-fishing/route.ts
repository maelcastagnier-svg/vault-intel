// app/api/debug/trigger-pluton-fishing/route.ts
// Route de debug temporaire (Phase 5 -- verification couche NBT rod ajoutee
// a tous les tiers, "ne rien laisser a moitie"). Supprimee apres validation.
import { NextResponse } from 'next/server'
import { computeFishingRanking, computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'

export const maxDuration = 60

export async function GET(request: Request) {
  const url = new URL(request.url)
  const dryTier = url.searchParams.get('dryTier')
  const dryBlock = url.searchParams.get('dryBlock')
  if (dryTier && dryBlock) {
    const result = await computeFishingRanking(dryTier as any, dryBlock)
    return NextResponse.json({ success: true, result })
  }
  const result = await computeAndPersistAllFishingRankings()
  return NextResponse.json({ success: true, count: result.length, result })
}
