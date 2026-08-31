// app/api/cron/pluton-dungeons-perfect-armor-refresh/route.ts
// Dungeons Perfect Armor craft margin (31 aout, nuit) -- cron dedie quotidien.
import { NextResponse } from 'next/server'
import { computeAndPersistDungeonsPerfectArmorRankings } from '../../../../lib/pluton-dungeons-perfect-armor'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-dungeons-perfect-armor-refresh')
  try {
    const result = await computeAndPersistDungeonsPerfectArmorRankings()
    await finishSync(logId, 'success', result.pieces_priced, result)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
