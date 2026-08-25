// TEMPORAIRE -- verification du pre-filtre bruit discovery_queue_noise_patterns.
// A supprimer apres verification.
import { NextResponse } from 'next/server'
import { runDiscoveryScan } from '../../../../app/api/cron/discovery-scan/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const result = await runDiscoveryScan()
  return NextResponse.json(result)
}
