// Route de debug TEMPORAIRE -- verification Sea Creature kills avant creation
// du cron. A supprimer apres validation (meme discipline que les 6
// activites precedentes).
import { NextResponse } from 'next/server'
import { computeAndPersistSeaCreatureRankings } from '../../../../lib/pluton-sea-creatures'

export const maxDuration = 60

export async function GET() {
  try {
    const results = await computeAndPersistSeaCreatureRankings()
    return NextResponse.json({ success: true, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
