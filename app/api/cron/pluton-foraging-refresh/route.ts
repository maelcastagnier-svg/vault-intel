// app/api/cron/pluton-foraging-refresh/route.ts
// Meme pattern que pluton-mining-refresh/pluton-farming-refresh : rejoue
// computeAndPersistAllForagingRankings() (lib/pluton-foraging.ts, verifiee en
// prod le 17 aout) pour garder real_cost/coins_per_hour recroises sur des prix
// AH recents. Aucune formule modifiee ici.
import { NextResponse } from 'next/server'
import { computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'
import { startSync, finishSync } from '../../../../lib/sync-log'

// 120->180 (23 aout, migration 7-tiers) -- +75% de combos (4->7 tiers),
// marge de securite, aucune formule changee.
export const maxDuration = 180

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-foraging-refresh')
  try {
    const results = await computeAndPersistAllForagingRankings()
    const withSetup = results.filter(r => r.has_setup).length
    const result = { success: true, combos: results.length, with_setup: withSetup, without_setup: results.length - withSetup }
    await finishSync(logId, 'success', withSetup, result)
    return NextResponse.json(result)
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
