// TEMPORAIRE -- route de debug pour verifier la migration 4-tiers -> 7-tiers
// Groupe 1/5 : Mining + Forge (meme regroupement que le cron production,
// meme budget 280s). A supprimer apres verification complete des 5 groupes.
import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'
import { computeAndPersistForgeRankings } from '../../../../lib/pluton-forge'

export const dynamic = 'force-dynamic'
export const maxDuration = 280

export async function GET() {
  const out: Record<string, any> = {}
  try {
    const mining = await computeAndPersistAllMiningRankings()
    out.mining = { ok: true, count: mining.length, with_setup: mining.filter((r: any) => r.has_setup).length }
  } catch (e: any) { out.mining = { ok: false, error: e.message } }
  try {
    const forge = await computeAndPersistForgeRankings()
    out.forge = { ok: true, ...forge }
  } catch (e: any) { out.forge = { ok: false, error: e.message } }
  return NextResponse.json(out)
}
