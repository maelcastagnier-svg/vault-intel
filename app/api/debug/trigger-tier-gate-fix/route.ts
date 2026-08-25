// TEMPORAIRE -- verification du fix tier-gating pets/accessoires
// (Mining/Foraging/Fishing appliquaient ce layer a TOUS les tiers, jamais
// gate a INVESTMENT_MAX_TIERS contrairement a Combat). A supprimer apres
// verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'
import { computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const which = new URL(request.url).searchParams.get('which')
  if (which === 'mining') {
    const mining = await computeAndPersistAllMiningRankings()
    return NextResponse.json({ mining: mining.length })
  }
  if (which === 'foraging') {
    const foraging = await computeAndPersistAllForagingRankings()
    return NextResponse.json({ foraging: foraging.length })
  }
  if (which === 'fishing') {
    const fishing = await computeAndPersistAllFishingRankings()
    return NextResponse.json({ fishing: fishing.length })
  }
  return NextResponse.json({ error: 'pass ?which=mining|foraging|fishing' }, { status: 400 })
}
