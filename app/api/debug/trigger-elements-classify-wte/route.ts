// Route de debug TEMPORAIRE (Pluton architecture v2, 14 aout) -- classification
// element_type + gating du residu wiki_table_extract (~137k lignes, ~2920 pages).
// Meme principe que trigger-elements-classify-ref mais au niveau PAGE (pas table) :
// un seul jugement Haiku par page, applique a toutes les lignes residuelles de
// cette page -- une page sans signal de rarete/prix est presque toujours homogene
// dans son element_type et son statut de gating.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ELEMENT_TYPES = ['item', 'progression_milestone', 'mechanic_formula', 'mob_zone_data', 'cosmetic', 'event_seasonal', 'admin_excluded', 'general_mechanic']

const SYSTEM_PROMPT = `Tu classes des PAGES wiki Hypixel Skyblock (titre + section + colonnes + echantillon de lignes). Pour chaque page, reponds a DEUX questions :

1. element_type -- un des 8 : ${ELEMENT_TYPES.join(', ')}.
   - item = equipement/arme/outil/pet/accessoire/reforge qu'un joueur obtient/achete
   - progression_milestone = niveaux skill/slayer/collection/reputation et leurs recompenses
   - mechanic_formula = formule/regle du jeu (taux de drop, courbe XP, calcul de stat) -- PAS une chose "obtenue"
   - mob_zone_data = stats de mob, donnees de zone/bestiary/loot par zone
   - cosmetic = skins, dialogues, contenu purement visuel, bande-son
   - event_seasonal = festivals, bingo, contenu limite dans le temps
   - admin_excluded = contenu reserve aux GM/dev, jamais accessible a un vrai joueur
   - general_mechanic = mecanique reelle mais qui ne rentre dans aucune des 7 autres

2. is_gated -- cette page documente-t-elle du contenu DEBLOQUABLE (networth/XP/prerequis reel) ? Une regle UNIVERSELLE vraie pour tout joueur des le debut (vitesse de cassage vanilla, definition d'une stat, changelog, page meta/admin) n'est PAS gated.
   Si is_gated=true : gate_type (networth|xp_ratio|prerequisite|inherited), tier_min/tier_max (1-7, plage si la page couvre plusieurs paliers).
   Si is_gated=false : gate_type="none", tier_min=null, tier_max=null.

Regles : n'invente aucune valeur numerique. confidence=low si tu dois inferer sans signal fort.`

const SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          element_type: { type: 'string', enum: ELEMENT_TYPES },
          is_gated: { type: 'boolean' },
          gate_type: { type: 'string', enum: ['networth', 'xp_ratio', 'prerequisite', 'inherited', 'none'] },
          tier_min: { type: ['integer', 'null'] },
          tier_max: { type: ['integer', 'null'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          reason: { type: 'string' },
        },
        required: ['index', 'element_type', 'is_gated', 'gate_type', 'tier_min', 'tier_max', 'confidence', 'reason'],
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
  return {
    classifications: parsed.classifications as Array<{ index: number; element_type: string; is_gated: boolean; gate_type: string; tier_min: number | null; tier_max: number | null; confidence: string; reason: string }>,
    inputTokens: data?.usage?.input_tokens ?? 0,
    outputTokens: data?.usage?.output_tokens ?? 0,
  }
}

export async function GET(req: NextRequest) {
  try {
    const limit = req.nextUrl.searchParams.get('limit') ? parseInt(req.nextUrl.searchParams.get('limit')!, 10) : 25
    const batchSize = 25

    // Pages deja classees (via pluton_elements, source_table='wiki_table_extract')
    const doneIds = new Set<string>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('pluton_elements').select('source_row_id').eq('source_table', 'wiki_table_extract').range(offset, offset + 999)
      if (error) throw new Error(`fetch done: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data) doneIds.add(r.source_row_id)
      if (data.length < 1000) break
    }

    // Etape legere : uniquement id + cle de page (pas headers/cells) pour TOUTES les lignes --
    // evite de charger ~137k lignes completes a chaque invocation (meme piege corrige hier sur
    // les tables de reference). Le contenu complet n'est charge qu'au lot traite ce run.
    type LightRow = { id: number; game_mechanics_misc_id: number; page_title: string }
    const lightRows: LightRow[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('wiki_table_extract').select('id, game_mechanics_misc_id, page_title').range(offset, offset + 999)
      if (error) throw new Error(`fetch wte light: ${error.message}`)
      if (!data || data.length === 0) break
      lightRows.push(...(data as any[]))
      if (data.length < 1000) break
    }

    const byPageIds = new Map<string, { title: string; misc_id: number; ids: number[] }>()
    for (const r of lightRows) {
      if (doneIds.has(String(r.id))) continue
      const key = `${r.game_mechanics_misc_id}::${r.page_title}`
      if (!byPageIds.has(key)) byPageIds.set(key, { title: r.page_title, misc_id: r.game_mechanics_misc_id, ids: [] })
      byPageIds.get(key)!.ids.push(r.id)
    }
    const residualTablesTotal = byPageIds.size
    const pageKeysToProcess = [...byPageIds.entries()].slice(0, limit)

    // Contenu complet UNIQUEMENT pour le lot traite ce run
    type Row = { id: number; game_mechanics_misc_id: number; page_title: string; section_heading: string | null; headers: string[] | null; cells: string[] | null }
    type PageInfo = { key: string; title: string; rows: Row[]; sampleText: string }
    const pagesInfo: PageInfo[] = (await Promise.all(pageKeysToProcess.map(async ([key, info]) => {
      const { data, error } = await supabase.from('wiki_table_extract')
        .select('id, game_mechanics_misc_id, page_title, section_heading, headers, cells')
        .in('id', info.ids)
      if (error) { console.error(`fetch page ${info.title}: ${error.message}`); return null }
      const rows = (data ?? []) as Row[]
      if (rows.length === 0) return null
      const sample = rows.slice(0, 3).map(r => `section:"${r.section_heading}" headers:${JSON.stringify(r.headers)} cells:${JSON.stringify(r.cells)}`).join(' | ')
      return { key, title: info.title, rows, sampleText: `Page "${info.title}" -- ${sample} (${rows.length} lignes au total sur cette page)` } as PageInfo
    }))).filter((p): p is PageInfo => p !== null)
    const toProcess = pagesInfo

    let totalInputTokens = 0, totalOutputTokens = 0, classifiedRows = 0, classifiedPages = 0, gatedPages = 0, ungatedPages = 0
    const errors: Array<{ page: string; error: string }> = []

    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batch = toProcess.slice(i, i + batchSize)
      const items = batch.map((p, idx) => ({ index: idx, text: p.sampleText }))
      try {
        const { classifications, inputTokens, outputTokens } = await callHaiku(items)
        totalInputTokens += inputTokens
        totalOutputTokens += outputTokens
        for (const c of classifications) {
          const p = batch[c.index]
          if (!p) continue
          const tMin = c.is_gated ? c.tier_min : null
          const tMax = c.is_gated ? (c.tier_max ?? c.tier_min) : null
          if (c.is_gated) gatedPages++; else ungatedPages++

          for (let ri = 0; ri < p.rows.length; ri++) {
            const row = p.rows[ri]
            const tier = (tMin !== null && tMax !== null && tMax > tMin)
              ? Math.min(tMax, tMin + Math.floor((ri / Math.max(1, p.rows.length - 1)) * (tMax - tMin)))
              : tMin
            const elementName = `${p.title} / ${row.section_heading ?? ''}: ${(row.cells ?? []).slice(0, 2).join(', ')}`.slice(0, 250)
            const { error } = await supabase.from('pluton_elements').upsert({
              element_type: c.element_type,
              element_name: elementName,
              tier,
              gate_type: c.is_gated ? c.gate_type : null,
              gate_reference: c.is_gated ? `jugement page-level (plage ${tMin}-${tMax})` : null,
              source_table: 'wiki_table_extract',
              source_row_id: String(row.id),
              raw_data: row,
              classification_method: 'haiku_page_level_v2',
              classification_confidence: c.confidence,
              classification_reason: c.reason,
            }, { onConflict: 'source_table,source_row_id', ignoreDuplicates: true })
            if (error) errors.push({ page: p.title, error: error.message })
            else classifiedRows++
          }
          classifiedPages++
        }
      } catch (e: any) {
        for (const p of batch) errors.push({ page: p.title, error: String(e?.message ?? e) })
      }
    }

    const costUsd = (totalInputTokens / 1_000_000) * 1.0 + (totalOutputTokens / 1_000_000) * 5.0
    return NextResponse.json({
      success: true,
      residual_pages_total: residualTablesTotal,
      processed_this_run: toProcess.length,
      remaining_after_this_run: residualTablesTotal - toProcess.length,
      classified_pages: classifiedPages,
      classified_rows: classifiedRows,
      gated_pages: gatedPages,
      ungated_pages: ungatedPages,
      error_count: errors.length,
      real_cost_usd: costUsd,
      errors: errors.slice(0, 10),
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
