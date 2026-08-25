// TEMPORAIRE -- verification fix Deathripper Dagger Attack Speed (Blaze
// Slayer, base_attack_speed 0->20, deja applique en base, aucun changement
// de code -- persist juste besoin d'etre rejoue pour recalculer le DPS).
// A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeSlayerRanking, computeAndPersistAllSlayerRankings } from '../../../../lib/pluton-slayer'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET() {
  const check = await computeSlayerRanking('master', 'BLAZE_T1')
  const all = await computeAndPersistAllSlayerRankings()
  return NextResponse.json({
    master_blaze_t1_weapon: check.top_setup?.weapon,
    master_blaze_t1_dps: check.top_setup?.dps,
    combos: all.length,
    with_setup: all.filter((r: any) => r.has_setup).length,
  })
}
