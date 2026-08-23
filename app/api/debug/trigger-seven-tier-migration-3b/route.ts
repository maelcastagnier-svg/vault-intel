// TEMPORAIRE -- migration 4-tiers -> 7-tiers, Groupe 3b : Foraging SEUL.
import { NextResponse } from 'next/server'
import { computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    const foraging = await computeAndPersistAllForagingRankings()
    return NextResponse.json({ foraging: { ok: true, count: foraging.length } })
  } catch (e: any) {
    return NextResponse.json({ foraging: { ok: false, error: e.message } })
  }
}
