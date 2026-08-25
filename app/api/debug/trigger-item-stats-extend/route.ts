// TEMPORAIRE -- resync item_stats avec colonnes etendues. A supprimer apres verification.
import { NextResponse } from 'next/server'
import { syncItemStats } from '../../../../app/api/cron/skyblock-resources-sync/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET() {
  const count = await syncItemStats()
  return NextResponse.json({ count })
}
