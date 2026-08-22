// app/api/debug/trigger-pluton-combat/route.ts
// Route de debug temporaire (Phase 5 -- verification Reforge+Recombobulator+
// Art of War, lot "ne rien laisser a moitie"). Supprimee apres validation.
import { NextResponse } from 'next/server'
import { computeZombieSlayerRankings, computeAndPersistZombieSlayerRankings } from '../../../../lib/pluton-combat'

export const maxDuration = 90

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('dry') === '1') {
    const results = await computeZombieSlayerRankings()
    return NextResponse.json({ success: true, results })
  }
  const result = await computeAndPersistZombieSlayerRankings()
  return NextResponse.json({ success: true, ...result })
}
