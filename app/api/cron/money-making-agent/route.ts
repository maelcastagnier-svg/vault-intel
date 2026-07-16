// app/api/cron/money-making-agent/route.ts
// 4 appels Claude parallèles — 1 par tier (early/mid/end/late)
// Utilise get_full_context() qui inclut maintenant :
// - Wiki Fandom (armor sets, weapons, slayers, dungeons, farming, fishing, mining, kuudra)
// - item_stats (686+ items avec vraies stats)
// - enchantments (144 enchants)
// - accessories, reforges, gemstones, pets, collections, skill_unlocks
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
    forbidden:      'M1-M7, Kuudra T3+, Slayer T5, Crystal Hollows advanced'
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
    forbidden:      'M6-M7 unless catacombs 35+'
  },
  late: {
    label:          'LATE',
    networth:       '5B+',
    coins_target:   70_000_000,
    capital_max:    2_000_000_000,
    access:         'Everything — M6-M7, all Kuudra, all Slayers, Bazaar Advanced Flipping',
    forbidden:      'Nothing'
  }
}

// ============================================================
// SYSTEM PROMPT
// ============================================================
function buildSystemPrompt(tier: string, config: typeof TIER_CONFIG.early): string {
  const target  = (config.coins_target / 1_000_000) + 'M'
  const capital = config.capital_max >= 1_000_000_000
    ? (config.capital_max / 1_000_000_000) + 'B'
    : (config.capital_max / 1_000_000) + 'M'

  return (
    'You are Vault, the elite Hypixel Skyblock economic intelligence system.\n\n' +
    'TIER: ' + config.label + ' | Networth: ' + config.networth + ' | Target: ' + target + ' coins/hour minimum | Max capital: ' + capital + '\n' +
    'ACCESSIBLE CONTENT: ' + config.access + '\n' +
    'FORBIDDEN (player cannot access yet): ' + config.forbidden + '\n\n' +
    'YOUR JOB: Generate the 3 best methods in each of 4 categories that meet the ' + target + '/h target.\n\n' +
    'You have access to extensive game data including:\n' +
    '- Real-time Bazaar and AH prices with historical averages\n' +
    '- Complete Fandom Wiki content for armor sets, weapons, slayers, dungeons, farming, fishing, mining, kuudra\n' +
    '- Real item stats (HP, DEF, STR, CD, INT) for 1991+ items\n' +
    '- All 144 enchantments with item types and max levels\n' +
    '- All accessories, reforges, gemstones, pets, collections\n' +
    '- Verified money-making methods with real coins/hour ranges\n\n' +
    'PRICE CONVENTIONS (critical — never confuse):\n' +
    '- sell_price = instant-sell (what you GET — LOWER price)\n' +
    '- buy_price = instant-buy (what you PAY — HIGHER price)\n' +
    '- Bazaar flip profit = buy_price - sell_price - 1.25% tax\n' +
    '- AH tax = 1% on sale\n\n' +
    'SETUP RULES:\n' +
    '- Use ONLY item names from provided item_stats, wiki_armor_sets, wiki_weapons data\n' +
    '- Use ONLY enchant names from provided enchantments data with correct item_types\n' +
    '- Use ONLY accessory names from provided accessories data\n' +
    '- Cross-reference wiki content with real prices for accurate coins/hour\n\n' +
    'METHODOLOGY:\n' +
    '1. BAZAAR FLIP: Use provided bazaar_live prices. profit = buy_price - sell_price - 1.25% tax. Show math.\n' +
    '2. AH FLIP: Only items with discount_pct > 15% AND historical_avg known. profit = historical_avg × 0.99 - best_price.\n' +
    '3. ACTIVE GRIND: Use wiki content + loot_tables + slayer_data + dungeon_data. coins/hour = drops/hour × sell_price.\n' +
    '4. VAULT EXCLUSIVE: Cross-reference wiki mechanics with current prices to find non-obvious opportunities.\n\n' +
    'CRITICAL RULES:\n' +
    '- NEVER suggest forbidden content for this tier\n' +
    '- NEVER invent drop rates — use provided loot_tables, slayer_data, wiki content\n' +
    '- Mark confidence: HIGH (data confirms), MED (estimate from data), LOW (insufficient data)\n' +
    '- If coins/hour target unreachable, explain what IS achievable\n\n' +
    'Output ONLY this exact structure — no extra text:\n\n' +
    '[MONEY_MAKING_' + tier.toUpperCase() + ']\n\n' +
    '### BAZAAR FLIP\n' +
    '| Item | Sell Price | Buy Price | Spread % | Volume/Day | Capital | Coins/Hour | Math |\n' +
    '3 rows. sell_price < buy_price always.\n\n' +
    '### AH FLIP\n' +
    '| Item | Variant | Best Price | Hist. Avg | Discount % | Capital | Profit/Flip | Confidence |\n' +
    '3 rows. Skip with explanation if no items with discount_pct > 15%.\n\n' +
    '### ACTIVE GRIND\n' +
    '| Method | Category | Coins/Hour | Key Drops + Sell Prices | Full Setup | Requirements | Confidence |\n' +
    '3 rows. Full Setup = real armor (stats from wiki/item_stats) + enchants (from enchantments table) + accessories. Use ONLY real names.\n\n' +
    '### VAULT EXCLUSIVE\n' +
    '| Method | Category | Coins/Hour | The Edge | Full Setup | Confidence |\n' +
    '3 rows. Original non-obvious methods. Full Setup uses only real gear from provided data.'
  )
}

// ============================================================
// FORMAT CONTEXTE DEPUIS get_full_context()
// ============================================================
function formatContext(ctx: any): string {
  // Bazaar
  const bz = (ctx?.bazaar_live || [])
    .map((i: any) =>
      i.item_id +
      ' SELL=' + Number(i.sell_price).toFixed(1) +
      ' BUY=' + Number(i.buy_price).toFixed(1) +
      ' spread=' + Number(i.spread_pct).toFixed(1) + '%' +
      ' vol=' + (i.volume ? Number(i.volume).toLocaleString() : 'N/A')
    ).join('\n')

  // AH
  const ah = (ctx?.ah_live || []).length > 0
    ? (ctx.ah_live || []).map((i: any) =>
        i.base_item_id + ' [' + i.variant_key + ']' +
        ' best=' + Number(i.best_price).toLocaleString() +
        ' hist=' + (i.historical_avg ? Number(i.historical_avg).toLocaleString() : 'N/A') +
        ' discount=' + (i.discount_pct || 0) + '%'
      ).join('\n')
    : 'No AH items with >10% discount currently'

  // Méthodes vérifiées
  const methods = (ctx?.money_methods || [])
    .map((m: any) =>
      m.method_name + ' [' + m.category + ']' +
      ': ' + (m.coins_per_hour_min / 1e6).toFixed(0) + 'M-' +
      (m.coins_per_hour_max / 1e6).toFixed(0) + 'M/h' +
      ' req=' + JSON.stringify(m.requirements)
    ).join('\n')

  // Slayers
  const slayers = (ctx?.slayers || [])
    .map((s: any) =>
      s.slayer_type + ' T' + s.tier +
      ': cost=' + s.coin_cost +
      ' time=' + s.avg_kill_time_seconds + 's' +
      ' drops=' + JSON.stringify(s.drops)
    ).join('\n')

  // Donjons
  const dungeons = (ctx?.dungeons || [])
    .map((d: any) =>
      d.floor + ' ' + d.mode +
      ': time=' + d.avg_run_time_seconds + 's' +
      ' loot=' + JSON.stringify(d.chest_loot)
    ).join('\n')

  // Kuudra
  const kuudra = (ctx?.kuudra || [])
    .map((k: any) =>
      'T' + k.tier + ': coins=' + k.avg_coins_per_run +
      ' req=' + JSON.stringify(k.requirements)
    ).join('\n')

  // Loot tables
  const loot = (ctx?.loot_tables || [])
    .map((l: any) =>
      l.source_name + ' [' + l.source_type + ']' +
      ' → ' + l.item_id + ' ' + l.drop_chance + '%'
    ).join('\n')

  // Item stats armures
  const armor = (ctx?.item_stats_armor || [])
    .map((a: any) =>
      a.display_name + ' [' + a.category + ']' +
      ' HP=' + a.health + ' DEF=' + a.defense +
      ' STR=' + a.strength + ' CD=' + a.crit_damage + '%' +
      ' INT=' + a.intelligence
    ).join('\n')

  // Armes
  const weapons = (ctx?.item_stats_weapons || [])
    .map((w: any) =>
      w.display_name + ' [' + w.category + ']' +
      ' STR=' + w.strength + ' CD=' + w.crit_damage + '%' +
      ' INT=' + w.intelligence
    ).join('\n')

  // Enchantements
  const enchants = (ctx?.enchantments || [])
    .map((e: any) =>
      e.name + ' [' + (e.item_types || []).join(',') + '] max=' + e.max_level
    ).join('\n')

  // Accessories
  const accessories = (ctx?.accessories || [])
    .map((a: any) =>
      a.name + ' [' + a.rarity + '] MP=' + a.magical_power +
      (a.ability ? ' | ' + a.ability : '')
    ).join('\n')

  // Reforges
  const reforges = (ctx?.reforges || [])
    .map((r: any) => r.name + ' (' + r.type + '): ' + JSON.stringify(r.stats))
    .join('\n')

  // Pets
  const pets = (ctx?.pets || [])
    .map((p: any) => p.display_name + ' [' + p.rarity + '] type=' + p.type)
    .join('\n')

  // Wiki content — formatté compact
  const wikiGuides = (ctx?.wiki_guides || [])
    .map((w: any) => '=== ' + w.key.toUpperCase() + ' ===\n' + (w.content || '').slice(0, 800))
    .join('\n\n')

  const wikiArmor = (ctx?.wiki_armor_sets || [])
    .map((w: any) => '[ARMOR:' + w.key + '] ' + (w.content || '').slice(0, 400))
    .join('\n')

  const wikiWeapons = (ctx?.wiki_weapons || [])
    .map((w: any) => '[WEAPON:' + w.key + '] ' + (w.content || '').slice(0, 300))
    .join('\n')

  const wikiSlayers = (ctx?.wiki_slayers || [])
    .map((w: any) => '[SLAYER:' + w.key + '] ' + (w.content || '').slice(0, 600))
    .join('\n')

  const wikiDungeons = (ctx?.wiki_dungeons || [])
    .map((w: any) => '[DUNGEON:' + w.key + '] ' + (w.content || '').slice(0, 600))
    .join('\n')

  const wikiFarming = (ctx?.wiki_farming || [])
    .map((w: any) => '[FARMING:' + w.key + '] ' + (w.content || '').slice(0, 500))
    .join('\n')

  const wikiFishing = (ctx?.wiki_fishing || [])
    .map((w: any) => '[FISHING:' + w.key + '] ' + (w.content || '').slice(0, 500))
    .join('\n')

  const wikiMining = (ctx?.wiki_mining || [])
    .map((w: any) => '[MINING:' + w.key + '] ' + (w.content || '').slice(0, 500))
    .join('\n')

  const wikiKuudra = (ctx?.wiki_kuudra || [])
    .map((w: any) => '[KUUDRA:' + w.key + '] ' + (w.content || '').slice(0, 600))
    .join('\n')

  const wikiEconomy = (ctx?.wiki_economy || [])
    .map((w: any) => '[ECONOMY:' + w.key + '] ' + (w.content || '').slice(0, 500))
    .join('\n')

  return [
    '=== BAZAAR LIVE (SELL=insta-sell you receive, BUY=insta-buy you pay) ===',
    bz,
    '\n=== AH LIVE (items underpriced vs historical avg) ===',
    ah,
    '\n=== VERIFIED MONEY METHODS ===',
    methods,
    '\n=== SLAYER DATA ===',
    slayers,
    '\n=== DUNGEON DATA ===',
    dungeons,
    '\n=== KUUDRA DATA ===',
    kuudra,
    '\n=== LOOT TABLES ===',
    loot,
    '\n=== ARMOR STATS (real data — use these names in setups) ===',
    armor,
    '\n=== WEAPON STATS (real data — use these names in setups) ===',
    weapons,
    '\n=== ENCHANTMENTS (name [item_types] max_level) ===',
    enchants,
    '\n=== ACCESSORIES (use ONLY these names in setups) ===',
    accessories,
    '\n=== REFORGES ===',
    reforges,
    '\n=== PETS ===',
    pets,
    '\n=== WIKI — GUIDES ===',
    wikiGuides,
    '\n=== WIKI — ARMOR SETS ===',
    wikiArmor,
    '\n=== WIKI — WEAPONS ===',
    wikiWeapons,
    '\n=== WIKI — SLAYERS ===',
    wikiSlayers,
    '\n=== WIKI — DUNGEONS ===',
    wikiDungeons,
    '\n=== WIKI — FARMING ===',
    wikiFarming,
    '\n=== WIKI — FISHING ===',
    wikiFishing,
    '\n=== WIKI — MINING ===',
    wikiMining,
    '\n=== WIKI — KUUDRA ===',
    wikiKuudra,
    '\n=== WIKI — ECONOMY ===',
    wikiEconomy,
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
    // Récupère tout le contexte depuis get_full_context()
    const { data: ctx, error: ctxError } = await supabase.rpc('get_full_context')
    if (ctxError) throw new Error('get_full_context failed: ' + ctxError.message)

    const sharedContext = formatContext(ctx)

    // 4 appels Claude en parallèle
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

    // Sauvegarde dans claude_analysis
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
      context_size: sharedContext.length,
      results: results.map(r => ({ tier: r.tier, success: !('error' in r) }))
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}