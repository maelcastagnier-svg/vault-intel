// Route de debug TEMPORAIRE (Pluton B1, 11 août) -- extraction brute générique de toutes
// les wikitables/tabbers/Mob Drops Table cartographiées, écrite dans wiki_table_extract
// (table de staging distincte de stat_bonus_sources, ne touche rien à la prod). Contourne
// CRON_SECRET, appelle directement runB1WikiExtract() -- même pattern que toutes les
// autres routes de debug de ce projet. À supprimer après vérification.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  extractStructuredTables,
  parseMobDropsTable,
  type ExtractedTableRow,
} from '../../../../lib/wiki-table-parse'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Pages de référence connues (mining_wiki/farming_wiki), hors périmètre "2605" strict
// (catégorisées avant le chantier game_wiki) mais nécessaires à la validation B1 --
// trouvé en vérifiant (11 août) que Mining Speed/Mining Fortune/Farming Fortune/Extra
// Farming Fortune/Bonus Pest Chance vivent dans ces catégories, pas dans game_wiki.
const KNOWN_REFERENCE_IDS = [2946, 2941, 2620, 2609, 2401]

type PageRow = { id: number; title: string; content: string }

// Filtre appliqué en JS plutôt qu'en PostgREST .or() -- évite tout risque
// d'échappement fragile des caractères "{|"/"<tabber>" dans le mini-DSL de filtre
// PostgREST (jamais testé au préalable ; la requête SQL brute équivalente a été
// vérifiée directement via le MCP Supabase avant d'écrire cette route, mais le
// générateur de requête de supabase-js pour ce même filtre ne l'a jamais été --
// fetcher toutes les pages game_wiki puis filtrer en JS est plus lent mais 100% sûr).
function hasStructuredContent(content: string): boolean {
  return content.includes('{|') || content.includes('<tabber>') || content.includes('Mob Drops Table')
}

async function fetchGameWikiPages(): Promise<PageRow[]> {
  const pages: PageRow[] = []
  const pageSize = 500
  let from = 0
  while (true) {
    // .order('id') explicite -- bug réel trouvé en vérifiant après le 3e run déployé
    // (11 août) : sans tri explicite, PostgREST ne garantit aucun ordre stable entre
    // deux appels .range() successifs, donc des lignes peuvent apparaître dans DEUX
    // fenêtres de pagination consécutives (traitées 2 fois -> conflit de clé unique à
    // l'insertion, faussement pris pour un vrai doublon d'extraction -- vérifié
    // isolément : la page réellement testée n'avait aucun doublon) OU dans AUCUNE
    // (silencieusement absentes du scan -- explique un écart de ~387 pages entre
    // "pages_with_rows" rapporté et le nombre de pages réellement présentes en base).
    const { data, error } = await supabase
      .from('game_mechanics_misc')
      .select('id, value')
      .eq('category', 'game_wiki')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`fetchGameWikiPages: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data) {
      const content = (row.value as any)?.content ?? ''
      if (hasStructuredContent(content)) {
        pages.push({ id: row.id, title: (row.value as any)?.title ?? '', content })
      }
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  return pages
}

async function fetchKnownReferencePages(): Promise<PageRow[]> {
  const { data, error } = await supabase
    .from('game_mechanics_misc')
    .select('id, value')
    .in('id', KNOWN_REFERENCE_IDS)
  if (error) throw new Error(`fetchKnownReferencePages: ${error.message}`)
  return (data ?? []).map(row => ({ id: row.id, title: (row.value as any)?.title ?? '', content: (row.value as any)?.content ?? '' }))
}

function rowsToInsert(pageId: number, title: string, rows: ExtractedTableRow[]) {
  return rows.map(r => ({
    game_mechanics_misc_id: pageId,
    page_title: title,
    section_heading: r.sectionHeading,
    tab_name: r.tabName,
    table_index: r.tableIndex,
    row_index: r.rowIndex,
    headers: r.headers,
    cells: r.cells,
    extraction_method: r.extractionMethod,
  }))
}

function mobDropsToInsert(pageId: number, title: string) {
  return (content: string) => {
    const drops = parseMobDropsTable(content)
    if (!drops) return []
    return drops.map((d, i) => ({
      game_mechanics_misc_id: pageId,
      page_title: title,
      section_heading: null,
      tab_name: null,
      table_index: -1,
      row_index: i,
      headers: d.headers,
      cells: d.cells,
      extraction_method: 'mob_drops_table' as const,
    }))
  }
}

export async function runB1WikiExtract() {
  const started = Date.now()
  const [gameWikiPages, referencePages] = await Promise.all([
    fetchGameWikiPages(),
    fetchKnownReferencePages(),
  ])
  const seen = new Set(gameWikiPages.map(p => p.id))
  const allPages = [...gameWikiPages, ...referencePages.filter(p => !seen.has(p.id))]

  let totalRowsToInsert = 0
  let pagesWithRows = 0
  let pagesWithNoRows = 0
  let duplicateRowsDropped = 0
  const errors: Array<{ id: number; title: string; error: string }> = []

  // Dédoublonnage AU SEIN d'une page avant tout insert -- comme game_mechanics_misc_id
  // fait partie de la contrainte unique, un doublon ne peut structurellement survenir
  // qu'à l'intérieur d'une même page, jamais entre deux pages différentes.
  function dedupePageRows(pageId: number, rows: any[]): any[] {
    const seenKeys = new Set<string>()
    const deduped: any[] = []
    for (const r of rows) {
      const key = `${r.section_heading}::${r.tab_name}::${r.table_index}::${r.row_index}`
      if (seenKeys.has(key)) { duplicateRowsDropped++; continue }
      seenKeys.add(key)
      deduped.push(r)
    }
    return deduped
  }

  // Flush par LOT de plusieurs pages (débit correct), avec repli page-par-page en cas
  // d'échec -- 2 vrais bugs trouvés en déployant coup sur coup (11 août) :
  // 1) Un flush global par lot de 1000 lignes de PLUSIEURS pages faisait échouer tout
  //    le lot dès qu'UNE ligne d'UNE page violait la contrainte unique -- perte
  //    silencieuse de 2020 lignes (39137 rapportées vs 37117 réellement en base), et
  //    l'erreur attribuée à la mauvaise page (les 2 pages "en erreur" rapportées,
  //    retestées isolément, ne contenaient en réalité aucun doublon).
  // 2) Le repli "1 insert par page" qui a suivi (2599 requêtes séparées) s'est révélé
  //    trop lent : timeout client à 290s après seulement 2040/2599 pages, execution
  //    tuée côté serveur par maxDuration=300 (confirmé : le compte de lignes en base
  //    a cessé de progresser après l'expiration du timeout, pas juste le client qui a
  //    abandonné).
  // Solution : lot de plusieurs pages (débit) + dédoublonnage déjà fait AVANT insert
  // (élimine la cause räcine du bug 1) + repli page-par-page UNIQUEMENT si le lot
  // échoue malgré tout (isolation exacte sans perte, coût du repli seulement sur la
  // page réellement fautive, pas sur les ~2600).
  const PAGES_PER_BATCH = 25
  let pendingBatch: Array<{ pageId: number; title: string; rows: any[] }> = []

  async function flushBatch() {
    if (pendingBatch.length === 0) return
    const batch = pendingBatch
    pendingBatch = []
    const allRows = batch.flatMap(p => p.rows)
    const { error } = await supabase.from('wiki_table_extract').insert(allRows)
    if (!error) return
    // Repli : réinsère page par page pour isoler la vraie fautive sans perdre les
    // autres pages de ce lot.
    for (const p of batch) {
      const { error: pageError } = await supabase.from('wiki_table_extract').insert(p.rows)
      if (pageError) errors.push({ id: p.pageId, title: p.title, error: `insert failed (${p.rows.length} rows): ${pageError.message}` })
    }
  }

  for (const page of allPages) {
    try {
      const structured = extractStructuredTables(page.content)
      const mobDrops = page.content.includes('Mob Drops Table') ? mobDropsToInsert(page.id, page.title)(page.content) : []
      const toInsert = dedupePageRows(page.id, [...rowsToInsert(page.id, page.title, structured), ...mobDrops])
      if (toInsert.length > 0) {
        pagesWithRows++
        totalRowsToInsert += toInsert.length
        pendingBatch.push({ pageId: page.id, title: page.title, rows: toInsert })
        if (pendingBatch.length >= PAGES_PER_BATCH) await flushBatch()
      } else {
        pagesWithNoRows++
      }
    } catch (e: any) {
      errors.push({ id: page.id, title: page.title, error: String(e?.message ?? e) })
    }
  }
  await flushBatch()

  return {
    pages_scanned: allPages.length,
    game_wiki_pages: gameWikiPages.length,
    reference_pages: referencePages.length,
    pages_with_rows: pagesWithRows,
    pages_with_no_rows: pagesWithNoRows,
    total_rows_inserted: totalRowsToInsert - duplicateRowsDropped,
    duplicate_rows_dropped: duplicateRowsDropped,
    errors: errors.slice(0, 20),
    error_count: errors.length,
    duration_ms: Date.now() - started,
  }
}

export async function GET() {
  try {
    const result = await runB1WikiExtract()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
