// TEMP debug route -- verifies Phase 1 end-to-end on real data before
// merging feat/game-knowledge-phase1:
//  1. Confirms activity_gear_categories/progression_tiers are populated as
//     seeded by phase1_game_knowledge_base.sql.
//  2. Re-runs the real Evolve Skills pipeline on Cucumber/Orange (now reading
//     the shared table instead of the old hardcoded const) and checks every
//     target.gear_name's real item_stats.category against the activity's
//     allowed set -- the actual Ragnarok-Axe-class regression check.
//  3. Generates a small real sample of Money Making setups (one method per
//     distinct skill found in the DB) via the same new code path and does
//     the same category cross-check on weapon_name/tool/rod, without
//     regenerating the entire catalog (cost/time control).
// Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { runEvolveSkills } from '../../cron/evolve-skills/route'
import { generateOne, loadPricedItems, buildWikiContext, GROUNDING_RULES, gearCatalogForBudget } from '../../cron/setup-generate-agent/route'
import { buildActivityGearCatalogSection } from '../../../../lib/gear-pricing'
import { loadActivityGearCategories } from '../../../../lib/activity-gear'
import { TIER_CONFIG } from '../../../../lib/money-making-constants'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PROFILES = {
  cucumber: 'b077f27a-60f7-46d9-be13-c4689a01dc3b',
  orange: '35938937-7db6-4f5e-95c5-fecae9084be5',
}

const ACTIVITY_KEYS = ['farming', 'mining', 'foraging', 'fishing', 'combat', 'dungeoneering', 'slayer']

export async function GET() {
  // 1. Migration sanity check
  const { data: agc, error: agcErr } = await supabase.from('activity_gear_categories').select('activity_key, item_category')
  const { data: pt, error: ptErr } = await supabase.from('progression_tiers').select('*').order('tier_order')

  // Build item_id -> category lookup once, reused by both cross-checks below
  const { data: statsRows } = await supabase.from('item_stats').select('display_name, category')
  const categoryByName = new Map((statsRows || []).map(s => [s.display_name, s.category]))
  const activityGear = await loadActivityGearCategories()

  function crossCheck(name: string | null | undefined, activityKey: string): { name: string; category: string | undefined; allowed: boolean } | null {
    if (!name) return null
    const category = categoryByName.get(name)
    const allowedCategories = activityGear[activityKey] || []
    return { name, category, allowed: !!category && allowedCategories.includes(category) }
  }

  // 2. Real Evolve Skills run + 3. Money Making sample, run concurrently --
  // fully independent operations (different players/methods/API calls).
  async function runEvolveCheck() {
    const evolveResult = await runEvolveSkills(Object.values(PROFILES))
    const evolveCheck: any = {}
    for (const [name, profileId] of Object.entries(PROFILES)) {
      const { data } = await supabase.from('player_skill_cards').select('cards').eq('profile_id', profileId).single()
      const violations: any[] = []
      const allGear: any[] = []
      for (const card of (data?.cards || [])) {
        const check = crossCheck(card.target?.gear_name, card.skill_key)
        if (check) { allGear.push({ skill: card.skill_key, ...check }); if (!check.allowed) violations.push({ skill: card.skill_key, ...check }) }
        for (const b of (card.bosses || [])) {
          const bcheck = crossCheck(b.target?.gear_name, card.skill_key)
          if (bcheck) { allGear.push({ skill: `${card.skill_key}/${b.boss}`, ...bcheck }); if (!bcheck.allowed) violations.push({ skill: `${card.skill_key}/${b.boss}`, ...bcheck }) }
        }
      }
      evolveCheck[name] = { totalGearChecked: allGear.length, violations, sample: allGear.slice(0, 8) }
    }
    return { evolveResult, evolveCheck }
  }

  async function runMoneyMakingCheck() {
    // One real method per distinct skill present in DB
    const { data: libraryRows } = await supabase.from('claude_analysis').select('section, content').like('section', 'money_making_%')
    const [{ data: ctx }, pricedItems] = await Promise.all([supabase.rpc('get_full_context'), loadPricedItems()])
    const baseWikiContext = buildWikiContext(ctx) + '\n' + GROUNDING_RULES

    const seenSkills = new Set<string>()
    const sampleMethods: { method: any; tier: string }[] = []
    for (const row of libraryRows || []) {
      try {
        const parsed = JSON.parse(row.content)
        const tier = row.section.replace('money_making_', '')
        for (const m of [...(parsed.active || []), ...(parsed.vault || [])]) {
          const skill = m.skill || (m.skills_combined || [])[0]
          if (skill && !seenSkills.has(skill)) { seenSkills.add(skill); sampleMethods.push({ method: m, tier }) }
        }
      } catch {}
    }

    return Promise.all(sampleMethods.map(async ({ method, tier }) => {
      const tierConfig = TIER_CONFIG[tier as keyof typeof TIER_CONFIG]
      if (!tierConfig) return null
      const wikiContext = baseWikiContext + '\n\n' + gearCatalogForBudget(pricedItems, tierConfig.max_gear_cost) +
        '\n\n' + buildActivityGearCatalogSection(pricedItems, tierConfig.max_gear_cost, ACTIVITY_KEYS, activityGear)
      await generateOne(method, tier, wikiContext, pricedItems, activityGear)

      const key = (method.id || method.method || '').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 80)
      const { data: saved } = await supabase.from('method_setups').select('setup').eq('method_key', key).eq('tier', tier).single()
      const setup = saved ? JSON.parse(saved.setup) : null
      const activityKey = method.skill || (method.skills_combined || [])[0]
      return {
        method: method.method, tier, activityKey,
        weapon_check: crossCheck(setup?.weapon_name, activityKey),
        tool_raw: setup?.tool, rod_raw: setup?.rod,
        cost_optimal: setup?.cost_optimal,
      }
    }))
  }

  const [{ evolveResult, evolveCheck }, moneyMakingResults] = await Promise.all([runEvolveCheck(), runMoneyMakingCheck()])

  return NextResponse.json({
    migration: {
      activity_gear_categories_rows: agc?.length, activity_gear_categories_error: agcErr?.message,
      progression_tiers_rows: pt?.length, progression_tiers_error: ptErr?.message,
    },
    activityGearLoaded: Object.keys(activityGear).length,
    evolveResult, evolveCheck, moneyMakingResults,
  })
}
