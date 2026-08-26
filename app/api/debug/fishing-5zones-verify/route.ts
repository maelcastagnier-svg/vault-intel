import { NextResponse } from 'next/server'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'

export const maxDuration = 280
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const results = await computeAndPersistAllFishingRankings()
    return NextResponse.json({ success: true, combos: results.length, with_setup: results.filter(r => r.has_setup).length, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
