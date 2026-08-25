// TEMPORAIRE -- verification Vorpal Katana (Enderman Slayer, nouveau
// candidat palier mid). A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllSlayerRankings } from '../../../../lib/pluton-slayer'

export const dynamic = 'force-dynamic'
export const maxDuration = 280

export async function GET() {
  const all = await computeAndPersistAllSlayerRankings()
  return NextResponse.json({ combos: all.length })
}
