// TEMPORAIRE -- verification Halberd of the Shredded (Zombie Slayer,
// tier master). Lecture seule d'abord (compute), puis persist complet.
// A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeSlayerRanking, computeAndPersistAllSlayerRankings } from '../../../../lib/pluton-slayer'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET() {
  const masterCheck = await computeSlayerRanking('master', 'ZOMBIE_T1')
  const all = await computeAndPersistAllSlayerRankings()
  return NextResponse.json({
    master_zombie_t1_weapon: masterCheck.top_setup?.weapon,
    master_zombie_t1_dps: masterCheck.top_setup?.dps,
    combos: all.length,
    with_setup: all.filter((r: any) => r.has_setup).length,
  })
}
