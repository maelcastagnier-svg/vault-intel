// Route de debug temporaire -- verification en base reelle avant creation du
// cron pluton-fishing-refresh. A supprimer apres validation (meme pattern que
// trigger-pluton-mining/farming/foraging-refresh, deja supprimees).
import { NextRequest, NextResponse } from 'next/server'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const results = await computeAndPersistAllFishingRankings()
    return NextResponse.json({ success: true, count: results.length, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
