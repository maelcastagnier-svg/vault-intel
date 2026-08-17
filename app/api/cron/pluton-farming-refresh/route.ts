// app/api/cron/pluton-farming-refresh/route.ts
// Meme trou d'automatisation que Mining (audit du 17 aout) : computeAndPersistAllFarmingRankings()
// existe et est validee (lib/pluton-farming.ts) mais n'etait jamais rappelee -- pluton_setups/
// pluton_rankings (activity_key='farming') figes depuis le 5 aout, jamais recroises sur des prix
// recents. Rejoue exactement la meme fonction deja validee, aucune formule modifiee.
import { NextResponse } from 'next/server'
import { computeAndPersistAllFarmingRankings } from '../../../../lib/pluton-farming'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 120

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-farming-refresh')
  try {
    const results = await computeAndPersistAllFarmingRankings()
    const withSetup = results.filter(r => r.has_setup).length
    const result = { success: true, combos: results.length, with_setup: withSetup, without_setup: results.length - withSetup }
    await finishSync(logId, 'success', withSetup, result)
    return NextResponse.json(result)
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
