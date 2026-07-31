// Temporary debug route -- verifies the contamination masking filter against
// real claude_analysis content on preview, bypassing the plan gate (which would
// otherwise require a real paid test session). Deleted after validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { filterMoneyMaking } from '../../../../lib/gate-content'
import { SLAYER_BUG_CONTAMINATED_METHOD_IDS } from '../../../../lib/money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const results: Record<string, any> = {}

  for (const tier of ['early', 'mid', 'end', 'late']) {
    const key = `money_making_${tier}`
    const { data } = await supabase
      .from('claude_analysis')
      .select('content')
      .eq('section', key)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const parsed = JSON.parse(data?.content || '{}')
    const filtered = filterMoneyMaking(parsed, 'elite')
    const beforeIds = [...(parsed?.active || []), ...(parsed?.vault || [])].map((m: any) => m?.id)
    const afterIds = [...filtered.active, ...filtered.vault].map((m: any) => m?.id)
    const filteredOut = beforeIds.filter((id: string) => !afterIds.includes(id))

    results[key] = {
      before_count: beforeIds.length,
      after_count: afterIds.length,
      filtered_out: filteredOut,
      still_contains_contaminated: afterIds.some((id: string) => SLAYER_BUG_CONTAMINATED_METHOD_IDS.has(id)),
    }
  }

  return NextResponse.json(results)
}
