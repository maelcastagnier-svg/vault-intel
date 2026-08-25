// TEMPORAIRE -- verification Vorpal Katana (Enderman Slayer, nouveau
// candidat palier mid). A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeSlayerRanking, computeAndPersistAllSlayerRankings } from '../../../../lib/pluton-slayer'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET() {
  const skilled = await computeSlayerRanking('skilled', 'ENDERMAN_T4')
  const intermediate = await computeSlayerRanking('intermediate', 'ENDERMAN_T4')
  const all = await computeAndPersistAllSlayerRankings()
  return NextResponse.json({
    skilled_weapon: skilled.top_setup?.weapon,
    skilled_dps: skilled.top_setup?.dps,
    intermediate_weapon: intermediate.top_setup?.weapon,
    intermediate_dps: intermediate.top_setup?.dps,
    combos: all.length,
  })
}
