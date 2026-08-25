// Route de debug temporaire -- verification des 6 nouveaux bois de base
// (Oak/Spruce/Birch/Jungle/Acacia/Dark Oak) apres l'audit Collections
// officielles du 25 aout. A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'

export const maxDuration = 180
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const results = await computeAndPersistAllForagingRankings()
    const withSetup = results.filter(r => r.has_setup).length
    const newBlocks = results.filter(r =>
      ['OAK_LOG', 'SPRUCE_LOG', 'BIRCH_LOG', 'JUNGLE_LOG', 'ACACIA_LOG', 'DARK_OAK_LOG'].includes(r.block_id)
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
