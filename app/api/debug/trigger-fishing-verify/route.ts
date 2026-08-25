// TEMPORAIRE -- verification Speedy Line (Rod Part, +10 Fishing Speed)
// ajoutee a lib/pluton-fishing.ts. A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET() {
  const all = await computeAndPersistAllFishingRankings()
  return NextResponse.json({ combos: all.length })
}
