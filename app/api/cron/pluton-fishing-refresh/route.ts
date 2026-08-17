// app/api/cron/pluton-fishing-refresh/route.ts
// Meme pattern que pluton-mining/farming/foraging-refresh : rejoue
// computeAndPersistAllFishingRankings() (lib/pluton-fishing.ts, verifiee en
// prod le 17 aout) pour garder real_cost/coins_per_hour recroises sur des prix
// AH/Bazaar recents. Aucune formule modifiee ici.
import { NextResponse } from 'next/server'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 120

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-fishing-refresh')
  try {
    const results = await computeAndPersistAllFishingRankings()
    const withSetup = results.filter(r => r.has_setup).length
    const result = { success: true, combos: results.length, with_setup: withSetup, without_setup: results.length - withSetup }
    await finishSync(logId, 'success', withSetup, result)
    return NextResponse.json(result)
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
