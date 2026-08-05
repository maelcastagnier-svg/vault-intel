import { NextResponse } from 'next/server'
import { computeMiningRanking } from '../../../../lib/pluton-mining'

export const maxDuration = 60

export async function GET() {
  const end = await computeMiningRanking('end', 'JASPER_GEMSTONE')
  const late = await computeMiningRanking('late', 'JASPER_GEMSTONE')
  return NextResponse.json({ end, late })
}
