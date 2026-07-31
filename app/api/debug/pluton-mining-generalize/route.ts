// Temp debug route -- Bloc 8, generalisation Mining aux 9 blocs x 4 tiers.
// Deleted after validation.
import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'

export const maxDuration = 120

export async function GET() {
  const results = await computeAndPersistAllMiningRankings()
  return NextResponse.json({ count: results.length, results })
}
