// app/api/debug/trigger-essence-audit/route.ts
// Route de debug temporaire (Phase 5 -- verification lot Essence Shops:
// Wither Forbidden Strength (Combat x4 fichiers), Diamond Rhinestone
// Infusion (Mining), Forest Lumberjack (Foraging), Forest Trapped
// (Hunting)). Supprimee apres validation.
import { NextResponse } from 'next/server'
import { computeZombieSlayerRankings, computeAndPersistZombieSlayerRankings } from '../../../../lib/pluton-combat'
import { computeSlayerRanking, computeAndPersistAllSlayerRankings } from '../../../../lib/pluton-slayer'
import { computeAndPersistBestiaryRankings } from '../../../../lib/pluton-bestiary'
import { computeSeaCreatureRanking, computeAndPersistSeaCreatureRankings } from '../../../../lib/pluton-sea-creatures'
import { computeMiningRanking, computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'
import { computeForagingRanking, computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'
import { computeAndPersistTrapHuntingRankings } from '../../../../lib/pluton-hunting'

export const maxDuration = 280

export async function GET(request: Request) {
  const url = new URL(request.url)
  const which = url.searchParams.get('which')
  const dry = url.searchParams.get('dry') === '1'

  if (which === 'zombie') {
    if (dry) return NextResponse.json({ success: true, results: await computeZombieSlayerRankings() })
    return NextResponse.json({ success: true, ...(await computeAndPersistZombieSlayerRankings()) })
  }
  if (which === 'slayer') {
    const dryTier = url.searchParams.get('dryTier')
    const dryBlock = url.searchParams.get('dryBlock')
    if (dryTier && dryBlock) return NextResponse.json({ success: true, result: await computeSlayerRanking(dryTier as any, dryBlock) })
    return NextResponse.json({ success: true, result: await computeAndPersistAllSlayerRankings() })
  }
  if (which === 'bestiary') {
    return NextResponse.json({ success: true, ...(await computeAndPersistBestiaryRankings()) })
  }
  if (which === 'sea') {
    const dryTier = url.searchParams.get('dryTier')
    if (dryTier) return NextResponse.json({ success: true, result: await computeSeaCreatureRanking(dryTier as any) })
    return NextResponse.json({ success: true, result: await computeAndPersistSeaCreatureRankings() })
  }
  if (which === 'mining') {
    const dryTier = url.searchParams.get('dryTier')
    const dryBlock = url.searchParams.get('dryBlock')
    if (dryTier && dryBlock) return NextResponse.json({ success: true, result: await computeMiningRanking(dryTier as any, dryBlock) })
    return NextResponse.json({ success: true, result: await computeAndPersistAllMiningRankings() })
  }
  if (which === 'foraging') {
    const dryTier = url.searchParams.get('dryTier')
    const dryBlock = url.searchParams.get('dryBlock')
    if (dryTier && dryBlock) return NextResponse.json({ success: true, result: await computeForagingRanking(dryTier as any, dryBlock) })
    return NextResponse.json({ success: true, result: await computeAndPersistAllForagingRankings() })
  }
  if (which === 'hunting') {
    return NextResponse.json({ success: true, result: await computeAndPersistTrapHuntingRankings() })
  }
  return NextResponse.json({ error: 'missing which=' }, { status: 400 })
}
