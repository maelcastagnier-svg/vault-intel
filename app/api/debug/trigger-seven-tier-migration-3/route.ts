// TEMPORAIRE -- migration 4-tiers -> 7-tiers, Groupe 3a : Farming SEUL.
import { NextResponse } from 'next/server'
import { computeAndPersistAllFarmingRankings } from '../../../../lib/pluton-farming'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    const farming = await computeAndPersistAllFarmingRankings()
    return NextResponse.json({ farming: { ok: true, count: farming.length } })
  } catch (e: any) {
    return NextResponse.json({ farming: { ok: false, error: e.message } })
  }
}
