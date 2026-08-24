// TEMPORAIRE -- verifie Flowstate (Mining) + First Impression (Foraging),
// 23 aout. A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'
import { computeAndPersistForgeRankings } from '../../../../lib/pluton-forge'
import { computeAndPersistAllForagingRankings } from '../../../../lib/pluton-foraging'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const out: Record<string, any> = {}
  try {
    const mining = await computeAndPersistAllMiningRankings()
    out.mining = { ok: true, count: mining.length }
  } catch (e: any) { out.mining = { ok: false, error: e.message } }
  try {
    const forge = await computeAndPersistForgeRankings()
    out.forge = { ok: true, ...forge }
  } catch (e: any) { out.forge = { ok: false, error: e.message } }
  try {
    const foraging = await computeAndPersistAllForagingRankings()
    out.foraging = { ok: true, count: foraging.length }
  } catch (e: any) { out.foraging = { ok: false, error: e.message } }
  return NextResponse.json(out)
}
