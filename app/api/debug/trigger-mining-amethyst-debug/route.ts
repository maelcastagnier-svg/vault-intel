// TEMPORAIRE -- diagnostic de l'echec silencieux sur AMETHYST_GEMSTONE/professional
// (et par extension tout master), trouve en verifiant le lot Jaded MYTHIC. Lecture
// seule (computeMiningRanking, pas de persist), a supprimer apres diagnostic.
import { NextResponse } from 'next/server'
import { computeMiningRanking } from '../../../../lib/pluton-mining'
import { loadSevenTierConfig } from '../../../../lib/pluton-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const cfg = await loadSevenTierConfig()
  const out: Record<string, any> = {}
  for (const [tier, blockId] of [['professional', 'AMETHYST_GEMSTONE'], ['master', 'RUBY_GEMSTONE'], ['master', 'COAL_ORE']] as const) {
    try {
      const result = await computeMiningRanking(tier, blockId, cfg[tier])
      out[`${tier}/${blockId}`] = { ok: true, has_setup: !!result.top_setup }
    } catch (e: any) {
      out[`${tier}/${blockId}`] = { ok: false, error: e.message, stack: e.stack }
    }
  }
  return NextResponse.json(out)
}
