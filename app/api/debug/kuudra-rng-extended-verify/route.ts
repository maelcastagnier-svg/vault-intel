import { NextResponse } from 'next/server'
import { computeAndPersistKuudraRngPoolRankings } from '../../../../lib/pluton-kuudra'

export const maxDuration = 90
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await computeAndPersistKuudraRngPoolRankings()
    return NextResponse.json({ success: true, result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
