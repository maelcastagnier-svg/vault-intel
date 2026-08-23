// TEMPORAIRE -- migration 4-tiers -> 7-tiers, Groupe 3/5 : Farming + Foraging.
import { NextResponse } from 'next/server'
import { computeAndPersistAllFarmingRankings } from '../../../../lib/pluton-farming'
import { computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'

export const dynamic = 'force-dynamic'
export const maxDuration = 280

export async function GET() {
  const out: Record<string, any> = {}
  try {
    const farming = await computeAndPersistAllFarmingRankings()
    out.farming = { ok: true, count: farming.length }
  } catch (e: any) { out.farming = { ok: false, error: e.message } }
  try {
    const foraging = await computeAndPersistAllForagingRankings()
    out.foraging = { ok: true, count: foraging.length }
  } catch (e: any) { out.foraging = { ok: false, error: e.message } }
  return NextResponse.json(out)
}
