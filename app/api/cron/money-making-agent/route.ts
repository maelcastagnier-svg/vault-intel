// app/api/cron/money-making-agent/route.ts
// 4 prompts par tier → JSON structuré {active: [...], vault: [...]}
// Le setup est généré on-demand via /api/setup/generate
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================
// TIER CONFIG
// ============================================================
const TIER_CONFIG = {
  early: {
    label: 'EARLY', networth: '0-50M', target_coins: 10,
    access: [
      'Combat: Zombie Slayer T1-T2, Spider Slayer T1-T2, Wolf Slayer T1-T2',
      'Mining: Dwarven Mines basic, no Crystal Hollows, HotM 1-3',
      'Farming: Basic crops, no Garden',
      'Fishing: Basic fishing, no Trophy Fishing, no Thunder',
      'Foraging: Basic foraging',
    ].join(' | '),
    forbidden: 'Kuudra, Dungeons F4+, Enderman/Blaze/Vampire Slayer, Crystal Hollows, Garden/Pests, Thunder Fishing'
  },
  mid: {
    label: 'MID', networth: '50M-500M', target_coins: 25,
    access: [
      'Combat: Zombie T3-T4, Spider T3-T4 (MAX), Wolf T3-T4 (MAX), Enderman T1-T2, Dungeon F4-F6, Kuudra T1-T2',
      'Mining: Crystal Hollows basic, HotM 4-6, Glacite Tunnels basic',
      'Farming: Garden unlocked, Pests basic',
      'Fishing: Trophy Fishing basic, Lava fishing basic',
      'Foraging: Advanced foraging',
    ].join(' | '),
    forbidden: 'M1-M7, Kuudra T3+, Enderman T3+, Blaze/Vampire Slayer, Thunder Fishing'
  },
  end: {
    label: 'END', networth: '500M-5B', target_coins: 50,
    access: [
      'Combat: Zombie T5, Enderman T3-T4 (MAX T4 — T5 DOES NOT EXIST), Blaze T4-T5, Vampire T4-T5, Dungeon M1-M4, Kuudra T3-T5',
      'Mining: Crystal Hollows advanced, HotM 7-9, Glacite advanced',
      'Farming: Garden advanced, Pest farming optimized',
      'Fishing: Thunder Fishing, Trophy Fishing advanced',
    ].join(' | '),
    forbidden: 'M5-M7, Enderman Slayer T5 (DOES NOT EXIST — BOSS MAX IS T4)'
  },
  late: {
    label: 'LATE', networth: '5B+', target_coins: 70,
    access: [
      'Combat: All slayers at MAX tier, M5-M7, all Kuudra, RNG items',
      'Mining: HotM 10, Divan Drill, max gemstone fortune',
      'Farming: Max fortune, pests optimized, Jacob farming',
      'Fishing: Max SCC, Thunder optimized',
    ].join(' | '),
    forbidden: 'Nothing — but Enderman Slayer boss MAX is still T4'
  }
}

// ============================================================
// PROMPT TIER — génère les méthodes en JSON
// ============================================================
function buildTierPrompt(tier: string, config: typeof TIER_CONFIG.early): string {
  return `You are Vault, the elite Hypixel Skyblock economic intelligence system.

MISSION: Compare ALL available active money-making methods for the ${config.label} tier player and select the TOP 3 active grind methods + TOP 3 vault exclusive innovations.

=== PLAYER PROFILE ===
Tier: ${config.label} | Networth: ${config.networth} | Target: ${config.target_coins}M coins/hour minimum
ACCESSIBLE: ${config.access}
FORBIDDEN: ${config.forbidden}

=== SLAYER MAX TIER TABLE (ABSOLUTE — never exceed) ===
- Zombie (Revenant Horror): MAX T5
- Spider (Tarantula): MAX T4 — T5 does not exist
- Wolf (Sven): MAX T4 — T5 does not exist
- Enderman (Voidgloom Seraph): MAX T4 — T5 DOES NOT EXIST. "Enderman Slayer level 9" is the XP level, BOSS TIER MAX IS 4.
- Blaze (Inferno Demonlord): MAX T5
- Vampire (Riftstalker): MAX T5 (Rift only)

=== METHODOLOGY ===
ACTIVE GRIND: Compare across ALL skill categories (Combat/Mining/Farming/Fishing/Foraging).
For each candidate method, calculate: drops_per_hour × bazaar_sell_price OR ah_value = real coins/hour.
Pick the 3 methods with highest verifiable coins/hour for this tier.

VAULT EXCLUSIVE: Cross-reference wiki mechanics + live prices to find methods that:
- Combine two or more systems simultaneously (e.g. farming during event)
- Exploit a price inefficiency visible in the live data
- Use a mechanic most players overlook
Must be computable from provided data — no speculation.

=== OUTPUT FORMAT (strict JSON, no markdown, no extra text) ===
{
  "tier": "${tier}",
  "active": [
    {
      "id": "unique_snake_case_id",
      "method": "Method display name",
      "skill": "combat|mining|farming|fishing|foraging",
      "coins_min": 10000000,
      "coins_max": 15000000,
      "coins_display": "10-15M/h",
      "key_drops": "Item1 Xcoins (vol/day), Item2 Ycoins — ~Z drops/hr = Coins total",
      "why_best": "One sentence: why this beats other options at this tier",
      "confidence": "HIGH|MED|LOW"
    }
  ],
  "vault": [
    {
      "id": "unique_snake_case_id",
      "method": "Innovation name",
      "skills_combined": ["skill1", "skill2"],
      "coins_min": 10000000,
      "coins_max": 15000000,
      "coins_display": "10-15M/h",
      "the_edge": "The specific non-obvious mechanic/combination that makes this work",
      "data_source": "What wiki pages + live prices confirm this",
      "confidence": "HIGH|MED|LOW"
    }
  ]
}`
}

// ============================================================
// FORMAT CONTEXTE
// ============================================================
function formatContext(ctx: any): string {
  const bz = (ctx?.bazaar_live || [])
    .map((i: any) =>
      `${i.item_id} SELL=${Number(i.sell_price).toFixed(1)} BUY=${Number(i.buy_price).toFixed(1)} spread=${Number(i.spread_pct).toFixed(1)}% vol=${i.volume ? Number(i.volume).toLocaleString() : 'N/A'}`
    ).join('\n')

  const ah = (ctx?.ah_live || []).length > 0
    ? (ctx.ah_live || []).map((i: any) =>
        `${i.base_item_id} [${i.variant_key}] best=${Number(i.best_price).toLocaleString()} hist=${i.historical_avg ? Number(i.historical_avg).toLocaleString() : 'N/A'} discount=${i.discount_pct || 0}%`
      ).join('\n')
    : 'No significant AH discounts currently'

  const wikiSection = (items: any[], maxChars = 2500) =>
    (items || []).map((w: any) => `[${w.key}]\n${(w.content || '').slice(0, maxChars)}`).join('\n\n')

  return [
    '=== BAZAAR LIVE (SELL=what you receive, BUY=what you pay) ===',
    bz,
    '\n=== AH LIVE ===',
    ah,
    '\n=== WIKI — SLAYERS (max tier, drops, required armor) ===',
    wikiSection(ctx?.wiki_slayers, 3000),
    '\n=== WIKI — DUNGEONS ===',
    wikiSection(ctx?.wiki_dungeons, 2000),
    '\n=== WIKI — KUUDRA ===',
    wikiSection(ctx?.wiki_kuudra, 2000),
    '\n=== WIKI — MINING (Crystal Hollows, Glacite, HotM, drills) ===',
    wikiSection(ctx?.wiki_mining, 2500),
    '\n=== WIKI — FARMING (Garden, Pests, fortune, crops) ===',
    wikiSection(ctx?.wiki_farming, 2000),
    '\n=== WIKI — FISHING (Trophy, Thunder, SCC, rods) ===',
    wikiSection(ctx?.wiki_fishing, 2000),
    '\n=== WIKI — GUIDES ===',
    wikiSection(ctx?.wiki_guides, 1500),
    '\n=== WIKI — ECONOMY ===',
    wikiSection(ctx?.wiki_economy, 1000),
  ].join('\n')
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: ctx, error: ctxError } = await supabase.rpc('get_full_context')
    if (ctxError) throw new Error('get_full_context: ' + ctxError.message)

    const sharedContext = formatContext(ctx)

    const tierPromises = Object.entries(TIER_CONFIG).map(async ([tier, config]) => {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'x-api-key':         process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json'
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 3000,
          system: [{
            type:          'text',
            text:          buildTierPrompt(tier, config),
            cache_control: { type: 'ephemeral' }
          }],
          messages: [{ role: 'user', content: sharedContext }]
        })
      })

      if (!claudeRes.ok) return { tier, error: claudeRes.status.toString() }
      const data    = await claudeRes.json()
      const content = data.content?.[0]?.text || ''

      // Parse JSON — Claude output should be pure JSON
      try {
        const parsed = JSON.parse(content.replace(/```json\n?|```\n?/g, '').trim())
        return { tier, data: parsed }
      } catch {
        return { tier, error: 'JSON parse failed', raw: content }
      }
    })

    const results = await Promise.all(tierPromises)

    for (const result of results) {
      if ('error' in result) { console.error('Error tier ' + result.tier + ':', result.error); continue }

      const section = 'money_making_' + result.tier
      const content = JSON.stringify(result.data)

      const { data: old } = await supabase.from('claude_analysis').select('content').eq('section', section).single()
      if (old) {
        await supabase.from('claude_memory').insert({ section, content: old.content, archived_at: new Date().toISOString() })
      }
      await supabase.from('claude_analysis').upsert(
        { section, content, updated_at: new Date().toISOString() },
        { onConflict: 'section' }
      )
    }

    return NextResponse.json({
      success: true,
      results: results.map(r => ({ tier: r.tier, ok: !('error' in r) }))
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}