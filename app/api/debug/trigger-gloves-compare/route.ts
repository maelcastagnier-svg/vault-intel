// TEMPORAIRE -- comparaison DPS reelle Manticore Claw vs Demonslayer
// Gauntlet (slot Gloves Combat) sur les 5 paliers top master. A supprimer
// apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllSlayerRankings } from '../../../../lib/pluton-slayer'

export const dynamic = 'force-dynamic'
export const maxDuration = 280

export async function GET() {
  const all = await computeAndPersistAllSlayerRankings()
  return NextResponse.json({ combos: all.length, with_setup: all.filter((r: any) => r.has_setup).length })
}
