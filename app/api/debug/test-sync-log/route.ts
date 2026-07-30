// Temp debug route -- verifies the Bloc 2 sync_log instrumentation actually
// writes real rows for the 6 non-AI crons (skips the 4 Claude-cost crons to
// avoid needless API spend; those get confirmed naturally via their real
// schedule -- radar-agent/patch-analysis-agent daily, money-making-agent/
// setup-generate-agent next Monday). Deleted after validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAhCollect } from '../../cron/ah-collect/route'
import { runAhAggregate } from '../../cron/ah-aggregate/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function fakeAuthedRequest(): Request {
  return new Request('http://localhost/debug', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
}

export async function GET() {
  const before = new Date().toISOString()

  // ah-collect / ah-aggregate have plain exported functions -- call directly.
  let ahCollectResult: any = null
  let ahAggregateResult: any = null
  try { ahCollectResult = await runAhCollect() } catch (e: any) { ahCollectResult = { error: e.message } }
  try { ahAggregateResult = await runAhAggregate() } catch (e: any) { ahAggregateResult = { error: e.message } }

  // bazaar-collect / data-retention / patch-collect / update-catalog only
  // export GET -- call it directly with a real CRON_SECRET-bearing Request,
  // same trick as always (direct in-process call, never HTTP self-fetch,
  // which hits the Vercel SSO wall).
  const { GET: bazaarGET }        = await import('../../cron/bazaar-collect/route')
  const { GET: retentionGET }     = await import('../../cron/data-retention/route')
  const { GET: patchCollectGET }  = await import('../../cron/patch-collect/route')
  const { GET: catalogGET }       = await import('../../cron/update-catalog/route')

  const bazaarRes    = await bazaarGET(fakeAuthedRequest() as any)
  const retentionRes = await retentionGET(fakeAuthedRequest() as any)
  const patchRes      = await patchCollectGET(fakeAuthedRequest() as any)
  const catalogRes   = await catalogGET(fakeAuthedRequest() as any)

  const { data: rows } = await supabase
    .from('sync_log')
    .select('job_name, status, rows_written, started_at, finished_at')
    .gte('started_at', before)
    .order('started_at', { ascending: true })

  return NextResponse.json({
    ah_collect: ahCollectResult,
    ah_aggregate: ahAggregateResult,
    bazaar_collect: await bazaarRes.json(),
    data_retention: await retentionRes.json(),
    patch_collect: await patchRes.json(),
    update_catalog: await catalogRes.json(),
    sync_log_rows_since_test: rows,
  })
}
