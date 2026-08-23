import { NextResponse } from 'next/server'
import { computeAndPersistKuudraRankings } from '@/lib/pluton-kuudra'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function GET() {
  const results = await computeAndPersistKuudraRankings()
  return NextResponse.json({ count: results.length, results })
}
