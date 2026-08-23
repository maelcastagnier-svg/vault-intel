import { NextResponse } from 'next/server'
import { computeAndPersistSeaCreatureRankings } from '@/lib/pluton-sea-creatures'

export const maxDuration = 280

export async function GET() {
  const results = await computeAndPersistSeaCreatureRankings()
  return NextResponse.json({ count: results.length, results })
}
