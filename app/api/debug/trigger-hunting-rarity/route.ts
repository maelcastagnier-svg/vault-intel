import { NextResponse } from 'next/server'
import { computeAndPersistTrapHuntingRankings } from '@/lib/pluton-hunting'

export const maxDuration = 120

export async function GET() {
  const results = await computeAndPersistTrapHuntingRankings()
  return NextResponse.json({ count: results.length, results })
}
