// Route de debug temporaire -- verification en base reelle avant creation du
// cron pluton-slayer-refresh. A supprimer apres validation.
import { NextRequest, NextResponse } from 'next/server'
import { computeAndPersistAllSlayerRankings } from '../../../../lib/pluton-slayer'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const results = await computeAndPersistAllSlayerRankings()
    return NextResponse.json({ success: true, count: results.length, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
