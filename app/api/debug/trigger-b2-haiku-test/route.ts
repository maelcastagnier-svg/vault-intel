// Route de debug TEMPORAIRE (Pluton B2, 11 août) -- lot test de 50 pages Haiku avant le
// lancement complet sur les ~3952 pages sans wikitable/tabber/Mob Drops Table (déjà
// couvertes par B1/wiki_table_extract). Écrit dans wiki_haiku_extract (staging, distincte
// de stat_bonus_sources -- même principe que B1). Contourne CRON_SECRET, appelle
// directement runB2HaikuTest() -- même pattern que toutes les routes de debug de ce
// projet. Suit la convention déjà établie du projet (fetch brut vers l'API Anthropic,
// pas le SDK -- voir money-making-agent/radar-agent/etc, aucun autre cron n'utilise le
// SDK). À supprimer après vérification.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Échantillon stratifié tiré des ~3952 pages "sans wikitable" (11 août) : 10 pages
// contenant un template {{Stat|...}} inline en prose (fort signal de bonus réel caché,
// non capturé par B1 qui ne lit que les vraies wikitables), 10 pages très courtes
// (<500 caractères, attendu : quasi toutes extractable=false), 20 pages de longueur
// médiane (le gros du corpus), 10 pages longues/très longues (stress-test de la
// troncature -- vérifie qu'aucune vraie donnée n'est perdue avant le cap).
const TEST_PAGE_IDS = [
  9149, 5327, 8809, 7289, 6446, 6686, 6559, 25971, 7835, 6431,
  5279, 8280, 22067, 24675, 8479, 4720, 8991, 9171, 4714, 13263,
  27496, 8835, 6713, 5821, 6319, 5068, 4799, 8575, 23074, 8095,
  9545, 9335, 26435, 7438, 7701, 4704, 9364, 8320, 26928, 9507,
  5531, 5482, 24983, 5339, 5184, 5337, 8114, 8302, 5402, 39758,
]

// Cap de troncature -- bug de coût réel trouvé en préparant l'échantillon : plusieurs
// pages "sans table" (Changelog/*, */UI) font 40 000 à 210 000 caractères (bien au-delà
// de la moyenne 2372,71 caractères utilisée dans le chiffrage 0ter, qui sous-estimait
// donc la vraie queue longue). Ce sont exactement les pages déjà confirmées comme
// contenu non structuré (UI/changelog) lors de l'échantillonnage précédent -- si une
// page n'a montré aucune donnée de stat en 6000 caractères, la suite (souvent du JSON
// d'interface ou une liste d'entrées de changelog répétitives) n'en contient pas non
// plus. Documenté ici, pas une troncature silencieuse.
const CONTENT_CHAR_CAP = 6000

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

type HaikuResult = {
  extractable: boolean
  entries: Array<{ source_label: string; stat_name_guess: string; bonus_raw: string; condition_note: string; confidence: string }>
}

// max_tokens 1024 -> 4096 : bug réel trouvé sur le 1er lot test (50 pages, 11 août) --
// 2 pages ("Changelog/2022/September 28", "Hunting Fortune") ont un nombre légitimement
// élevé d'entrées réelles (Hunting Fortune : plusieurs vraies sources de Hunter
// Fortune) et le JSON s'est tronqué en plein milieu avant la fin du tableau "entries".
// 4096 reste très bon marché (~$0,02 même si intégralement consommé, à $5/MTok) et
// laisse largement la marge pour la page la plus riche vue jusqu'ici (17 entrées).
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

export async function runB2HaikuTest() {
  const started = Date.now()
  const { data: pages, error } = await supabase
    .from('game_mechanics_misc')
    .select('id, value')
    .in('id', TEST_PAGE_IDS)
  if (error) throw new Error(`fetch pages: ${error.message}`)

  let extractableCount = 0
  let notExtractableCount = 0
  let skippedChangelogCount = 0
  let totalEntries = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const errors: Array<{ id: number; title: string; error: string }> = []
  const results: Array<{ id: number; title: string; extractable: boolean; entries_count: number }> = []

  for (const page of pages ?? []) {
    const title = (page.value as any)?.title ?? ''
    const content = (page.value as any)?.content ?? ''

    // Exclusion déterministe des pages Changelog/* -- vrai problème de design trouvé
    // sur le 1er lot test (11 août), pas juste un bug de prompt : "Changelog/2025/August
    // 8" a été extrait extractable=true avec 17 entrées, toutes réelles et bien sourcées
    // (ex "Sting: dégâts aux Araignées 250%->300%") -- mais ce sont des DELTAS
    // historiques ponctuels à une date donnée, jamais l'état courant du jeu (principe
    // déjà établi tout du long de ce chantier : préférer une source qui reflète l'état
    // actuel, comme les wikitables de B1, plutôt qu'un instantané de patch qui peut être
    // périmé par un changement ultérieur non documenté ici). Un filtre par TITRE en code
    // est plus fiable qu'une règle de prompt seule (jamais garanti suivie à 100% par un
    // modèle) -- 457/3952 pages (~11,6%) sont concernées, exclues avant même d'appeler
    // Haiku (économise aussi le coût de l'appel).
    if (title.startsWith('Changelog/')) {
      skippedChangelogCount++
      notExtractableCount++
      results.push({ id: page.id, title, extractable: false, entries_count: 0 })
      await supabase.from('wiki_haiku_extract').upsert({
        game_mechanics_misc_id: page.id,
        page_title: title,
        extractable: false,
        entries: [],
        model: 'skip_changelog_title_filter',
        error: null,
      }, { onConflict: 'game_mechanics_misc_id' })
      continue
    }

    try {
      const { parsed, inputTokens, outputTokens, raw } = await callHaiku(content)
      totalInputTokens += inputTokens
      totalOutputTokens += outputTokens
      if (parsed.extractable) { extractableCount++; totalEntries += parsed.entries.length } else { notExtractableCount++ }
      results.push({ id: page.id, title, extractable: parsed.extractable, entries_count: parsed.entries.length })
      const { error: upsertError } = await supabase.from('wiki_haiku_extract').upsert({
        game_mechanics_misc_id: page.id,
        page_title: title,
        extractable: parsed.extractable,
        entries: parsed.entries,
        model: 'claude-haiku-4-5',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        raw_response: raw,
        error: null,
      }, { onConflict: 'game_mechanics_misc_id' })
      if (upsertError) throw new Error(`upsert: ${upsertError.message}`)
    } catch (e: any) {
      errors.push({ id: page.id, title, error: String(e?.message ?? e) })
      await supabase.from('wiki_haiku_extract').upsert({
        game_mechanics_misc_id: page.id,
        page_title: title,
        extractable: false,
        entries: [],
        model: 'claude-haiku-4-5',
        error: String(e?.message ?? e),
      }, { onConflict: 'game_mechanics_misc_id' })
    }
  }

  return {
    pages_requested: TEST_PAGE_IDS.length,
    pages_found: (pages ?? []).length,
    skipped_changelog_count: skippedChangelogCount,
    extractable_count: extractableCount,
    not_extractable_count: notExtractableCount,
    total_entries: totalEntries,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    estimated_cost_usd: (totalInputTokens / 1_000_000) * 1.0 + (totalOutputTokens / 1_000_000) * 5.0,
    errors,
    error_count: errors.length,
    results,
    duration_ms: Date.now() - started,
  }
}

export async function GET() {
  try {
    const result = await runB2HaikuTest()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
