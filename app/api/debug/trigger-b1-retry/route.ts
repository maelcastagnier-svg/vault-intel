// Route de debug TEMPORAIRE (Pluton B1, 11 aout) -- reprend les pages "structurees"
// (predicat {|/tabber/Mob Drops Table) qui avaient produit 0 ligne lors du run initial,
// maintenant que les 2 vrais bugs parseur (faux |} via {{{param|default}}}, template-par-
// ligne avec vrais |-) sont corriges. Meme pattern que trigger-b1-wiki-extract (deja
// supprimee apres verification) -- lots de 25 pages avec repli page-par-page. A supprimer
// apres verification.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractStructuredTables, parseMobDropsTable } from '../../../../lib/wiki-table-parse'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type PendingRow = { id: number; title: string; content: string }
type ExtractRow = {
  game_mechanics_misc_id: number
  page_title: string
  section_heading: string | null
  tab_name: string | null
  table_index: number
  row_index: number
  headers: string[]
  cells: string[]
  extraction_method: string
}

function buildRowsForPage(p: PendingRow): ExtractRow[] {
  const out: ExtractRow[] = []
  for (const r of extractStructuredTables(p.content)) {
    out.push({
      game_mechanics_misc_id: p.id,
      page_title: p.title,
      section_heading: r.sectionHeading,
      tab_name: r.tabName,
      table_index: r.tableIndex,
      row_index: r.rowIndex,
      headers: r.headers,
      cells: r.cells,
      extraction_method: r.extractionMethod,
    })
  }
  if (p.content.includes('Mob Drops Table')) {
    const mobRows = parseMobDropsTable(p.content) ?? []
    mobRows.forEach((r, i) => {
      out.push({
        game_mechanics_misc_id: p.id,
        page_title: p.title,
        section_heading: null,
        tab_name: null,
        table_index: 0,
        row_index: i,
        headers: [r.slotLabel, ...r.headers],
        cells: [r.slotLabel, ...r.cells],
        extraction_method: 'mob_drops_table',
      })
    })
  }
  // Dédoublonnage défensif avant insertion -- même discipline que le run B1 initial.
  const seen = new Set<string>()
  return out.filter(r => {
    const key = `${r.section_heading}::${r.tab_name}::${r.table_index}::${r.row_index}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function GET(req: NextRequest) {
  try {
    const debugId = req.nextUrl.searchParams.get('debugId')
    if (debugId) {
      const { data, error } = await supabase.from('game_mechanics_misc').select('id, value').eq('id', Number(debugId)).single()
      if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 })
      const p: PendingRow = { id: data.id, title: (data.value as any)?.title ?? '', content: (data.value as any)?.content ?? '' }
      const rows = buildRowsForPage(p)
      const seen = new Map<string, ExtractRow>()
      const dups: Array<{ key: string; a: ExtractRow; b: ExtractRow }> = []
      for (const r of rows) {
        const key = `${r.section_heading}::${r.tab_name}::${r.table_index}::${r.row_index}`
        if (seen.has(key)) dups.push({ key, a: seen.get(key)!, b: r })
        seen.set(key, r)
      }
      const { data: existing } = await supabase.from('wiki_table_extract').select('*').eq('game_mechanics_misc_id', Number(debugId))
      return NextResponse.json({ computed_rows: rows.length, dups, existing_rows_in_db: existing?.length ?? 0, existing_sample: existing?.slice(0, 3) })
    }
    // Fetch en JS (pas de filtre ilike sur jsonb côté PostgREST -- trop fragile/risqué de
    // deviner la syntaxe exacte sans la route d'origine sous les yeux) : pagine tout
    // game_wiki (6546 lignes, 7 pages de 1000) et filtre le prédicat structurel en JS.
    const allPages: Array<{ id: number; title: string; content: string }> = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from('game_mechanics_misc')
        .select('id, value')
        .eq('category', 'game_wiki')
        .order('id', { ascending: true })
        .range(offset, offset + 999)
      if (error) throw new Error(`fetch page_wiki: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data) allPages.push({ id: r.id, title: (r.value as any)?.title ?? '', content: (r.value as any)?.content ?? '' })
      if (data.length < 1000) break
    }

    const structuralPredicate = (content: string) =>
      content.includes('{|') || content.includes('<tabber>') || content.includes('Mob Drops Table')

    // Meme piege de troncature deja rencontre plusieurs fois aujourd'hui (defaut
    // PostgREST ~1000 lignes) : wiki_table_extract a >39000 lignes, un .select() sans
    // .range() ne renvoyait qu'une fraction des page_id deja traites -- "Ferocity"
    // (id 6484, 34 lignes deja reelles depuis le run B1 original) et 78 autres pages
    // deja completes se retrouvaient donc a tort dans `pending`, retentees, et
    // entraient en collision avec leurs propres lignes deja existantes (collision
    // garantie, pas aleatoire -- meme table_index/row_index reproduits a l'identique).
    const doneIds = new Set<number>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from('wiki_table_extract')
        .select('game_mechanics_misc_id')
        .order('game_mechanics_misc_id', { ascending: true })
        .range(offset, offset + 999)
      if (error) throw new Error(`fetch doneIds: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data) doneIds.add(r.game_mechanics_misc_id)
      if (data.length < 1000) break
    }

    const pending: PendingRow[] = allPages.filter(p => structuralPredicate(p.content) && !doneIds.has(p.id))

    let pagesWithRows = 0
    let totalRows = 0
    const stillZero: Array<{ id: number; title: string }> = []
    const errors: Array<{ id: number; title: string; error: string }> = []

    for (let i = 0; i < pending.length; i += 25) {
      const batch = pending.slice(i, i + 25)
      const batchRows: ExtractRow[] = []
      for (const p of batch) {
        const rows = buildRowsForPage(p)
        if (rows.length > 0) { pagesWithRows++; totalRows += rows.length; batchRows.push(...rows) }
        else stillZero.push({ id: p.id, title: p.title })
      }
      if (batchRows.length === 0) continue
      const { error } = await supabase.from('wiki_table_extract').insert(batchRows)
      if (error) {
        // Repli page par page -- isole exactement la page fautive plutôt que perdre tout le lot.
        for (const p of batch) {
          const rows = buildRowsForPage(p)
          if (rows.length === 0) continue
          const { error: pageErr } = await supabase.from('wiki_table_extract').insert(rows)
          if (pageErr) errors.push({ id: p.id, title: p.title, error: pageErr.message })
        }
      }
    }

    return NextResponse.json({
      success: true,
      pending_total: pending.length,
      pages_with_rows: pagesWithRows,
      total_rows_inserted: totalRows,
      still_zero_count: stillZero.length,
      still_zero_sample: stillZero.slice(0, 20),
      error_count: errors.length,
      errors: errors.slice(0, 10),
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
