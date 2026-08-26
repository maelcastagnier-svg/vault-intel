import { NextResponse } from 'next/server'
import { computeAndPersistComposterRanking } from '../../../../lib/pluton-farming'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await computeAndPersistComposterRanking()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
