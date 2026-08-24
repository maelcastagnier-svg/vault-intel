// TEMPORAIRE -- rebuild propre et isole de Mining seul (23 aout, apres
// incident de doublons cause par des invocations HTTP chevauchees sur les
// routes de debug precedentes). A supprimer immediatement apres verification.
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
