// app/api/cron/pluton-combat-refresh/route.ts
// Cron du nouveau calculateur 1-skill-par-fichier (lib/pluton-combat.ts,
// 21 aout, plan reconnexion Systeme A/B) -- pour l'instant Zombie Slayer
// uniquement (1re tranche verticale migree). A etendre au fur et a mesure
// que Spider/Wolf/Enderman/Blaze/Dungeons/Bestiary sont migres depuis leurs
// fichiers respectifs (lib/pluton-slayer.ts/pluton-dungeons.ts/pluton-
// bestiary.ts, toujours actifs et rafraichis par leurs propres crons tant
// que non migres).
import { NextResponse } from 'next/server'
import { computeAndPersistZombieSlayerRankings } from '../../../../lib/pluton-combat'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-combat-refresh')
  try {
    const result = await computeAndPersistZombieSlayerRankings()
    await finishSync(logId, 'success', result.combos, result)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
