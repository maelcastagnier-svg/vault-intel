// app/api/cron/pluton-slayer-refresh/route.ts
// Meme pattern que pluton-mining/farming/foraging/fishing-refresh : rejoue
// computeAndPersistAllSlayerRankings() (lib/pluton-slayer.ts, verifiee en
// prod le 18 aout) pour garder guaranteed_drop_value recroise sur des prix
// Bazaar recents. Aucune formule modifiee ici.
import { NextResponse } from 'next/server'
import { computeAndPersistAllSlayerRankings, computeAndPersistSlayerRngPoolRankings } from '../../../../lib/pluton-slayer'
import { startSync, finishSync } from '../../../../lib/sync-log'

// 120->220 (23 aout, migration 7-tiers) -- +75% de combos (4->7 tiers),
// marge de securite, aucune formule changee.
// 220->320 (26 aout) -- couche RNG-Meter additive rappelle computeSlayerRanking()
// une 2e fois par combo (23 combos), double approximativement le travail.
export const maxDuration = 320

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-slayer-refresh')
  try {
    const results = await computeAndPersistAllSlayerRankings()
    const withSetup = results.filter(r => r.has_setup).length
    // Couche RNG-Meter (26 aout) -- methode additive independante (target_blocks
    // distincts *_RNG_POOL, meme discipline que Sea Creature kills sur Fishing).
    const rngPool = await computeAndPersistSlayerRngPoolRankings()
    const result = { success: true, combos: results.length, with_setup: withSetup, without_setup: results.length - withSetup, rng_pool: rngPool }
    await finishSync(logId, 'success', withSetup, result)
    return NextResponse.json(result)
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
