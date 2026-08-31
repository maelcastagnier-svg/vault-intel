import { NextResponse } from 'next/server'
import { computeAndPersistDungeonsPerfectArmorRankings } from '../../../../lib/pluton-dungeons-perfect-armor'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await computeAndPersistDungeonsPerfectArmorRankings()
    return NextResponse.json({ success: true, result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
