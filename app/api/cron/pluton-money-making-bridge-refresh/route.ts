// app/api/cron/pluton-money-making-bridge-refresh/route.ts
// Pont Pluton -> Money Making (27 aout apres-midi) -- cron dedie quotidien,
// tourne APRES tous les crons pluton-*-refresh (5h50 au plus tard cote
// activites, celui-ci a 5h58) pour lire des pluton_rankings deja a jour.
// Ecrit dans claude_analysis section pmm_<tier> (SEPAREE du flux LIVE
// money_making_<tier> -- fusion = decision produit a valider explicitement
// avec l'utilisateur, voir lib/pluton-money-making-bridge.ts).
import { NextResponse } from 'next/server'
import { computeAndPersistPlutonMoneyMakingSections } from '../../../../lib/pluton-money-making-bridge'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-money-making-bridge-refresh')
  try {
    const result = await computeAndPersistPlutonMoneyMakingSections()
    const totalMethods = result.reduce((sum, r) => sum + r.methods, 0)
    await finishSync(logId, 'success', totalMethods, result)
    return NextResponse.json({ success: true, result })
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
