// TEMPORAIRE -- verification Foraging Fortune Booster (Uncommon, +35 FF
// total Axe+Armor+Equipment) ajoutee a stat_bonus_sources. A supprimer
// apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET() {
  const all = await computeAndPersistAllForagingRankings()
  return NextResponse.json({ combos: all.length })
}
