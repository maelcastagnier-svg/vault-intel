// TEMPORAIRE -- migration 4-tiers -> 7-tiers, Groupe 2/5 : Fishing + Sea
// Creatures (meme regroupement que le cron production, meme budget 280s).
import { NextResponse } from 'next/server'
import { computeAndPersistAllFishingRankings } from '../../../../lib/pluton-fishing'
import { computeAndPersistSeaCreatureRankings } from '../../../../lib/pluton-sea-creatures'

export const dynamic = 'force-dynamic'
export const maxDuration = 280

export async function GET() {
  const out: Record<string, any> = {}
  try {
    const fishing = await computeAndPersistAllFishingRankings()
    out.fishing = { ok: true, count: fishing.length }
  } catch (e: any) { out.fishing = { ok: false, error: e.message } }
  try {
    const seaCreatures = await computeAndPersistSeaCreatureRankings()
    out.sea_creatures = { ok: true, count: seaCreatures.length }
  } catch (e: any) { out.sea_creatures = { ok: false, error: e.message } }
  return NextResponse.json(out)
}
