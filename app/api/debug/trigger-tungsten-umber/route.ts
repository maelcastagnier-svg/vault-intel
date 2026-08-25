// TEMPORAIRE -- verification Tungsten/Umber. A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const all = await computeAndPersistAllMiningRankings()
  return NextResponse.json({ combos: all.length })
}
