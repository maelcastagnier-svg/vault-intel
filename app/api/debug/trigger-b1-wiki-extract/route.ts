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
    const { data, error } = await supabase
      .from('game_mechanics_misc')
      .select('id, value')
      .eq('category', 'game_wiki')
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

  // Un flush PAR PAGE, jamais accumulé entre plusieurs pages -- bug réel trouvé en
  // vérifiant après le premier run déployé (11 août) : le batching global (jusqu'à 1000
  // lignes de PLUSIEURS pages consécutives par flush) fait que si UNE ligne d'UNE page
  // viole la contrainte unique, tout le lot entier (potentiellement des centaines de
  // lignes de pages parfaitement correctes) échoue -- et le catch, placé au niveau de
  // la boucle par page, attribue l'erreur à la page en cours de traitement au moment du
  // flush, pas à la vraie page fautive. Résultat mesuré : la route rapportait
  // "39137 lignes insérées" mais la table n'en contenait réellement que 37117 (2020
  // perdues), et les 2 pages "en erreur" rapportées (Melancholic Viking, White Gift)
  // se sont révélées, en retestant isolément, ne contenir AUCUN doublon -- confirmant
  // l'attribution erronée. Comme game_mechanics_misc_id fait partie de la contrainte
  // unique, un doublon ne peut structurellement survenir qu'AU SEIN d'une même page --
  // flush isolé par page garantit donc une attribution exacte de toute erreur future.
  async function insertPageRows(pageId: number, title: string, rows: any[]) {
    if (rows.length === 0) return
    const seenKeys = new Set<string>()
    const deduped: any[] = []
    for (const r of rows) {
      const key = `${r.section_heading}::${r.tab_name}::${r.table_index}::${r.row_index}`
      if (seenKeys.has(key)) { duplicateRowsDropped++; continue }
      seenKeys.add(key)
      deduped.push(r)
    }
    const { error } = await supabase.from('wiki_table_extract').insert(deduped)
    if (error) throw new Error(`insert failed (page ${pageId} "${title}", ${deduped.length} rows): ${error.message}`)
  }

  for (const page of allPages) {
    try {
      const structured = extractStructuredTables(page.content)
      const mobDrops = page.content.includes('Mob Drops Table') ? mobDropsToInsert(page.id, page.title)(page.content) : []
      const toInsert = [...rowsToInsert(page.id, page.title, structured), ...mobDrops]
      if (toInsert.length > 0) {
        pagesWithRows++
        totalRowsToInsert += toInsert.length
        await insertPageRows(page.id, page.title, toInsert)
      } else {
        pagesWithNoRows++
      }
    } catch (e: any) {
      errors.push({ id: page.id, title: page.title, error: String(e?.message ?? e) })
    }
  }

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
