import { NextResponse } from 'next/server'
import { computeMiningRanking } from '../../../../lib/pluton-mining'

export const maxDuration = 60

export async function GET() {
  const ruby = await computeMiningRanking('end', 'RUBY_GEMSTONE')
  const topaz = await computeMiningRanking('end', 'TOPAZ_GEMSTONE')
  const jasper = await computeMiningRanking('end', 'JASPER_GEMSTONE')
  return NextResponse.json({ ruby, topaz, jasper })
}
