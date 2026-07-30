// TEMP debug route -- verifies the sold-price pipeline fix end to end (Bloc 1.3):
// 1. Direct HTTP check of /v2/skyblock/auctions/ended WITH the API key (confirms 1.1)
// 2. Calls runAhCollect() directly (bypasses CRON_SECRET/HTTP), checks ah_scan_buffer
//    for real sold_count > 0 rows
// 3. Calls runAhAggregate() directly (forces today's aggregation early rather than
//    waiting for the 23:59 cron -- safe, same pattern used all session, just runs
//    today's real aggregate a few hours ahead of schedule), checks all 3 daily
//    tables for sold_count > 0 on today's bucket_date
// Zero Claude cost. Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { runAhCollect } from '../../cron/ah-collect/route'
import { runAhAggregate } from '../../cron/ah-aggregate/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // 1. Direct endpoint check with the key
  const endedRes = await fetch('https://api.hypixel.net/v2/skyblock/auctions/ended', {
    headers: { 'API-Key': process.env.HYPIXEL_API_KEY! },
  })
  const endedBody = await endedRes.json().catch(() => null)

  // 2. Real collection run
  const collectResult = await runAhCollect()

  const today = new Date().toISOString().split('T')[0]
  const { data: bufferSample, count: bufferSoldCount } = await supabase
    .from('ah_scan_buffer')
    .select('base_item_id, variant_key, avg_sold_price, sold_count', { count: 'exact' })
    .gt('sold_count', 0)
    .limit(5)

  // 3. Force today's aggregate early (safe -- just runs the real 23:59 job now)
  const aggregateResult = await runAhAggregate()

  const [{ count: variantsWithSold }, { count: baseWithSold }, { count: blendedWithSold }] = await Promise.all([
    supabase.from('price_history_ah_variants').select('*', { count: 'exact', head: true }).eq('bucket_date', today).gt('sold_count', 0),
    supabase.from('price_history_ah_variant_base').select('*', { count: 'exact', head: true }).eq('bucket_date', today).gt('sold_count', 0),
    supabase.from('price_history_ah').select('*', { count: 'exact', head: true }).eq('bucket_date', today).eq('granularity', 'DAILY').gt('sold_count', 0),
  ])

  return NextResponse.json({
    step1_ended_endpoint: { status: endedRes.status, success: endedBody?.success, auctions_count: endedBody?.auctions?.length ?? null },
    step2_collect: { ...collectResult, buffer_rows_with_sold_price: bufferSoldCount, buffer_sample: bufferSample },
    step3_aggregate: { ...aggregateResult, today, variants_with_sold_today: variantsWithSold, base_with_sold_today: baseWithSold, blended_with_sold_today: blendedWithSold },
  })
}
