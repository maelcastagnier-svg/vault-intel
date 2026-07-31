// Temp debug route -- Bloc 8, test concret demandé : meilleur setup MID
// pour miner du Mithril. Deleted after validation.
import { NextResponse } from 'next/server'
import { computeMiningRanking } from '../../../../lib/pluton-mining'

export async function GET() {
  const result = await computeMiningRanking('mid', 'MITHRIL_ORE')
  return NextResponse.json(result)
}
