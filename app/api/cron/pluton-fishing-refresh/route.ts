// app/api/cron/pluton-fishing-refresh/route.ts
// Meme pattern que pluton-mining/farming/foraging-refresh : rejoue
// computeAndPersistAllFishingRankings() (lib/pluton-fishing.ts, verifiee en
// prod le 17 aout) pour garder real_cost/coins_per_hour recroises sur des prix
// AH/Bazaar recents. Aucune formule modifiee ici.
//
// Sea Creature kills (computeAndPersistSeaCreatureRankings, lib/pluton-
// sea-creatures.ts) ajoute ici le 23 aout -- trou d'automatisation reel
// trouve lors de l'audit general : construite le 21 aout (pool basic) puis
// etendue aux 10 autres pools le 23 aout, mais JAMAIS appelee par aucun
// cron -- seulement via des routes de debug manuelles a chaque fois.
// Methode additive independante (target_blocks distincts de WATER_POOL),
// echec de l'une n'empeche pas l'autre.
import { NextResponse } from 'next/server'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'
import { computeAndPersistSeaCreatureRankings } from '../../../../lib/pluton-sea-creatures'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 280

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-fishing-refresh')
  try {
    const results = await computeAndPersistAllFishingRankings()
    const withSetup = results.filter(r => r.has_setup).length
    const seaCreatureResults = await computeAndPersistSeaCreatureRankings()
    const result = {
      success: true,
      combos: results.length, with_setup: withSetup, without_setup: results.length - withSetup,
      sea_creature_combos: seaCreatureResults.length,
    }
    await finishSync(logId, 'success', withSetup + seaCreatureResults.length, result)
    return NextResponse.json(result)
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
