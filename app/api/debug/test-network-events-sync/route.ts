// Temporary debug route -- verifies network-events-sync's real logic on preview,
// bypassing CRON_SECRET. Deleted after validation.
import { NextResponse } from 'next/server'
import { runNetworkEventsSync } from '../../cron/network-events-sync/route'

export async function GET() {
  const result = await runNetworkEventsSync()
  return NextResponse.json(result)
}
