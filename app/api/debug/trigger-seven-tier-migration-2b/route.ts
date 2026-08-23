// TEMPORAIRE -- migration 4-tiers -> 7-tiers, Groupe 2b : Sea Creatures SEUL.
import { NextResponse } from 'next/server'
import { computeAndPersistSeaCreatureRankings } from '../../../../lib/pluton-sea-creatures'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    const seaCreatures = await computeAndPersistSeaCreatureRankings()
    return NextResponse.json({ sea_creatures: { ok: true, count: seaCreatures.length } })
  } catch (e: any) {
    return NextResponse.json({ sea_creatures: { ok: false, error: e.message } })
  }
}
