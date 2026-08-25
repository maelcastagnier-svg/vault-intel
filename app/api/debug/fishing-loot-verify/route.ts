// Route de debug temporaire -- verification du fix Raw Salmon/Tropical
// Fish/Pufferfish (RAW_FISH:1/:2/:3, item_id=null -> item_id reel) apres
// l'audit Collections officielles FISHING du 25 aout. A supprimer apres
// verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const results = await computeAndPersistAllFishingRankings()
    return NextResponse.json({ success: true, combos: results.length, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
