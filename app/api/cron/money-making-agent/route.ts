// app/api/cron/money-making-agent/route.ts
// 4 appels Claude parallèles — 1 par tier (early/mid/end/late)
// Données gear requêtées directement pour les setups Farming + Vault Exclusive
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
    networth:       '0-10M',
    capital:        '<1M coins disponibles',
    target_bazaar:  '10M+/h',
    target_ah:      'profits <500K par flip',
    target_farming: '5-10M/h',
    target_vault:   '8-12M/h',
    focus:          'Slayer T1-T2, farming de base, minions débutants, flips Bazaar accessibles'
  },
  mid: {
    networth:       '10M-500M',
    capital:        '5M-100M coins disponibles',
    target_bazaar:  '25M+/h',
    target_ah:      'profits 500K-5M par flip',
    target_farming: '20-30M/h',
    target_vault:   '25-40M/h',
    focus:          'Slayer T3-T4, donjons F1-F5, craft intermédiaire, Kuudra T1-T2'
  },
  end: {
    networth:       '500M-5B',
    capital:        '100M-1B coins disponibles',
    target_bazaar:  '50M+/h',
    target_ah:      'profits 5M-50M par flip',
    target_farming: '40-60M/h',
    target_vault:   '50-80M/h',
    focus:          'Slayer T5, donjons F7/M1-M4, Kuudra T3-T5, flips AH haute valeur'
  },
  late: {
    networth:       '5B+',
    capital:        '1B+ coins disponibles',
    target_bazaar:  '100M+/h',
    target_ah:      'profits 50M+ par flip',
    target_farming: '80-120M/h',
    target_vault:   '100M+/h',
    focus:          'Master Mode, craft gear end-game, farming items rares, flips whale'
  }
}

// ============================================================
// SYSTEM PROMPT PAR TIER
// ============================================================
function buildSystemPrompt(tier: string, config: typeof TIER_CONFIG.early): string {
  return (
    'You are Vault, the ultimate Hypixel Skyblock economic agent for the ' + tier.toUpperCase() + ' tier (networth ' + config.networth + ', capital ' + config.capital + ').' +
    ' Cross-reference ALL provided data — bazaar prices, AH prices with historical averages, crafting costs, drop rates, game mechanics — to find the BEST money-making paths for THIS tier specifically.' +
    ' Every coins/hour figure must be computed from real provided data (price x drop rate or production rate). Never invent numbers.' +
    '\n\nOutput ONLY [MONEY_MAKING_' + tier.toUpperCase() + '] in this EXACT structure — no extra text:\n\n' +
    '[MONEY_MAKING_' + tier.toUpperCase() + ']\n' +
    '### BAZAAR FLIP\n' +
    '| Item | Buy Price | Sell Price | Spread % | Capital Needed | Coins/Hour | Confidence |\n' +
    '3 rows. Only flips with capital <= ' + config.capital + '. Target ' + config.target_bazaar + '. Use real spread from provided bazaar data.\n\n' +
    '### AH FLIP\n' +
    '| Item | Variant | Best Price | Historical Avg | Discount % | Capital Needed | Target Profit | Confidence |\n' +
    '3 rows. Only flips with budget matching ' + config.capital + '. Target ' + config.target_ah + '. Prioritize items with discount_pct > 10% vs historical average.\n\n' +
    '### FARMING METHODS\n' +
    '| Method | Coins/Hour | Setup Items + Stats | Accessories / Magical Power | Power Stone | Requirements | Confidence |\n' +
    '4 rows. Target ' + config.target_farming + '. Setup Items must reference REAL accessories, reforges, gemstones from provided gear data. Never invent gear names.\n\n' +
    '### VAULT EXCLUSIVE\n' +
    '| Method | Coins/Hour | Why This Works | Setup Items + Stats | Confidence |\n' +
    '3 rows. Target ' + config.target_vault + '. Original cross-correlations only — not repeating known guides. Explain the specific price/mechanic correlation. Setup must use real gear from provided data.\n\n' +
    'STRICT RULES:\n' +
    '- Every number comes from provided data only — no fabrication\n' +
    '- Capital constraints are hard limits — never suggest items above the capital budget\n' +
    '- If data is insufficient, write LOW confidence + explain the gap\n' +
    '- Never add sections or text outside this exact structure'
  )
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
    // 1. Contexte global via get_full_context()
    const { data: ctx } = await supabase.rpc('get_full_context')

    // 2. Données gear requêtées directement (non incluses dans get_full_context)
    const [
      { data: accessories },
      { data: accessoryPowers },
      { data: reforges },
      { data: reforgeStones },
      { data: gemstones },
      { data: ahLive },
      { data: priceHistoryAh }
    ] = await Promise.all([
      supabase.from('accessories').select('name, ability, magical_power, rarity').limit(150),
      supabase.from('accessory_powers').select('power_name, stats, description').limit(50),
      supabase.from('reforges').select('name, type, stats').limit(100),
      supabase.from('reforge_stones').select('name, reforge_name, item_type').limit(100),
      supabase.from('gemstones').select('name, type, stats, slot_type').limit(100),
      supabase.from('ah_live').select('base_item_id, item_name, best_price, avg_price, historical_avg, discount_pct, spread_pct, category, variant_key').order('discount_pct', { ascending: false }).limit(100),
      supabase.from('price_history_ah').select('base_item_id, variant_key, avg_price, granularity').eq('granularity', 'DAILY').order('bucket_date', { ascending: false }).limit(200)
    ])

    // 3. Formate les données contextuelles
    const bz = (ctx?.bazaar_live || [])
      .map((i: any) => i.item_id + ' buy=' + i.buy_price + ' sell=' + i.sell_price + ' spread=' + i.spread_pct + '%')
      .join('\n')

    const ahFormatted = (ahLive || [])
      .map((i: any) => i.base_item_id + ' [' + i.variant_key + '] best=' + i.best_price + ' hist_avg=' + (i.historical_avg || 'N/A') + ' discount=' + (i.discount_pct || 0) + '%')
      .join('\n')

    const slayers = (ctx?.slayers || [])
      .map((s: any) => s.slayer_type + ' T' + s.tier + ': cost=' + s.coin_cost + ' drops=' + JSON.stringify(s.drops))
      .join('\n')

    const dungeons = (ctx?.dungeons || [])
      .map((d: any) => d.floor + ' ' + d.mode + ': loot=' + JSON.stringify(d.chest_loot))
      .join('\n')

    const kuudra = (ctx?.kuudra || [])
      .map((k: any) => 'T' + k.tier + ': avg_coins=' + k.avg_coins_per_run)
      .join('\n')

    const moneyMethods = (ctx?.money_methods || [])
      .map((m: any) => m.method_name + ' (' + m.category + '): ' + m.coins_per_hour_min + '-' + m.coins_per_hour_max + '/h')
      .join('\n')

    const accessoriesFormatted = (accessories || [])
      .map((a: any) => a.name + ' [' + a.rarity + '] MP=' + a.magical_power + (a.ability ? ' ability=' + a.ability : ''))
      .join('\n')

    const reforgesFormatted = (reforges || [])
      .map((r: any) => r.name + ' (' + r.type + '): ' + JSON.stringify(r.stats))
      .join('\n')

    const gemstonesFormatted = (gemstones || [])
      .map((g: any) => g.name + ' [' + g.type + '] slot=' + g.slot_type + ' stats=' + JSON.stringify(g.stats))
      .join('\n')

    const powersFormatted = (accessoryPowers || [])
      .map((p: any) => p.power_name + ': ' + p.description)
      .join('\n')

    const sharedContext = (
      'BAZAAR LIVE (top spreads):\n' + bz +
      '\n\nAH LIVE (top discounts vs historical):\n' + ahFormatted +
      '\n\nSLAYERS:\n' + slayers +
      '\n\nDUNGEONS:\n' + dungeons +
      '\n\nKUUDRA:\n' + kuudra +
      '\n\nKNOWN MONEY METHODS:\n' + moneyMethods +
      '\n\nACCESSORIES (real data):\n' + accessoriesFormatted +
      '\n\nREFORGES:\n' + reforgesFormatted +
      '\n\nGEMSTONES:\n' + gemstonesFormatted +
      '\n\nACCESSORY POWERS:\n' + powersFormatted
    )

    // 4. 4 appels Claude en parallèle — 1 par tier
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
          max_tokens: 2000,
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

    // 5. Sauvegarde dans claude_analysis avec archivage
    for (const result of results) {
      if ('error' in result) continue

      const section = 'money_making_' + result.tier

      // Archive l'ancienne version
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

      // Upsert la nouvelle
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