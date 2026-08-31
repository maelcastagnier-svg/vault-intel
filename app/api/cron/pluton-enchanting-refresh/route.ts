// app/api/cron/pluton-enchanting-refresh/route.ts
// Enchanted Books flip (27 aout) -- nouvelle activite, cron dedie quotidien.
import { NextResponse } from 'next/server'
import { computeAndPersistEnchantedBookFlipRankings } from '../../../../lib/pluton-enchanting'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 120

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-enchanting-refresh')
  try {
    const result = await computeAndPersistEnchantedBookFlipRankings()
    await finishSync(logId, 'success', result.pairs_priced, result)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
