// TEMPORAIRE -- migration 4-tiers -> 7-tiers, Groupe 5/5 : Kuudra + Hunting
// + Bestiary (les 3 plus legers).
import { NextResponse } from 'next/server'
import { computeAndPersistKuudraRankings } from '../../../../lib/pluton-kuudra'
import { computeAndPersistTrapHuntingRankings } from '../../../../lib/pluton-hunting'
import { computeAndPersistBestiaryRankings } from '../../../../lib/pluton-bestiary'

export const dynamic = 'force-dynamic'
export const maxDuration = 280

export async function GET() {
  const out: Record<string, any> = {}
  try {
    const kuudra = await computeAndPersistKuudraRankings()
    out.kuudra = { ok: true, count: kuudra.length }
  } catch (e: any) { out.kuudra = { ok: false, error: e.message } }
  try {
    const hunting = await computeAndPersistTrapHuntingRankings()
    out.hunting = { ok: true, count: hunting.length }
  } catch (e: any) { out.hunting = { ok: false, error: e.message } }
  try {
    const bestiary = await computeAndPersistBestiaryRankings()
    out.bestiary = { ok: true, ...bestiary }
  } catch (e: any) { out.bestiary = { ok: false, error: e.message } }
  return NextResponse.json(out)
}
