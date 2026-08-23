// TEMPORAIRE -- migration 4-tiers -> 7-tiers, Groupe 4/5 : Slayer + Dungeons.
import { NextResponse } from 'next/server'
import { computeAndPersistAllSlayerRankings } from '../../../../lib/pluton-slayer'
import { computeAndPersistAllDungeonsRankings } from '../../../../lib/pluton-dungeons'

export const dynamic = 'force-dynamic'
export const maxDuration = 280

export async function GET() {
  const out: Record<string, any> = {}
  try {
    const slayer = await computeAndPersistAllSlayerRankings()
    out.slayer = { ok: true, count: slayer.length }
  } catch (e: any) { out.slayer = { ok: false, error: e.message } }
  try {
    const dungeons = await computeAndPersistAllDungeonsRankings()
    out.dungeons = { ok: true, count: dungeons.length, with_setup: dungeons.filter((r: any) => r.has_setup).length }
  } catch (e: any) { out.dungeons = { ok: false, error: e.message } }
  return NextResponse.json(out)
}
