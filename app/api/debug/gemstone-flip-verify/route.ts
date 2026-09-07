import { NextResponse } from 'next/server'
import { computeAndPersistGemstoneQualityFlipRankings } from '../../../../lib/pluton-gemstone-quality-flip'

export const maxDuration = 90
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await computeAndPersistGemstoneQualityFlipRankings()
    return NextResponse.json({ success: true, result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
