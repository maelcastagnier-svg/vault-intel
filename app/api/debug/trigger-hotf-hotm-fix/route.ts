import { NextResponse } from 'next/server'
import { computeAndPersistAllForagingRankings } from '@/lib/pluton-foraging'

export const maxDuration = 120

export async function GET() {
  const results = await computeAndPersistAllForagingRankings()
  return NextResponse.json({ results })
}
