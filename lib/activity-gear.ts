// lib/activity-gear.ts
// Single source of truth for "which real item_stats.category belongs to
// which activity" -- previously a hardcoded SKILL_GEAR_CATEGORIES const
// living only inside evolve-skills/route.ts, now a real table
// (activity_gear_categories, see phase1_game_knowledge_base.sql) shared by
// both Evolve Skills and Money Making's setup-generate-agent. The point:
// two independent copies of this mapping is exactly the kind of drift that
// caused the Ragnarok Axe bug (a real SWORD recommended as a Foraging tool)
// -- one table, read by both, can't diverge.
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ActivityGearCategories = Record<string, string[]>

// Activities with no dedicated weapon/tool slot (alchemy, enchanting) simply
// have no rows -- callers treat a missing key as "armor/accessories only",
// same semantics the old hardcoded const had for an absent object key.
export async function loadActivityGearCategories(): Promise<ActivityGearCategories> {
  const { data } = await supabase
    .from('activity_gear_categories')
    .select('activity_key, item_category')

  const map: ActivityGearCategories = {}
  for (const row of data || []) {
    if (!map[row.activity_key]) map[row.activity_key] = []
    map[row.activity_key].push(row.item_category)
  }
  return map
}
