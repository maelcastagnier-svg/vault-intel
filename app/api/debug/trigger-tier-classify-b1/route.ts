// Route de debug TEMPORAIRE (Pluton, 13 aout) -- classification 7-tiers Couche 1,
// residu wiki_table_extract (2920 pages sans colonne rarete/prix exploitable par les
// regles gratuites). Classification au niveau PAGE (pas ligne) -- un echantillon
// representatif de la page (titre + en-tetes + premieres lignes) suffit a Haiku pour
// juger le tier, et toutes les lignes de la page heritent du meme tier (une page sans
// colonne rarete est presque toujours homogene -- si elle avait une vraie variation de
// rarete/niveau par ligne, la regle gratuite l'aurait deja capturee). Meme cascade que
// trigger-tier-classify (rarete/prix deja essayes en amont, ceci est le residu final
// avant Haiku).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TIER_TABLES = ['pluton_tier_1_starter', 'pluton_tier_2_amateur', 'pluton_tier_3_intermediate', 'pluton_tier_4_skilled', 'pluton_tier_5_expert', 'pluton_tier_6_professional', 'pluton_tier_7_master']

const SYSTEM_PROMPT = `Tu classes des PAGES du wiki Hypixel Skyblock dans un des 7 tiers de progression joueur (networth réel, déjà validés) :
1 Starter (0-5M) | 2 Amateur (5-50M) | 3 Intermediate (50-150M) | 4 Skilled (150-500M) | 5 Expert (500M-1.5B) | 6 Professional (1.5B-5B) | 7 Master (5B+)

Pour chaque page (titre + échantillon de sa table), réponds à quel tier un joueur rencontre/utilise TYPIQUEMENT ce contenu pour la première fois de façon réaliste.
Règles :
- N'invente aucune valeur numérique. Base-toi sur le contenu fourni et ta connaissance générale de la progression Hypixel Skyblock (zones, mécaniques, difficulté).
- Si le contenu ne donne AUCUN indice exploitable, réponds tier=null plutôt que deviner au hasard.
- confidence=low si tu dois inférer sans signal fort, high si un vrai indice (zone/mécanique/difficulté claire) est présent.`

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
  const userContent = items.map(i => `[${i.index}] ${i.text}`).join('\n---\n')
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
    const limit = req.nextUrl.searchParams.get('limit') ? parseInt(req.nextUrl.searchParams.get('limit')!, 10) : 20
    const batchSize = 20 // pages plus lourdes que les entrees B2 -- lot plus petit

    // Deja classe (n'importe quelle methode) -- id de ligne wiki_table_extract.
    const doneRowIds = new Set<number>()
    for (const tbl of TIER_TABLES) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from(tbl).select('source_row_id').eq('source_table', 'wiki_table_extract').range(offset, offset + 999)
        if (error) throw new Error(`fetch done ${tbl}: ${error.message}`)
        if (!data || data.length === 0) break
        for (const r of data) doneRowIds.add(Number(r.source_row_id))
        if (data.length < 1000) break
      }
    }

    // Toutes les lignes wiki_table_extract, paginees, groupees par page.
    type Row = { id: number; game_mechanics_misc_id: number; page_title: string; section_heading: string | null; tab_name: string | null; headers: string[]; cells: string[] }
    const byPage = new Map<number, Row[]>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from('wiki_table_extract')
        .select('id, game_mechanics_misc_id, page_title, section_heading, tab_name, headers, cells')
        .order('game_mechanics_misc_id', { ascending: true })
        .range(offset, offset + 999)
      if (error) throw new Error(`fetch rows: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data as any[]) {
        if (doneRowIds.has(r.id)) continue
        if (!byPage.has(r.game_mechanics_misc_id)) byPage.set(r.game_mechanics_misc_id, [])
        byPage.get(r.game_mechanics_misc_id)!.push(r)
      }
      if (data.length < 1000) break
    }

    const pages = Array.from(byPage.entries()).map(([pageId, rows]) => ({
      pageId,
      title: rows[0].page_title,
      rows,
      sampleText: `Page "${rows[0].page_title}"${rows[0].section_heading ? ` / ${rows[0].section_heading}` : ''}${rows[0].tab_name ? ` [${rows[0].tab_name}]` : ''} -- headers: ${rows[0].headers.join(', ')} -- exemple: ${rows.slice(0, 3).map(r => r.cells.join(' | ')).join(' ;; ')} (${rows.length} lignes au total)`,
    }))

    const toProcess = pages.slice(0, limit)
    let totalInputTokens = 0, totalOutputTokens = 0, classifiedRows = 0, classifiedPages = 0, nullCount = 0
    const errors: Array<{ pageId: number; error: string }> = []

    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batch = toProcess.slice(i, i + batchSize)
      const items = batch.map((p, idx) => ({ index: idx, text: p.sampleText }))
      try {
        const { classifications, inputTokens, outputTokens } = await callHaiku(items)
        totalInputTokens += inputTokens
        totalOutputTokens += outputTokens
        for (const c of classifications) {
          const page = batch[c.index]
          if (!page) continue
          if (c.tier === null) { nullCount++; continue }
          const tbl = TIER_TABLES[c.tier - 1]
          const insertRows = page.rows.map(r => ({
            element_name: `${page.title}${r.section_heading ? ` / ${r.section_heading}` : ''}: ${r.cells[0] || page.title}`.slice(0, 250),
            element_type: 'wiki_row',
            source_table: 'wiki_table_extract',
            source_row_id: r.id.toString(),
            raw_data: { page_title: r.page_title, section_heading: r.section_heading, tab_name: r.tab_name, headers: r.headers, cells: r.cells },
            classification_method: 'haiku_page_level',
            classification_confidence: c.confidence,
            classification_reason: `${c.reason} (jugement au niveau page "${page.title}", appliqué à ses ${page.rows.length} lignes)`,
          }))
          for (let bi = 0; bi < insertRows.length; bi += 500) {
            const { error } = await supabase.from(tbl).insert(insertRows.slice(bi, bi + 500))
            if (error) errors.push({ pageId: page.pageId, error: error.message })
            else classifiedRows += insertRows.slice(bi, bi + 500).length
          }
          classifiedPages++
        }
      } catch (e: any) {
        for (const page of batch) errors.push({ pageId: page.pageId, error: String(e?.message ?? e) })
      }
    }

    const costUsd = (totalInputTokens / 1_000_000) * 1.0 + (totalOutputTokens / 1_000_000) * 5.0
    return NextResponse.json({
      success: true,
      residual_pages_total: pages.length,
      processed_this_run: toProcess.length,
      remaining_after_this_run: pages.length - toProcess.length,
      classified_pages: classifiedPages,
      classified_rows: classifiedRows,
      null_count: nullCount,
      error_count: errors.length,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      real_cost_usd: costUsd,
      real_cost_per_page_usd: toProcess.length > 0 ? costUsd / toProcess.length : 0,
      errors: errors.slice(0, 10),
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
