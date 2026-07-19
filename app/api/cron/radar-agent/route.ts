// app/api/cron/radar-agent/route.ts
// Daily 7h — croise patches + tendances prix + events Mayor
// → TOP 10 opportunités positives + négatives
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseJSON(text: string): any {
  return JSON.parse(text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim())
}

const SYSTEM_PROMPT = `You are Vault Radar, Hypixel Skyblock market intelligence.

Your job: cross-reference patch impacts + price trends + Mayor events to find the TOP investment opportunities RIGHT NOW.

RULES:
- Use only data provided — no assumptions
- Positive = price rising or likely to rise (BUY/INVEST signal)
- Negative = price falling or likely to fall (SELL/AVOID signal)
- Be specific: name the exact item_id and the exact reason
- Timeframe: short=1-7 days, mid=1-4 weeks, long=1-3 months
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
      "timeframe": "short|mid|long",
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
      "timeframe": "short|mid|long",
      "price_target": "-X% in Y days",
      "confidence": "HIGH|MED|LOW"
    }
  ],
  "summary": "1-2 sentences: overall market sentiment right now"
}`

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Charge tout le contexte en parallèle
    const [
      { data: patches },
      { data: insights },
      { data: bazaarTop },
      { data: mayors },
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
      supabase.rpc('get_price_summary').limit ? 
        supabase.from('bazaar_1h').select('item_id, sell_price, buy_price, volume').order('volume', { ascending: false }).limit(50) :
        supabase.from('bazaar_1h').select('item_id, sell_price, buy_price, volume').order('volume', { ascending: false }).limit(50),

      // Mayors (si disponible)
      supabase.from('mayors').select('*').limit(5).catch(() => ({ data: [] })),
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

    // Sauvegarde dans claude_analysis
    await supabase.from('claude_analysis').upsert({
      section:    'radar',
      content:    JSON.stringify(parsed),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'section' })

    return NextResponse.json({
      success:   true,
      positive:  (parsed.positive || []).length,
      negative:  (parsed.negative || []).length,
      summary:   parsed.summary,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}