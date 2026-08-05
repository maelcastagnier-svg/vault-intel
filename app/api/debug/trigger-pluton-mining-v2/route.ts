import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'

export const maxDuration = 60

export async function GET() {
  const results = await computeAndPersistAllMiningRankings()
  return NextResponse.json(results)
}
