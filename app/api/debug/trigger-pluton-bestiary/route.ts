// app/api/debug/trigger-pluton-bestiary/route.ts
// Route de debug temporaire (Phase 5 -- verification couche NBT complete
// Bestiary + Sea Creature kills). Supprimee apres validation.
import { NextResponse } from 'next/server'
import { computeAndPersistBestiaryRankings } from '../../../../lib/pluton-bestiary'
import { computeSeaCreatureRanking, computeAndPersistSeaCreatureRankings } from '../../../../lib/pluton-sea-creatures'

export const maxDuration = 120

export async function GET(request: Request) {
  const url = new URL(request.url)
  const which = url.searchParams.get('which')
  const dryTier = url.searchParams.get('dryTier')
  if (which === 'sea' && dryTier) {
    const result = await computeSeaCreatureRanking(dryTier as any)
    return NextResponse.json({ success: true, result })
  }
  if (which === 'sea') {
    const result = await computeAndPersistSeaCreatureRankings()
    return NextResponse.json({ success: true, result })
  }
  const result = await computeAndPersistBestiaryRankings()
  return NextResponse.json({ success: true, ...result })
}
