import { NextResponse } from 'next/server'
import { computeAndPersistBestiaryRankings } from '../../../../lib/pluton-bestiary'

export const maxDuration = 100
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await computeAndPersistBestiaryRankings()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
