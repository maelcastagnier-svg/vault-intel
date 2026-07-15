// app/api/cron/money-making-agent/route.ts
// 4 appels Claude parallèles — 1 par tier (early/mid/end/late)
// Claude croise mécaniques de jeu + données économiques pour générer des money-making réels
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
    coins_per_hour: '10M',
    capital_max:    '500K',
    description:    'Joueur débutant, peu de capital, accès limité aux contenus end-game'
  },
  mid: {
    label:          'MID',
    networth:       '10M-500M',
    coins_per_hour: '25M',
    capital_max:    '50M',
    description:    'Joueur intermédiaire, accès donjons F1-F5, slayers T3-T4, Kuudra T1-T2'
  },
  end: {
    label:          'END',
    networth:       '500M-5B',
    coins_per_hour: '50M',
    capital_max:    '500M',
    description:    'Joueur avancé, accès donjons F7/M1-M4, slayers T5, Kuudra T3-T5'
  },
  late: {
    label:          'LATE',
    networth:       '5B+',
    coins_per_hour: '70M+',
    capital_max:    '2B',
    description:    'Joueur whale, accès Master Mode, tout le contenu débloqué'
  }
}

// ============================================================
// SYSTEM PROMPT
// ============================================================
function buildSystemPrompt(tier: string, config: typeof TIER_CONFIG.early): string {
  return `You are Vault, the ultimate Hypixel Skyblock economic intelligence agent.

Your task: Generate a complete money-making guide for the ${config.label} tier (networth ${config.networth}).
STRICT TARGET: Every method MUST generate at least ${config.coins_per_hour} coins/hour.
CAPITAL LIMIT: Maximum ${config.capital_max} available capital.
PLAYER PROFILE: ${config.description}

HYPIXEL PRICE CONVENTIONS (critical — never confuse these):
- buy_price = instant-buy price (you pay this to buy immediately)
- sell_price = instant-sell price (you receive this when selling immediately)
- Bazaar flip profit = sell_price - buy_price - 1.25% tax
- volume = daily trading volume (higher = more liquid, easier to flip)

YOUR ANALYSIS METHOD:
1. For Bazaar flips: Use provided buy_price, sell_price, volume. Compute real profit per flip and coins/hour based on flip cycle time (typically 10-30min per cycle with order management).
2. For AH flips: Use provided best_price, historical_avg, discount_pct. Real profit = historical_avg - best_price - AH tax (1%). Only suggest flips where discount_pct > 15% AND historical_avg is available.
3. For Farming: Cross-reference drop rates from loot_tables/slayer_data/dungeon_data with current sell prices from bazaar_live to compute REAL coins/hour. Formula: drops_per_hour × item_sell_price = coins/hour.
4. For Vault Exclusive: Innovate by finding non-obvious correlations between game mechanics and current market prices that other players miss. These must be real, computable methods.

CRITICAL RULES:
- Every coins/hour figure must be mathematically derivable from provided data
- If you cannot compute a real number, state the formula and mark as ESTIMATE
- Never suggest a method that requires more capital than the tier limit
- Never suggest content the tier player cannot access
- Farming setups must list ONLY real gear from provided accessories/reforges/gemstones data

Output ONLY the following structure, no extra text:

[MONEY_MAKING_${tier.toUpperCase()}]

### BAZAAR FLIP
| Item | Buy Price | Sell Price | Spread % | Volume/Day | Capital | Coins/Hour | How |
3 rows. Each flip must reach ${config.coins_per_hour}/h target. Show the math briefly in "How" column.

### AH FLIP
| Item | Variant | Best Price | Hist. Avg | Discount % | Capital | Est. Profit | Confidence |
3 rows. Only items with discount_pct > 15% from provided data. If no AH data available, state why clearly.

### FARMING
| Method | Coins/Hour | How It Works | Full Setup | Requirements |
3 rows. "How It Works" = drop_rate × price formula. "Full Setup" = specific gear from provided data.

### VAULT EXCLUSIVE
| Method | Coins/Hour | The Insight | Full Setup | Why Others Miss It |
3 rows. These are original methods discovered by cross-referencing provided mechanics + market data. Must be computable, not generic advice.`
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

    // 2. Données gear + AH
    const [
      { data: accessories },
      { data: reforges },
      { data: gemstones },
      { data: accessoryPowers },
      { data: ahLive },
      { data: lootTables },
      { data: minions }
    ] = await Promise.all([
      supabase.from('accessories').select('name, ability, magical_power, rarity').limit(150),
      supabase.from('reforges').select('name, type, stats').limit(100),
      supabase.from('gemstones').select('name, type, stats, slot_type').limit(80),
      supabase.from('accessory_powers').select('power_name, description').limit(30),
      supabase.from('ah_live')
        .select('base_item_id, item_name, best_price, historical_avg, discount_pct, spread_pct, category, variant_key')
        .gt('discount_pct', 10)
        .order('discount_pct', { ascending: false })
        .limit(80),
      supabase.from('loot_tables')
        .select('source_type, source_name, item_id, drop_chance, quantity_min, quantity_max')
        .order('drop_chance', { ascending: false })
        .limit(80),
      supabase.from('minions').select('name, resource, coins_per_hour, upgrade_cost').limit(30)
    ])

    // 3. Formate contexte
    const bz = (ctx?.bazaar_live || [])
      .map((i: any) =>
        i.item_id +
        ' | buy=' + Number(i.buy_price).toFixed(1) +
        ' sell=' + Number(i.sell_price).toFixed(1) +
        ' spread=' + i.spread_pct + '%' +
        ' vol=' + (i.volume ? Number(i.volume).toLocaleString() : 'N/A')
      ).join('\n')

    const ahFormatted = (ahLive || [])
      .map((i: any) =>
        i.base_item_id +
        ' [' + i.variant_key + ']' +
        ' best=' + Number(i.best_price).toLocaleString() +
        ' hist_avg=' + (i.historical_avg ? Number(i.historical_avg).toLocaleString() : 'NO_HISTORY') +
        ' discount=' + (i.discount_pct || 0) + '%'
      ).join('\n')

    const slayers = (ctx?.slayers || [])
      .map((s: any) =>
        s.slayer_type + ' T' + s.tier +
        ': cost=' + s.coin_cost +
        ' drops=' + JSON.stringify(s.drops) +
        ' kill_time=' + s.avg_kill_time_seconds + 's'
      ).join('\n')

    const dungeons = (ctx?.dungeons || [])
      .map((d: any) =>
        d.floor + ' ' + d.mode +
        ' boss=' + d.boss_name +
        ' loot=' + JSON.stringify(d.chest_loot) +
        ' time=' + d.avg_run_time_seconds + 's'
      ).join('\n')

    const kuudra = (ctx?.kuudra || [])
      .map((k: any) =>
        'T' + k.tier +
        ': coins=' + k.avg_coins_per_run +
        ' requirements=' + JSON.stringify(k.requirements)
      ).join('\n')

    const moneyMethods = (ctx?.money_methods || [])
      .map((m: any) =>
        m.method_name + ' (' + m.category + ')' +
        ': ' + m.coins_per_hour_min + '-' + m.coins_per_hour_max + '/h' +
        ' req=' + m.requirements
      ).join('\n')

    const lootFormatted = (lootTables || [])
      .map((l: any) =>
        l.source_name + ' [' + l.source_type + ']' +
        ' drops ' + l.item_id +
        ' chance=' + l.drop_chance + '%' +
        ' qty=' + l.quantity_min + '-' + l.quantity_max
      ).join('\n')

    const accessoriesFormatted = (accessories || [])
      .map((a: any) =>
        a.name + ' [' + a.rarity + ']' +
        ' MP=' + a.magical_power +
        (a.ability ? ' | ' + a.ability : '')
      ).join('\n')

    const reforgesFormatted = (reforges || [])
      .map((r: any) => r.name + ' (' + r.type + '): ' + JSON.stringify(r.stats))
      .join('\n')

    const gemstonesFormatted = (gemstones || [])
      .map((g: any) => g.name + ' [' + g.type + '] slot=' + g.slot_type)
      .join('\n')

    const minionsFormatted = (minions || [])
      .map((m: any) => m.name + ': ' + m.resource + ' ~' + m.coins_per_hour + '/h')
      .join('\n')

    const sharedContext =
      '=== BAZAAR LIVE (buy_price=insta-buy, sell_price=insta-sell) ===\n' + bz +
      '\n\n=== AH LIVE (items with discount vs historical avg) ===\n' +
      (ahFormatted || 'No AH items with >10% discount currently') +
      '\n\n=== SLAYER DATA (cost + drops + kill time) ===\n' + slayers +
      '\n\n=== DUNGEON DATA (loot + run time) ===\n' + dungeons +
      '\n\n=== KUUDRA DATA ===\n' + kuudra +
      '\n\n=== KNOWN MONEY METHODS (verified) ===\n' + moneyMethods +
      '\n\n=== LOOT TABLES (drop rates) ===\n' + lootFormatted +
      '\n\n=== MINIONS ===\n' + minionsFormatted +
      '\n\n=== ACCESSORIES (for setups) ===\n' + accessoriesFormatted +
      '\n\n=== REFORGES ===\n' + reforgesFormatted +
      '\n\n=== GEMSTONES ===\n' + gemstonesFormatted

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
          max_tokens: 2500,
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

    // 5. Sauvegarde dans claude_analysis
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
          {
            section,
            content:    result.content,
            updated_at: new Date().toISOString()
          },
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