// app/api/cron/pluton-milestone-bridge-refresh/route.ts
// Phase C V1 (1er sept) -- pont Pluton -> Evolve (milestone_optimal_setups,
// scope collection uniquement). Quotidien, apres tous les autres crons
// Pluton (ils doivent avoir fini de rafraichir pluton_rankings/pluton_setups
// avant que ce pont les lise).
import { NextResponse } from 'next/server'
import { computeAndPersistMilestoneOptimalSetups } from '../../../../lib/pluton-milestone-bridge'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-milestone-bridge-refresh')
  try {
    const result = await computeAndPersistMilestoneOptimalSetups()
    await finishSync(logId, 'success', result.matched, result)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
