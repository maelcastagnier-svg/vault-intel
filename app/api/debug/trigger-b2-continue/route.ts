// Route de debug TEMPORAIRE (Pluton B2, reprise 11 aout) -- pool de pages en attente
// recalcule proprement (unifie B1+B2 : toute page game_wiki sans ligne B1 ET jamais
// traitee avec succes par B2), plutot que l'ancien predicat statique qui ratait les
// pages routees aujourd'hui depuis B1 (bug tabber-sans-table + contenu tronque).
// Meme prompt/schema/garde-fous deja valides (skip <500 car, exclusion deterministe
// Changelog/*, max_tokens 4096) -- seul le calcul du pool "pending" change.
// Limite par defaut basse (15) pour test de cout avant tout engagement plus large.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CONTENT_CHAR_CAP = 4000
const MIN_CONTENT_LENGTH = 500
const DEFAULT_LIMIT = 15

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
type PageRow = { id: number; title: string; content: string }

async function callHaiku(content: string): Promise<{ parsed: HaikuResult; inputTokens: number; outputTokens: number; raw: string }> {
  const truncated = content.length > CONTENT_CHAR_CAP ? content.slice(0, CONTENT_CHAR_CAP) : content
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: truncated }],
      output_config: { format: { type: 'json_schema', schema: HAIKU_EXTRACT_SCHEMA } },
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Haiku API ${res.status}: ${errText.slice(0, 500)}`)
  }
  const data = await res.json()
  const raw = data?.content?.[0]?.text ?? ''
  let parsed: HaikuResult
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`JSON parse failed on Haiku output: ${String(e)} -- raw: ${raw.slice(0, 300)}`)
  }
  return { parsed, inputTokens: data?.usage?.input_tokens ?? 0, outputTokens: data?.usage?.output_tokens ?? 0, raw }
}

export async function GET(req: NextRequest) {
  try {
    const limit = req.nextUrl.searchParams.get('limit') ? parseInt(req.nextUrl.searchParams.get('limit')!, 10) : DEFAULT_LIMIT
    const started = Date.now()

    // 1) Pages avec au moins 1 ligne B1 -- pagine (wiki_table_extract depasse le
    // plafond implicite PostgREST, meme piege que trigger-b1-retry corrige plus tot).
    const b1DoneIds = new Set<number>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('wiki_table_extract').select('game_mechanics_misc_id').order('game_mechanics_misc_id', { ascending: true }).range(offset, offset + 999)
      if (error) throw new Error(`fetch b1DoneIds: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data) b1DoneIds.add(r.game_mechanics_misc_id)
      if (data.length < 1000) break
    }

    // 2) Pages deja traitees avec succes par B2 (error is null) -- pagine par prudence.
    const b2DoneIds = new Set<number>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('wiki_haiku_extract').select('game_mechanics_misc_id').is('error', null).order('game_mechanics_misc_id', { ascending: true }).range(offset, offset + 999)
      if (error) throw new Error(`fetch b2DoneIds: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data) b2DoneIds.add(r.game_mechanics_misc_id)
      if (data.length < 1000) break
    }

    // 3) Toutes les pages game_wiki -- pagine.
    const allPages: PageRow[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('game_mechanics_misc').select('id, value').eq('category', 'game_wiki').order('id', { ascending: true }).range(offset, offset + 999)
      if (error) throw new Error(`fetch allPages: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data) allPages.push({ id: r.id, title: (r.value as any)?.title ?? '', content: (r.value as any)?.content ?? '' })
      if (data.length < 1000) break
    }

    const pending = allPages.filter(p => !b1DoneIds.has(p.id) && !b2DoneIds.has(p.id))

    // Tier 0 -- trop courte, cout nul.
    const tooShort = pending.filter(p => p.content.length < MIN_CONTENT_LENGTH)
    if (tooShort.length > 0) {
      for (let i = 0; i < tooShort.length; i += 500) {
        await supabase.from('wiki_haiku_extract').upsert(
          tooShort.slice(i, i + 500).map(p => ({ game_mechanics_misc_id: p.id, page_title: p.title, extractable: false, entries: [], model: 'skip_too_short_filter', error: null })),
          { onConflict: 'game_mechanics_misc_id' }
        )
      }
    }

    // Tier 0b -- Changelog/* exclu deterministiquement (deltas historiques, pas l'etat courant).
    const changelog = pending.filter(p => p.content.length >= MIN_CONTENT_LENGTH && p.title.startsWith('Changelog/'))
    if (changelog.length > 0) {
      for (let i = 0; i < changelog.length; i += 500) {
        await supabase.from('wiki_haiku_extract').upsert(
          changelog.slice(i, i + 500).map(p => ({ game_mechanics_misc_id: p.id, page_title: p.title, extractable: false, entries: [], model: 'skip_changelog_filter', error: null })),
          { onConflict: 'game_mechanics_misc_id' }
        )
      }
    }

    const toCall = pending.filter(p => p.content.length >= MIN_CONTENT_LENGTH && !p.title.startsWith('Changelog/'))
    const toProcess = toCall.slice(0, limit)

    let extractableCount = 0, totalEntries = 0, totalInputTokens = 0, totalOutputTokens = 0
    const errors: Array<{ id: number; title: string; error: string }> = []
    const results: Array<{ id: number; title: string; extractable: boolean; entries_count: number }> = []

    for (const page of toProcess) {
      try {
        const { parsed, inputTokens, outputTokens, raw } = await callHaiku(page.content)
        totalInputTokens += inputTokens
        totalOutputTokens += outputTokens
        if (parsed.extractable) { extractableCount++; totalEntries += parsed.entries.length }
        results.push({ id: page.id, title: page.title, extractable: parsed.extractable, entries_count: parsed.entries.length })
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
    }

    const costUsd = (totalInputTokens / 1_000_000) * 1.0 + (totalOutputTokens / 1_000_000) * 5.0

    return NextResponse.json({
      success: true,
      pending_total: pending.length,
      skipped_too_short: tooShort.length,
      skipped_changelog: changelog.length,
      remaining_to_call: toCall.length,
      processed_this_run: toProcess.length,
      remaining_after_this_run: toCall.length - toProcess.length,
      extractable_count: extractableCount,
      total_entries: totalEntries,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      real_cost_usd: costUsd,
      real_cost_per_page_usd: toProcess.length > 0 ? costUsd / toProcess.length : 0,
      errors,
      error_count: errors.length,
      results,
      duration_ms: Date.now() - started,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
