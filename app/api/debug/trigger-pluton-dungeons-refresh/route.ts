// Route de debug temporaire -- verification en base reelle de la
// generalisation Floor I-VII avant redeploiement du cron.
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
