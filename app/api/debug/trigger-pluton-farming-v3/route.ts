import { NextResponse } from 'next/server'
import { computeAndPersistAllFarmingRankings } from '@/lib/pluton-farming'

export const maxDuration = 300

export async function GET() {
  try {
    const results = await computeAndPersistAllFarmingRankings()
    return NextResponse.json({ ok: true, count: results.length, results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e), stack: e?.stack ?? null }, { status: 500 })
  }
}
