// app/api/debug/test-ah-collect-fix/route.ts
// TEMPORAIRE -- vérifie que le fix price_history_ah_variants fait bien
// remonter des lignes dans ah_live. Supprimée après validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAhCollect } from '../../cron/ah-collect/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const result = await runAhCollect()
  const { count: ahLiveCount } = await supabase.from('ah_live').select('*', { count: 'exact', head: true })
  const { data: sample } = await supabase.from('ah_live').select('item_name, discount_pct, historical_avg, best_price').order('discount_pct', { ascending: false }).limit(5)
  return NextResponse.json({ collect_result: result, ah_live_count_after: ahLiveCount, ah_live_top5: sample })
}
