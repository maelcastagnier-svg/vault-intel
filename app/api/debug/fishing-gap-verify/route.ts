import { NextResponse } from 'next/server'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'
import { computeAndPersistSeaCreatureRankings } from '../../../../lib/pluton-sea-creatures'

export const maxDuration = 280
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const fishing = await computeAndPersistAllFishingRankings()
    const seaCreatures = await computeAndPersistSeaCreatureRankings()
    return NextResponse.json({ success: true, fishing_combos: fishing.length, sea_creature_result: seaCreatures })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
