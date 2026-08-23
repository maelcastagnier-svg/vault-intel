// app/api/cron/pluton-kuudra-refresh/route.ts
// Meme pattern que les autres pluton-*-refresh : rejoue
// computeAndPersistKuudraRankings() (lib/pluton-kuudra.ts, construite et
// verifiee en prod le 23 aout) pour garder guaranteed_loot_value/keyCost
// recroises sur des prix Bazaar recents. Aucune formule modifiee ici.
import { NextResponse } from 'next/server'
import { computeAndPersistKuudraRankings } from '../../../../lib/pluton-kuudra'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-kuudra-refresh')
  try {
    const results = await computeAndPersistKuudraRankings()
    await finishSync(logId, 'success', results.length, { combos: results.length })
    return NextResponse.json({ success: true, combos: results.length })
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
