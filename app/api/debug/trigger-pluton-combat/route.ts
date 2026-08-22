// Route de debug TEMPORAIRE -- verification Zombie Slayer refonte (lib/
// pluton-combat.ts, 1er consommateur reel de pluton_elements en direct)
// avant cron. A supprimer apres validation.
import { NextResponse } from 'next/server'
import { computeAndPersistZombieSlayerRankings, computeZombieSlayerRankings } from '../../../../lib/pluton-combat'

export const maxDuration = 60

export async function GET(request: Request) {
  const url = new URL(request.url)
  try {
    if (url.searchParams.get('dry') === '1') {
      const results = await computeZombieSlayerRankings()
      return NextResponse.json({ success: true, results })
    }
    const result = await computeAndPersistZombieSlayerRankings()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
