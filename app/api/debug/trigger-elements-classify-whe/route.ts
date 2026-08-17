// Route de debug TEMPORAIRE (Pluton architecture v2, 17 aout) -- reclassification du
// residu wiki_haiku_extract apres nettoyage d'un bug reel (tier_min/tier_max hors 1-7,
// Haiku copiant un niveau brut du jeu). Fix double : prompt renforce + clamp code.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ELEMENT_TYPES = ['item', 'progression_milestone', 'mechanic_formula', 'mob_zone_data', 'cosmetic', 'event_seasonal', 'admin_excluded', 'general_mechanic']

const SYSTEM_PROMPT = `Tu classes des PAGES wiki Hypixel Skyblock (titre + entries deja extraites : source_label/stat_name_guess/bonus_raw/condition_note). Pour chaque page, reponds a DEUX questions :

1. element_type -- un des 8 : ${ELEMENT_TYPES.join(', ')}.
   - item = equipement/arme/outil/pet/accessoire/reforge qu'un joueur obtient/achete
   - progression_milestone = niveaux skill/slayer/collection/reputation et leurs recompenses
   - mechanic_formula = formule/regle du jeu (taux de drop, courbe XP, calcul de stat) -- PAS une chose "obtenue"
   - mob_zone_data = stats de mob, donnees de zone/bestiary/loot par zone
   - cosmetic = skins, dialogues, contenu purement visuel, bande-son
   - event_seasonal = festivals, bingo, contenu limite dans le temps
   - admin_excluded = contenu reserve aux GM/dev, jamais accessible a un vrai joueur
   - general_mechanic = mecanique reelle mais qui ne rentre dans aucune des 7 autres

2. is_gated -- cette page documente-t-elle du contenu DEBLOQUABLE (networth/XP/prerequis reel) ? Une regle UNIVERSELLE vraie pour tout joueur des le debut n'est PAS gated.
   Si is_gated=true : gate_type, tier_min/tier_max.
   Si is_gated=false : gate_type="none", tier_min=null, tier_max=null.

   ⚠️ REGLE ABSOLUE sur tier_min/tier_max : c'est TOUJOURS un entier entre 1 et 7 inclus, JAMAIS autre chose.
   Cette echelle 1-7 est la NOTRE (Starter a Master), PAS une echelle presente dans condition_note/bonus_raw.
   Si une entree mentionne un niveau/palier brut du jeu (SkyBlock Level, niveau HOTM, niveau skill...) --
   NE COPIE JAMAIS ce nombre tel quel. Convertis-le toi-meme en position dans l'echelle 1-7.
   tier_min et tier_max hors de la plage [1,7] seront rejetes automatiquement.

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

function clampTier(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null
  return Math.max(1, Math.min(7, Math.round(n)))
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

type Entry = { source_label?: string; stat_name_guess?: string; bonus_raw?: string; condition_note?: string; confidence?: string }

export async function GET(req: NextRequest) {
  try {
    const limit = req.nextUrl.searchParams.get('limit') ? parseInt(req.nextUrl.searchParams.get('limit')!, 10) : 400
    const batchSize = 25

    const doneIds = new Set<string>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('pluton_elements').select('source_row_id').eq('source_table', 'wiki_haiku_extract').range(offset, offset + 999)
      if (error) throw new Error(`fetch done: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data) doneIds.add(r.source_row_id)
      if (data.length < 1000) break
    }

    type PageRow = { id: number; page_title: string; entries: Entry[] }
    const allPages: PageRow[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('wiki_haiku_extract').select('id, page_title, entries').eq('extractable', true).is('error', null).range(offset, offset + 999)
      if (error) throw new Error(`fetch whe: ${error.message}`)
      if (!data || data.length === 0) break
      allPages.push(...(data as any[]))
      if (data.length < 1000) break
    }

    type PageInfo = { id: number; title: string; entries: Entry[]; residualIdx: number[]; sampleText: string }
    const pagesInfo: PageInfo[] = []
    for (const page of allPages) {
      const entries = page.entries ?? []
      const residualIdx: number[] = []
      for (let ei = 0; ei < entries.length; ei++) {
        if (!doneIds.has(`${page.id}:${ei + 1}`)) residualIdx.push(ei)
      }
      if (residualIdx.length === 0) continue
      const sample = residualIdx.slice(0, 5).map(ei => JSON.stringify(entries[ei])).join(' | ')
      pagesInfo.push({ id: page.id, title: page.page_title, entries, residualIdx, sampleText: `Page "${page.page_title}" -- entries: ${sample} (${residualIdx.length} entries residuelles)` })
    }
    const residualPagesTotal = pagesInfo.length
    const toProcess = pagesInfo.slice(0, limit)

    let totalInputTokens = 0, totalOutputTokens = 0, classifiedRows = 0, classifiedPages = 0, gatedPages = 0, ungatedPages = 0
    const errors: Array<{ page: string; error: string }> = []

    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batch = toProcess.slice(i, i + batchSize)
      const items = batch.map((p, idx) => ({ index: idx, text: p.sampleText }))
      try {
        const { classifications, inputTokens, outputTokens } = await callHaiku(items)
        totalInputTokens += inputTokens
        totalOutputTokens += outputTokens
        const batchInserts: any[] = []
        for (const c of classifications) {
          const p = batch[c.index]
          if (!p) continue
          const tMin = c.is_gated ? clampTier(c.tier_min) : null
          const tMax = c.is_gated ? clampTier(c.tier_max ?? c.tier_min) : null
          if (c.is_gated) gatedPages++; else ungatedPages++

          for (let ri = 0; ri < p.residualIdx.length; ri++) {
            const ei = p.residualIdx[ri]
            const entry = p.entries[ei]
            const tier = (tMin !== null && tMax !== null && tMax > tMin)
              ? Math.min(tMax, tMin + Math.floor((ri / Math.max(1, p.residualIdx.length - 1)) * (tMax - tMin)))
              : tMin
            const elementName = `${entry.source_label ?? p.title} -- ${entry.stat_name_guess ?? ''} ${entry.bonus_raw ?? ''}`.slice(0, 250)
            batchInserts.push({
              element_type: c.element_type,
              element_name: elementName,
              tier,
              gate_type: c.is_gated ? c.gate_type : null,
              gate_reference: c.is_gated ? `jugement page-level (plage ${tMin}-${tMax})` : null,
              stat_name: entry.stat_name_guess ?? null,
              bonus_raw: entry.bonus_raw ?? null,
              source_table: 'wiki_haiku_extract',
              source_row_id: `${p.id}:${ei + 1}`,
              raw_data: entry,
              classification_method: 'haiku_page_level_v3',
              classification_confidence: c.confidence,
              classification_reason: c.reason,
            })
          }
          classifiedPages++
        }
        for (let bi = 0; bi < batchInserts.length; bi += 500) {
          const chunk = batchInserts.slice(bi, bi + 500)
          const { error } = await supabase.from('pluton_elements').upsert(chunk, { onConflict: 'source_table,source_row_id', ignoreDuplicates: true })
          if (error) errors.push({ page: 'batch-insert', error: error.message })
          else classifiedRows += chunk.length
        }
      } catch (e: any) {
        for (const p of batch) errors.push({ page: p.title, error: String(e?.message ?? e) })
      }
    }

    const costUsd = (totalInputTokens / 1_000_000) * 1.0 + (totalOutputTokens / 1_000_000) * 5.0
    return NextResponse.json({
      success: true,
      residual_pages_total: residualPagesTotal,
      processed_this_run: toProcess.length,
      remaining_after_this_run: residualPagesTotal - toProcess.length,
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
