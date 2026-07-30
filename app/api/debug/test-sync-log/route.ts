// Temp debug route -- verifies the Bloc 2 sync_log instrumentation actually
// writes real rows for the 6 non-AI crons (skips the 4 Claude-cost crons to
// avoid needless API spend; those get confirmed naturally via their real
// schedule -- radar-agent/patch-analysis-agent daily, money-making-agent/
// setup-generate-agent next Monday). Deleted after validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  // startSync/finishSync live in each route's GET wrapper, not in the plain
  // exported run*() functions -- must go through GET itself (direct in-process
  // call with a real CRON_SECRET-bearing Request, never HTTP self-fetch, which
  // hits the Vercel SSO wall) to actually exercise the instrumentation.
  const { GET: ahCollectGET }     = await import('../../cron/ah-collect/route')
  const { GET: ahAggregateGET }   = await import('../../cron/ah-aggregate/route')
  const { GET: bazaarGET }        = await import('../../cron/bazaar-collect/route')
  const { GET: retentionGET }     = await import('../../cron/data-retention/route')
  const { GET: patchCollectGET }  = await import('../../cron/patch-collect/route')
  const { GET: catalogGET }       = await import('../../cron/update-catalog/route')

  const ahCollectRes   = await ahCollectGET(fakeAuthedRequest() as any)
  const ahAggregateRes = await ahAggregateGET(fakeAuthedRequest() as any)
  const bazaarRes      = await bazaarGET(fakeAuthedRequest() as any)
  const retentionRes   = await retentionGET(fakeAuthedRequest() as any)
  const patchRes       = await patchCollectGET(fakeAuthedRequest() as any)
  const catalogRes     = await catalogGET(fakeAuthedRequest() as any)

  const { data: rows } = await supabase
    .from('sync_log')
    .select('job_name, status, rows_written, started_at, finished_at')
    .gte('started_at', before)
    .order('started_at', { ascending: true })

  return NextResponse.json({
    ah_collect: await ahCollectRes.json(),
    ah_aggregate: await ahAggregateRes.json(),
    bazaar_collect: await bazaarRes.json(),
    data_retention: await retentionRes.json(),
    patch_collect: await patchRes.json(),
    update_catalog: await catalogRes.json(),
    sync_log_rows_since_test: rows,
  })
}
