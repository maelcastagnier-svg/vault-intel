// app/api/cron/money-making-agent/route.ts
// 4 appels Claude parallèles — 1 par tier (early/mid/end/late)
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
    label:          'EARLY',
    networth:       '0-10M',
    coins_target:   10_000_000,
    capital_max:    500_000,
    access:         'Slayer T1-T2, Dungeon F1-F3, no Kuudra, basic minions, no Garden',
    forbidden:      'M1-M7, Kuudra T3+, Slayer T5, Crystal Hollows mining advanced'
  },
  mid: {
    label:          'MID',
    networth:       '10M-500M',
    coins_target:   25_000_000,
    capital_max:    50_000_000,
    access:         'Slayer T3-T4, Dungeon F4-F6, Kuudra T1-T2, Crystal Hollows, Garden basic',
    forbidden:      'M4-M7, Kuudra T5, Slayer T5 Vampire/Inferno'
  },
  end: {
    label:          'END',
    networth:       '500M-5B',
    coins_target:   50_000_000,
    capital_max:    500_000_000,
    access:         'Slayer T5 all, Dungeon M1-M4, Kuudra T3-T5, Pest Farming Advanced, Thunder Fishing',
    forbidden:      'M6-M7 (unless catacombs 35+)'
  },
  late: {
    label:          'LATE',
    networth:       '5B+',
    coins_target:   70_000_000,
    capital_max:    2_000_000_000,
    access:         'Everything — M6-M7, all Kuudra, all Slayers, Bazaar Advanced Flipping, all content',
    forbidden:      'Nothing'
  }
}

// ============================================================
// SYSTEM PROMPT
// ============================================================
function buildSystemPrompt(tier: string, config: typeof TIER_CONFIG.early): string {
  const target = (config.coins_target / 1_000_000) + 'M'
  const capital = config.capital_max >= 1_000_000_000
    ? (config.capital_max / 1_000_000_000) + 'B'
    : (config.capital_max / 1_000_000) + 'M'

  return `You are Vault, the elite Hypixel Skyblock economic intelligence system.

TIER: ${config.label} | Networth: ${config.networth} | Target: ${target} coins/hour minimum | Max capital: ${capital}
ACCESSIBLE CONTENT: ${config.access}
FORBIDDEN (player cannot access yet): ${config.forbidden}

YOUR JOB: Generate the 3 best methods in each of 4 categories that meet the ${target}/h target for THIS tier.

PRICE CONVENTIONS (critical):
- buy_price = instant-buy price (what you PAY to buy now)  
- sell_price = instant-sell price (what you GET when selling now)
- Bazaar flip profit per unit = sell_price - buy_price — never reverse this
- Bazaar tax = 1.25% on sell side
- AH tax = 1% on sale

METHODOLOGY:
1. BAZAAR FLIP: profit/cycle = (sell_price - buy_price) × units - tax. Cycles/hour = 60min / cycle_time. Use provided volume to assess liquidity.
2. AH FLIP: only suggest items where discount_pct > 15% AND historical_avg exists. profit = historical_avg × 0.99 - best_price.
3. ACTIVE GRIND (combat/mining/fishing/slayer/dungeon — NOT farming skill): Use provided verified methods as base. Cross with current bazaar sell prices to compute real coins/hour. Show the math.
4. VAULT EXCLUSIVE: Original methods Claude discovers by cross-referencing game mechanics with current market data. Must be computable.

CRITICAL RULES:
- NEVER suggest methods forbidden for this tier
- NEVER invent drop rates — use only provided loot_tables and slayer_data
- NEVER invent item names for setups — use only provided accessories/reforges
- If coins/hour cannot reach ${target}/h, say so honestly and explain what IS achievable
- Bazaar flip: sell_price is ALWAYS lower than buy_price in Hypixel (sell order < buy order)
- Mark confidence: HIGH (data confirms target), MED (estimate based on data), LOW (insufficient data)

Output ONLY this structure, no extra text outside it:

[MONEY_MAKING_${tier.toUpperCase()}]

### BAZAAR FLIP
| Item | Sell Price | Buy Price | Spread % | Volume/Day | Capital | Coins/Hour | Math |
3 rows. sell_price < buy_price always. Show: (buy_price - sell_price - tax) × units/cycle × cycles/hour.

### AH FLIP
| Item | Variant | Best Price | Hist. Avg | Discount % | Capital | Profit/Flip | Confidence |
3 rows. Skip if no items with discount_pct > 15% — write "Insufficient AH history data for ${config.label} tier" instead.

### ACTIVE GRIND
| Method | Category | Coins/Hour | Key Drops + Prices | Full Setup (real gear only) | Requirements | Confidence |
3 rows. Category = combat/mining/fishing/slayer/dungeon. Coins/hour from: drops/hour × bazaar_sell_price. Full Setup uses ONLY gear from provided accessories and reforges data.

### VAULT EXCLUSIVE
| Method | Category | Coins/Hour | The Edge | Setup | Confidence |
3 rows. Cross-reference game mechanics with current prices to find non-obvious opportunities others miss. Must be computable from provided data.`
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
    // 1. Contexte global
    const { data: ctx } = await supabase.rpc('get_full_context')

    // 2. Données additionnelles
    const [
      { data: accessories },
      { data: reforges },
      { data: gemstones },
      { data: ahLive },
      { data: lootTables },
      { data: minions },
      { data: gameContextArmor }
    ] = await Promise.all([
      supabase.from('accessories')
        .select('name, ability, magical_power, rarity')
        .order('magical_power', { ascending: false })
        .limit(100),
      supabase.from('reforges')
        .select('name, type, stats')
        .limit(80),
      supabase.from('gemstones')
        .select('name, type, stats, slot_type')
        .limit(60),
      supabase.from('ah_live')
        .select('base_item_id, item_name, best_price, historical_avg, discount_pct, category, variant_key')
        .gt('discount_pct', 10)
        .not('historical_avg', 'is', null)
        .gt('historical_avg', 0)
        .order('discount_pct', { ascending: false })
        .limit(60),
      supabase.from('loot_tables')
        .select('source_type, source_name, item_id, drop_chance, quantity_min, quantity_max')
        .order('drop_chance', { ascending: false })
        .limit(60),
      supabase.from('minions')
        .select('name, resource, coins_per_hour, upgrade_cost')
        .limit(25),
      supabase.from('game_context')
        .select('title, content')
        .or('title.ilike.%armor%,title.ilike.%helmet%,title.ilike.%sword%,title.ilike.%bow%,title.ilike.%wand%,title.ilike.%staff%')
        .limit(40)
    ])

    // 3. Formate le contexte
    // Bazaar — sell_price < buy_price (convention Hypixel)
    const bz = (ctx?.bazaar_live || [])
      .map((i: any) => {
        const sellP  = Number(i.sell_price).toFixed(1)
        const buyP   = Number(i.buy_price).toFixed(1)
        const spread = Number(i.spread_pct).toFixed(1)
        const vol    = i.volume ? Number(i.volume).toLocaleString() : 'N/A'
        return `${i.item_id} | SELL=${sellP} BUY=${buyP} spread=${spread}% vol/day=${vol}`
      }).join('\n')

    const ahFormatted = (ahLive || []).length > 0
      ? (ahLive || []).map((i: any) =>
          `${i.base_item_id} [${i.variant_key}] | best=${Number(i.best_price).toLocaleString()} hist_avg=${Number(i.historical_avg).toLocaleString()} discount=${i.discount_pct}% cat=${i.category}`
        ).join('\n')
      : 'No AH items with >10% discount and known historical average currently'

    const slayers = (ctx?.slayers || [])
      .map((s: any) =>
        `${s.slayer_type} T${s.tier}: coin_cost=${s.coin_cost} kill_time=${s.avg_kill_time_seconds}s drops=${JSON.stringify(s.drops)}`
      ).join('\n')

    const dungeons = (ctx?.dungeons || [])
      .map((d: any) =>
        `${d.floor} ${d.mode}: run_time=${d.avg_run_time_seconds}s loot=${JSON.stringify(d.chest_loot)}`
      ).join('\n')

    const kuudra = (ctx?.kuudra || [])
      .map((k: any) =>
        `T${k.tier}: avg_coins=${k.avg_coins_per_run} req=${JSON.stringify(k.requirements)}`
      ).join('\n')

    const verifiedMethods = (ctx?.money_methods || [])
      .map((m: any) =>
        `${m.method_name} [${m.category}]: ${(m.coins_per_hour_min/1e6).toFixed(0)}M-${(m.coins_per_hour_max/1e6).toFixed(0)}M/h | req=${JSON.stringify(m.requirements)}`
      ).join('\n')

    const lootFormatted = (lootTables || [])
      .map((l: any) =>
        `${l.source_name} [${l.source_type}] → ${l.item_id} | chance=${l.drop_chance}% qty=${l.quantity_min}-${l.quantity_max}`
      ).join('\n')

    const accessoriesFormatted = (accessories || [])
      .map((a: any) =>
        `${a.name} [${a.rarity}] MP=${a.magical_power}${a.ability ? ' | ' + a.ability : ''}`
      ).join('\n')

    const reforgesFormatted = (reforges || [])
      .map((r: any) => `${r.name} (${r.type}): ${JSON.stringify(r.stats)}`)
      .join('\n')

    const minionsFormatted = (minions || [])
      .map((m: any) => `${m.name}: ${m.resource} ~${m.coins_per_hour}/h`)
      .join('\n')

    const armorFormatted = (gameContextArmor || [])
      .map((g: any) => `${g.title}: ${(g.content || '').slice(0, 120)}`)
      .join('\n')

    const sharedContext =
      '=== BAZAAR (SELL=insta-sell you receive, BUY=insta-buy you pay, spread=profit margin) ===\n' + bz +
      '\n\n=== AH LIVE (items underpriced vs historical — discount_pct = % below avg) ===\n' + ahFormatted +
      '\n\n=== VERIFIED MONEY METHODS (use as primary reference for ACTIVE GRIND) ===\n' + verifiedMethods +
      '\n\n=== SLAYER DATA ===\n' + slayers +
      '\n\n=== DUNGEON DATA ===\n' + dungeons +
      '\n\n=== KUUDRA DATA ===\n' + kuudra +
      '\n\n=== LOOT TABLES (drop rates) ===\n' + lootFormatted +
      '\n\n=== MINIONS ===\n' + minionsFormatted +
      '\n\n=== ARMOR & WEAPONS (from game data) ===\n' + armorFormatted +
      '\n\n=== ACCESSORIES (for setups — use ONLY these names) ===\n' + accessoriesFormatted +
      '\n\n=== REFORGES (for setups — use ONLY these names) ===\n' + reforgesFormatted

    // 4. 4 appels Claude en parallèle
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
            text:          buildSystemPrompt(tier, config),
            cache_control: { type: 'ephemeral' }
          }],
          messages: [{ role: 'user', content: sharedContext }]
        })
      })

      if (!claudeRes.ok) return { tier, error: claudeRes.status.toString() }
      const data = await claudeRes.json()
      return { tier, content: data.content?.[0]?.text || '' }
    })

    const results = await Promise.all(tierPromises)

    // 5. Sauvegarde
    for (const result of results) {
      if ('error' in result) continue

      const section = 'money_making_' + result.tier

      const { data: old } = await supabase
        .from('claude_analysis')
        .select('*')
        .eq('section', section)
        .single()

      if (old) {
        await supabase.from('claude_memory').insert({
          section,
          content:     old.content,
          archived_at: new Date().toISOString()
        })
      }

      await supabase
        .from('claude_analysis')
        .upsert(
          { section, content: result.content, updated_at: new Date().toISOString() },
          { onConflict: 'section' }
        )
    }

    return NextResponse.json({
      status:  'done',
      results: results.map(r => ({ tier: r.tier, success: !('error' in r) }))
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}