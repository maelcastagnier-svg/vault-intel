// app/api/debug/check-variants-table/route.ts
// TEMPORAIRE -- vérifie l'état réel de price_history_ah_variants (le fix
// pointe dessus mais relevant_after_filter reste à 0, faut confirmer si la
// table a des données récentes avant de creuser plus loin).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { count } = await supabase.from('price_history_ah_variants').select('*', { count: 'exact', head: true })
  const { data: latest } = await supabase.from('price_history_ah_variants').select('*').order('bucket_date', { ascending: false }).limit(5)
  const { data: bucketDates } = await supabase.from('price_history_ah_variants').select('bucket_date').order('bucket_date', { ascending: false }).limit(1)

  const { data: lockAggregate } = await supabase.from('cron_locks').select('*').eq('job_name', 'ah_aggregate').maybeSingle()

  return NextResponse.json({
    price_history_ah_variants_count: count,
    latest_bucket_date: bucketDates?.[0]?.bucket_date || null,
    sample_rows: latest,
    ah_aggregate_lock: lockAggregate,
    now: new Date().toISOString(),
  })
}
