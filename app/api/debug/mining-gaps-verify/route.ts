// Route de debug temporaire -- verification des 6 nouveaux blocs Mining
// (Ice/Sand/Red Sand/Gravel/Mycelium/Glowstone Dust) apres l'audit Collections
// officielles du 25 aout. A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const results = await computeAndPersistAllMiningRankings()
    const withSetup = results.filter(r => r.has_setup).length
    const newBlocks = results.filter(r =>
      ['ICE', 'SAND', 'RED_SAND', 'GRAVEL', 'MYCELIUM', 'GLOWSTONE_DUST'].includes(r.block_id)
    )
    return NextResponse.json({
      success: true,
      combos: results.length,
      with_setup: withSetup,
      new_blocks_sample: newBlocks,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
