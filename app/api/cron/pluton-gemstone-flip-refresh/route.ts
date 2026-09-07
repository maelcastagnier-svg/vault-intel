// app/api/cron/pluton-gemstone-flip-refresh/route.ts
// Gemstone quality flip (1er sept) -- cron dedie quotidien.
import { NextResponse } from 'next/server'
import { computeAndPersistGemstoneQualityFlipRankings } from '../../../../lib/pluton-gemstone-quality-flip'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-gemstone-flip-refresh')
  try {
    const result = await computeAndPersistGemstoneQualityFlipRankings()
    await finishSync(logId, 'success', result.steps_priced, result)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
