// app/api/cron/money-making-agent/route.ts
// Lundi 6h UTC — 4 prompts Sonnet avec analyse comparative complète
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseJSON(text: string): any {
  return JSON.parse(text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim())
}

// ─────────────────────────────────────────────────────────────
// TIER CONFIG
// ─────────────────────────────────────────────────────────────
const TIER_CONFIG = {
  early: {
    label:         'EARLY',
    networth:      '0-50M',
    target:        10,
    max_gear_cost: 5_000_000,
    capital:       500_000,
    access: [
      'COMBAT: Zombie Slayer T1-T2, Spider Slayer T1-T2, Wolf Slayer T1-T2',
      'MINING: Dwarven Mines only, HotM 1-3, basic pickaxe/drill (<5M)',
      'FISHING: Basic rods only, no Trophy Fish zone, no Thunder',
      'FARMING: Basic crops, no Garden unlock',
      'FORAGING: Basic foraging hubs',
    ].join(' | '),
    forbidden: 'Kuudra, Enderman/Blaze/Vampire Slayer, Crystal Hollows, Garden/Pests, Thunder, F4+ Dungeons, any gear costing more than 5M total'
  },
  mid: {
    label:         'MID',
    networth:      '50M-500M',
    target:        25,
    max_gear_cost: 100_000_000,
    capital:       10_000_000,
    access: [
      'COMBAT: Zombie T3-T4, Spider T3 (MAX T4), Wolf T3 (MAX T4), Enderman T1-T2, Dungeons F4-F6, Kuudra T1-T2',
      'MINING: Crystal Hollows basic (HotM 4-6), Glacite Tunnels basic — drills max ~50M (NOT Divan 1B+)',
      'FISHING: Trophy Fishing basic, Crimson Isle lava fishing basic',
      'FARMING: Garden unlocked, Pests basic, Fortune <400',
      'FORAGING: Advanced foraging',
    ].join(' | '),
    forbidden: 'M1-M7, Kuudra T3+, Enderman T3+, Blaze/Vampire Slayer, Thunder Fishing (requires 400+ SCC), Divan Drill (1B+), any gear >100M'
  },
  end: {
    label:         'END',
    networth:      '500M-5B',
    target:        50,
    max_gear_cost: 1_000_000_000,
    capital:       200_000_000,
    access: [
      'COMBAT: Zombie T5, Enderman T3-T4 (MAX T4 — T5 DOES NOT EXIST), Blaze T4-T5, Vampire T4-T5, M1-M4, Kuudra T3-T5',
      'MINING: Crystal Hollows advanced, Glacite Tunnels optimized, HotM 7-9',
      'FISHING: Thunder Fishing, Trophy Fishing advanced (400+ SCC)',
      'FARMING: Garden advanced, Pest farming optimized, Fortune 400-600',
    ].join(' | '),
    forbidden: 'M5-M7, Enderman T5 (DOES NOT EXIST), gear >1B per piece'
  },
  late: {
    label:         'LATE',
    networth:      '5B+',
    target:        70,
    max_gear_cost: 999_999_999_999,
    capital:       1_000_000_000,
    access: [
      'COMBAT: All slayers at max tier, M5-M7, all Kuudra tiers, RNG methods',
      'MINING: Divan Drill (1B+), HotM 10, max gemstone fortune',
      'FARMING: Max fortune, all crops, Jacob farming events',
      'FISHING: Max SCC, Thunder optimized, Crimson Isle lava',
    ].join(' | '),
    forbidden: 'Nothing — all content accessible. Enderman boss MAX still T4.'
  }
}

// ─────────────────────────────────────────────────────────────
// VÉRITÉS ABSOLUES DU JEU
// ─────────────────────────────────────────────────────────────
const GAME_TRUTHS = `
=== SLAYER SYSTEM ===
Slayer bosses are SUMMONED, not naturally spawning.
Process: Talk to Maddox NPC → get quest → kill X [mob type] in their zone → boss spawns.
ALWAYS describe as: "Via Maddox quest → kill [mob] in [zone] → boss summons there."
- Zombie: kill Zombies anywhere → Revenant Horror spawns
- Spider: kill Spiders in Spider's Den → Tarantula Broodfather spawns
- Wolf: kill Wolves in The Park → Sven Packmaster spawns
- Enderman: kill Endermen in The End → Voidgloom Seraph spawns
- Blaze: kill Blazes in Crimson Isle → Inferno Demonlord spawns
- Vampire: kill Vampires in The Rift → Riftstalker Bloodfiend spawns

=== SLAYER MAX TIERS ===
Zombie T5 ✅ | Spider T4 ✅ (T5 doesn't exist) | Wolf T4 ✅ (T5 doesn't exist)
Enderman T4 ✅ (T5 DOES NOT EXIST — player level goes to 9 but BOSS MAX IS T4)
Blaze T5 ✅ | Vampire T5 ✅ (Rift only)

=== GEAR COST REALITY CHECK ===
Before proposing any gear, verify cost is within tier budget:
- Divan's Drill: ~1,000,000,000 coins → LATE game only
- Hyperion: ~300-500M coins → END/LATE game only
- Necron's Armor full set: ~200-500M → END/LATE only
- Crimson Armor (Kuudra): ~20-100M per piece → END+
- Adaptive Armor: ~2-5M → MID game accessible
- Cheap fishing rod setup: <5M → EARLY accessible
- Basic pickaxe for Dwarven: <1M → EARLY accessible
Never suggest gear that costs more than the tier's max_gear_cost.

=== COINS/HOUR CALCULATION ===
MANDATORY: Calculate from real data, never guess.
Formula: (drops_per_kill × sell_price_from_bazaar × kills_per_hour) + (rare_drop_rate × rare_price × kills_per_hour) - costs_per_hour
Realistic kill rates:
- Slayer T1: ~40-60 kills/hr | T2: ~20-35/hr | T3: ~10-15/hr | T4: ~5-10/hr | T5: ~3-6/hr
- Kuudra T5: ~3-5 runs/hr
- Crystal Hollows mining: ~200-400 gems/hr depending on fortune
- Glacite Tunnels: ~150-300 powder/hr
- Basic fishing: ~30-60 catches/hr
- Trophy fishing: ~10-25 catches/hr

REALISTIC RANGES (do not exceed without data proof):
Early tier: 2-5M/h slayer, 3-8M/h mining, 2-6M/h fishing
Mid tier: 8-20M/h slayer, 10-25M/h mining/fishing, 15-30M/h dungeons
End tier: 25-80M/h best methods
Late tier: 50-150M/h best methods
`

// ─────────────────────────────────────────────────────────────
// PROMPT PRINCIPAL
// ─────────────────────────────────────────────────────────────
function buildPrompt(tier: string, config: typeof TIER_CONFIG.early): string {
  const gearBudget = config.max_gear_cost >= 1_000_000_000
    ? (config.max_gear_cost / 1_000_000_000).toFixed(0) + 'B'
    : (config.max_gear_cost / 1_000_000).toFixed(0) + 'M'

  return `You are Vault, elite Hypixel Skyblock economic intelligence system.

${GAME_TRUTHS}

=== TIER: ${config.label} (${config.networth} networth) ===
Target: ${config.target}M coins/hour minimum
Max affordable gear cost: ${gearBudget} total setup
Capital available: ${(config.capital / 1_000_000).toFixed(1)}M
ACCESSIBLE: ${config.access}
FORBIDDEN: ${config.forbidden}

=== ANALYSIS METHODOLOGY (follow these steps in order) ===

STEP 1 — BUILD COMPARISON TABLE
Before proposing anything, mentally build this table for ALL accessible methods:

| Method | Skill | Kills/Actions per hr | Key drops × price | Gross/hr | Costs/hr | NET coins/hr | Setup cost | Accessible at tier? |
For each method, fill in real numbers from the wiki drop tables and bazaar prices provided.
Example of correct calculation:
  Spider T3: ~12 kills/hr × (30 Tarantula Web × 800 coins + 1 Tarantula Silk × 150K × 0.02 chance) = ~316K gross + rare drops ~2M/hr = ~2.3M/hr - 30K costs = ~2.27M/h

STEP 2 — VERIFY SETUP AFFORDABILITY
For each method in your table, check: can a ${config.label} player with ${gearBudget} max gear budget actually equip this?
If the optimal setup costs more than ${gearBudget}, find the best AFFORDABLE alternative that still works.
Mark methods with unaffordable setups as inaccessible.

STEP 3 — SELECT TOP 3 ACTIVE GRIND
From your verified table, select the 3 methods with highest net coins/hour that:
- Are accessible at ${config.label} tier
- Have setups affordable within ${gearBudget}
- Have coins/hour calculated from real data (not guessed)
If the ${config.target}M/h target is unreachable, select the highest achievable methods and note the gap.

STEP 4 — GENERATE 3 VAULT EXCLUSIVE
Cross-reference wiki mechanics + live bazaar prices to find non-obvious opportunities:
- Method combinations that multiply income
- Price inefficiencies visible in current bazaar data
- Mechanics that most players overlook
Each must have a COMPUTABLE coins/hour from provided data.
Vault exclusive setups must also be affordable at ${gearBudget} max.

=== OUTPUT — strict JSON, no other text ===
{
  "tier": "${tier}",
  "comparison_summary": "2-3 sentences: which skill was best at this tier and why, with the key numbers that decided it",
  "active": [
    {
      "id": "unique_snake_case_id",
      "method": "Exact method name",
      "skill": "combat|mining|farming|fishing|foraging",
      "coins_min": 8000000,
      "coins_max": 15000000,
      "coins_display": "8-15M/h",
      "calculation": "X kills/hr × (Y drops × Z coins = W) + rare = GROSS - costs = NET",
      "key_drops": "Item1: X units/hr × Y coins = ZM | Item2: ...",
      "why_best": "Why this ranked #1/#2/#3 vs other accessible methods at this tier",
      "confidence": "HIGH|MED|LOW"
    }
  ],
  "vault": [
    {
      "id": "unique_snake_case_id",
      "method": "Innovation name",
      "skills_combined": ["skill1", "skill2"],
      "coins_min": 10000000,
      "coins_max": 20000000,
      "coins_display": "10-20M/h",
      "the_edge": "The specific non-obvious mechanic. Why it works. What most players miss.",
      "calculation": "How coins/hr is computed",
      "data_source": "Which wiki sections + bazaar prices confirm this",
      "confidence": "HIGH|MED|LOW"
    }
  ]
}`
}

// ─────────────────────────────────────────────────────────────
// CONTEXTE
// ─────────────────────────────────────────────────────────────
function formatContext(ctx: any): string {
  const bz = (ctx?.bazaar_live || [])
    .map((i: any) => `${i.item_id}: SELL=${Number(i.sell_price).toFixed(0)} BUY=${Number(i.buy_price).toFixed(0)} vol/day=${i.volume ? Number(i.volume).toLocaleString() : '?'}`)
    .join('\n')

  const wiki = (items: any[], n: number) =>
    (items || []).map((w: any) => `[${w.key}]\n${(w.content || '').slice(0, n)}`).join('\n\n')

  return [
    '=== BAZAAR LIVE PRICES ===',
    bz,
    '\n=== SLAYER WIKI (drop tables with %, quantities, slayer levels) ===',
    wiki(ctx?.wiki_slayers, 3000),
    '\n=== KUUDRA WIKI ===',
    wiki(ctx?.wiki_kuudra, 2000),
    '\n=== DUNGEON WIKI ===',
    wiki(ctx?.wiki_dungeons, 1500),
    '\n=== MINING WIKI (drop rates, powder, gemstones) ===',
    wiki(ctx?.wiki_mining, 2500),
    '\n=== FARMING WIKI (crops, pests, fortune scaling) ===',
    wiki(ctx?.wiki_farming, 1500),
    '\n=== FISHING WIKI (sea creatures, drop rates, SCC requirements) ===',
    wiki(ctx?.wiki_fishing, 2000),
    '\n=== ECONOMY & GUIDES ===',
    wiki(ctx?.wiki_economy, 800),
    wiki(ctx?.wiki_guides, 800),
  ].join('\n')
}

// ─────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: ctx, error: ctxErr } = await supabase.rpc('get_full_context')
  if (ctxErr) return NextResponse.json({ error: ctxErr.message }, { status: 500 })

  const context = formatContext(ctx)

  const results = await Promise.all(
    Object.entries(TIER_CONFIG).map(async ([tier, config]) => {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method:  'POST',
          headers: {
            'x-api-key':         process.env.ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
            'content-type':      'application/json',
          },
          body: JSON.stringify({
            model:      'claude-sonnet-4-6',
            max_tokens: 4000,
            system: [{ type: 'text', text: buildPrompt(tier, config), cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: context }],
          }),
        })

        if (!res.ok) return { tier, error: String(res.status) }
        const data   = await res.json()
        const parsed = parseJSON(data.content?.[0]?.text || '')
        return { tier, data: parsed }
      } catch (e: any) {
        return { tier, error: e.message }
      }
    })
  )

  for (const r of results) {
    if ('error' in r) { console.error(r.tier, r.error); continue }
    const section = 'money_making_' + r.tier
    const { data: old } = await supabase.from('claude_analysis').select('content').eq('section', section).single()
    if (old) await supabase.from('claude_memory').insert({ section, content: old.content, archived_at: new Date().toISOString() })
    await supabase.from('claude_analysis').upsert({ section, content: JSON.stringify(r.data), updated_at: new Date().toISOString() }, { onConflict: 'section' })
  }

  return NextResponse.json({
    success: true,
    results: results.map(r => ({ tier: r.tier, ok: !('error' in r) }))
  })
}