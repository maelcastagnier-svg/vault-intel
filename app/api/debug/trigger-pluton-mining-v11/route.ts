import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '@/lib/pluton-mining'

export const maxDuration = 300

export async function GET() {
  const results = await computeAndPersistAllMiningRankings()
  return NextResponse.json({ ok: true, count: results.length, results })
}
