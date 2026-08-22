// app/api/cron/pluton-weekly-sync/route.ts
// Cron PERMANENT (hebdomadaire) -- ferme la boucle d'auto-alimentation de Pluton.
// Chaine 2 phases dans la meme invocation ("quand la cartographie est finie on
// lance extract dans la foulee", demande explicite utilisateur, 17 aout) :
//
// PHASE 1 -- EXTRACTION : pages wiki nouvelles depuis le dernier run reussi de
//   CE cron (meme watermark que discovery-scan, sur game_mechanics_misc.created_at)
//   -> bi-parsing maison (B1, lib/wiki-table-parse.ts, gratuit) puis Haiku en
//   dernier recours (B2, uniquement si B1 ne trouve rien) -> wiki_table_extract /
//   wiki_haiku_extract.
// PHASE 2 -- CLASSIFICATION : tout le residu non encore dans pluton_elements
//   (wiki_table_extract/wiki_haiku_extract fraichement extraits CE run + tables
//   de reference NEU-REPO/SkyHanni-REPO si neu-sync/skyhanni-repo-sync en ont
//   ajoute depuis) -> jugement Haiku element_type + gating (meme prompt/clamp
//   que la classification manuelle du 17 aout), upsert par lots.
//
// Idempotent/resumable par construction (meme discipline que tout le projet) :
// phase 1 watermarke sur created_at (comme discovery-scan) ; phase 2 diffe
// directement contre pluton_elements (source_table, source_row_id) -- aucune
// des deux ne peut jamais retraiter/dupliquer, meme si une invocation precedente
// s'est arretee en cours de route (maxDuration=300).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractStructuredTables } from '@/lib/wiki-table-parse'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ════════════════════════════════════════════════════════════════════════
// PHASE 1 -- EXTRACTION
// ════════════════════════════════════════════════════════════════════════

async function getExtractionWatermark(): Promise<string> {
  const { data } = await supabase
    .from('sync_log')
    .select('started_at')
    .eq('job_name', 'pluton-weekly-sync')
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.started_at ?? new Date(0).toISOString()
}

const B2_SYSTEM_PROMPT = `Tu lis une page wiki Hypixel Skyblock qui n'a AUCUNE wikitable structuree (deja tente et echoue). Cherche dans le texte brut toute mention d'un bonus de stat chiffre (ex: "+5 Strength", "Increases Magic Find by 10%") attache a un objet/pet/perk/mecanique nomme sur cette page.

Si tu trouves au moins un bonus reel et chiffre : extractable=true, liste chaque bonus dans entries[] avec source_label (nom de l'objet/pet/perk qui donne ce bonus), stat_name_guess (le nom de la stat), bonus_raw (la valeur telle qu'ecrite, texte libre), condition_note (condition d'obtention si mentionnee, sinon chaine vide), confidence.
Si aucun bonus chiffre reel n'est trouve (page purement narrative/cosmetique/liste sans stat) : extractable=false, entries=[].

Regle absolue : n'invente aucune valeur, ne rapporte que ce qui est litteralement ecrit dans le texte fourni.`

const B2_SCHEMA = {
  type: 'object',
  properties: {
    extractable: { type: 'boolean' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source_label: { type: 'string' },
          stat_name_guess: { type: 'string' },
          bonus_raw: { type: 'string' },
          condition_note: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['source_label', 'stat_name_guess', 'bonus_raw', 'condition_note', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['extractable', 'entries'],
  additionalProperties: false,
}

async function callHaikuB2(pageTitle: string, content: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      // cache_control -- callHaikuB2 est appele une fois par page dans une boucle
      // (potentiellement des dizaines/centaines par invocation sur un backlog),
      // toujours avec le meme system prompt statique. Meme pattern que radar-agent/
      // money-making-agent/setup-generate-agent.
      system: [{ type: 'text', text: B2_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Page "${pageTitle}":\n\n${content.slice(0, 8000)}` }],
      output_config: { format: { type: 'json_schema', schema: B2_SCHEMA } },
    }),
  })
  if (!res.ok) throw new Error(`Haiku B2 ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const parsed = JSON.parse(data?.content?.[0]?.text ?? '{}')
  return { parsed, inputTokens: data?.usage?.input_tokens ?? 0, outputTokens: data?.usage?.output_tokens ?? 0 }
}

async function runExtractionPhase() {
  const since = await getExtractionWatermark()
  const { data: newPages, error } = await supabase
    .from('game_mechanics_misc')
    .select('id, key, category, value')
    .eq('value->>source', 'hypixelskyblock_wiki')
    .gt('created_at', since)
    .limit(2000)
  if (error) throw new Error('extraction: fetch new pages: ' + error.message)

  // Resumabilite reelle independante du watermark : maxDuration=300 tue
  // l'invocation avant finishSync des qu'un run depasse le budget (deja observe
  // en testant), donc le watermark (qui n'avance que sur un succes complet) ne
  // suffit pas seul a eviter un rescan du meme residu. Skip explicite de toute
  // page deja presente dans wiki_table_extract OU wiki_haiku_extract, comme
  // filet de securite systematique (meme doctrine "doneKeys" que partout
  // ailleurs dans ce projet).
  const alreadyExtracted = new Set<number>()
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabase.from('wiki_table_extract').select('game_mechanics_misc_id').range(offset, offset + 999)
    if (!data || data.length === 0) break
    for (const r of data) alreadyExtracted.add(r.game_mechanics_misc_id)
    if (data.length < 1000) break
  }
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabase.from('wiki_haiku_extract').select('game_mechanics_misc_id').range(offset, offset + 999)
    if (!data || data.length === 0) break
    for (const r of data) alreadyExtracted.add(r.game_mechanics_misc_id)
    if (data.length < 1000) break
  }

  let b1Pages = 0, b1Rows = 0, b2Pages = 0, b2Cost = 0
  const errors: Array<{ page: string; error: string }> = []

  for (const page of newPages ?? []) {
    if (alreadyExtracted.has(page.id)) continue
    const title = (page.value as any)?.title ?? page.key
    const content = (page.value as any)?.content ?? ''
    if (!content || content.length < 500) continue // meme seuil que B1/B2 d'origine

    try {
      const rows = extractStructuredTables(content)
      if (rows.length > 0) {
        const insertRows = rows.map(r => ({
          game_mechanics_misc_id: page.id,
          page_title: title,
          section_heading: r.sectionHeading,
          tab_name: r.tabName,
          table_index: r.tableIndex,
          row_index: r.rowIndex,
          headers: r.headers,
          cells: r.cells,
          extraction_method: r.extractionMethod,
        }))
        for (let i = 0; i < insertRows.length; i += 500) {
          // upsert(ignoreDuplicates) plutot qu'insert() nu -- une invocation qui
          // n'avance pas le watermark (ex: retest hors du vrai handler cron, qui
          // seul appelle startSync/finishSync) ne doit jamais faire remonter des
          // erreurs 23505 en boucle sur un rescan du meme residu. Meme contrainte
          // unique (game_mechanics_misc_id, section_heading, tab_name, table_index,
          // row_index) protegeait deja contre une vraie duplication en base, mais
          // gaspillait du calcul/du bruit de log a chaque retry avant ce fix.
          const { error: insErr } = await supabase.from('wiki_table_extract')
            .upsert(insertRows.slice(i, i + 500), {
              onConflict: 'game_mechanics_misc_id,section_heading,tab_name,table_index,row_index',
              ignoreDuplicates: true,
            })
          if (insErr) errors.push({ page: title, error: insErr.message })
        }
        b1Pages++
        b1Rows += rows.length
      } else {
        // B1 n'a rien trouve -- dernier recours Haiku (B2)
        const { parsed, inputTokens, outputTokens } = await callHaikuB2(title, content)
        b2Cost += (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0
        await supabase.from('wiki_haiku_extract').upsert({
          game_mechanics_misc_id: page.id,
          page_title: title,
          extractable: !!parsed.extractable,
          entries: parsed.entries ?? [],
          model: 'claude-haiku-4-5',
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        }, { onConflict: 'game_mechanics_misc_id', ignoreDuplicates: true })
        b2Pages++
      }
    } catch (e: any) {
      errors.push({ page: title, error: String(e?.message ?? e) })
    }
  }

  return { pages_scanned: (newPages ?? []).length, b1_pages: b1Pages, b1_rows: b1Rows, b2_pages: b2Pages, b2_cost_usd: b2Cost, errors: errors.slice(0, 10), error_count: errors.length }
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 2 -- CLASSIFICATION (element_type + gating, meme logique que le
// 17 aout -- prompt renforce + clamp [1,7] en filet de securite)
// ════════════════════════════════════════════════════════════════════════

const ELEMENT_TYPES = ['item', 'progression_milestone', 'mechanic_formula', 'mob_zone_data', 'cosmetic', 'event_seasonal', 'admin_excluded', 'general_mechanic']

const CLASSIFY_SYSTEM_PROMPT = `Tu classes du contenu Hypixel Skyblock (table de reference ou page wiki). Pour chaque item, reponds a DEUX questions :

1. element_type -- un des 8 : ${ELEMENT_TYPES.join(', ')}.
   - item = equipement/arme/outil/pet/accessoire/reforge qu'un joueur obtient/achete
   - progression_milestone = niveaux skill/slayer/collection/reputation et leurs recompenses
   - mechanic_formula = formule/regle du jeu -- PAS une chose "obtenue"
   - mob_zone_data = stats de mob, donnees de zone/bestiary/loot par zone
   - cosmetic = skins, dialogues, contenu purement visuel
   - event_seasonal = festivals, bingo, contenu limite dans le temps
   - admin_excluded = contenu reserve aux GM/dev, jamais accessible a un vrai joueur
   - general_mechanic = mecanique reelle qui ne rentre dans aucune des 7 autres

2. is_gated -- ce contenu est-il DEBLOQUABLE (networth/XP/prerequis reel) ? Une regle UNIVERSELLE vraie pour tout joueur des le debut n'est PAS gated.
   Si is_gated=true : gate_type (networth|xp_ratio|prerequisite|inherited), tier_min/tier_max.
   Si is_gated=false : gate_type="none", tier_min=null, tier_max=null.

   ⚠️ REGLE ABSOLUE : tier_min/tier_max est TOUJOURS un entier entre 1 et 7 inclus. Cette echelle est LA NOTRE
   (Starter a Master), jamais une echelle presente dans le contenu source (SkyBlock Level, niveau HOTM, niveau
   skill...). Ne copie JAMAIS un nombre brut du jeu -- convertis-le toi-meme en position 1-7.

Regles : n'invente aucune valeur. confidence=low si tu dois inferer sans signal fort.`

const CLASSIFY_SCHEMA = {
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

async function callHaikuClassify(items: Array<{ index: number; text: string }>) {
  const userContent = items.map(i => `[${i.index}] ${i.text}`).join('\n---\n')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      // cache_control -- callHaikuClassify est appele une fois par lot de 25 pages,
      // potentiellement plusieurs dizaines de fois par invocation sur un residu
      // important, toujours avec le meme system prompt statique.
      system: [{ type: 'text', text: CLASSIFY_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: { type: 'json_schema', schema: CLASSIFY_SCHEMA } },
    }),
  })
  if (!res.ok) throw new Error(`Haiku classify ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const parsed = JSON.parse(data?.content?.[0]?.text ?? '{}')
  return {
    classifications: (parsed.classifications ?? []) as Array<{ index: number; element_type: string; is_gated: boolean; gate_type: string; tier_min: number | null; tier_max: number | null; confidence: string; reason: string }>,
    inputTokens: data?.usage?.input_tokens ?? 0,
    outputTokens: data?.usage?.output_tokens ?? 0,
  }
}

// Classe le residu wiki_table_extract (page-level) -- meme logique que
// trigger-elements-classify-wte (supprimee apres son usage le 17 aout).
async function classifyWikiTableExtractResidual(deadline: number, doneWte: Set<string>) {
  let rows = 0, cost = 0
  // select() sans .range() plafonne silencieusement a ~1000 lignes cote
  // PostgREST -- sur ~140k lignes ca ratait tout residu au-dela des 1000
  // premieres (meme piege de troncature deja rencontre ailleurs sur ce
  // projet). Pagine explicitement comme runClassificationPhase le fait deja
  // pour pluton_elements (bug trouve le 17 aout : un run a rendu
  // wte_rows:0 alors qu'un residu de 2307 lignes existait reellement).
  const lightRows: Array<{ id: number; game_mechanics_misc_id: number; page_title: string }> = []
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabase.from('wiki_table_extract').select('id, game_mechanics_misc_id, page_title').range(offset, offset + 999)
    if (!data || data.length === 0) break
    lightRows.push(...data)
    if (data.length < 1000) break
  }
  const byPage = new Map<string, { title: string; ids: number[] }>()
  for (const r of lightRows) {
    if (doneWte.has(String(r.id))) continue
    const key = `${r.game_mechanics_misc_id}::${r.page_title}`
    if (!byPage.has(key)) byPage.set(key, { title: r.page_title, ids: [] })
    byPage.get(key)!.ids.push(r.id)
  }
  const pageKeys = [...byPage.entries()]
  for (let i = 0; i < pageKeys.length && Date.now() < deadline; i += 25) {
    const batch = pageKeys.slice(i, i + 25)
    const pagesInfo = (await Promise.all(batch.map(async ([, info]) => {
      const { data } = await supabase.from('wiki_table_extract').select('id, section_heading, headers, cells').in('id', info.ids)
      const rowsData = data ?? []
      if (rowsData.length === 0) return null
      const sample = rowsData.slice(0, 3).map((r: any) => `section:"${r.section_heading}" headers:${JSON.stringify(r.headers)} cells:${JSON.stringify(r.cells)}`).join(' | ')
      return { title: info.title, rows: rowsData, sampleText: `Page "${info.title}" -- ${sample} (${rowsData.length} lignes)` }
    }))).filter((p): p is NonNullable<typeof p> => p !== null)

    if (pagesInfo.length === 0) continue
    const items = pagesInfo.map((p, idx) => ({ index: idx, text: p.sampleText }))
    const { classifications, inputTokens, outputTokens } = await callHaikuClassify(items)
    cost += (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0

    const inserts: any[] = []
    for (const c of classifications) {
      const p = pagesInfo[c.index]
      if (!p) continue
      const tMin = c.is_gated ? clampTier(c.tier_min) : null
      const tMax = c.is_gated ? clampTier(c.tier_max ?? c.tier_min) : null
      for (let ri = 0; ri < p.rows.length; ri++) {
        const row: any = p.rows[ri]
        const tier = (tMin !== null && tMax !== null && tMax > tMin)
          ? Math.min(tMax, tMin + Math.floor((ri / Math.max(1, p.rows.length - 1)) * (tMax - tMin)))
          : tMin
        inserts.push({
          element_type: c.element_type,
          element_name: `${p.title} / ${row.section_heading ?? ''}: ${(row.cells ?? []).slice(0, 2).join(', ')}`.slice(0, 250),
          tier,
          gate_type: c.is_gated ? c.gate_type : null,
          gate_reference: c.is_gated ? `jugement page-level (plage ${tMin}-${tMax})` : null,
          source_table: 'wiki_table_extract',
          source_row_id: String(row.id),
          raw_data: row,
          classification_method: 'haiku_page_level_weekly',
          classification_confidence: c.confidence,
          classification_reason: c.reason,
        })
      }
    }
    for (let bi = 0; bi < inserts.length; bi += 500) {
      await supabase.from('pluton_elements').upsert(inserts.slice(bi, bi + 500), { onConflict: 'source_table,source_row_id', ignoreDuplicates: true })
    }
    rows += inserts.length
  }
  return { rows, cost }
}

// Classe le residu wiki_haiku_extract (entries[]) -- meme logique que
// trigger-elements-classify-whe.
async function classifyWikiHaikuExtractResidual(deadline: number, doneWhe: Set<string>) {
  let rows = 0, cost = 0
  // Meme piege de troncature ~1000 lignes que classifyWikiTableExtractResidual
  // (wiki_haiku_extract a ~5200 lignes, au-dela du plafond par defaut) -- pagine.
  const pages: Array<{ id: number; page_title: string; entries: any[] }> = []
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabase.from('wiki_haiku_extract').select('id, page_title, entries').eq('extractable', true).is('error', null).range(offset, offset + 999)
    if (!data || data.length === 0) break
    pages.push(...data)
    if (data.length < 1000) break
  }
  type PageInfo = { id: number; title: string; entries: any[]; residualIdx: number[]; sampleText: string }
  const pagesInfo: PageInfo[] = []
  for (const page of pages) {
    const entries = page.entries ?? []
    const residualIdx: number[] = []
    for (let ei = 0; ei < entries.length; ei++) {
      if (!doneWhe.has(`${page.id}:${ei + 1}`)) residualIdx.push(ei)
    }
    if (residualIdx.length === 0) continue
    const sample = residualIdx.slice(0, 5).map(ei => JSON.stringify(entries[ei])).join(' | ')
    pagesInfo.push({ id: page.id, title: page.page_title, entries, residualIdx, sampleText: `Page "${page.page_title}" -- entries: ${sample} (${residualIdx.length} entries)` })
  }
  for (let i = 0; i < pagesInfo.length && Date.now() < deadline; i += 25) {
    const batch = pagesInfo.slice(i, i + 25)
    const items = batch.map((p, idx) => ({ index: idx, text: p.sampleText }))
    const { classifications, inputTokens, outputTokens } = await callHaikuClassify(items)
    cost += (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0

    const inserts: any[] = []
    for (const c of classifications) {
      const p = batch[c.index]
      if (!p) continue
      const tMin = c.is_gated ? clampTier(c.tier_min) : null
      const tMax = c.is_gated ? clampTier(c.tier_max ?? c.tier_min) : null
      for (let ri = 0; ri < p.residualIdx.length; ri++) {
        const ei = p.residualIdx[ri]
        const entry = p.entries[ei]
        const tier = (tMin !== null && tMax !== null && tMax > tMin)
          ? Math.min(tMax, tMin + Math.floor((ri / Math.max(1, p.residualIdx.length - 1)) * (tMax - tMin)))
          : tMin
        inserts.push({
          element_type: c.element_type,
          element_name: `${entry.source_label ?? p.title} -- ${entry.stat_name_guess ?? ''} ${entry.bonus_raw ?? ''}`.slice(0, 250),
          tier,
          gate_type: c.is_gated ? c.gate_type : null,
          gate_reference: c.is_gated ? `jugement page-level (plage ${tMin}-${tMax})` : null,
          stat_name: entry.stat_name_guess ?? null,
          bonus_raw: entry.bonus_raw ?? null,
          source_table: 'wiki_haiku_extract',
          source_row_id: `${p.id}:${ei + 1}`,
          raw_data: entry,
          classification_method: 'haiku_page_level_weekly',
          classification_confidence: c.confidence,
          classification_reason: c.reason,
        })
      }
    }
    for (let bi = 0; bi < inserts.length; bi += 500) {
      await supabase.from('pluton_elements').upsert(inserts.slice(bi, bi + 500), { onConflict: 'source_table,source_row_id', ignoreDuplicates: true })
    }
    rows += inserts.length
  }
  return { rows, cost }
}

// Scope volontairement limite au contenu wiki (wiki_table_extract/
// wiki_haiku_extract) -- symetrique de discovery-scan, qui ne surveille lui
// aussi que le wiki. Les ~150 tables de reference NEU-REPO/SkyHanni-REPO
// recoivent tres rarement de nouvelles lignes (leurs propres crons hebdo
// -- neu-sync/skyhanni-repo-sync/wiki-referential-sync -- rafraichissent
// des lignes deja existantes via upsert, pas des insertions massives) --
// non couvert ici pour garder ce cron simple et fiable plutot que
// sur-couvrir un cas rare. A ajouter en phase separee si un vrai residu
// s'accumule (verifiable via `select count(*) from <table> where not
// exists (select 1 from pluton_elements where source_table='<table>' and
// source_row_id=id::text)`).
async function runClassificationPhase(deadline: number) {
  const doneKeys = new Set<string>()
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabase.from('pluton_elements').select('source_table, source_row_id').range(offset, offset + 999)
    if (!data || data.length === 0) break
    for (const r of data) doneKeys.add(`${r.source_table}::${r.source_row_id}`)
    if (data.length < 1000) break
  }
  const doneWte = new Set([...doneKeys].filter(k => k.startsWith('wiki_table_extract::')).map(k => k.split('::')[1]))
  const doneWhe = new Set([...doneKeys].filter(k => k.startsWith('wiki_haiku_extract::')).map(k => k.split('::')[1]))

  const wte = await classifyWikiTableExtractResidual(deadline, doneWte)
  const whe = Date.now() < deadline ? await classifyWikiHaikuExtractResidual(deadline, doneWhe) : { rows: 0, cost: 0 }

  return { wte_rows: wte.rows, whe_rows: whe.rows, classify_cost_usd: wte.cost + whe.cost }
}

// Verifie le residu reel des ~148 tables de reference NEU-REPO/SkyHanni-REPO
// (fonction SQL pluton_referential_residual_check, 21 aout) -- SQL pur, cout
// nul, aucun appel Haiku ici. Ferme le gap documente : ces tables sont
// rafraichies chaque semaine par leurs propres crons mais leur contenu neuf
// n'etait jamais reinjecte dans la classification. Un residu trouve ici est
// juste RAPPORTE (jamais classe automatiquement) -- un vrai residu reste une
// decision de classification a faire manuellement (meme discipline que le
// residu game_drops ferme le 21 aout, 1032 lignes classees a la main),
// jamais delegue a Haiku pour un one-shot que Claude Code peut faire lui-meme.
async function checkReferentialResidual() {
  const { data, error } = await supabase.rpc('pluton_referential_residual_check')
  if (error) return { checked: true, residual_found: false, tables: [], error: error.message }
  return { checked: true, residual_found: (data || []).length > 0, tables: data || [] }
}

// ════════════════════════════════════════════════════════════════════════
export async function runPlutonWeeklySync() {
  const startedAt = Date.now()
  const deadline = startedAt + 260_000 // marge de securite sous maxDuration=300

  const extraction = await runExtractionPhase()
  const classification = await runClassificationPhase(deadline)
  const referentialResidual = await checkReferentialResidual()

  return {
    success: true,
    extraction,
    classification,
    referential_residual: referentialResidual,
    total_cost_usd: extraction.b2_cost_usd + classification.classify_cost_usd,
    duration_ms: Date.now() - startedAt,
  }
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const logId = await startSync('pluton-weekly-sync')
  try {
    const result = await runPlutonWeeklySync()
    const rows = result.extraction.b1_rows + result.classification.wte_rows + result.classification.whe_rows
    await finishSync(logId, 'success', rows, result)
    return NextResponse.json(result)
  } catch (error: any) {
    await finishSync(logId, 'error', 0, undefined, error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
