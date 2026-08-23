// TEMPORAIRE -- migration 4-tiers -> 7-tiers, Groupe 4a : Slayer SEUL.
import { NextResponse } from 'next/server'
import { computeAndPersistAllSlayerRankings } from '../../../../lib/pluton-slayer'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    const slayer = await computeAndPersistAllSlayerRankings()
    return NextResponse.json({ slayer: { ok: true, count: slayer.length } })
  } catch (e: any) {
    return NextResponse.json({ slayer: { ok: false, error: e.message } })
  }
}
