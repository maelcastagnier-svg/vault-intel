// TEMPORAIRE -- migration 4-tiers -> 7-tiers, Groupe 2a : Fishing SEUL.
import { NextResponse } from 'next/server'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    const fishing = await computeAndPersistAllFishingRankings()
    return NextResponse.json({ fishing: { ok: true, count: fishing.length } })
  } catch (e: any) {
    return NextResponse.json({ fishing: { ok: false, error: e.message } })
  }
}
