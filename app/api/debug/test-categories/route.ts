// TEMP debug route -- inspect real item_stats.category values to design a
// per-skill functional filter for evolve-skills' gear catalog. Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data } = await supabase.from('item_stats').select('item_id, display_name, category')
  const byCategory: Record<string, string[]> = {}
  for (const row of data || []) {
    const cat = row.category || 'NULL'
    byCategory[cat] = byCategory[cat] || []
    if (byCategory[cat].length < 8) byCategory[cat].push(`${row.item_id} "${row.display_name}"`)
  }
  const counts = Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, v.length]))

  const ragnarok = (data || []).filter(r => (r.display_name || '').toLowerCase().includes('ragnarok'))

  return NextResponse.json({
    categoryCounts: Object.fromEntries(Object.entries(byCategory).map(([k]) => [k, (data || []).filter(r => (r.category || 'NULL') === k).length])),
    samplesByCategory: byCategory,
    ragnarok,
  })
}
