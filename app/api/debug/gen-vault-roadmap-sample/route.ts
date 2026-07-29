// TEMP debug route -- ONE-SHOT Haiku call to draft a sample of 10-15
// Starter-tier "Vault roadmap" tasks, grounded in real data (skill caps,
// real collections, real cheap items). Does NOT write to the DB -- returns
// the draft for review before any full 7-tier generation. Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { loadPricedItems } from '../../cron/setup-generate-agent/route'
import { GAME_TRUTHS } from '../../../../lib/money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // ── Real grounding data, zero Claude cost to gather ─────────────────
  const [{ data: skillRows }, { data: collectionRows }, pricedItems] = await Promise.all([
    supabase.from('skills').select('skill_name, level').order('level', { ascending: false }),
    supabase.from('collections').select('item_id, item_name, skill_type, max_tier'),
    loadPricedItems(),
  ])

  const capBySkill = new Map<string, number>()
  for (const row of skillRows || []) {
    if (!capBySkill.has(row.skill_name)) capBySkill.set(row.skill_name, row.level) // first seen = highest (desc order)
  }
  const skillCapsText = Array.from(capBySkill.entries()).map(([s, cap]) => `${s}: cap ${cap}`).join(', ')

  const collectionsText = (collectionRows || [])
    .map(c => `${c.item_id} "${c.item_name}" [${c.skill_type}] max_tier=${c.max_tier}`)
    .join('\n')

  // Cheap, real, Starter-appropriate items only (well below TIER_CONFIG.early's
  // own 5M ceiling -- Starter is the very bottom of the 7-tier scale, a sub-band
  // of "early" per progression_tiers).
  const starterItems = pricedItems
    .filter(p => p.price > 0 && p.price <= 300_000)
    .sort((a, b) => b.price - a.price)
    .slice(0, 40)
  const starterItemsText = starterItems
    .map(p => `${p.item_id} "${p.display_name}" [${p.category}] price=${Math.round(p.price).toLocaleString()}`)
    .join('\n')

  const system = `You are drafting the Starter tier of Vault's own SkyBlock progression roadmap -- inspired by the community wiki's completion guide but NOT bound to reproduce it, a curated, logically-ordered sequence WE define.

${GAME_TRUTHS}

=== REAL SKILL LEVEL CAPS (never propose a level above these) ===
${skillCapsText}

=== REAL COLLECTIONS (only name a collection from this list, exact item_id/tier <= max_tier) ===
${collectionsText}

=== REAL CHEAP ITEMS, STARTER BUDGET (<=300k coins, only name an item from this list) ===
${starterItemsText}

=== GROUNDING RULES (mandatory, same discipline as Money Making/Evolve Skills) ===
- Never invent an item, collection, or skill name -- every named item MUST come verbatim from the lists above.
- Starter is the very first, easiest tier -- skill levels should be low (roughly 3-12), collection tiers low (1-3), items cheap (the list above is already capped at 300k).
- Order tasks by ACTUAL difficulty/progression logic: what a brand new player would realistically reach first, second, etc. -- not alphabetical, not random.
- Only use these requirement types, exactly these shapes:
  {"type":"skill","skill":"farming","level":5}
  {"type":"collection","item_id":"WHEAT","item_name":"Wheat","tier":2}
  {"type":"fairy_souls","target":10}
  {"type":"dungeon_floor","floor":1}
  {"type":"slayer_engaged","boss":"zombie"}
  {"type":"hotm_unlocked"}
  {"type":"item","item_id":"...","item_name":"..."}
- Cover a MIX of these categories, not all of one kind -- the user explicitly wants skill leveling, collections, a dungeon-entry task, a slayer-engagement task, an item-acquisition task, and fairy souls represented across the 10-15 tasks.
- Do NOT invent a "reputation" mechanic -- no verified real data source for it exists yet, leave it out entirely for now.
- Do NOT propose a specific slayer TIER (e.g. "reach Zombie T2") -- no real tier-threshold data exists yet, only "engaged with this slayer at all" (slayer_engaged) is honest.

Return ONLY raw JSON, no explanation:
{"tasks":[{"order":1,"category":"...","task_title":"...","label":"...","requirement":{...},"why_this_order":"1 sentence on why this comes at this point in the sequence"}]}
10 to 15 tasks total.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: [{ type: 'text', text: system }],
      messages: [{ role: 'user', content: 'Draft the Starter tier task sample now.' }],
    }),
  })

  if (!res.ok) {
    return NextResponse.json({ error: `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}` }, { status: 500 })
  }

  const data = await res.json()
  const raw = data.content?.[0]?.text || ''
  let parsed: any
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: 'JSON parse failed', raw }, { status: 500 })
  }

  // Cross-check every named item/collection against the real lists we gave it --
  // never trust the prompt rule alone, same philosophy as verifyActivityGearName.
  const realItemIds = new Set(starterItems.map(p => p.item_id))
  const realCollectionIds = new Set((collectionRows || []).map(c => c.item_id))
  const violations: any[] = []
  for (const t of parsed.tasks || []) {
    const r = t.requirement
    if (r?.type === 'item' && !realItemIds.has(r.item_id)) violations.push({ task: t.task_title, issue: 'item_id not in real starter catalog', item_id: r.item_id })
    if (r?.type === 'collection' && !realCollectionIds.has(r.item_id)) violations.push({ task: t.task_title, issue: 'collection item_id not real', item_id: r.item_id })
    if (r?.type === 'skill' && capBySkill.get(r.skill) != null && r.level > capBySkill.get(r.skill)!) violations.push({ task: t.task_title, issue: 'level exceeds real cap', skill: r.skill, level: r.level, cap: capBySkill.get(r.skill) })
  }

  return NextResponse.json({ taskCount: parsed.tasks?.length, violations, tasks: parsed.tasks })
}
