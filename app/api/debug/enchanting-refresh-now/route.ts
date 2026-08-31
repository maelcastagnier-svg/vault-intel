import { NextResponse } from 'next/server'
import { computeAndPersistEnchantedBookFlipRankings } from '../../../../lib/pluton-enchanting'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await computeAndPersistEnchantedBookFlipRankings()
    return NextResponse.json({ success: true, result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
