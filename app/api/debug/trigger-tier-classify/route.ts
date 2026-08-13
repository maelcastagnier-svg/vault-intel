// Route de debug TEMPORAIRE (Pluton, 13 aout) -- classification 7-tiers Couche 1,
// residu apres les 3 regles gratuites (rarete, prix reel AH sur wiki_table_extract et
// wiki_haiku_extract). Traite en priorite le residu wiki_haiku_extract (entrees deja
// structurees -- source_label/stat_name_guess/bonus_raw/condition_note -- classification
// tres bon marche car pas besoin de relire toute la page, juste ces 4 champs courts).
// Batch de N entrees par appel Haiku pour amortir le system prompt.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TIER_TABLES = ['pluton_tier_1_starter', 'pluton_tier_2_amateur', 'pluton_tier_3_intermediate', 'pluton_tier_4_skilled', 'pluton_tier_5_expert', 'pluton_tier_6_professional', 'pluton_tier_7_master']

const SYSTEM_PROMPT = `Tu classes des éléments du jeu Hypixel Skyblock dans un des 7 tiers de progression joueur (networth réel, déjà validés) :
1 Starter (0-5M) | 2 Amateur (5-50M) | 3 Intermediate (50-150M) | 4 Skilled (150-500M) | 5 Expert (500M-1.5B) | 6 Professional (1.5B-5B) | 7 Master (5B+)

Pour chaque élément donné, réponds : à quel tier un joueur obtient/utilise TYPIQUEMENT cet élément pour la première fois de façon réaliste (pas le minimum théorique absolu, le point réaliste d'obtention/pertinence) ?
Règles :
- N'invente aucune valeur numérique. Base-toi sur le texte fourni (nom, stat, condition, bonus) et ta connaissance générale de la progression Hypixel Skyblock.
- Si le texte ne donne AUCUN indice exploitable (ni rareté, ni niveau, ni zone, ni contexte de difficulté), réponds tier=null plutôt que de deviner au hasard.
- confidence=low si tu dois inférer sans signal fort, high si un vrai indice (rareté/niveau/zone/prix) est présent dans le texte.`

const SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          tier: { type: ['integer', 'null'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          reason: { type: 'string' },
        },
        required: ['index', 'tier', 'confidence', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['classifications'],
  additionalProperties: false,
}

async function callHaiku(items: Array<{ index: number; text: string }>) {
  const userContent = items.map(i => `[${i.index}] ${i.text}`).join('\n')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    }),
  })
  if (!res.ok) throw new Error(`Haiku API ${res.status}: ${(await res.text()).slice(0, 500)}`)
  const data = await res.json()
  const raw = data?.content?.[0]?.text ?? ''
  const parsed = JSON.parse(raw)
  return { classifications: parsed.classifications as Array<{ index: number; tier: number | null; confidence: string; reason: string }>, inputTokens: data?.usage?.input_tokens ?? 0, outputTokens: data?.usage?.output_tokens ?? 0 }
}

export async function GET(req: NextRequest) {
  try {
    const limit = req.nextUrl.searchParams.get('limit') ? parseInt(req.nextUrl.searchParams.get('limit')!, 10) : 30
    const batchSize = 30

    // Deja classes (tous types confondus) -- pagine par prudence.
    const doneRowIds = new Set<string>()
    for (const tbl of TIER_TABLES) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from(tbl).select('source_table, source_row_id').eq('source_table', 'wiki_haiku_extract').range(offset, offset + 999)
        if (error) throw new Error(`fetch done ${tbl}: ${error.message}`)
        if (!data || data.length === 0) break
        for (const r of data) doneRowIds.add(r.source_row_id)
        if (data.length < 1000) break
      }
    }

    // Residu wiki_haiku_extract -- entrees deja structurees.
    const { data: pages, error: pagesErr } = await supabase
      .from('wiki_haiku_extract')
      .select('id, page_title, entries')
      .eq('extractable', true)
      .order('id', { ascending: true })
    if (pagesErr) throw new Error(pagesErr.message)

    type Item = { rowId: string; text: string; sourceLabel: string; statName: string; bonusRaw: string; pageTitle: string }
    const residual: Item[] = []
    for (const p of pages ?? []) {
      const entries = (p.entries as any[]) ?? []
      entries.forEach((e, idx) => {
        const rowId = `${p.id}:${idx + 1}`
        if (doneRowIds.has(rowId)) return
        residual.push({
          rowId,
          text: `"${e.source_label}" -- stat=${e.stat_name_guess}, bonus=${e.bonus_raw}, condition="${e.condition_note || 'none'}" (page: ${p.page_title})`,
          sourceLabel: e.source_label, statName: e.stat_name_guess, bonusRaw: e.bonus_raw, pageTitle: p.page_title,
        })
      })
    }

    const toProcess = residual.slice(0, limit)
    let totalInputTokens = 0, totalOutputTokens = 0, classifiedCount = 0, nullCount = 0
    const errors: Array<{ rowId: string; error: string }> = []
    const results: Array<{ rowId: string; sourceLabel: string; tier: number | null; confidence: string }> = []

    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batch = toProcess.slice(i, i + batchSize)
      const items = batch.map((item, idx) => ({ index: idx, text: item.text }))
      try {
        const { classifications, inputTokens, outputTokens } = await callHaiku(items)
        totalInputTokens += inputTokens
        totalOutputTokens += outputTokens
        for (const c of classifications) {
          const item = batch[c.index]
          if (!item) continue
          results.push({ rowId: item.rowId, sourceLabel: item.sourceLabel, tier: c.tier, confidence: c.confidence })
          if (c.tier === null) { nullCount++; continue }
          const tbl = TIER_TABLES[c.tier - 1]
          const { error } = await supabase.from(tbl).insert({
            element_name: item.sourceLabel,
            element_type: 'stat_bonus',
            stat_name: item.statName,
            bonus_raw: item.bonusRaw,
            source_table: 'wiki_haiku_extract',
            source_row_id: item.rowId,
            raw_data: { page_title: item.pageTitle, source_label: item.sourceLabel, stat_name: item.statName, bonus_raw: item.bonusRaw },
            classification_method: 'haiku',
            classification_confidence: c.confidence,
            classification_reason: c.reason,
          })
          if (error) errors.push({ rowId: item.rowId, error: error.message })
          else classifiedCount++
        }
      } catch (e: any) {
        for (const item of batch) errors.push({ rowId: item.rowId, error: String(e?.message ?? e) })
      }
    }

    const costUsd = (totalInputTokens / 1_000_000) * 1.0 + (totalOutputTokens / 1_000_000) * 5.0
    return NextResponse.json({
      success: true,
      residual_total: residual.length,
      processed_this_run: toProcess.length,
      remaining_after_this_run: residual.length - toProcess.length,
      classified_count: classifiedCount,
      null_count: nullCount,
      error_count: errors.length,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      real_cost_usd: costUsd,
      real_cost_per_item_usd: toProcess.length > 0 ? costUsd / toProcess.length : 0,
      errors: errors.slice(0, 10),
      sample_results: results.slice(0, 15),
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
