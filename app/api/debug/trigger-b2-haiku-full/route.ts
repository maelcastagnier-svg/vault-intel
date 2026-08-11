// Route de debug TEMPORAIRE (Pluton B2, 11 août) -- lancement complet sur les ~3938
// pages sans wikitable/tabber/Mob Drops Table (déjà couvertes par B1). Reprend les 2
// corrections validées sur le lot test de 50 pages (wiki_haiku_extract) :
// max_tokens=4096, exclusion déterministe des pages Changelog/* par titre (457 pages,
// ~11,6%, jamais envoyées à Haiku). Nouveau ici : concurrence bornée (25 appels Haiku en
// parallèle) -- ~3483 vraies pages à appeler, ~1,46s/appel mesuré sur le lot test
// séquentiel -> ~85 min en séquentiel, hors de portée d'une seule invocation
// (maxDuration=300s) -- 25 en parallèle ramène l'estimation à ~200s. À supprimer après
// vérification.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CONTENT_CHAR_CAP = 6000
const CONCURRENCY = 25

function hasStructuredContent(content: string): boolean {
  return content.includes('{|') || content.includes('<tabber>') || content.includes('Mob Drops Table')
}

const SYSTEM_PROMPT = `Tu analyses une page du wiki Hypixel Skyblock qui NE CONTIENT AUCUNE wikitable structurée (les vraies wikitables ont déjà été extraites séparément par un parseur mécanique). Ta tâche : déterminer si cette page décrit, en PROSE, un bonus numérique réel à une statistique de joueur (Mining Speed, Mining Fortune, Farming Fortune, Crop Fortune, stats de combat, etc.) accordé par un objet, un pet, un enchantement, une mécanique de jeu, etc.

Règles strictes :
- N'invente RIEN. Si la page ne décrit aucun bonus de stat chiffré, réponds extractable=false, entries=[].
- N'extrait QUE des bonus numériques explicites présents dans le texte (ex: "+25 Mining Speed", "grants 10% more damage", "increases Farming Fortune by 5"). Ignore les mécaniques sans chiffre, le lore, les changelogs, les captures d'interface.
- Une page de changelog, une page d'interface (UI), une page de désambiguïsation, une page cosmétique sans effet de jeu -> extractable=false systématiquement, même si elle contient des chiffres non liés à un bonus de stat (dates, prix, ids).
- Pour chaque bonus trouvé, remplis : source_label (nom de l'objet/pet/mécanique qui donne ce bonus), stat_name_guess (nom de la stat affectée, tel qu'écrit dans le texte), bonus_raw (texte exact du bonus, ex "+25" ou "10%"), condition_note (toute condition -- rareté, niveau, zone -- ou chaîne vide si aucune), confidence (high si le chiffre est explicite et non ambigu, low si tu dois interpréter).
- Réponds UNIQUEMENT le JSON demandé, rien d'autre.`

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

async function fetchNoTablePages(): Promise<PageRow[]> {
  const pages: PageRow[] = []
  const pageSize = 500
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('game_mechanics_misc')
      .select('id, value')
      .eq('category', 'game_wiki')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`fetchNoTablePages: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data) {
      const content = (row.value as any)?.content ?? ''
      if (!hasStructuredContent(content)) {
        pages.push({ id: row.id, title: (row.value as any)?.title ?? '', content })
      }
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  return pages
}

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

async function processPage(page: PageRow, stats: {
  extractableCount: number; notExtractableCount: number; totalEntries: number
  totalInputTokens: number; totalOutputTokens: number
  errors: Array<{ id: number; title: string; error: string }>
}) {
  try {
    const { parsed, inputTokens, outputTokens, raw } = await callHaiku(page.content)
    stats.totalInputTokens += inputTokens
    stats.totalOutputTokens += outputTokens
    if (parsed.extractable) { stats.extractableCount++; stats.totalEntries += parsed.entries.length } else { stats.notExtractableCount++ }
    const { error } = await supabase.from('wiki_haiku_extract').upsert({
      game_mechanics_misc_id: page.id,
      page_title: page.title,
      extractable: parsed.extractable,
      entries: parsed.entries,
      model: 'claude-haiku-4-5',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      raw_response: raw,
      error: null,
    }, { onConflict: 'game_mechanics_misc_id' })
    if (error) throw new Error(`upsert: ${error.message}`)
  } catch (e: any) {
    stats.errors.push({ id: page.id, title: page.title, error: String(e?.message ?? e) })
    await supabase.from('wiki_haiku_extract').upsert({
      game_mechanics_misc_id: page.id,
      page_title: page.title,
      extractable: false,
      entries: [],
      model: 'claude-haiku-4-5',
      error: String(e?.message ?? e),
    }, { onConflict: 'game_mechanics_misc_id' })
  }
}

export async function runB2HaikuFull() {
  const started = Date.now()
  const allPages = await fetchNoTablePages()

  // Reprise : ignore les pages déjà présentes en base -- bug de timeout réel trouvé
  // en déployant (11 août, même piège que B1) : le run précédent a été tué par
  // maxDuration=300 à 3462/3938 pages (88%). Sans reprise, relancer refait tout le
  // travail déjà correct (upsert idempotent mais lent, même risque de re-timeout
  // avant la fin). Comme upsert écrase sans distinguer "déjà bon" de "à refaire",
  // sauter les IDs déjà présents est la seule façon de finir le reste dans le budget.
  const { data: existingRows } = await supabase.from('wiki_haiku_extract').select('game_mechanics_misc_id')
  const alreadyDone = new Set((existingRows ?? []).map(r => r.game_mechanics_misc_id))
  const pendingPages = allPages.filter(p => !alreadyDone.has(p.id))

  const changelogPages = pendingPages.filter(p => p.title.startsWith('Changelog/'))
  const haikuPages = pendingPages.filter(p => !p.title.startsWith('Changelog/'))

  // Changelog : exclusion déterministe, aucun appel Haiku (voir commit précédent pour
  // le raisonnement complet -- deltas historiques ponctuels, pas l'état courant).
  // Un seul insert en lot -- bug de perf réel trouvé sur le run précédent : 457 upserts
  // séquentiels (1 page = 1 aller-retour DB attendu) avant même de commencer Haiku,
  // du temps perdu pour un travail qui devrait être quasi instantané.
  if (changelogPages.length > 0) {
    await supabase.from('wiki_haiku_extract').insert(changelogPages.map(p => ({
      game_mechanics_misc_id: p.id,
      page_title: p.title,
      extractable: false,
      entries: [],
      model: 'skip_changelog_title_filter',
      error: null,
    })))
  }

  const stats = {
    extractableCount: 0,
    notExtractableCount: changelogPages.length,
    totalEntries: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    errors: [] as Array<{ id: number; title: string; error: string }>,
  }

  for (let i = 0; i < haikuPages.length; i += CONCURRENCY) {
    const chunk = haikuPages.slice(i, i + CONCURRENCY)
    await Promise.all(chunk.map(p => processPage(p, stats)))
  }

  return {
    total_pages: allPages.length,
    changelog_skipped: changelogPages.length,
    haiku_pages: haikuPages.length,
    extractable_count: stats.extractableCount,
    not_extractable_count: stats.notExtractableCount,
    total_entries: stats.totalEntries,
    total_input_tokens: stats.totalInputTokens,
    total_output_tokens: stats.totalOutputTokens,
    estimated_cost_usd: (stats.totalInputTokens / 1_000_000) * 1.0 + (stats.totalOutputTokens / 1_000_000) * 5.0,
    errors: stats.errors.slice(0, 30),
    error_count: stats.errors.length,
    duration_ms: Date.now() - started,
  }
}

export async function GET() {
  try {
    const result = await runB2HaikuFull()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
