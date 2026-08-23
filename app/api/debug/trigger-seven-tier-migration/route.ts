// TEMPORAIRE -- route de debug pour verifier la migration 4-tiers -> 7-tiers
// de tous les calculateurs Pluton (23 aout). Rejoue chaque
// computeAndPersistAll*Rankings() deja valide, sur le nouveau systeme
// SevenTier. A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'
import { computeAndPersistForgeRankings } from '../../../../lib/pluton-forge'
import { computeAndPersistAllFarmingRankings } from '../../../../lib/pluton-farming'
import { computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'
import { computeAndPersistSeaCreatureRankings } from '../../../../lib/pluton-sea-creatures'
import { computeAndPersistAllSlayerRankings } from '../../../../lib/pluton-slayer'
import { computeAndPersistKuudraRankings } from '../../../../lib/pluton-kuudra'
import { computeAndPersistTrapHuntingRankings } from '../../../../lib/pluton-hunting'
import { computeAndPersistBestiaryRankings } from '../../../../lib/pluton-bestiary'
import { computeAndPersistAllDungeonsRankings } from '../../../../lib/pluton-dungeons'

export const dynamic = 'force-dynamic'
export const maxDuration = 280

export async function GET() {
  const out: Record<string, any> = {}
  const steps: [string, () => Promise<any>][] = [
    ['mining', computeAndPersistAllMiningRankings],
    ['forge', computeAndPersistForgeRankings],
    ['farming', computeAndPersistAllFarmingRankings],
    ['foraging', computeAndPersistAllForagingRankings],
    ['fishing', computeAndPersistAllFishingRankings],
    ['sea_creatures', computeAndPersistSeaCreatureRankings],
    ['slayer', computeAndPersistAllSlayerRankings],
    ['kuudra', computeAndPersistKuudraRankings],
    ['hunting', computeAndPersistTrapHuntingRankings],
    ['bestiary', computeAndPersistBestiaryRankings],
    ['dungeons', computeAndPersistAllDungeonsRankings],
  ]
  for (const [name, fn] of steps) {
    try {
      const result = await fn()
      out[name] = { ok: true, count: Array.isArray(result) ? result.length : result }
    } catch (e: any) {
      out[name] = { ok: false, error: e.message }
    }
  }
  return NextResponse.json(out)
}
