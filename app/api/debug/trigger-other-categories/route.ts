// Route de debug TEMPORAIRE (Pluton, 11 aout) -- extension B1+B2 aux 19 categories
// wiki deja cartographiees mais jamais passees par le pipeline d'extraction (
// accessory_wiki, armor_set, weapon, enchant_wiki, farming_wiki, mining_wiki,
// minion_wiki, dungeon_wiki, mayor_wiki, fishing_wiki, slayer_wiki, mob_wiki,
// kuudra_wiki, economy_wiki, wiki_guide, gemstone_wiki, skill_wiki, foraging_wiki,
// reforge_wiki -- 1674 pages avec du vrai contenu, confirme par requete directe).
// Meme logique deja validee sur game_wiki : B1 mecanique (gratuit) d'abord, puis
// Haiku uniquement sur ce qui reste a 0 ligne. wiki_table_extract/wiki_haiku_extract
// sont deja generiques sur game_mechanics_misc_id -- pas de nouvelle table.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractStructuredTables, parseMobDropsTable } from '../../../../lib/wiki-table-parse'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const OTHER_CATEGORIES = [
  'accessory_wiki', 'armor_set', 'weapon', 'enchant_wiki', 'farming_wiki',
  'mining_wiki', 'minion_wiki', 'dungeon_wiki', 'mayor_wiki', 'fishing_wiki',
  'slayer_wiki', 'mob_wiki', 'kuudra_wiki', 'economy_wiki', 'wiki_guide',
  'gemstone_wiki', 'skill_wiki', 'foraging_wiki', 'reforge_wiki',
]

const CONTENT_CHAR_CAP = 4000
const MIN_CONTENT_LENGTH = 500
const DEFAULT_B2_LIMIT = 1500

const SYSTEM_PROMPT = `Tu analyses une page du wiki Hypixel Skyblock qui NE CONTIENT AUCUNE wikitable structurée (les vraies wikitables ont déjà été extraites séparément par un parseur mécanique). Ta tâche : déterminer si cette page décrit, en PROSE, un bonus numérique réel à une statistique de joueur (Mining Speed, Mining Fortune, Farming Fortune, Crop Fortune, stats de combat, etc.) accordé par un objet, un pet, un enchantement, une mécanique de jeu, etc.

Règles strictes :
- N'invente RIEN. Si la page ne décrit aucun bonus de stat chiffré, réponds extractable=false, entries=[].
- N'extrait QUE des bonus numériques explicites présents dans le texte (ex: "+25 Mining Speed", "grants 10% more damage", "increases Farming Fortune by 5"). Ignore les mécaniques sans chiffre, le lore, les captures d'interface.
- Une page d'interface (UI), une page de désambiguïsation, une page cosmétique sans effet de jeu -> extractable=false systématiquement, même si elle contient des chiffres non liés à un bonus de stat (dates, prix, ids).
- Pour chaque bonus trouvé, remplis : source_label (nom de l'objet/pet/mécanique qui donne ce bonus), stat_name_guess (nom de la stat affectée, tel qu'écrit dans le texte), bonus_raw (texte exact du bonus, ex "+25" ou "10%"), condition_note (toute condition -- rareté, niveau, zone -- ou chaîne vide si aucune), confidence (high si le chiffre est explicite et non ambigu, low si tu dois interpréter).`

const HAIKU_EXTRACT_SCHEMA = {
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

type HaikuResult = { extractable: boolean; entries: Array<{ source_label: string; stat_name_guess: string; bonus_raw: string; condition_note: string; confidence: string }> }
type PageRow = { id: number; title: string; content: string; category: string }

async function callHaiku(content: string) {
  const truncated = content.length > CONTENT_CHAR_CAP ? content.slice(0, CONTENT_CHAR_CAP) : content
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: truncated }],
      output_config: { format: { type: 'json_schema', schema: HAIKU_EXTRACT_SCHEMA } },
    }),
  })
  if (!res.ok) throw new Error(`Haiku API ${res.status}: ${(await res.text()).slice(0, 500)}`)
  const data = await res.json()
  const raw = data?.content?.[0]?.text ?? ''
  let parsed: HaikuResult
  try { parsed = JSON.parse(raw) } catch (e) { throw new Error(`JSON parse failed: ${String(e)} -- raw: ${raw.slice(0, 300)}`) }
  return { parsed, inputTokens: data?.usage?.input_tokens ?? 0, outputTokens: data?.usage?.output_tokens ?? 0, raw }
}

type ExtractRow = { game_mechanics_misc_id: number; page_title: string; section_heading: string | null; tab_name: string | null; table_index: number; row_index: number; headers: string[]; cells: string[]; extraction_method: string }

function buildB1RowsForPage(p: PageRow): ExtractRow[] {
  const out: ExtractRow[] = []
  for (const r of extractStructuredTables(p.content)) {
    out.push({ game_mechanics_misc_id: p.id, page_title: p.title, section_heading: r.sectionHeading, tab_name: r.tabName, table_index: r.tableIndex, row_index: r.rowIndex, headers: r.headers, cells: r.cells, extraction_method: r.extractionMethod })
  }
  if (p.content.includes('Mob Drops Table')) {
    const mobRows = parseMobDropsTable(p.content) ?? []
    mobRows.forEach((r, i) => out.push({ game_mechanics_misc_id: p.id, page_title: p.title, section_heading: null, tab_name: null, table_index: 0, row_index: i, headers: [r.slotLabel, ...r.headers], cells: [r.slotLabel, ...r.cells], extraction_method: 'mob_drops_table' }))
  }
  return out
}

export async function GET(req: NextRequest) {
  try {
    const b2Limit = req.nextUrl.searchParams.get('b2limit') ? parseInt(req.nextUrl.searchParams.get('b2limit')!, 10) : DEFAULT_B2_LIMIT
    const skipB2 = req.nextUrl.searchParams.get('skipB2') === '1'
    const started = Date.now()

    // 1) Toutes les pages des 19 categories, paginees.
    const allPages: PageRow[] = []
    for (const cat of OTHER_CATEGORIES) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('game_mechanics_misc').select('id, value').eq('category', cat).order('id', { ascending: true }).range(offset, offset + 999)
        if (error) throw new Error(`fetch ${cat}: ${error.message}`)
        if (!data || data.length === 0) break
        for (const r of data) {
          const content = (r.value as any)?.content ?? ''
          if (content.length > 0) allPages.push({ id: r.id, title: (r.value as any)?.title ?? '', content, category: cat })
        }
        if (data.length < 1000) break
      }
    }

    // 2) Deja fait (B1) -- pagine.
    const b1DoneIds = new Set<number>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('wiki_table_extract').select('game_mechanics_misc_id').order('game_mechanics_misc_id', { ascending: true }).range(offset, offset + 999)
      if (error) throw new Error(`fetch b1DoneIds: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data) b1DoneIds.add(r.game_mechanics_misc_id)
      if (data.length < 1000) break
    }

    const b1Pending = allPages.filter(p => !b1DoneIds.has(p.id))

    // 3) B1 -- lots de 25 pages par insert, repli page-par-page si le lot echoue.
    let b1PagesWithRows = 0, b1RowsInserted = 0
    const b1StillZero: PageRow[] = []
    for (let i = 0; i < b1Pending.length; i += 25) {
      const batch = b1Pending.slice(i, i + 25)
      const batchRows: ExtractRow[] = []
      for (const p of batch) {
        const rows = buildB1RowsForPage(p)
        if (rows.length > 0) { b1PagesWithRows++; b1RowsInserted += rows.length; batchRows.push(...rows) }
        else b1StillZero.push(p)
      }
      if (batchRows.length === 0) continue
      const { error } = await supabase.from('wiki_table_extract').insert(batchRows)
      if (error) {
        for (const p of batch) {
          const rows = buildB1RowsForPage(p)
          if (rows.length === 0) continue
          await supabase.from('wiki_table_extract').insert(rows)
        }
      }
    }

    // 4) B2 -- Haiku sur tout ce qui reste a 0 ligne B1 (incluant les pages deja a 0
    // AVANT ce run, pas seulement b1StillZero de cette passe -- recalcule proprement).
    const allB1DoneAfter = new Set(b1DoneIds)
    for (const p of b1Pending) if (!b1StillZero.includes(p)) allB1DoneAfter.add(p.id)

    let b2Result: any = { skipped: true }
    if (!skipB2) {
      const b2DoneIds = new Set<number>()
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('wiki_haiku_extract').select('game_mechanics_misc_id').is('error', null).order('game_mechanics_misc_id', { ascending: true }).range(offset, offset + 999)
        if (error) throw new Error(`fetch b2DoneIds: ${error.message}`)
        if (!data || data.length === 0) break
        for (const r of data) b2DoneIds.add(r.game_mechanics_misc_id)
        if (data.length < 1000) break
      }

      const b2Pending = allPages.filter(p => !allB1DoneAfter.has(p.id) && !b2DoneIds.has(p.id))
      const tooShort = b2Pending.filter(p => p.content.length < MIN_CONTENT_LENGTH)
      if (tooShort.length > 0) {
        for (let i = 0; i < tooShort.length; i += 500) {
          await supabase.from('wiki_haiku_extract').upsert(
            tooShort.slice(i, i + 500).map(p => ({ game_mechanics_misc_id: p.id, page_title: p.title, extractable: false, entries: [], model: 'skip_too_short_filter', error: null })),
            { onConflict: 'game_mechanics_misc_id' }
          )
        }
      }
      const toCall = b2Pending.filter(p => p.content.length >= MIN_CONTENT_LENGTH)
      const toProcess = toCall.slice(0, b2Limit)

      let extractableCount = 0, totalEntries = 0, totalInputTokens = 0, totalOutputTokens = 0
      const errors: Array<{ id: number; title: string; error: string }> = []
      const PARALLEL_BATCH = 25
      for (let i = 0; i < toProcess.length; i += PARALLEL_BATCH) {
        const batch = toProcess.slice(i, i + PARALLEL_BATCH)
        await Promise.all(batch.map(async page => {
          try {
            const { parsed, inputTokens, outputTokens, raw } = await callHaiku(page.content)
            totalInputTokens += inputTokens
            totalOutputTokens += outputTokens
            if (parsed.extractable) { extractableCount++; totalEntries += parsed.entries.length }
            const { error } = await supabase.from('wiki_haiku_extract').upsert(
              { game_mechanics_misc_id: page.id, page_title: page.title, extractable: parsed.extractable, entries: parsed.entries, model: 'claude-haiku-4-5', input_tokens: inputTokens, output_tokens: outputTokens, raw_response: raw, error: null },
              { onConflict: 'game_mechanics_misc_id' }
            )
            if (error) throw new Error(`upsert: ${error.message}`)
          } catch (e: any) {
            errors.push({ id: page.id, title: page.title, error: String(e?.message ?? e) })
            await supabase.from('wiki_haiku_extract').upsert(
              { game_mechanics_misc_id: page.id, page_title: page.title, extractable: false, entries: [], model: 'claude-haiku-4-5', error: String(e?.message ?? e) },
              { onConflict: 'game_mechanics_misc_id' }
            )
          }
        }))
      }
      const costUsd = (totalInputTokens / 1_000_000) * 1.0 + (totalOutputTokens / 1_000_000) * 5.0
      b2Result = {
        pending_total: b2Pending.length,
        skipped_too_short: tooShort.length,
        remaining_to_call: toCall.length,
        processed_this_run: toProcess.length,
        remaining_after_this_run: toCall.length - toProcess.length,
        extractable_count: extractableCount,
        total_entries: totalEntries,
        real_cost_usd: costUsd,
        error_count: errors.length,
        errors: errors.slice(0, 10),
      }
    }

    return NextResponse.json({
      success: true,
      total_pages_scanned: allPages.length,
      by_category: OTHER_CATEGORIES.map(c => ({ category: c, count: allPages.filter(p => p.category === c).length })),
      b1: { pending_before: b1Pending.length, pages_with_rows: b1PagesWithRows, rows_inserted: b1RowsInserted, still_zero: b1StillZero.length },
      b2: b2Result,
      duration_ms: Date.now() - started,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
