// Route de debug temporaire -- verification en base reelle avant creation du
// cron pluton-foraging-refresh. A supprimer apres validation (meme pattern que
// trigger-pluton-mining-refresh/trigger-pluton-farming-refresh, deja supprimees).
import { NextRequest, NextResponse } from 'next/server'
import { computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const results = await computeAndPersistAllForagingRankings()
    return NextResponse.json({ success: true, count: results.length, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
