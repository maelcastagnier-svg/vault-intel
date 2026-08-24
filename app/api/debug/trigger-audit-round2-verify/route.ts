// TEMPORAIRE -- verification du lot "audit exhaustivite ressources" (24 aout) :
// Hunting (formule Trapped corrigee), Farming (Rare Crop/Overbloom ajoute),
// Fishing (reforges rod/armure scales par rarete reelle), Mining (Jaded MYTHIC
// ajoute), Foraging (Foraging Fortune des accessoires enfin appliquee).
// A supprimer apres verification en base.
import { NextResponse } from 'next/server'
import { computeAndPersistTrapHuntingRankings } from '../../../../lib/pluton-hunting'
import { computeAndPersistAllFarmingRankings } from '../../../../lib/pluton-farming'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'
import { computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const out: Record<string, any> = {}
  try {
    const hunting = await computeAndPersistTrapHuntingRankings()
    out.hunting = { combos: hunting.length }
  } catch (e: any) { out.hunting = { error: e.message } }

  try {
    const farming = await computeAndPersistAllFarmingRankings()
    out.farming = { combos: farming.length, with_setup: farming.filter((r: any) => r.has_setup).length }
  } catch (e: any) { out.farming = { error: e.message } }

  try {
    const fishing = await computeAndPersistAllFishingRankings()
    out.fishing = { combos: fishing.length, with_setup: fishing.filter((r: any) => r.has_setup).length }
  } catch (e: any) { out.fishing = { error: e.message } }

  try {
    const mining = await computeAndPersistAllMiningRankings()
    out.mining = { combos: mining.length, with_setup: mining.filter((r: any) => r.has_setup).length }
  } catch (e: any) { out.mining = { error: e.message } }

  try {
    const foraging = await computeAndPersistAllForagingRankings()
    out.foraging = { combos: foraging.length, with_setup: foraging.filter((r: any) => r.has_setup).length }
  } catch (e: any) { out.foraging = { error: e.message } }

  return NextResponse.json(out)
}
