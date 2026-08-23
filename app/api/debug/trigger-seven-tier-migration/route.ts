// TEMPORAIRE -- migration 4-tiers -> 7-tiers, Groupe 1a : Mining SEUL.
// Separe de Forge (le combo Mining+Forge a 7 tiers depasse 280s -- 7 tiers
// = 75% de combos en plus par rapport aux 4 tiers d'origine, budget par
// fonction augmente a 300s, le max deja valide sur ce projet -- Mining
// seul d'abord pour isoler si Mining a lui seul suffit a saturer ce budget).
import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    const mining = await computeAndPersistAllMiningRankings()
    return NextResponse.json({ mining: { ok: true, count: mining.length, with_setup: mining.filter((r: any) => r.has_setup).length } })
  } catch (e: any) {
    return NextResponse.json({ mining: { ok: false, error: e.message } })
  }
}
