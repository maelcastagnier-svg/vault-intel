// app/api/cron/pluton-bestiary-refresh/route.ts
// Meme pattern que les autres pluton-*-refresh : rejoue
// computeAndPersistBestiaryRankings() (lib/pluton-bestiary.ts, verifiee en
// prod le 21 aout) pour garder guaranteed_ev recroise sur des prix Bazaar
// recents. Aucune formule modifiee ici.
import { NextResponse } from 'next/server'
import { computeAndPersistBestiaryRankings } from '../../../../lib/pluton-bestiary'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-bestiary-refresh')
  try {
    const result = await computeAndPersistBestiaryRankings()
    await finishSync(logId, 'success', result.viable, result)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
