// TEMP debug route -- Evolve Skills half of Phase 1 verification, split out
// from test-phase1-verify because the combined route (Evolve Skills + a
// Money Making sample) exceeded the available time budget. Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { runEvolveSkills } from '../../cron/evolve-skills/route'
import { loadActivityGearCategories } from '../../../../lib/activity-gear'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PROFILES = {
  cucumber: 'b077f27a-60f7-46d9-be13-c4689a01dc3b',
  orange: '35938937-7db6-4f5e-95c5-fecae9084be5',
}

export async function GET() {
  const { data: statsRows } = await supabase.from('item_stats').select('display_name, category')
  const categoryByName = new Map((statsRows || []).map(s => [s.display_name, s.category]))
  const activityGear = await loadActivityGearCategories()

  function crossCheck(name: string | null | undefined, activityKey: string) {
    if (!name) return null
    const category = categoryByName.get(name)
    const allowedCategories = activityGear[activityKey] || []
    return { name, category, allowed: !!category && allowedCategories.includes(category) }
  }

  const evolveResult = await runEvolveSkills(Object.values(PROFILES))

  const evolveCheck: any = {}
  for (const [name, profileId] of Object.entries(PROFILES)) {
    const { data } = await supabase.from('player_skill_cards').select('cards').eq('profile_id', profileId).single()
    const violations: any[] = []
    const allGear: any[] = []
    for (const card of (data?.cards || [])) {
      const check = crossCheck(card.target?.gear_name, card.skill_key)
      if (check) { allGear.push({ skill: card.skill_key, current_armor_set_used: card.current?.armor_set_used, ...check }); if (!check.allowed) violations.push({ skill: card.skill_key, ...check }) }
      for (const b of (card.bosses || [])) {
        const bcheck = crossCheck(b.target?.gear_name, card.skill_key)
        if (bcheck) { allGear.push({ skill: `${card.skill_key}/${b.boss}`, current_armor_set_used: b.current?.armor_set_used, ...bcheck }); if (!bcheck.allowed) violations.push({ skill: `${card.skill_key}/${b.boss}`, ...bcheck }) }
      }
    }
    evolveCheck[name] = { totalGearChecked: allGear.length, violations, allGear }
  }

  return NextResponse.json({
    activityGearLoaded: Object.keys(activityGear).length,
    evolveResult, evolveCheck,
  })
}
