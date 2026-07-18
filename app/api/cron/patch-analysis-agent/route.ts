// app/api/cron/patch-analysis-agent/route.ts
// Tourne tous les jours à 6h UTC
// 2 appels Sonnet parallèles :
//   1. Analyse Live + Alpha patches avec prédictions
//   2. Validation des prédictions passées vs prix réels
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

// ── Prompt analyse patches ────────────────────────────────────
function buildAnalysisPrompt(): string {
  return `You are Vault, elite Hypixel Skyblock economic intelligence system.

Your job: analyze Hypixel Skyblock patch notes and predict economic impacts with precision.

=== ANALYSIS RULES ===
1. For LIVE patches: analyze confirmed changes, identify items directly affected
2. For ALPHA patches: these are changes being TESTED — may or may not reach live servers
3. Always link patches to Bazaar items (use item_id format like ENCHANTED_FLINT)
4. Predict price direction with reasoning from supply/demand mechanics
5. Flag methods that are buffed or nerfed
6. Assign confidence based on how directly the patch affects economy

=== ACTION SIGNALS ===
BUY    → price will rise, buy now before patch hits live
SELL   → price will drop, sell before patch hits live  
HOLD   → monitor, unclear impact
WATCH  → alpha only, wait for live confirmation
INVEST → long term position, patch creates sustained demand

=== OUTPUT FORMAT — strict JSON only ===
{
  "live_patches": [
    {
      "patch_title": "Exact patch name/version",
      "patch_date": "Month Day, Year if known",
      "direct_impact": "1-2 sentences: what changed economically",
      "items_affected": [
        {"item_id": "ITEM_ID", "direction": "up|down|neutral", "reason": "why", "magnitude": "LOW|MED|HIGH"}
      ],
      "methods_affected": [
        {"method": "method name", "impact": "buffed|nerfed|unchanged", "reason": "why"}
      ],
      "price_prediction": "Specific price movement prediction with timeframe",
      "predicted_items": [
        {"item_id": "ITEM_ID", "predicted_change_pct": 25, "timeframe_days": 7, "reasoning": "why"}
      ],
      "action_signal": "BUY|SELL|HOLD|WATCH|INVEST",
      "confidence": "HIGH|MED|LOW"
    }
  ],
  "alpha_patches": [
    {
      "patch_title": "Alpha patch name",
      "patch_date": "Month Day, Year if known",
      "direct_impact": "What this WOULD change if it hits live",
      "items_affected": [
        {"item_id": "ITEM_ID", "direction": "up|down|neutral", "reason": "why IF hits live", "magnitude": "LOW|MED|HIGH"}
      ],
      "methods_affected": [
        {"method": "method name", "impact": "buffed|nerfed|unchanged", "reason": "why"}
      ],
      "price_prediction": "Conditional prediction: IF this hits live, expect...",
      "predicted_items": [
        {"item_id": "ITEM_ID", "predicted_change_pct": 15, "timeframe_days": 14, "reasoning": "conditional on alpha reaching live"}
      ],
      "action_signal": "WATCH|INVEST",
      "confidence": "LOW|MED"
    }
  ]
}`
}

// ── Prompt validation des prédictions ─────────────────────────
function buildValidationPrompt(predictions: any[], bazaarPrices: any[]): string {
  const priceMap = Object.fromEntries(
    (bazaarPrices || []).map((i: any) => [i.item_id, { sell: i.sell_price, buy: i.buy_price }])
  )

  const toValidate = predictions.map(p => ({
    id:            p.id,
    patch_title:   p.patch_title,
    predicted_items: p.predicted_items || [],
    price_prediction: p.price_prediction,
    action_signal: p.action_signal,
    confidence:    p.confidence,
    created_at:    p.created_at,
    current_prices: (p.predicted_items || []).map((pi: any) => ({
      item_id:       pi.item_id,
      predicted_pct: pi.predicted_change_pct,
      current_sell:  priceMap[pi.item_id]?.sell ?? null,
      current_buy:   priceMap[pi.item_id]?.buy  ?? null,
    }))
  }))

  return `You are Vault validation engine. Evaluate prediction accuracy using current market prices.

PREDICTIONS TO VALIDATE:
${JSON.stringify(toValidate, null, 2)}

For each prediction:
1. Compare predicted direction with actual price movement
2. Score accuracy 0-100 (100=perfect, 0=wrong direction)
3. Note what was right/wrong

Return ONLY raw JSON:
{
  "validations": [
    {
      "id": prediction_id,
      "accuracy_score": 0-100,
      "status": "validated",
      "validated_at": "${new Date().toISOString()}",
      "validation_notes": "What happened vs what was predicted. Be specific."
    }
  ]
}`
}

// ── Handler ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Charge patches + prix bazaar + prédictions à valider en parallèle
    const [
      { data: livePatches },
      { data: alphaPatches },
      { data: bazaarPrices },
      { data: pendingValidation }
    ] = await Promise.all([
      supabase.from('patch_notes').select('*').eq('is_alpha', false).order('published_at', { ascending: false }).limit(10),
      supabase.from('patch_notes').select('*').eq('is_alpha', true).order('published_at',  { ascending: false }).limit(5),
      supabase.from('bazaar_1h').select('item_id, sell_price, buy_price'),
      supabase.from('insight_patch')
        .select('*')
        .eq('status', 'active')
        .not('predicted_items', 'is', null)
        .lt('created_at', new Date(Date.now() - 3 * 86_400_000).toISOString()) // > 3 jours
        .limit(10),
    ])

    const patchContext = JSON.stringify({
      live:  (livePatches  || []).map(p => ({ title: p.title, content: p.content?.slice(0, 3000), date: p.published_at })),
      alpha: (alphaPatches || []).map(p => ({ title: p.title, content: p.content?.slice(0, 2000), date: p.published_at })),
    })

    // 2 appels Claude en parallèle
    const [analysisRes, validationRes] = await Promise.all([
      // Appel 1 : analyse des patches
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 4000,
          system: [{ type: 'text', text: buildAnalysisPrompt(), cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: `Patch notes to analyze:\n${patchContext}\n\nCurrent bazaar prices:\n${JSON.stringify(bazaarPrices?.slice(0, 50))}` }],
        }),
      }),
      // Appel 2 : validation prédictions passées
      pendingValidation && pendingValidation.length > 0
        ? fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key':         process.env.ANTHROPIC_API_KEY!,
              'anthropic-version': '2023-06-01',
              'content-type':      'application/json',
            },
            body: JSON.stringify({
              model:      'claude-sonnet-4-6',
              max_tokens: 2000,
              messages: [{ role: 'user', content: buildValidationPrompt(pendingValidation, bazaarPrices || []) }],
            }),
          })
        : Promise.resolve(null),
    ])

    // Parse analyse
    const analysisData = await analysisRes.json()
    const analysis     = parseJSON(analysisData.content?.[0]?.text || '{}')

    // Sauvegarde patches live dans insight_patch
    let savedLive  = 0
    let savedAlpha = 0

    for (const patch of (analysis.live_patches || [])) {
      const { error } = await supabase.from('insight_patch').upsert({
        patch_title:      patch.patch_title,
        patch_date:       patch.patch_date,
        patch_type:       'live',
        patch_source:     'hypixel_official',
        direct_impact:    patch.direct_impact,
        items_affected:   patch.items_affected || [],
        methods_affected: patch.methods_affected || [],
        price_prediction: patch.price_prediction,
        predicted_items:  patch.predicted_items || [],
        action_signal:    patch.action_signal,
        confidence:       patch.confidence,
        status:           'active',
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'patch_title', ignoreDuplicates: false })

      if (!error) savedLive++
    }

    for (const patch of (analysis.alpha_patches || [])) {
      const { error } = await supabase.from('insight_patch').upsert({
        patch_title:      patch.patch_title,
        patch_date:       patch.patch_date,
        patch_type:       'alpha',
        is_alpha:         true,
        patch_source:     'hypixel_alpha',
        direct_impact:    patch.direct_impact,
        items_affected:   patch.items_affected || [],
        methods_affected: patch.methods_affected || [],
        price_prediction: patch.price_prediction,
        predicted_items:  patch.predicted_items || [],
        action_signal:    patch.action_signal,
        confidence:       patch.confidence,
        status:           'active',
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'patch_title', ignoreDuplicates: false })

      if (!error) savedAlpha++
    }

    // Sauvegarde dans claude_analysis pour le dashboard
    await supabase.from('claude_analysis').upsert({
      section:    'patch_analysis',
      content:    JSON.stringify(analysis),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'section' })

    // Parse + applique validations
    let validationsApplied = 0
    if (validationRes) {
      try {
        const valData = await validationRes.json()
        const val     = parseJSON(valData.content?.[0]?.text || '{}')

        for (const v of (val.validations || [])) {
          const { error } = await supabase.from('insight_patch').update({
            accuracy_score:   v.accuracy_score,
            status:           v.status,
            validated_at:     v.validated_at,
            accuracy_notes:   v.validation_notes,
            outcome_verified: true,
          }).eq('id', v.id)

          if (!error) validationsApplied++
        }
      } catch (e) {
        console.error('Validation parse error:', e)
      }
    }

    return NextResponse.json({
      success:              true,
      live_patches_saved:   savedLive,
      alpha_patches_saved:  savedAlpha,
      validations_applied:  validationsApplied,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}