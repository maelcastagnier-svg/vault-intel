// TEMP debug route -- re-runs the real evolve-skills pipeline (real Claude
// calls, real DB writes to player_skill_cards) on Cucumber/Orange to verify
// the two fixes: (1) current.armor_set_used pulls the best OWNED set for
// each specific skill, not just literally-equipped armor, (2) target.gear_name
// is category-scoped per skill and never leaks a wrong-activity item.
// Deleted after validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runEvolveSkills } from '../../cron/evolve-skills/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PROFILES = {
  cucumber: 'b077f27a-60f7-46d9-be13-c4689a01dc3b',
  orange: '35938937-7db6-4f5e-95c5-fecae9084be5',
}

export async function GET() {
  const result = await runEvolveSkills(Object.values(PROFILES))

  const out: any = { runResult: result }
  for (const [name, profileId] of Object.entries(PROFILES)) {
    const { data } = await supabase
      .from('player_skill_cards')
      .select('cards')
      .eq('profile_id', profileId)
      .single()

    out[name] = (data?.cards || []).map((c: any) => ({
      skill_key: c.skill_key,
      current_armor_set_used: c.current?.armor_set_used,
      current_render_setup_armor_set: c.current?.render_setup?.armor_set,
      target_armor_set: c.target?.armor_set,
      target_gear_name: c.target?.gear_name,
      target_goal: c.target?.goal,
      bosses: (c.bosses || []).map((b: any) => ({
        boss: b.boss,
        current_armor_set_used: b.current?.armor_set_used,
        current_render_setup_armor_set: b.current?.render_setup?.armor_set,
        target_armor_set: b.target?.armor_set,
        target_gear_name: b.target?.gear_name,
      })),
    }))
  }

  return NextResponse.json(out)
}
