// TEMPORAIRE -- migration 4-tiers -> 7-tiers, Groupe 1b : Forge SEUL.
import { NextResponse } from 'next/server'
import { computeAndPersistForgeRankings } from '../../../../lib/pluton-forge'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    const forge = await computeAndPersistForgeRankings()
    return NextResponse.json({ forge: { ok: true, ...forge } })
  } catch (e: any) {
    return NextResponse.json({ forge: { ok: false, error: e.message } })
  }
}
