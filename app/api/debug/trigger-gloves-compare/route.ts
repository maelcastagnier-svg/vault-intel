// TEMPORAIRE -- comparaison DPS reelle Manticore Claw vs Demonslayer
// Gauntlet (slot Gloves Combat) sur les 5 paliers top master. A supprimer
// apres verification.
import { NextResponse } from 'next/server'
import { computeSlayerRanking } from '../../../../lib/pluton-slayer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BLOCKS = ['ZOMBIE_SLAYER_T1', 'SPIDER_T5', 'WOLF_T4', 'ENDERMAN_T4', 'BLAZE_T1']

export async function GET() {
  const results: Record<string, { weapon?: string; dps?: number }> = {}
  for (const block of BLOCKS) {
    const r = await computeSlayerRanking('master', block)
    results[block] = { weapon: r.top_setup?.weapon, dps: r.top_setup?.dps }
  }
  return NextResponse.json(results)
}
