import { NextResponse } from 'next/server'
import { computeAndPersistSeaCreatureRankings } from '@/lib/pluton-sea-creatures'

export const maxDuration = 280
export const dynamic = 'force-dynamic'

export async function GET() {
  const results = await computeAndPersistSeaCreatureRankings()
  return NextResponse.json({ count: results.length, results })
}
