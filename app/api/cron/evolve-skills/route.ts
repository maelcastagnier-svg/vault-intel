// app/api/cron/evolve-skills/route.ts
// Lundi 6h30 UTC — 30 min après money-making-agent (lit sa bibliothèque déjà fraîche).
// Pour chaque profil synced : 1 appel Claude qui construit les 9 cartes Skills
// (état actuel réel vs prochaine target atteignable), stocké dans player_skill_cards.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TIER_CONFIG, GAME_TRUTHS } from '../../../../lib/money-making-constants'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MODEL = 'claude-sonnet-4-6'

function parseJSON(text: string): any {
  return JSON.parse(text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim())
}

// ── Les 9 systèmes actionnables ─────────────────────────────────
// Carpentry/Taming/Hunting/Social exclus : pas de méthode de farm directe
// (voir CLAUDE.md pour la justification de chaque cas limite).
const SKILL_CARDS = [
  'farming', 'mining', 'combat', 'foraging', 'fishing',
  'alchemy', 'enchanting', 'dungeoneering', 'slayer',
] as const

const SLAYER_BOSSES = ['zombie', 'spider', 'wolf', 'enderman', 'blaze', 'vampire'] as const

// ── Formate l'état d'un joueur pour le prompt ───────────────────
function formatPlayerContext(player: any, library: string): string {
  const armor = Object.entries(player.equipped_armor || {})
    .map(([slot, item]: [string, any]) =>
      `${slot}: ${item?.item_name || item?.item_id || 'empty'}` +
      (item?.total_stars ? ` ${'✪'.repeat(Math.min(item.total_stars, 5))}` : '') +
      (item?.reforge ? ` (${item.reforge})` : '') +
      (item?.is_recomb ? ' [recomb]' : '')
    ).join('\n') || 'None equipped'

  const accessories = (player.equipped_accessories || [])
    .map((a: any) => a.item_name || a.item_id).join(', ') || 'None'

  const hotm = player.hotm_progress || {}
  const hotmLine = (tree: string) => {
    const t = hotm[tree]
    if (!t || Object.keys(t.nodes || {}).length === 0) return `${tree}: no perks purchased (tokens spent: ${t?.tokens_spent ?? 0})`
    return `${tree}: ${Object.entries(t.nodes).map(([k, v]) => `${k} lvl${v}`).join(', ')} (tokens spent: ${t.tokens_spent})`
  }

  const slayers = Object.entries(player.slayers || {})
    .map(([boss, d]: [string, any]) => `${boss}: xp=${d.xp ?? 0}, kills=${d.kills ?? 0}`)
    .join('\n') || 'No slayer data'

  const dungeons = player.dungeons?.catacombs
    ? `Catacombs: highest floor ${player.dungeons.catacombs.highest_floor}, ${player.dungeons.catacombs.runs} runs`
    : 'Catacombs: never entered (dungeon hub not unlocked or no run completed)'

  const topCollections = Object.entries(player.collections || {})
    .sort(([, a]: any, [, b]: any) => b - a)
    .slice(0, 10)
    .map(([k, v]) => `${k}: ${v}`).join(', ') || 'None'

  return `
=== PLAYER STATE — every "current" claim must be grounded ONLY in what follows ===
game_stage: ${player.game_stage} | networth: ${player.networth?.toLocaleString()} | purse (liquid, spendable NOW): ${player.purse?.toLocaleString()} | bank: ${(player.bank ?? 0).toLocaleString()}
skills: ${JSON.stringify(player.skills)}
fairy_souls: ${player.fairy_souls ?? 0}

=== EQUIPPED ARMOR (real decoded items — this is ALL the armor they own equipped) ===
${armor}

=== EQUIPPED ACCESSORIES (${(player.equipped_accessories || []).length}) ===
${accessories}

=== HEART OF THE MOUNTAIN / SKILL TREE ===
${hotmLine('mining')}
${hotmLine('foraging')}

=== SLAYERS ===
${slayers}

=== DUNGEONS ===
${dungeons}

=== TOP COLLECTIONS ===
${topCollections}

=== VALIDATED GENERAL METHOD LIBRARY FOR THEIR TIER (inspiration/reference only — never copy a coins/h number as-is, re-derive it from THIS player's real setup) ===
${library}
`
}

function buildSystemPrompt(): string {
  return `You are Vault, personalizing Skills progression cards for one specific Hypixel Skyblock player.

${GAME_TRUTHS}

=== YOUR JOB ===
Produce exactly ${SKILL_CARDS.length} cards, one per system: ${SKILL_CARDS.join(', ')}.
"dungeoneering" = Catacombs. "slayer" additionally requires a "bosses" array with exactly 6 entries
(${SLAYER_BOSSES.join(', ')}), each with its own current/target — gear and coins/h differ wildly by boss,
never blend them into one number.

Each card has:
- "current": their REAL state right now, grounded strictly in the PLAYER STATE section — armor/accessories/
  tools you were NOT given do not exist, never invent one. If they own nothing relevant, say so honestly
  and give a coins/h near zero if that is the truth.
- "target": the SINGLE next concrete step for this specific system.

=== TARGET CALIBRATION — the most important rule ===
The target must be reachable from where THIS player actually is, not a generic tier goal:
- Use their PURSE specifically (not networth, not game_stage) to judge what they can afford right now.
  A player can be MID-tier overall (large networth from gear on other skills) while being genuinely
  under-invested on one specific system — that's still "can afford it, just hasn't prioritized it",
  a different case from a player who truly cannot afford anything yet.
- If a system is not yet unlocked/started at all (e.g. Catacombs never entered, no slayer kills on a
  boss), target.type = "unlock_access" — the goal is starting the system, not optimizing a yield that
  doesn't exist yet.
- If the player has little to no capital anywhere (very low purse, EARLY game_stage, most skills near
  level 0), the target must be their realistic FIRST step into that system — a starter tool/setup within
  their actual budget, never a mid/end-game item. Getting this wrong (recommending something unreachable
  to a near-zero player) is the single worst failure mode for this feature.
- The general method library given as reference is for INSPIRATION on what methods exist in the game —
  never copy its coins/h numbers directly, they were calculated for a generic tier setup, not this player.

=== CONFIDENCE ===
Mark "confidence": "LOW" whenever a coins/h estimate has no verified internal stat data behind it
(e.g. tool speed/fortune stats aren't in our database) — say so honestly rather than presenting a
guess as precise fact.

=== OUTPUT — strict JSON only ===
{
  "summary": "1-2 sentences on this player's overall Skills situation",
  "cards": [
    {
      "skill_key": "farming",
      "label": "Farming",
      "unlocked": true,
      "current": {
        "setup_items": ["..."],
        "method": "...",
        "coins_per_hour": 0,
        "coins_display": "...",
        "calculation": "...",
        "confidence": "HIGH"
      },
      "target": {
        "type": "upgrade",
        "goal": "...",
        "requirements": ["..."],
        "budget_estimate": 0,
        "expected_coins_display": "...",
        "reasoning": "..."
      }
    }
  ]
}
For the "slayer" card only, add "bosses": [ { "boss": "zombie", "current": {...same shape...}, "target": {...same shape...} }, ... all 6 ].`
}

// ── Logique principale, reutilisable par le handler cron et par un test manuel ──
export async function runEvolveSkills(filterProfileIds?: string[]) {
  let query = supabase.from('player_data').select('*')
  if (filterProfileIds?.length) query = query.in('profile_id', filterProfileIds)
  const { data: players, error: playersError } = await query
  if (playersError) return { error: playersError.message, status: 500 }
  if (!players || players.length === 0) return { message: 'No synced players' }

  const { data: libraryRows } = await supabase
    .from('claude_analysis')
    .select('section, content')
    .like('section', 'money_making_%')

  const libraryByTier: Record<string, string> = {}
  for (const row of libraryRows || []) {
    try {
      const parsed = JSON.parse(row.content)
      const methods = [...(parsed.active || []), ...(parsed.vault || [])]
      libraryByTier[row.section.replace('money_making_', '')] = methods
        .map((m: any) => `[${m.id}] ${m.method} | ${m.coins_display} | confidence: ${m.confidence}`)
        .join('\n')
    } catch { /* section malformed, skip */ }
  }

  const system = buildSystemPrompt()

  const results = await Promise.all(
    players.map(async (player: any) => {
      const tier = String(player.game_stage || 'early').toLowerCase()
      const library = libraryByTier[tier] || 'No general library available for this tier yet'
      const context = formatPlayerContext(player, library)

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method:  'POST',
          headers: {
            'x-api-key':         process.env.ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
            'content-type':      'application/json',
          },
          body: JSON.stringify({
            model:      MODEL,
            max_tokens: 8000,
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: context }],
          }),
        })

        if (!res.ok) return { player, error: `HTTP ${res.status}` }
        const data   = await res.json()
        const parsed = parseJSON(data.content?.[0]?.text || '')
        return { player, data: parsed }
      } catch (e: any) {
        return { player, error: e.message }
      }
    })
  )

  let saved = 0
  for (const r of results) {
    if ('error' in r) { console.error(r.player.hypixel_uuid, r.error); continue }

    const { error } = await supabase.from('player_skill_cards').upsert({
      hypixel_uuid:  r.player.hypixel_uuid,
      profile_id:    r.player.profile_id,
      game_stage:    r.player.game_stage,
      networth:      r.player.networth,
      purse:         r.player.purse,
      cards:         r.data.cards,
      model:         MODEL,
      generated_at:  new Date().toISOString(),
    }, { onConflict: 'hypixel_uuid,profile_id' })

    if (error) console.error('Save error:', r.player.hypixel_uuid, error.message)
    else saved++
  }

  return {
    success: true,
    players_processed: players.length,
    saved,
    results,
    errors: results.filter(r => 'error' in r).map((r: any) => ({ uuid: r.player.hypixel_uuid, error: r.error })),
  }
}

// ── Handler cron ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runEvolveSkills()
  return NextResponse.json(result)
}
