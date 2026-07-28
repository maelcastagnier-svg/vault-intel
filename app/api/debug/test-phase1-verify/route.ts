// TEMP debug route -- diagnose why activity_gear_categories/progression_tiers
// queries returned null/undefined in the first Phase 1 verification pass.
// Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const agc = await supabase.from('activity_gear_categories').select('*')
  const pt = await supabase.from('progression_tiers').select('*')

  return NextResponse.json({
    activity_gear_categories: { data: agc.data, error: agc.error, status: agc.status, count: agc.data?.length },
    progression_tiers: { data: pt.data, error: pt.error, status: pt.status, count: pt.data?.length },
  })
}
