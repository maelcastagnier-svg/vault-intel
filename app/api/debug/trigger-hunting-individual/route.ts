import { NextResponse } from 'next/server'
import { computeAndPersistTrapHuntingRankings } from '@/lib/pluton-hunting'

export const maxDuration = 280
export const dynamic = 'force-dynamic'

export async function GET() {
  const results = await computeAndPersistTrapHuntingRankings()
  return NextResponse.json({ count: results.length })
}
