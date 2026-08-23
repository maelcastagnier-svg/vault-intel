// app/api/cron/pluton-hunting-refresh/route.ts
// Meme pattern que les autres pluton-*-refresh : rejoue
// computeAndPersistTrapHuntingRankings() (lib/pluton-hunting.ts, verifiee
// en prod le 21 aout) pour garder coins_per_hour recroise sur des prix
// Bazaar recents. Aucune formule modifiee ici.
import { NextResponse } from 'next/server'
import { computeAndPersistTrapHuntingRankings } from '../../../../lib/pluton-hunting'
import { startSync, finishSync } from '../../../../lib/sync-log'

// 30->90 (23 aout, migration 7-tiers) -- 2240 lignes (320 shards x 7 tiers,
// contre ~1280 avant), marge de securite, aucune formule changee.
export const maxDuration = 90

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-hunting-refresh')
  try {
    const results = await computeAndPersistTrapHuntingRankings()
    const result = { success: true, combos: results.length }
    await finishSync(logId, 'success', results.length, result)
    return NextResponse.json(result)
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
