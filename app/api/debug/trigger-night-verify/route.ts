// TEMPORAIRE -- verification des fixes de la nuit (24 aout) : Farming
// (accessoires MID + Pest Farming MID), Foraging (Logger + corrections
// stat_bonus_sources), Fishing (Thunder/Magma Lord armor + competition
// slot). Mining deja verifie isolement plus tot (budget partage trop
// juste) -- ces 3 sont plus legers, tentes ensemble ici. A supprimer
// apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllFarmingRankings } from '../../../../lib/pluton-farming'
import { computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const out: Record<string, any> = {}
  try {
    const farming = await computeAndPersistAllFarmingRankings()
    out.farming = { combos: farming.length, with_setup: farming.filter((r: any) => r.has_setup).length }
  } catch (e: any) { out.farming = { error: e.message } }

  try {
    const foraging = await computeAndPersistAllForagingRankings()
    out.foraging = { combos: foraging.length, with_setup: foraging.filter((r: any) => r.has_setup).length }
  } catch (e: any) { out.foraging = { error: e.message } }

  try {
    const fishing = await computeAndPersistAllFishingRankings()
    out.fishing = { combos: fishing.length, with_setup: fishing.filter((r: any) => r.has_setup).length }
  } catch (e: any) { out.fishing = { error: e.message } }

  return NextResponse.json(out)
}
