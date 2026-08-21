// Route de debug TEMPORAIRE -- verification Trap Hunting avant cron.
// A supprimer apres validation.
import { NextResponse } from 'next/server'
import { computeAndPersistTrapHuntingRankings, computeTrapHuntingRankings } from '../../../../lib/pluton-hunting'

export const maxDuration = 30

export async function GET(request: Request) {
  const url = new URL(request.url)
  try {
    if (url.searchParams.get('dry') === '1') {
      const results = await computeTrapHuntingRankings()
      return NextResponse.json({ success: true, results })
    }
    const results = await computeAndPersistTrapHuntingRankings()
    return NextResponse.json({ success: true, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
