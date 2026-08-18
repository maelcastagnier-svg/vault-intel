// Route de debug temporaire -- verification en base reelle avant creation
// du cron pluton-dungeons-refresh.
import { NextRequest, NextResponse } from 'next/server'
import { computeAndPersistAllDungeonsRankings } from '../../../../lib/pluton-dungeons'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const results = await computeAndPersistAllDungeonsRankings()
    return NextResponse.json({ success: true, count: results.length, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
