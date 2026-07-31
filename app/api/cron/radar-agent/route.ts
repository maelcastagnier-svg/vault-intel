// app/api/cron/radar-agent/route.ts
// Daily 7h — croise patches + tendances prix + events Mayor
// → TOP 10 opportunités positives + négatives
// + long_term_movers (Bloc 5, 31 juillet) — analyse de courbe pluriannuelle
// 100% déterministe (SQL/JS pur, zéro coût Claude), voir computeLongTermMovers.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseJSON(text: string): any {
  return JSON.parse(text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim())
}

// Timeframes renommés short/mid/extended (Bloc 5, 31 juillet) -- "long" (1-3
// mois) collidait avec le vrai sens pluriannuel qu'on introduit ici avec
// long_term_movers, deux échelles de temps complètement différentes sous le
// même mot. "extended" reste 1-3 mois, comportement inchangé pour ce champ.
const SYSTEM_PROMPT = `You are Vault Radar, Hypixel Skyblock market intelligence.

Your job: cross-reference patch impacts + price trends + Mayor events to find the TOP investment opportunities RIGHT NOW.

RULES:
- Use only data provided — no assumptions
- Positive = price rising or likely to rise (BUY/INVEST signal)
- Negative = price falling or likely to fall (SELL/AVOID signal)
- Be specific: name the exact item_id and the exact reason
- Timeframe: short=1-7 days, mid=1-4 weeks, extended=1-3 months (never "long" -- that word is reserved elsewhere for multi-year trends, a different timescale)
- Confidence: HIGH only if multiple signals align

Return ONLY compact JSON:
{
  "positive": [
    {
      "item_id": "ITEM_ID",
      "item_name": "Display Name",
      "signal": "BUY|INVEST",
      "reason": "Why price is rising — be specific",
      "drivers": ["patch_buff", "supply_shock", "event_demand", "trend"],
      "timeframe": "short|mid|extended",
      "price_target": "+X% in Y days",
      "confidence": "HIGH|MED|LOW"
    }
  ],
  "negative": [
    {
      "item_id": "ITEM_ID",
      "item_name": "Display Name",
      "signal": "SELL|AVOID",
      "reason": "Why price is falling",
      "drivers": ["patch_nerf", "supply_increase", "demand_drop"],
      "timeframe": "short|mid|extended",
      "price_target": "-X% in Y days",
      "confidence": "HIGH|MED|LOW"
    }
  ],
  "summary": "1-2 sentences: overall market sentiment right now"
}`

export type LongTermMover = {
  item_id: string
  avg_recent_year: number
  avg_prior_year: number
  change_yoy_pct: number
  years_of_data: number
}

// ── Analyse de courbe pluriannuelle (Bloc 5.3, 31 juillet) ────────────────
// Volontairement PAS le calculateur de stats du Bloc 8 -- juste une vraie
// comparaison année N vs N-1 sur des items dont on sait, par une vraie
// requête d'agrégation (get_longstanding_ah_items), qu'ils ont assez de
// profondeur réelle pour que la comparaison ait un sens (>= 3 ans, pas un
// item tracké depuis 2 semaines). 100% SQL/JS, zéro appel Claude.
export async function computeLongTermMovers(): Promise<{ gainers: LongTermMover[]; decliners: LongTermMover[]; pool_size: number }> {
  const MIN_ROWS_FOR_YOY = 1000 // ~3 ans de données réelles à granularité DAILY
  const POOL_SIZE        = 80

  const { data: pool, error: poolErr } = await supabase.rpc('get_longstanding_ah_items', {
    min_rows: MIN_ROWS_FOR_YOY,
    limit_n:  POOL_SIZE,
  })
  if (poolErr || !pool || pool.length === 0) return { gainers: [], decliners: [], pool_size: 0 }

  const itemIds = pool.map((r: any) => r.base_item_id)
  const twoYearsAgo = new Date(Date.now() - 730 * 86_400_000).toISOString().split('T')[0]
  const oneYearAgo  = new Date(Date.now() - 365 * 86_400_000).toISOString().split('T')[0]

  const rows: { base_item_id: string; bucket_date: string; avg_price: number }[] = []
  for (let i = 0; i < itemIds.length; i += 40) {
    const batch = itemIds.slice(i, i + 40)
    const { data, error } = await supabase
      .from('price_history_ah')
      .select('base_item_id, bucket_date, avg_price')
      .in('base_item_id', batch)
      .eq('granularity', 'DAILY')
      .gte('bucket_date', twoYearsAgo)
      .gt('avg_price', 0)
    if (error) { console.error('long-term movers fetch batch error', i, error.message); continue }
    if (data) rows.push(...data)
  }

  const byItem = new Map<string, { recent: number[]; prior: number[] }>()
  for (const r of rows) {
    if (!byItem.has(r.base_item_id)) byItem.set(r.base_item_id, { recent: [], prior: [] })
    const bucket = byItem.get(r.base_item_id)!
    if (r.bucket_date >= oneYearAgo) bucket.recent.push(Number(r.avg_price))
    else                             bucket.prior.push(Number(r.avg_price))
  }

  const avg = (arr: number[]) => arr.reduce((s, p) => s + p, 0) / arr.length
  const movers: LongTermMover[] = []
  for (const item of pool) {
    const bucket = byItem.get(item.base_item_id)
    if (!bucket || bucket.recent.length < 30 || bucket.prior.length < 30) continue // pas assez de points des deux côtés pour une moyenne fiable
    const avgRecent = avg(bucket.recent)
    const avgPrior  = avg(bucket.prior)
    if (avgPrior <= 0) continue
    const changePct = Math.round(((avgRecent - avgPrior) / avgPrior) * 1000) / 10
    const years = Math.round((new Date(item.max_date).getTime() - new Date(item.min_date).getTime()) / (365.25 * 86_400_000) * 10) / 10
    movers.push({ item_id: item.base_item_id, avg_recent_year: Math.round(avgRecent), avg_prior_year: Math.round(avgPrior), change_yoy_pct: changePct, years_of_data: years })
  }

  const sorted = [...movers].sort((a, b) => b.change_yoy_pct - a.change_yoy_pct)
  return {
    gainers:   sorted.filter(m => m.change_yoy_pct > 0).slice(0, 8),
    decliners: sorted.filter(m => m.change_yoy_pct < 0).slice(-8).reverse(),
    pool_size: pool.length,
  }
}

// ── Logique plain, réutilisable par une route de debug (même pattern que
//    runAhCollect()/runAhAggregate()) ───────────────────────────
export async function runRadarAgent() {
  // Charge tout le contexte en parallèle
  const [
    { data: patches },
    { data: insights },
    { data: bazaarTop },
    { data: mayors },
    longTermMovers,
  ] = await Promise.all([
    // Patches récents (live + alpha)
    supabase.from('patch_notes')
      .select('title, content, is_alpha, published_at')
      .order('published_at', { ascending: false })
      .limit(5),

    // Insights patch actifs avec items affectés
    supabase.from('insight_patch')
      .select('patch_title, patch_type, items_affected, methods_affected, action_signal, confidence, direct_impact')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10),

    // Top items Bazaar avec tendances 30j
    supabase.from('bazaar_1h').select('item_id, sell_price, buy_price, volume').order('volume', { ascending: false }).limit(50),

    // Mayors (si disponible)
    supabase.from('mayors').select('*').limit(5),

    // Bloc 5.3 -- pure SQL/JS, calculé en parallèle du reste, zéro coût Claude
    computeLongTermMovers(),
  ])

  // Tendances prix 30j pour les top items Bazaar
  const topItemIds = (bazaarTop || []).slice(0, 20).map((i: any) => i.item_id)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0]
  const sixtyDaysAgo  = new Date(Date.now() - 60 * 86_400_000).toISOString().split('T')[0]

  const { data: trends30 } = await supabase
    .from('price_history')
    .select('item_id, sell_price, bucket_date')
    .in('item_id', topItemIds)
    .gte('bucket_date', sixtyDaysAgo)
    .gt('sell_price', 0)
    .order('bucket_date', { ascending: true })

  // Calcule tendance par item (avg 30j récent vs 30j précédent)
  const trendMap: Record<string, { recent: number[]; older: number[] }> = {}
  for (const row of trends30 || []) {
    if (!trendMap[row.item_id]) trendMap[row.item_id] = { recent: [], older: [] }
    if (row.bucket_date >= thirtyDaysAgo) {
      trendMap[row.item_id].recent.push(Number(row.sell_price))
    } else {
      trendMap[row.item_id].older.push(Number(row.sell_price))
    }
  }

  const priceTrends = Object.entries(trendMap).map(([item_id, { recent, older }]) => {
    const avgRecent = recent.length > 0 ? recent.reduce((s, p) => s + p, 0) / recent.length : 0
    const avgOlder  = older.length  > 0 ? older.reduce((s, p) => s + p, 0)  / older.length  : 0
    const changePct = avgOlder > 0 ? Math.round(((avgRecent - avgOlder) / avgOlder) * 100) : 0
    return { item_id, avg_recent: Math.round(avgRecent), avg_older: Math.round(avgOlder), change_30d_pct: changePct }
  }).filter(t => t.avg_recent > 0).sort((a, b) => Math.abs(b.change_30d_pct) - Math.abs(a.change_30d_pct))

  // Construit le contexte pour Claude
  const context = JSON.stringify({
    active_patches: (patches || []).map(p => ({
      title:    p.title,
      is_alpha: p.is_alpha,
      date:     p.published_at,
      summary:  (p.content || '').slice(0, 500)
    })),
    patch_insights: (insights || []).map(i => ({
      patch:          i.patch_title,
      type:           i.patch_type,
      impact:         i.direct_impact,
      items_affected: i.items_affected,
      signal:         i.action_signal,
      confidence:     i.confidence,
    })),
    price_trends_30d: priceTrends.slice(0, 20),
    bazaar_live: (bazaarTop || []).slice(0, 30).map((i: any) => ({
      item_id:    i.item_id,
      sell_price: Number(i.sell_price),
      volume:     Number(i.volume),
    })),
    mayors: mayors || [],
  })

  // Appel Claude Sonnet
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 2000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Market data:\n${context}` }],
    }),
  })

  const data   = await res.json()
  const parsed = parseJSON(data.content?.[0]?.text || '{}')

  // long_term_movers ajouté au même blob JSON -- purement calculé (voir
  // computeLongTermMovers), jamais généré/reformulé par Claude.
  const combined = { ...parsed, long_term_movers: longTermMovers }

  // Sauvegarde dans claude_analysis
  await supabase.from('claude_analysis').upsert({
    section:    'radar',
    content:    JSON.stringify(combined),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'section' })

  return {
    success:           true,
    positive:          (parsed.positive || []).length,
    negative:          (parsed.negative || []).length,
    summary:           parsed.summary,
    long_term_gainers:   longTermMovers.gainers.length,
    long_term_decliners: longTermMovers.decliners.length,
    long_term_pool_size: longTermMovers.pool_size,
  }
}

// ── Handler ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('radar-agent')
  try {
    const result = await runRadarAgent()
    await finishSync(logId, 'success', result.positive + result.negative, result)
    return NextResponse.json(result)

  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
