// app/api/debug/trigger-pluton-combat/route.ts
// Route de debug temporaire (Phase 5 -- verification du lot complet
// Gemmes+Potato Books ajoute a Sharpness/Smite/Critical). Supprimee apres
// validation, meme pattern que toute route de debug du projet.
import { NextResponse } from 'next/server'
import { computeZombieSlayerRankings, computeAndPersistZombieSlayerRankings } from '../../../../lib/pluton-combat'

export const maxDuration = 60

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('dry') === '1') {
    const results = await computeZombieSlayerRankings()
    return NextResponse.json({ success: true, results })
  }
  const result = await computeAndPersistZombieSlayerRankings()
  return NextResponse.json({ success: true, ...result })
}
