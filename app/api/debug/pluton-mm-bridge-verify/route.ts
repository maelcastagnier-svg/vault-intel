import { NextResponse } from 'next/server'
import { computeAndPersistPlutonMoneyMakingSections } from '../../../../lib/pluton-money-making-bridge'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await computeAndPersistPlutonMoneyMakingSections()
    return NextResponse.json({ success: true, result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
