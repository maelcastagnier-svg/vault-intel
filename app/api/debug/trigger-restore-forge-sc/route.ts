// TEMPORAIRE -- restaure Forge + Sea Creatures apres le bug de delete
// scoping trouve le 23 aout (Mining/Fishing effacaient leurs rankings sans
// les reconstruire). A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistForgeRankings } from '../../../../lib/pluton-forge'
import { computeAndPersistSeaCreatureRankings } from '../../../../lib/pluton-sea-creatures'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const out: Record<string, any> = {}
  try {
    const forge = await computeAndPersistForgeRankings()
    out.forge = { ok: true, ...forge }
  } catch (e: any) { out.forge = { ok: false, error: e.message } }
  try {
    const sc = await computeAndPersistSeaCreatureRankings()
    out.sea_creatures = { ok: true, count: sc.length }
  } catch (e: any) { out.sea_creatures = { ok: false, error: e.message } }
  return NextResponse.json(out)
}
