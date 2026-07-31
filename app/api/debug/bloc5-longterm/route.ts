// Temp debug route -- Bloc 5.5, verifies computeLongTermMovers() (pure
// SQL/JS, zero Claude cost) produces a coherent result. Calls only the
// deterministic function, never the full runRadarAgent() Sonnet call --
// nothing here needs a real API cost to verify. Deleted after validation.
import { NextResponse } from 'next/server'
import { computeLongTermMovers } from '../../cron/radar-agent/route'

export async function GET() {
  const result = await computeLongTermMovers()
  return NextResponse.json(result)
}
