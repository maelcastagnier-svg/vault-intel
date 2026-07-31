// Temp debug route -- Bloc 6.2/6.3 sample test, verifies item_owned matching
// (target item_name normalized + compared against the PLAYER'S real owned
// NBT item_name values, not the global item_stats/items_catalog tables --
// confirmed with the user as the right approach after catalogs only
// exact-matched 22-33% of the 1302 "item" tasks). Deleted after validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CUCUMBER_UUID = '74a06395-3a99-4796-95d0-9e392ba3da7e'
const CUCUMBER_PROFILE = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'

// Real formats confirmed on Cucumber's actual decoded inventory: stars
// appended as literal ✪ characters ("Moonglade Figstone Splitter ✪✪✪✪✪"),
// pets prefixed "[Lvl N] " ("[Lvl 1] Frog"). No reforge text embedded in
// item_name (separate field) in the sample checked.
function normalizeItemName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .replace(/\s*✪+\s*$/, '')
    .replace(/^\[Lvl \d+\]\s*/i, '')
    .trim()
    .toLowerCase()
}

function collectOwnedNames(player: any): Set<string> {
  const names = new Set<string>()
  const add = (item: any) => { if (item?.item_name) names.add(normalizeItemName(item.item_name)) }

  for (const item of Object.values(player.equipped_armor || {})) add(item)
  for (const item of (player.equipped_accessories || [])) add(item)
  for (const item of (player.inventory_items || [])) add(item)
  for (const item of (player.ender_chest_items || [])) add(item)
  for (const bp of (player.backpacks || [])) for (const item of (bp.items || [])) add(item)
  for (const item of (player.personal_vault_items || [])) add(item)
  for (const slot of (player.wardrobe_slots || [])) for (const piece of ['helmet','chestplate','leggings','boots']) add(slot[piece])

  return names
}

export async function GET() {
  const { data: player } = await supabase
    .from('player_data')
    .select('equipped_armor, equipped_accessories, inventory_items, ender_chest_items, backpacks, personal_vault_items, wardrobe_slots')
    .eq('hypixel_uuid', CUCUMBER_UUID)
    .eq('profile_id', CUCUMBER_PROFILE)
    .single()

  const ownedNames = collectOwnedNames(player)

  const { data: itemTasks } = await supabase
    .from('milestone_tasks')
    .select('tier, category, task_title, label, requirement')
    .eq('requirement->>type', 'item')
    .limit(400)

  const results = (itemTasks || []).map(t => {
    const target = normalizeItemName((t.requirement as any).item_name)
    return { tier: t.tier, category: t.category, item_name: (t.requirement as any).item_name, normalized: target, matched: ownedNames.has(target) }
  })

  const matched = results.filter(r => r.matched)
  const unmatchedSample = results.filter(r => !r.matched).slice(0, 30)

  return NextResponse.json({
    owned_names_count: ownedNames.size,
    total_item_tasks_sampled: results.length,
    matched_count: matched.length,
    matched_sample: matched.slice(0, 30),
    unmatched_sample: unmatchedSample,
  })
}
