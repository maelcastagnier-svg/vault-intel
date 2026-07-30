// Temp debug route -- Bloc 3.3, verifies the exact->base cascade (3.2) and
// the top-25/category cap (3.1) on real data. Deleted after validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { GET: ahCollectGET } = await import('../../cron/ah-collect/route')
  const req = new Request('http://localhost/debug', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const res = await ahCollectGET(req as any)
  const result = await res.json()

  const { data: liveByCat } = await supabase
    .from('ah_live')
    .select('category')
  const counts: Record<string, number> = {}
  for (const r of liveByCat || []) counts[r.category] = (counts[r.category] || 0) + 1

  const { data: baseTierSamples } = await supabase
    .from('ah_live')
    .select('item_name, base_item_id, variant_key, historical_avg, discount_pct, best_price, category')
    .order('discount_pct', { ascending: false })
    .limit(200)

  return NextResponse.json({
    run_result: result,
    ah_live_rows_per_category: counts,
    ah_live_total: (liveByCat || []).length,
    sample_top_by_discount: (baseTierSamples || []).slice(0, 10),
  })
}
