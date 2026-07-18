// app/api/cron/money-making-agent/route.ts
// Lundi 6h UTC — analyse comparative + bibliothèque + feedback communautaire
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

const TIER_CONFIG = {
  early: {
    label: 'EARLY', networth: '0-50M', target: 10,
    max_gear_cost: 5_000_000, capital: 500_000,
    access: 'Zombie/Spider/Wolf Slayer T1-T2 | Dwarven Mines HotM 1-3 | Basic fishing | Basic crops | Basic foraging',
    forbidden: 'Kuudra, Enderman/Blaze/Vampire Slayer, Crystal Hollows, Garden, Thunder Fishing, Dungeons F4+, any gear >5M total'
  },
  mid: {
    label: 'MID', networth: '50M-500M', target: 25,
    max_gear_cost: 100_000_000, capital: 10_000_000,
    access: 'Zombie T3-T4, Spider T3-T4 (MAX), Wolf T3-T4 (MAX), Enderman T1-T2 | Dungeons F4-F6 | Kuudra T1-T2 | Crystal Hollows HotM 4-6 | Trophy Fishing basic | Garden basic',
    forbidden: 'M1-M7, Kuudra T3+, Enderman T3+, Blaze/Vampire Slayer, Thunder Fishing, Divan Drill (1B+), any gear >100M'
  },
  end: {
    label: 'END', networth: '500M-5B', target: 50,
    max_gear_cost: 1_000_000_000, capital: 200_000_000,
    access: 'Zombie T5, Enderman T3-T4 (MAX T4 ONLY), Blaze T4-T5, Vampire T4-T5 | Dungeons M1-M4 | Kuudra T3-T5 | Crystal Hollows advanced | Thunder Fishing | Pest Farming',
    forbidden: 'M5-M7, Enderman T5 (DOES NOT EXIST), any single gear piece >1B'
  },
  late: {
    label: 'LATE', networth: '5B+', target: 70,
    max_gear_cost: 9_999_999_999, capital: 1_000_000_000,
    access: 'All slayers at MAX tier | M5-M7 | All Kuudra | Max fortune farming | Max SCC fishing | Divan Drill',
    forbidden: 'Nothing — Enderman boss MAX still T4'
  }
}

const GAME_TRUTHS = `
=== SLAYER SYSTEM (mandatory — always describe this way) ===
Slayer bosses are SUMMONED via Maddox NPC, NOT naturally spawning.
Process: Talk to Maddox → get quest → kill X [mob type] in their zone → boss spawns at your location.
Always write: "Via Maddox quest → kill [mob] in [zone] → boss summons there"
Zones: Zombie=anywhere | Spider=Spider's Den | Wolf=The Park | Enderman=The End | Blaze=Crimson Isle | Vampire=The Rift

=== SLAYER MAX TIERS ===
Zombie T5 ✅ | Spider T4 ✅ | Wolf T4 ✅ | Enderman T4 ✅ (T5 DOES NOT EXIST) | Blaze T5 ✅ | Vampire T5 ✅

=== REALISTIC COINS/HOUR RANGES ===
Early: Slayer 2-5M/h | Mining 3-8M/h | Fishing 2-4M/h
Mid: Slayer 8-20M/h | Mining 10-25M/h | Fishing 12-25M/h | Dungeons 15-30M/h
End: Slayer 25-80M/h | Mining 25-60M/h | Fishing 30-70M/h | Kuudra 50-120M/h
Late: Best methods 70-150M/h
If a method doesn't reach the tier target, pick best available and note the gap honestly.
`

// ─── Format contexte ─────────────────────────────────────────
function formatContext(ctx: any, existingMethods: any[], feedbackData: any[]): string {
  const bz = (ctx?.bazaar_live || [])
    .map((i: any) => `${i.item_id}: SELL=${Number(i.sell_price).toFixed(0)} BUY=${Number(i.buy_price).toFixed(0)} vol=${i.volume ? Number(i.volume).toLocaleString() : '?'}`)
    .join('\n')

  const wiki = (items: any[], n: number) =>
    (items || []).map((w: any) => `[${w.key}]\n${(w.content || '').slice(0, n)}`).join('\n\n')

  // Bibliothèque des méthodes existantes
  const library = existingMethods.length > 0
    ? existingMethods.map(m =>
        `[${m.tier}/${m.method_id}] ${m.method_name} | ${m.coins_display} | validated ${m.validation_count}x | ` +
        `confidence: ${m.confidence} | status: ${m.status}`
      ).join('\n')
    : 'Empty — first run'

  // Feedback communautaire
  const feedback = feedbackData.length > 0
    ? feedbackData.map(f =>
        `[${f.tier}/${f.method_id}] ✅${f.positive} ❌${f.negative} (${f.approval_pct}% approval)` +
        (f.negative_comments?.length > 0 ? ` | Issues: ${f.negative_comments.slice(0, 3).join(' | ')}` : '')
      ).join('\n')
    : 'No feedback yet'

  return [
    '=== BAZAAR LIVE PRICES ===', bz,
    '\n=== EXISTING METHOD LIBRARY (methods discovered in previous runs) ===', library,
    '\n=== COMMUNITY FEEDBACK (player votes on each method) ===', feedback,
    '\n=== SLAYER WIKI ===', wiki(ctx?.wiki_slayers, 2500),
    '\n=== KUUDRA WIKI ===', wiki(ctx?.wiki_kuudra, 1500),
    '\n=== DUNGEON WIKI ===', wiki(ctx?.wiki_dungeons, 1200),
    '\n=== MINING WIKI ===', wiki(ctx?.wiki_mining, 2000),
    '\n=== FARMING WIKI ===', wiki(ctx?.wiki_farming, 1200),
    '\n=== FISHING WIKI ===', wiki(ctx?.wiki_fishing, 1500),
    '\n=== ECONOMY WIKI ===', wiki(ctx?.wiki_economy, 600),
  ].join('\n')
}

// ─── Prompt ──────────────────────────────────────────────────
function buildPrompt(tier: string, config: typeof TIER_CONFIG.early): string {
  const gearBudget = config.max_gear_cost >= 1_000_000_000
    ? (config.max_gear_cost / 1_000_000_000).toFixed(0) + 'B'
    : (config.max_gear_cost / 1_000_000).toFixed(0) + 'M'

  return `You are Vault, elite Hypixel Skyblock economic intelligence.

${GAME_TRUTHS}

=== TIER: ${config.label} | Networth: ${config.networth} | Target: ${config.target}M/h ===
Max gear cost: ${gearBudget} total | Capital: ${(config.capital/1_000_000).toFixed(0)}M
ACCESSIBLE: ${config.access}
FORBIDDEN: ${config.forbidden}

=== YOUR PROCESS (follow in order) ===

STEP 1 — REVIEW EXISTING LIBRARY
Read the "EXISTING METHOD LIBRARY" provided.
- Methods already there: revalidate coins/h with current bazaar prices
- Methods with community issues (negative feedback + comments): flag for revision or replacement
- Methods with high approval (>70%): keep and improve calculation accuracy

STEP 2 — COMPARE ALL ACCESSIBLE METHODS
Build internal comparison table across ALL skills at this tier.
For each candidate method:
  coins/h = (drops_per_action × bazaar_sell_price × actions_per_hour) - hourly_costs
  Gear cost check: must be ≤ ${gearBudget} total setup cost
Rank all methods by verified net coins/h.

STEP 3 — SELECT TOP 3 ACTIVE + TOP 3 VAULT EXCLUSIVE
Active: best verified methods from comparison, affordable gear only
Vault: cross-reference wiki mechanics + bazaar prices for non-obvious opportunities
- If a method appears in library with negative feedback, either fix it with correct data or replace it
- If a method is new (not in library), mark it as such

STEP 4 — STORE BACK TO LIBRARY
For each method you output, fill the "library_action" field:
- "update": method exists in library, updating coins/h with current prices
- "new": method not in library, adding for the first time
- "replaced": replaces a poorly-rated library method with a better alternative

=== OUTPUT — strict JSON only ===
{
  "tier": "${tier}",
  "comparison_summary": "Which skill won this week and why, with key numbers",
  "active": [
    {
      "id": "snake_case_unique_id",
      "method": "Method name",
      "skill": "combat|mining|farming|fishing|foraging",
      "coins_min": 8000000,
      "coins_max": 15000000,
      "coins_display": "8-15M/h",
      "calculation": "X actions/hr × Y drops × Z coins - W costs = NET",
      "key_drops": "Item: X/hr × Y coins = ZM/hr",
      "why_best": "Why ranked here vs other options at this tier",
      "confidence": "HIGH|MED|LOW",
      "library_action": "new|update|replaced"
    }
  ],
  "vault": [
    {
      "id": "snake_case_unique_id",
      "method": "Innovation name",
      "skills_combined": ["skill1"],
      "coins_min": 10000000,
      "coins_max": 20000000,
      "coins_display": "10-20M/h",
      "the_edge": "The specific mechanic. Why it works. What most players miss.",
      "calculation": "How coins/hr is derived from data",
      "data_source": "Which wiki + prices confirm this",
      "confidence": "HIGH|MED|LOW",
      "library_action": "new|update|replaced"
    }
  ]
}`
}

// ─── Sauvegarde dans la bibliothèque ─────────────────────────
async function saveToLibrary(methods: any[], tier: string, bazaarSnapshot: any[]) {
  const snapshot: Record<string, number> = {}
  bazaarSnapshot.slice(0, 20).forEach((i: any) => { snapshot[i.item_id] = i.sell_price })

  for (const m of methods) {
    const isVault = !!m.skills_combined
    const { error } = await supabase.from('money_making_methods').upsert({
      method_id:           m.id,
      method_name:         m.method,
      tier,
      skill:               m.skill || (m.skills_combined || [])[0] || 'unknown',
      type:                isVault ? 'vault' : 'active',
      skills_combined:     m.skills_combined || null,
      coins_min:           m.coins_min || 0,
      coins_max:           m.coins_max || 0,
      coins_display:       m.coins_display || '',
      calculation:         m.calculation || '',
      key_drops:           m.key_drops || '',
      why_best:            m.why_best || m.the_edge || '',
      the_edge:            m.the_edge || null,
      confidence:          m.confidence || 'MED',
      status:              'active',
      price_snapshot:      snapshot,
      last_validated_at:   new Date().toISOString(),
    }, {
      onConflict:       'method_id, tier',
      ignoreDuplicates: false,
    })
    if (error) console.error('Library save error:', m.id, error.message)

    // Incrémente validation_count
    try {
      await supabase.rpc('increment_validation_count', { p_method_id: m.id, p_tier: tier })
    } catch {} // ignore si la fonction n'existe pas encore
  }
}

// ─── Handler ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Charge contexte + bibliothèque + feedback
  const [{ data: ctx }, { data: existingMethods }, { data: feedbackData }] = await Promise.all([
    supabase.rpc('get_full_context'),
    supabase.from('money_making_methods').select('*').eq('status', 'active').order('last_validated_at', { ascending: false }),
    supabase.from('method_feedback_summary').select('*'),
  ])

  const context = formatContext(
    ctx,
    existingMethods || [],
    feedbackData    || []
  )

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

    const section  = 'money_making_' + r.tier
    const { data: old } = await supabase.from('claude_analysis').select('content').eq('section', section).single()
    if (old) await supabase.from('claude_memory').insert({ section, content: old.content, archived_at: new Date().toISOString() })
    await supabase.from('claude_analysis').upsert(
      { section, content: JSON.stringify(r.data), updated_at: new Date().toISOString() },
      { onConflict: 'section' }
    )

    // Sauvegarde dans la bibliothèque
    const allMethods = [...(r.data.active || []), ...(r.data.vault || [])]
    await saveToLibrary(allMethods, r.tier, ctx?.bazaar_live || [])
  }

  return NextResponse.json({
    success: true,
    results: results.map(r => ({ tier: r.tier, ok: !('error' in r) }))
  })
}