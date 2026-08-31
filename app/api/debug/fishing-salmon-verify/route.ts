import { NextResponse } from 'next/server'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await computeAndPersistAllFishingRankings()
    return NextResponse.json({ success: true, count: result.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
