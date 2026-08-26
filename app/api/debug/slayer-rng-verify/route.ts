import { NextResponse } from 'next/server'
import { computeAndPersistSlayerRngPoolRankings } from '../../../../lib/pluton-slayer'

export const maxDuration = 280
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await computeAndPersistSlayerRngPoolRankings()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
