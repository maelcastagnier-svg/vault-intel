// app/api/cron/patch-analysis-agent/route.ts
// 2 appels séparés : Sonnet pour live, Haiku pour alpha
// Format JSON compact pour éviter la troncature
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { startSync, finishSync } from '../../../../lib/sync-log'

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
Analyze these LIVE patch notes and output economic AND gameplay impact.

RULES:
- Cover economic impact (item prices, money-making methods) AND gameplay/mechanical
  impact (drop rates, XP curves, mob behavior, dungeon/slayer mechanics, movement,
  progression pacing) as two separate dimensions — a change can have one, the other,
  or both. Don't force a gameplay angle onto a purely cosmetic/economic patch.
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
      "predicted": [{"id":"ITEM_ID","pct":15,"days":7,"why":"short reason"}],
      "signal": "BUY|SELL|HOLD|INVEST",
      "confidence": "HIGH|MED|LOW",
      "mechanics": "1 sentence gameplay/mechanical impact, empty string if this patch has none",
      "gameplay": [{"system":"short system name e.g. Slayer/Dungeons/Mining/Combat/Movement","change":"what changed mechanically","sig":"MAJOR|MINOR"}]
    }
  ]
}
"predicted" is up to 2 items with a concrete numeric % price change you expect
within "days" days — only include an item there if you have a specific enough
reason to put a number on it (omit "predicted" entirely rather than guess).
"gameplay" is up to 4 mechanical changes — omit entirely (or leave empty) for
patches with no real gameplay-mechanics angle rather than invent one.`

// ── Prompt ALPHA — Haiku, prévisions conditionnelles ─────────
const ALPHA_PROMPT = `You are Vault, Hypixel Skyblock economic intelligence.
Analyze these ALPHA patch notes (not yet live — conditional predictions only).

RULES:
- These changes may or may not reach the live server
- Cover economic impact AND gameplay/mechanical impact (drop rates, XP curves, mob
  behavior, dungeon/slayer mechanics, movement, progression pacing) as two separate
  dimensions, both conditional on the patch actually shipping
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
      "predicted": [{"id":"ITEM_ID","pct":15,"days":7,"why":"short reason, conditional on going live"}],
      "signal": "WATCH|INVEST",
      "confidence": "LOW|MED",
      "mechanics": "1 sentence conditional gameplay/mechanical impact IF this ships, empty string if none",
      "gameplay": [{"system":"short system name e.g. Slayer/Dungeons/Mining/Combat/Movement","change":"what would change mechanically","sig":"MAJOR|MINOR"}]
    }
  ]
}
"predicted" is up to 2 items with a concrete numeric % price change you'd expect
within "days" days IF this ships — only include an item there if you have a
specific enough reason to put a number on it (omit "predicted" entirely rather
than guess).
"gameplay" is up to 4 mechanical changes — omit entirely (or leave empty) for
patches with no real gameplay-mechanics angle rather than invent one.`

// ── Logique plain, réutilisable par une route de debug (même pattern que
//    runAhCollect()/runAhAggregate()) ───────────────────────────
export async function runPatchAnalysisAgent() {
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
        // Bumped from 2000 — the added "predicted" field grows each patch's
        // JSON; the file's own original comment flagged truncation as an
        // already-known risk with 3 patches sharing one budget.
        max_tokens: 3000,
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
        max_tokens: 2200,
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
        items_affected:   (p.items || []).map((i: any) => ({ item_id: i.id, direction: i.dir, reason: i.why, magnitude: i.mag })),
        methods_affected: (p.methods || []).map((m: any) => ({ method: m.name, impact: m.impact, reason: m.why })),
        price_prediction: p.prediction,
        predicted_items:  (p.predicted || []).map((x: any) => ({ item_id: x.id, predicted_change_pct: x.pct, timeframe_days: x.days, reasoning: x.why })),
        action_signal:    p.signal,
        confidence:       p.confidence,
        mechanics_impact: p.mechanics || null,
        gameplay_changes: (p.gameplay || []).map((g: any) => ({ system: g.system, change: g.change, significance: g.sig })),
        status:           'active',
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'patch_title', ignoreDuplicates: false })
      if (!error) savedLive++
      else console.error('insight_patch upsert error (live):', error.message)
    }

    for (const p of alphaAnalysis) {
      const { error } = await supabase.from('insight_patch').upsert({
        patch_title:      p.title,
        patch_date:       p.date || null,
        patch_type:       'alpha',
        is_alpha:         true,
        direct_impact:    p.impact,
        items_affected:   (p.items || []).map((i: any) => ({ item_id: i.id, direction: i.dir, reason: i.why, magnitude: i.mag })),
        methods_affected: (p.methods || []).map((m: any) => ({ method: m.name, impact: m.impact, reason: m.why })),
        price_prediction: p.prediction,
        predicted_items:  (p.predicted || []).map((x: any) => ({ item_id: x.id, predicted_change_pct: x.pct, timeframe_days: x.days, reasoning: x.why })),
        action_signal:    p.signal,
        confidence:       p.confidence,
        mechanics_impact: p.mechanics || null,
        gameplay_changes: (p.gameplay || []).map((g: any) => ({ system: g.system, change: g.change, significance: g.sig })),
        status:           'active',
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'patch_title', ignoreDuplicates: false })
      if (!error) savedAlpha++
      else console.error('insight_patch upsert error (alpha):', error.message)
    }

    return {
      success:     true,
      live_saved:  savedLive,
      alpha_saved: savedAlpha,
      live_count:  liveAnalysis.length,
      alpha_count: alphaAnalysis.length,
    }
}

// ── Handler ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('patch-analysis-agent')
  try {
    const result = await runPatchAnalysisAgent()
    await finishSync(logId, 'success', result.live_saved + result.alpha_saved, result)
    return NextResponse.json(result)
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}