// TEMPORAIRE -- migration 4-tiers -> 7-tiers, Groupe 4b : Dungeons SEUL.
import { NextResponse } from 'next/server'
import { computeAndPersistAllDungeonsRankings } from '../../../../lib/pluton-dungeons'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    const dungeons = await computeAndPersistAllDungeonsRankings()
    return NextResponse.json({ dungeons: { ok: true, count: dungeons.length, with_setup: dungeons.filter((r: any) => r.has_setup).length } })
  } catch (e: any) {
    return NextResponse.json({ dungeons: { ok: false, error: e.message } })
  }
}
