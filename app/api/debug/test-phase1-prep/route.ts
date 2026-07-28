// TEMP debug route -- gathers real data needed to calibrate progression_tiers
// and validate Money Making's method.skill field coverage before writing the
// Phase 1 migration + integration. Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data: players } = await supabase
    .from('player_data')
    .select('profile_id, game_stage, networth, purse, bank')
    .in('profile_id', ['b077f27a-60f7-46d9-be13-c4689a01dc3b', '35938937-7db6-4f5e-95c5-fecae9084be5'])

  const { data: libraryRows } = await supabase
    .from('claude_analysis')
    .select('section, content')
    .like('section', 'money_making_%')

  const skillCoverage: Record<string, any> = {}
  for (const row of libraryRows || []) {
    try {
      const parsed = JSON.parse(row.content)
      const methods = [...(parsed.active || []), ...(parsed.vault || [])]
      skillCoverage[row.section] = methods.map((m: any) => ({
        method: m.method, skill: m.skill, skills_combined: m.skills_combined,
      }))
    } catch (e: any) {
      skillCoverage[row.section] = { error: e.message }
    }
  }

  return NextResponse.json({ players, skillCoverage })
}
