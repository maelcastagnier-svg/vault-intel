// Route de debug TEMPORAIRE -- verifie computeAndPersistAllMiningRankings()
// rebranchee en cron avant de valider la frequence reelle. A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'

export async function GET() {
  const startedAt = Date.now()
  try {
    const results = await computeAndPersistAllMiningRankings()
    const withSetup = results.filter(r => r.has_setup).length
    return NextResponse.json({
      success: true,
      combos: results.length,
      with_setup: withSetup,
      without_setup: results.length - withSetup,
      duration_ms: Date.now() - startedAt,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, duration_ms: Date.now() - startedAt }, { status: 500 })
  }
}
