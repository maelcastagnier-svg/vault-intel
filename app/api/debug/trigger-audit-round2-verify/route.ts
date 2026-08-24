// TEMPORAIRE -- Mining isole (budget maxDuration complet, pas chaine derriere
// 4 autres activites cette fois -- root cause probable du crash silencieux
// precedent : Vercel a coupe l'invocation avant la fin de Mining car
// Hunting/Farming/Fishing avaient deja consomme une partie des 300s partages).
// A supprimer apres verification en base.
import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const mining = await computeAndPersistAllMiningRankings()
  return NextResponse.json({ combos: mining.length, with_setup: mining.filter((r: any) => r.has_setup).length })
}
