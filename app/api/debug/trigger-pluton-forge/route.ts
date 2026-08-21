// Route de debug TEMPORAIRE -- verification Forge crafting margin avant cron.
// A supprimer apres validation.
import { NextResponse } from 'next/server'
import { computeAndPersistForgeRankings, computeForgeMargins } from '../../../../lib/pluton-forge'

export const maxDuration = 60

export async function GET(request: Request) {
  const url = new URL(request.url)
  try {
    if (url.searchParams.get('dry') === '1') {
      const margins = await computeForgeMargins()
      return NextResponse.json({ success: true, margins: margins.filter(m => m.priceable).sort((a, b) => b.profit - a.profit) })
    }
    const result = await computeAndPersistForgeRankings()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
