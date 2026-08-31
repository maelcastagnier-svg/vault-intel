// app/api/cron/pluton-kuudra-refresh/route.ts
// Meme pattern que les autres pluton-*-refresh : rejoue
// computeAndPersistKuudraRankings() (lib/pluton-kuudra.ts, construite et
// verifiee en prod le 23 aout) pour garder guaranteed_loot_value/keyCost
// recroises sur des prix Bazaar recents. Aucune formule modifiee ici.
import { NextResponse } from 'next/server'
import { computeAndPersistKuudraRankings, computeAndPersistKuudraRngPoolRankings } from '../../../../lib/pluton-kuudra'
import { startSync, finishSync } from '../../../../lib/sync-log'

// 60->120 (27 aout) -- pool RNG armure (methode additive) rappelee apres
// le calcul principal, meme discipline que Slayer/Farming/Foraging.
// IMPORTANT : computeAndPersistKuudraRankings() supprime TOUS les
// target_blocks activity_key='kuudra' (y compris les *_RNG_POOL) avant de
// re-inserer les siens -- doit donc etre appele EN PREMIER, jamais apres.
export const maxDuration = 120

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-kuudra-refresh')
  try {
    const results = await computeAndPersistKuudraRankings()
    const rngPool = await computeAndPersistKuudraRngPoolRankings()
    const result = { success: true, combos: results.length, rng_pool: rngPool }
    await finishSync(logId, 'success', results.length, result)
    return NextResponse.json(result)
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
