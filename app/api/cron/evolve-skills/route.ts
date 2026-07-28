// app/api/cron/evolve-skills/route.ts
// Plus de schedule cron fixe (retiré de vercel.json le 23 juillet, conformité API
// Hypixel — "no continuous polling of player data ... to offer a history" s'applique
// à toute réanalyse automatique périodique, pas seulement à l'appel API lui-même).
// runEvolveSkills() est maintenant appelé en synchrone directement depuis
// app/api/player/sync/route.ts juste après un sync manuel réussi, filtré sur le seul
// profil qui vient d'être synced — jamais sur l'ensemble des joueurs, jamais sur un
// timer. Le handler GET ci-dessous reste utilisable manuellement (CRON_SECRET) pour
// du debug/backfill ponctuel, mais n'est plus déclenché par aucun schedule.
// Pour chaque profil : 1 appel Claude qui construit les 9 cartes Skills (état actuel
// réel vs prochaine target atteignable), stocké dans player_skill_cards.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TIER_CONFIG, GAME_TRUTHS } from '../../../../lib/money-making-constants'
import { ULTIMATE_ENCHANTS } from '../../../../lib/skyblock-item-decoder'
import { loadPricedItems } from '../setup-generate-agent/route'
import { buildActivityGearCatalogSection, verifyActivityGearName } from '../../../../lib/gear-pricing'
import { loadActivityGearCategories } from '../../../../lib/activity-gear'
import {
  buildTargetSetup, collectOwnedArmorSets, formatOwnedArmorSets, resolveOwnedArmorSet,
  type OwnedArmorSet,
} from '../../../../lib/skill-setup-adapter'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MODEL = 'claude-sonnet-4-6'

// Found via real Vercel runtime logs while testing Phase 1 (bigger prompt,
// more context sections): Claude occasionally prefixes its response with
// prose ("I'll analyze this player's real gear...") before the JSON, which
// the old fence-stripping alone never handled -- it only stripped a leading/
// trailing ```` ``` ```` fence, not arbitrary text before the first `{`.
// Falls back to slicing from the first `{` to the last `}` when a direct
// parse fails, which recovers the JSON regardless of what Claude wrote
// around it.
function parseJSON(text: string): any {
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found in response')
    return JSON.parse(cleaned.slice(start, end + 1))
  }
}

// ── Les 9 systèmes actionnables ─────────────────────────────────
// Carpentry/Taming/Hunting/Social exclus : pas de méthode de farm directe
// (voir CLAUDE.md pour la justification de chaque cas limite).
const SKILL_CARDS = [
  'farming', 'mining', 'combat', 'foraging', 'fishing',
  'alchemy', 'enchanting', 'dungeoneering', 'slayer',
] as const

const SLAYER_BOSSES = ['zombie', 'spider', 'wolf', 'enderman', 'blaze', 'vampire'] as const

const ULTIMATE_ENCHANT_LIST = Array.from(ULTIMATE_ENCHANTS).join(', ')

// Real item_stats.category -> activity mapping now lives in the
// activity_gear_categories table (lib/activity-gear.ts), shared with Money
// Making's setup-generate-agent via lib/gear-pricing.ts's
// buildActivityGearCatalogSection/verifyActivityGearName -- not duplicated
// here anymore. Found the hard way: a shared, unfiltered catalog let Claude
// recommend a real SWORD (Ragnarok Axe -- a real combat weapon whose display
// name happens to contain "Axe") for the Foraging card, which is a real item
// with a real price but functionally wrong for that activity -- worse than a
// hallucinated name because it doesn't look wrong on the surface. Two
// independent copies of this mapping (one per file) is exactly the kind of
// thing that could silently drift back into the same bug, hence promoting
// both the data AND the logic that consumes it to a shared location.

function describeItem(item: any): string {
  if (!item) return ''
  return (item.item_name || item.item_id || 'unknown item') +
    (item.total_stars ? ` ${'✪'.repeat(Math.min(item.total_stars, 5))}` : '') +
    (item.reforge ? ` (${item.reforge})` : '') +
    (item.is_recomb ? ' [recomb]' : '')
}

// Rassemble tout ce que le joueur possede mais ne porte pas actuellement — inventaire,
// enderchest, backpacks, Personal Vault, wardrobe (tenues sauvegardees, swap gratuit).
// Sans ca, "current" ne voit que equipped_armor/equipped_accessories et le prompt peut
// recommander un achat pour un item deja possede mais range ailleurs.
function collectOwnedButUnequipped(player: any): string {
  const lines: string[] = []

  for (const item of (player.inventory_items || [])) {
    const d = describeItem(item)
    if (d) lines.push(`${d} [Inventory]`)
  }
  for (const item of (player.ender_chest_items || [])) {
    const d = describeItem(item)
    if (d) lines.push(`${d} [Ender Chest]`)
  }
  for (const bp of (player.backpacks || [])) {
    for (const item of (bp.items || [])) {
      const d = describeItem(item)
      if (d) lines.push(`${d} [${bp.icon_item_name || 'Backpack'}]`)
    }
  }
  for (const item of (player.personal_vault_items || [])) {
    const d = describeItem(item)
    if (d) lines.push(`${d} [Personal Vault]`)
  }
  for (const slot of (player.wardrobe_slots || [])) {
    for (const piece of ['helmet', 'chestplate', 'leggings', 'boots']) {
      const d = describeItem(slot[piece])
      if (d) lines.push(`${d} [Wardrobe slot ${slot.slot}]`)
    }
  }

  const MAX = 400
  if (lines.length > MAX) return lines.slice(0, MAX).join('\n') + `\n... (${lines.length - MAX} more items truncated)`
  return lines.join('\n') || 'Nothing else owned'
}

// ── Formate l'état d'un joueur pour le prompt ───────────────────
function formatPlayerContext(player: any, library: string, gearCatalog: string, reforgesText: string, ownedArmorSetsText: string): string {
  const armor = Object.entries(player.equipped_armor || {})
    .map(([slot, item]: [string, any]) => `${slot}: ${describeItem(item) || 'empty'}`)
    .join('\n') || 'None equipped'

  const accessories = (player.equipped_accessories || [])
    .map((a: any) => a.item_name || a.item_id).join(', ') || 'None'

  const ownedElsewhere = collectOwnedButUnequipped(player)

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

=== OWNED BUT NOT CURRENTLY EQUIPPED (inventory, ender chest, backpacks, Personal Vault, wardrobe) ===
Check this list BEFORE ever recommending a purchase — if something here already covers the
target, it's a free swap, not an upgrade to buy. Wardrobe items swap for free instantly.
Everything else requires physically moving/equipping it but costs nothing.
${ownedElsewhere}

=== ALL OWNED ARMOR SETS, GROUPED (equipped + inventory + ender chest + backpacks + Personal Vault + wardrobe — everywhere they own armor, one line per coherent real set) ===
Use this list to pick current.armor_set_used per card — see CURRENT GROUNDING below.
${ownedArmorSetsText}

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

${gearCatalog}

=== REAL REFORGES (copy armor_reforge verbatim from this list, exact spelling — never invent one) ===
${reforgesText}
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

=== CURRENT GROUNDING — the OPTIMAL owned setup, not just what's on your body ===
"current" must reflect the best setup this player could ALREADY be using for free for THIS specific skill —
picked from the ALL OWNED ARMOR SETS list in the player context (equipped + inventory + ender chest +
backpacks + Personal Vault + wardrobe), not simply whatever they happen to be wearing right now. Armor is
one single global loadout in this game, so a player grinding one skill is very often wearing a completely
different skill's set purely because that's what they last equipped — current must name whichever owned
set is actually the best fit for THIS card's activity, because swapping to it costs nothing and is their
honest real available state for this skill, not what a snapshot of their body happens to show.
Set current.armor_set_used to the EXACT name of the chosen set, copied verbatim from the ALL OWNED ARMOR
SETS list — or null if nothing owned is relevant to this skill (describe them as bare/unequipped for this
activity honestly in that case, never pick an unrelated set just because something exists). Do not invent
a name that isn't in that list.

=== TARGET CALIBRATION — the most important rule ===
The target must be reachable from where THIS player actually is, not a generic tier goal:
- BEFORE ever proposing a purchase, check the OWNED BUT NOT CURRENTLY EQUIPPED list. If an item there
  already satisfies (or beats) what you were about to recommend buying, target.type = "free_swap":
  budget_estimate = 0, and requirements/reasoning must name the exact item(s) and where they currently
  are (e.g. "already own: Ancient Necron's Chestplate/Leggings/Boots in Wardrobe slot 2 — swap for free
  in the Wardrobe menu, no purchase needed"). Recommending a purchase for something already owned is the
  single worst failure mode for this feature — worse than an unreachable target, because it wastes real
  money the player didn't need to spend.
- Use their PURSE specifically (not networth, not game_stage) to judge what they can afford right now,
  for whatever gap remains AFTER checking owned items above. A player can be MID-tier overall (large
  networth from gear on other skills) while being genuinely under-invested on one specific system —
  that's still "can afford it, just hasn't prioritized it", a different case from a player who truly
  cannot afford anything yet.
- If a system is not yet unlocked/started at all (e.g. Catacombs never entered, no slayer kills on a
  boss), target.type = "unlock_access" — the goal is starting the system, not optimizing a yield that
  doesn't exist yet.
- If the player has little to no capital anywhere (very low purse, EARLY game_stage, most skills near
  level 0), the target must be their realistic FIRST step into that system — a starter tool/setup within
  their actual budget, never a mid/end-game item. Getting this wrong (recommending something unreachable
  to a near-zero player) is also a critical failure mode for this feature.
- The general method library given as reference is for INSPIRATION on what methods exist in the game —
  never copy its coins/h numbers directly, they were calculated for a generic tier setup, not this player.

=== CONFIDENCE ===
Mark "confidence": "LOW" whenever a coins/h estimate has no verified internal stat data behind it
(e.g. tool speed/fortune stats aren't in our database) — say so honestly rather than presenting a
guess as precise fact.

=== TARGET ARMOR SPEC — precise, matched against the real gear catalog ===
Whenever the target involves wearing specific armor (most cards do — combat/dungeoneering/slayer
always; farming/mining/foraging/fishing/alchemy/enchanting whenever a coherent armor upgrade is
part of reaching the target), name a PRECISE, JUSTIFIED spec, not just a set name:
- armor_set MUST be picked from the REAL GEAR CATALOG in the player context when a matching set
  exists there for this tier's budget — never invent a set the catalog doesn't have, never suggest
  one priced far outside this tier's real budget band.
- armor_reforge MUST be copied verbatim (exact spelling) from the REAL REFORGES list in the player
  context — never invent a reforge name, never leave it as a vague rarity word like "Epic".
- armor_ultimate_enchant MUST be exactly one of: ${ULTIMATE_ENCHANT_LIST} — or null if none fits.
  Only set one when it clearly serves this system's target stat; most targets should leave this null.
- armor_hot_potato_count: 0, 5, or 10 — 10 only when this tier's budget genuinely supports it.
- If target.type is "free_swap", name the exact already-owned piece from the OWNED BUT NOT CURRENTLY
  EQUIPPED list (same real item, not a different recommendation) so the render matches what they
  already have. If target.type is "unlock_access" and no coherent armor target exists yet, leave
  armor_set null rather than inventing one.

=== TARGET GEAR NAME (weapon/tool/rod) — category-scoped per card, never borrowed from another skill ===
The player context includes PER-SKILL WEAPON/TOOL CATALOGS — one section per skill, each pre-filtered to
that skill's own real functional category (e.g. the FORAGING section only ever contains real AXE-category
items, the COMBAT section only real SWORD/BOW/LONGSWORD/GAUNTLET/WAND-category items). When writing a
given card, gear_name MUST be copied verbatim from THAT card's own section only — never from a different
skill's section, even though every item shown anywhere in that context is real and priced. A real item in
the wrong functional slot (e.g. a real combat sword recommended as a foraging tool because its display
name happens to contain a farming/foraging-sounding word) is a critical failure for this feature — it
looks correct on the surface (real name, real price) but is functionally wrong advice, worse than an
obviously invented name because it can pass unnoticed. If a card's own section says there is no dedicated
weapon/tool slot, or no priced item in budget, leave gear_name null — never reach into another section.

=== OUTPUT — strict JSON only ===
Your response MUST start with { as the very first character — no preamble, no "I'll analyze...", no explanation before or after the JSON. Do all your reasoning silently and output only the final JSON object.
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
        "confidence": "HIGH",
        "armor_set_used": "Exact name from ALL OWNED ARMOR SETS, or null"
      },
      "target": {
        "type": "free_swap | upgrade | unlock_access",
        "goal": "...",
        "requirements": ["..."],
        "budget_estimate": 0,
        "expected_coins_display": "...",
        "reasoning": "...",
        "armor_set": "Name or null",
        "armor_stars": 5,
        "armor_recomb": true,
        "armor_reforge": "exact reforge_name or null",
        "armor_hot_potato_count": 0,
        "armor_ultimate_enchant": null,
        "gear_name": "Exact weapon/tool/rod name from THIS card's own weapon/tool catalog section, or null"
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

  // Catalogue de gear réel + reforges réels — même source que setup-generate-agent
  // (jamais réimplémentée en parallèle), pour que le spec d'armure du "target" soit
  // matchable contre de vrais items pricés plutôt qu'un nom halluciné. activityGear
  // vient maintenant de la table partagée activity_gear_categories (Phase 1 de la
  // base de connaissances) au lieu d'un const dupliqué dans ce seul fichier.
  const [pricedItems, { data: fullContext }, activityGear] = await Promise.all([
    loadPricedItems(),
    supabase.rpc('get_full_context'),
    loadActivityGearCategories(),
  ])
  const reforgesText = ((fullContext?.reforges || []) as any[])
    .map(r => `${r.reforge_name}(${r.item_types}):${JSON.stringify(r.stats)}`)
    .join(' | ') || 'No reforge data available'

  const system = buildSystemPrompt()

  const results = await Promise.all(
    players.map(async (player: any) => {
      const tier = String(player.game_stage || 'early').toLowerCase()
      const library = libraryByTier[tier] || 'No general library available for this tier yet'
      const tierConfig = TIER_CONFIG[tier as keyof typeof TIER_CONFIG]
      const gearCatalog = tierConfig ? buildActivityGearCatalogSection(pricedItems, tierConfig.max_gear_cost, [...SKILL_CARDS], activityGear) : ''
      const ownedArmorSets = collectOwnedArmorSets(player)
      const context = formatPlayerContext(player, library, gearCatalog, reforgesText, formatOwnedArmorSets(ownedArmorSets))

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
            max_tokens: 16000,
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

  // Attache render_setup (shape attendue par SkinArmorRender.tsx, voir
  // lib/skill-setup-adapter.ts) à chaque current/target, et vérifie
  // target.gear_name en dernier recours -- current.render_setup est résolu
  // PAR CARTE maintenant (plus un seul render partagé par joueur) : Claude
  // choisit armor_set_used par carte depuis le pool complet de gear possédé
  // (ALL OWNED ARMOR SETS), on ne fait que résoudre ce nom exact en couleurs/
  // rareté réelles -- jamais de fuzzy matching ici, ces noms viennent de
  // notre propre regroupement, pas d'un texte libre Claude.
  for (const r of results) {
    if ('error' in r) continue
    const ownedArmorSets: OwnedArmorSet[] = collectOwnedArmorSets(r.player)
    const tier = String(r.player.game_stage || 'early').toLowerCase()
    const tierConfig = TIER_CONFIG[tier as keyof typeof TIER_CONFIG]
    const maxGearCost = tierConfig?.max_gear_cost ?? 0

    const attachRenderSetups = async (card: any, skillKey: string) => {
      if (card.current) {
        card.current.render_setup = await resolveOwnedArmorSet(ownedArmorSets, card.current.armor_set_used)
      }
      if (card.target) {
        card.target.render_setup = buildTargetSetup(card.target, pricedItems).setup
        card.target.gear_name = verifyActivityGearName(card.target.gear_name, pricedItems, maxGearCost, skillKey, activityGear)
      }
    }

    for (const card of (r.data?.cards || [])) {
      await attachRenderSetups(card, card.skill_key)
      for (const boss of (card.bosses || [])) await attachRenderSetups(boss, card.skill_key)
    }
  }

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
