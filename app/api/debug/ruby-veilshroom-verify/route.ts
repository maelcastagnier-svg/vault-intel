import { NextResponse } from 'next/server'
import { computeAndPersistRubyVeilshroomRanking } from '../../../../lib/pluton-foraging'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await computeAndPersistRubyVeilshroomRanking()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
