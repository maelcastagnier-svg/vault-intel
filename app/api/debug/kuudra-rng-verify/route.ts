import { NextResponse } from 'next/server'
import { computeAndPersistKuudraRankings, computeAndPersistKuudraRngPoolRankings } from '../../../../lib/pluton-kuudra'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const main = await computeAndPersistKuudraRankings()
    const rngPool = await computeAndPersistKuudraRngPoolRankings()
    return NextResponse.json({ success: true, main_combos: main.length, rng_pool: rngPool })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
