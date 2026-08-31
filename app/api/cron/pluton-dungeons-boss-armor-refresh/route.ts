// app/api/cron/pluton-dungeons-boss-armor-refresh/route.ts
// Dungeons Boss Armor craft margin (31 aout, nuit) -- cron dedie quotidien.
import { NextResponse } from 'next/server'
import { computeAndPersistDungeonsBossArmorCraftRankings } from '../../../../lib/pluton-dungeons-boss-armor'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-dungeons-boss-armor-refresh')
  try {
    const result = await computeAndPersistDungeonsBossArmorCraftRankings()
    await finishSync(logId, 'success', result.pieces_priced, result)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
