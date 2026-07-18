// app/api/cron/patch-analysis-agent/route.ts
// 2 appels séparés : Sonnet pour live, Haiku pour alpha
// Format JSON compact pour éviter la troncature
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

// ── Prompt LIVE — Sonnet, analyse économique profonde ────────
const LIVE_PROMPT = `You are Vault, Hypixel Skyblock economic intelligence.
Analyze these LIVE patch notes and output economic impact.

RULES:
- Focus only on changes that affect item prices or money-making methods
- Use exact Bazaar item IDs (ENCHANTED_FLINT format)
- Signals: BUY=price rising, SELL=price dropping, HOLD=unclear, INVEST=long term
- Be concise — short strings only, no long explanations

Return ONLY this compact JSON (no backticks):
{
  "patches": [
    {
      "title": "exact patch title",
      "date": "date if known",
      "impact": "1 sentence economic impact",
      "items": [{"id":"ITEM_ID","dir":"up|down","why":"short reason","mag":"LOW|MED|HIGH"}],
      "methods": [{"name":"method","impact":"buffed|nerfed","why":"short reason"}],
      "prediction": "1 sentence price prediction",
      "signal": "BUY|SELL|HOLD|INVEST",
      "confidence": "HIGH|MED|LOW"
    }
  ]
}`

// ── Prompt ALPHA — Haiku, prévisions conditionnelles ─────────
const ALPHA_PROMPT = `You are Vault, Hypixel Skyblock economic intelligence.
Analyze these ALPHA patch notes (not yet live — conditional predictions only).

RULES:
- These changes may or may not reach the live server
- Signals: WATCH=monitor, INVEST=position early if confident
- Short strings only

Return ONLY this compact JSON (no backticks):
{
  "patches": [
    {
      "title": "exact patch title",
      "date": "date if known",
      "impact": "1 sentence: what this WOULD change if live",
      "items": [{"id":"ITEM_ID","dir":"up|down","why":"short reason","mag":"LOW|MED|HIGH"}],
      "methods": [{"name":"method","impact":"buffed|nerfed","why":"short reason"}],
      "prediction": "Conditional: IF this hits live...",
      "signal": "WATCH|INVEST",
      "confidence": "LOW|MED"
    }
  ]
}`

// ── Handler ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Charge les données
    const [{ data: livePatches }, { data: alphaPatches }, { data: bazaarPrices }] = await Promise.all([
      supabase.from('patch_notes').select('title, content, published_at').eq('is_alpha', false).order('published_at', { ascending: false }).limit(5),
      supabase.from('patch_notes').select('title, content, published_at').eq('is_alpha', true).order('published_at', { ascending: false }).limit(3),
      supabase.from('bazaar_1h').select('item_id, sell_price, buy_price').limit(30),
    ])

    const bazaarCtx = (bazaarPrices || []).map((i: any) => `${i.item_id}:SELL=${Number(i.sell_price).toFixed(0)}`).join(' ')

    // Contexte live — top 3 patches uniquement
    const liveCtx = (livePatches || []).slice(0, 3).map((p: any) =>
      `[${p.title}]\n${(p.content || '').slice(0, 800)}`
    ).join('\n\n')

    // Contexte alpha — top 2 patches officiels
    const alphaCtx = (alphaPatches || []).slice(0, 2).map((p: any) =>
      `[${p.title}]\n${(p.content || '').slice(0, 600)}`
    ).join('\n\n')

    // Appel 1 — Sonnet pour live patches
    const liveRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 2000,
        system:     LIVE_PROMPT,
        messages:   [{ role: 'user', content: `Patches:\n${liveCtx}\n\nBazaar:\n${bazaarCtx}` }],
      }),
    })

    // Appel 2 — Haiku pour alpha patches
    const alphaRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system:     ALPHA_PROMPT,
        messages:   [{ role: 'user', content: `Alpha patches:\n${alphaCtx}\n\nBazaar:\n${bazaarCtx}` }],
      }),
    })

    // Parse résultats
    const [liveData, alphaData] = await Promise.all([liveRes.json(), alphaRes.json()])

    let liveAnalysis:  any[] = []
    let alphaAnalysis: any[] = []

    try { liveAnalysis  = parseJSON(liveData.content?.[0]?.text  || '{}').patches || [] } catch (e) { console.error('Live parse error:', e) }
    try { alphaAnalysis = parseJSON(alphaData.content?.[0]?.text || '{}').patches || [] } catch (e) { console.error('Alpha parse error:', e) }

    // Sauvegarde dans claude_analysis (format dashboard)
    const combined = { live_patches: liveAnalysis, alpha_patches: alphaAnalysis }
    await supabase.from('claude_analysis').upsert(
      { section: 'patch_analysis', content: JSON.stringify(combined), updated_at: new Date().toISOString() },
      { onConflict: 'section' }
    )

    // Sauvegarde dans insight_patch
    let savedLive = 0, savedAlpha = 0

    for (const p of liveAnalysis) {
      const { error } = await supabase.from('insight_patch').upsert({
        patch_title:      p.title,
        patch_date:       p.date || null,
        patch_type:       'live',
        is_alpha:         false,
        direct_impact:    p.impact,
        items_affected:   p.items || [],
        methods_affected: p.methods || [],
        price_prediction: p.prediction,
        action_signal:    p.signal,
        confidence:       p.confidence,
        status:           'active',
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'patch_title', ignoreDuplicates: false })
      if (!error) savedLive++
    }

    for (const p of alphaAnalysis) {
      const { error } = await supabase.from('insight_patch').upsert({
        patch_title:      p.title,
        patch_date:       p.date || null,
        patch_type:       'alpha',
        is_alpha:         true,
        direct_impact:    p.impact,
        items_affected:   p.items || [],
        methods_affected: p.methods || [],
        price_prediction: p.prediction,
        action_signal:    p.signal,
        confidence:       p.confidence,
        status:           'active',
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'patch_title', ignoreDuplicates: false })
      if (!error) savedAlpha++
    }

    return NextResponse.json({
      success:     true,
      live_saved:  savedLive,
      alpha_saved: savedAlpha,
      live_count:  liveAnalysis.length,
      alpha_count: alphaAnalysis.length,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}