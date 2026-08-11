// Route de debug TEMPORAIRE (Pluton B2, 11 août) -- reprise des 2064 pages en échec
// (crédit API épuisé, voir commit précédent), MAIS sous contrainte budget stricte
// demandée explicitement par l'utilisateur après un 1er lot à 3€ : priorisation,
// pas de cache_control (voir note plus bas -- structurellement inefficace ici),
// plafond de lignes ?limit=N (défaut volontairement bas -- 15 -- pour valider le
// coût réel avant tout engagement plus large). À supprimer après vérification.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Réduit de 6000 à 4000 -- optimisation coût demandée explicitement (11 août). La
// médiane réelle des pages sans wikitable est ~1140-2372 caractères (mesuré B1/B2) :
// un cap à 4000 couvre déjà la quasi-totalité du corpus intact, et ne raccourcit que
// la queue longue (183 pages ≥3000 car. parmi les 2064 restantes) -- aucune perte de
// signal attendue, ce sont les pages courtes/moyennes qui portent l'essentiel des
// vrais bonus trouvés jusqu'ici (Fancy Tuxedo 1956 car., Flint Arrow 3068 car., etc.)
const CONTENT_CHAR_CAP = 4000

// Tier 0 -- jamais envoyées à Haiku, coût nul : sur le tout premier lot test (10
// pages <500 caractères), 0/10 avaient un bonus réel (pages quasi vides / stubs /
// redirects). Rien dans les données observées jusqu'ici ne contredit ce seuil.
const MIN_CONTENT_LENGTH = 500

// Nombre max de VRAIS appels Haiku pour cette invocation -- garde-fou budget explicite
// (l'utilisateur a demandé un tout petit lot test avant tout engagement plus large).
// Doit être passé explicitement (?limit=N) pour dépasser ce défaut prudent.
const DEFAULT_LIMIT = 15

// System prompt raccourci -- 2 économies réelles trouvées en révisant pour le budget
// (11 août) : (1) la clause "page de changelog -> false" est devenue morte, ces pages
// sont déjà filtrées par titre en code AVANT tout appel Haiku, jamais montrées au
// modèle ; (2) "réponds uniquement le JSON" est redondant avec output_config.format
// (structured outputs garantit déjà la forme, quoi qu'on écrive ici). ~80-100 tokens
// économisés par appel -- modeste seul, mais gratuit (aucune perte de règle utile) et
// s'additionne sur des milliers d'appels.
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

export async function runB2HaikuPriority(limit: number) {
  const started = Date.now()

  // Pages encore en attente : présentes en base avec une vraie erreur (jamais celles
  // déjà réussies -- error is null), ou jamais tentées du tout.
  const { data: errorRows } = await supabase.from('wiki_haiku_extract').select('game_mechanics_misc_id').not('error', 'is', null)
  const pendingIds = new Set((errorRows ?? []).map(r => r.game_mechanics_misc_id))

  const { data: candidateRows, error: fetchError } = await supabase
    .from('game_mechanics_misc')
    .select('id, value')
    .in('id', Array.from(pendingIds))
  if (fetchError) throw new Error(`fetch candidates: ${fetchError.message}`)

  const candidates: PageRow[] = (candidateRows ?? []).map(r => ({ id: r.id, title: (r.value as any)?.title ?? '', content: (r.value as any)?.content ?? '' }))

  // Tier 0 -- sous le seuil de longueur minimal : marquées false sans appel Haiku
  // (coût nul), voir justification en tête de fichier.
  const tooShort = candidates.filter(p => p.content.length < MIN_CONTENT_LENGTH)
  if (tooShort.length > 0) {
    await supabase.from('wiki_haiku_extract').upsert(tooShort.map(p => ({
      game_mechanics_misc_id: p.id,
      page_title: p.title,
      extractable: false,
      entries: [],
      model: 'skip_too_short_filter',
      error: null,
    })), { onConflict: 'game_mechanics_misc_id' })
  }

  // Tier 1 -- signal fort validé sur l'échantillon test (11 août) : {{Stat|...}}
  // inline dans le texte -> ~75-80% de taux d'extraction réel observé, contre ~24%
  // sans ce filtre. Priorité absolue -- c'est CE sous-ensemble qui doit être envoyé
  // à Haiku en premier, jamais les 2064 pages indistinctement.
  const hasStatPattern = /\{\{Stat\|/
  const priority = candidates.filter(p => p.content.length >= MIN_CONTENT_LENGTH && hasStatPattern.test(p.content))

  const toProcess = priority.slice(0, limit)

  let extractableCount = 0
  let totalEntries = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const errors: Array<{ id: number; title: string; error: string }> = []
  const results: Array<{ id: number; title: string; extractable: boolean; entries_count: number }> = []

  for (const page of toProcess) {
    try {
      const { parsed, inputTokens, outputTokens, raw } = await callHaiku(page.content)
      totalInputTokens += inputTokens
      totalOutputTokens += outputTokens
      if (parsed.extractable) { extractableCount++; totalEntries += parsed.entries.length }
      results.push({ id: page.id, title: page.title, extractable: parsed.extractable, entries_count: parsed.entries.length })
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
      errors.push({ id: page.id, title: page.title, error: String(e?.message ?? e) })
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

  const costUsd = (totalInputTokens / 1_000_000) * 1.0 + (totalOutputTokens / 1_000_000) * 5.0

  return {
    pending_total: pendingIds.size,
    skipped_too_short: tooShort.length,
    priority_pool_size: priority.length,
    processed_this_run: toProcess.length,
    remaining_priority_after_this_run: priority.length - toProcess.length,
    non_priority_remaining: pendingIds.size - tooShort.length - priority.length,
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
  }
}

export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT
    const result = await runB2HaikuPriority(limit)
    return NextResponse.json({ success: true, limit_used: limit, ...result })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
