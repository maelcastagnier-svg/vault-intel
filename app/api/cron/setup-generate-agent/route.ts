// app/api/cron/setup-generate-agent/route.ts
// Génère tous les setups — lundi 7h UTC (après money-making-agent à 6h)
// Haiku + prompt caching — ~0.04€/semaine
// Claude fournit du TEXTE uniquement — le visuel est géré par React
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TIER_CONFIG } from '../../../../lib/money-making-constants'
import { ULTIMATE_ENCHANTS } from '../../../../lib/skyblock-item-decoder'
import {
  type PricedItem, loadPricedItems, matchesExact, bestArmorPiecesForSet, formatCoins,
  ARMOR_COLOR_FIELD, specVariantKeys, lookupPreciseVariantPrice, gearSpecFromSetup,
  buildActivityGearCatalogSection,
} from '../../../../lib/gear-pricing'
import { loadActivityGearCategories, type ActivityGearCategories } from '../../../../lib/activity-gear'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export { loadPricedItems, bestArmorPiecesForSet }

// Real values seen in method.skill across money_making_* content (confirmed
// via a live audit before this Phase 1 wiring: farming/mining/combat/
// fishing/foraging -- Money Making methods never use dungeoneering/slayer/
// alchemy/enchanting as a skill value, unlike Evolve Skills' 9 cards).
const MONEY_MAKING_ACTIVITIES = ['farming', 'mining', 'combat', 'fishing', 'foraging']

// A method can span more than one activity (money-making-agent's vault
// methods use skills_combined, e.g. ["farming","combat"] for a pest-farming-
// during-Jacob's-Contest method) -- weapon/tool/rod grounding must allow
// candidates from ANY of them, not just the primary skill.
function methodActivities(method: any): string[] {
  if (Array.isArray(method.skills_combined) && method.skills_combined.length) return method.skills_combined
  return method.skill ? [method.skill] : []
}

// Filtre par bande de budget du tier + score de puissance brut (proxy simple,
// pas une formule de jeu officielle — sert juste à trier, pas à afficher).
// Bande large (budget/25 → budget×3) pour inclure du budget jusqu'au BiS,
// sans laisser un tier bas polluer le catalogue d'un tier haut (ex: Mithril,
// prix réel bien sous le plancher LATE, n'apparaît jamais dans ce catalogue-là).
export function gearCatalogForBudget(priced: PricedItem[], maxGearCost: number): string {
  const minPrice = maxGearCost / 25
  const maxPrice = maxGearCost * 3

  // NOTE: item_stats.health/defense/strength/... est réel mais souvent 0 pour
  // les items endgame complexes (armures Kuudra, items Divan...) — Hypixel ne
  // remplit ce champ que pour les items à stats plates simples, pas ceux dont
  // le vrai stat vient de la génération/reforge/étoiles. Vérifié en base sur
  // Crown of Avarice/Hyperion/Infernal Crimson Chestplate : les trois à 0 alors
  // que ce sont de vraies pièces BiS statées. Afficher ces zéros au modèle
  // serait une fausse information (donnerait l'impression que ces items n'ont
  // aucun stat) — on ne montre donc QUE le prix réel (fiable) et on trie par
  // prix décroissant, jamais par un score dérivé de colonnes dont on sait
  // qu'elles sont creuses ici.
  const rows = priced
    .filter(s => s.price >= minPrice && s.price <= maxPrice)
    .sort((a, b) => b.price - a.price)
    .slice(0, 60)

  if (rows.length === 0) {
    return '=== REAL GEAR CATALOG (priced, in-budget) ===\nNo priced item found in this budget band — rely on the wiki sections above only, and mark confidence LOW on any specific item name you are not certain still exists.'
  }

  return '=== REAL GEAR CATALOG (actual traded items, current AH price, filtered to this tier\'s budget, sorted highest price first) ===\n' +
    rows.map(s => `${s.item_id} "${s.display_name}" [${s.category}] price=${Math.round(s.price).toLocaleString()}`).join('\n')
}

// Phase 1 game knowledge base: gates weapon_name/tool/rod matches by real
// functional category (activity_gear_categories) before they're allowed to
// contribute cost/rarity data -- does NOT touch the visible text Claude
// wrote (this is an already-shipped feature; unlike Evolve Skills' brand
// new gear_name field, nulling real text here would be a user-visible
// regression risk). A wrong-category match simply contributes nothing,
// same as today's existing "no match found" case already handles.
// Empty `activities` (method.skill missing/unrecognized) fails OPEN --
// keeps today's behavior rather than silently breaking cost calc for a
// method whose skill metadata doesn't happen to be set.
function categoryAllowedForActivities(category: string, activities: string[], activityGear: ActivityGearCategories): boolean {
  if (activities.length === 0) return true
  return activities.some(a => (activityGear[a] || []).includes(category))
}

// Calcule et écrase cost_budget/cost_optimal/cost_endgame en code, jamais
// laissé à Claude (testé 2 fois en LATE Gemstone Mining : même avec une
// règle de prompt explicite, Haiku continue de sortir un chiffre habituel
// proche de coins_display plutôt que de sommer les vrais prix montrés).
export async function applyPreciseCost(setup: any, priced: PricedItem[], activityGear: ActivityGearCategories = {}, activities: string[] = []): Promise<void> {
  const matchedIds = new Set<string>()
  const matched: { item_id: string; display_name: string; price: number; precision: string }[] = []
  let total = 0

  const addMatch = (item: PricedItem, price: number, precision: string) => {
    if (matchedIds.has(item.item_id)) return
    matchedIds.add(item.item_id)
    matched.push({ item_id: item.item_id, display_name: item.display_name, price, precision })
    total += price
  }

  // Rareté attachée directement sur le setup (jamais devinée côté frontend) --
  // vraie valeur `tier` Hypixel via item_stats.rarity, prise sur le premier
  // item matché par slot.
  if (setup.armor_set) {
    const spec = gearSpecFromSetup(setup, 'armor')
    const keys = specVariantKeys(spec)
    for (const item of bestArmorPiecesForSet(priced, setup.armor_set)) {
      if (!setup.armor_rarity && item.rarity) setup.armor_rarity = item.rarity
      const colorField = ARMOR_COLOR_FIELD[item.category]
      if (colorField && item.default_color) setup[colorField] = item.default_color
      const precise = await lookupPreciseVariantPrice(item.item_id, keys, spec)
      addMatch(item, precise?.price ?? item.price, precise?.precision ?? 'blended')
    }
  }

  if (setup.weapon_name) {
    const spec = gearSpecFromSetup(setup, 'weapon')
    const keys = specVariantKeys(spec)
    for (const item of priced) {
      if (!matchesExact(item.display_name, setup.weapon_name)) continue
      if (!categoryAllowedForActivities(item.category, activities, activityGear)) continue
      if (!setup.weapon_rarity && item.rarity) setup.weapon_rarity = item.rarity
      const precise = await lookupPreciseVariantPrice(item.item_id, keys, spec)
      addMatch(item, precise?.price ?? item.price, precise?.precision ?? 'blended')
    }
  }

  // Tool/rod restent sur le prix blended du catalogue -- ce sont des chaînes
  // multi-composants (drill + fuel tank + engine), hors périmètre du
  // pricing par variante précise pour cette passe.
  if (setup.tool) {
    for (const item of priced) {
      if (!matchesExact(item.display_name, setup.tool)) continue
      if (!categoryAllowedForActivities(item.category, activities, activityGear)) continue
      if (!setup.tool_rarity && item.rarity) setup.tool_rarity = item.rarity
      addMatch(item, item.price, 'blended')
    }
  }
  if (setup.rod) {
    for (const item of priced) {
      if (!matchesExact(item.display_name, setup.rod)) continue
      if (!categoryAllowedForActivities(item.category, activities, activityGear)) continue
      if (!setup.rod_rarity && item.rarity) setup.rod_rarity = item.rarity
      addMatch(item, item.price, 'blended')
    }
  }

  if (matchedIds.size === 0) return
  const exactCount  = matched.filter(m => m.precision === 'exact').length
  const baseCount   = matched.filter(m => m.precision === 'base').length
  const broadCount  = matched.filter(m => m.precision === 'broad').length
  const preciseCount = exactCount + baseCount + broadCount // toutes des vraies lignes AH, pas le blended
  setup.cost_budget  = `~${formatCoins(total * 0.75)} — cheaper rolls of the same real gear (fewer stars, no recomb)`
  setup.cost_optimal = `~${formatCoins(total)} — real AH price of the named spec (${matchedIds.size} item${matchedIds.size > 1 ? 's' : ''} matched, ${preciseCount} from real variant data${exactCount ? `, ${exactCount} exact` : ''})`
  setup.cost_endgame = `~${formatCoins(total * 1.4)} — recombobulated/5★ premium rolls of the same gear`
}

// ── Clé unique identique entre agent et route ─────────────────
export function methodKey(method: any): string {
  return (method.id || method.method || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80)
}

// ── Parse JSON Claude robuste ────────────────────────────────
function parseJSON(text: string): any {
  const clean = text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()
  return JSON.parse(clean)
}

// ── Contexte wiki — construit UNE FOIS, mis en cache ────────
export function buildWikiContext(ctx: any): string {
  const wiki = (items: any[], n: number) =>
    (items || []).map((w: any) => `[${w.key}]\n${(w.content || '').slice(0, n)}`).join('\n\n')

  return [
    '=== ARMOR SETS ===',      wiki(ctx?.wiki_armor_sets, 1000),
    '\n=== WEAPONS ===',       wiki(ctx?.wiki_weapons, 600),
    '\n=== SLAYERS ===',       wiki(ctx?.wiki_slayers, 1200),
    '\n=== KUUDRA ===',        wiki(ctx?.wiki_kuudra, 800),
    '\n=== DUNGEONS ===',      wiki(ctx?.wiki_dungeons, 600),
    '\n=== MINING ===',        wiki(ctx?.wiki_mining, 800),
    '\n=== FISHING ===',       wiki(ctx?.wiki_fishing, 600),
    '\n=== FARMING ===',       wiki(ctx?.wiki_farming, 500),
    '\n=== PETS ===',          wiki(ctx?.wiki_pets, 400),
    '\n=== ENCHANTMENTS ===',
    (ctx?.enchantments || []).map((e: any) =>
      `${e.name}[${(e.item_types || []).join(',')}]max=${e.max_level}`
    ).join(' | '),
    '\n=== REFORGES ===',
    (ctx?.reforges || []).map((r: any) =>
      `${r.reforge_name}(${r.item_types}):${JSON.stringify(r.stats)}`
    ).join(' | '),
  ].join('\n')
}

export const GROUNDING_RULES = `
=== GROUNDING RULES (mandatory) ===
- armor_set, weapon_name, tool, rod, and accessories MUST be picked from the REAL GEAR CATALOG below when a matching item exists there for that slot/activity. The catalog is already filtered to this tier's real budget band using actual current AH prices — never override it with a cheaper or more expensive item from memory (e.g. never suggest an old low-tier armor set for a tier whose budget clearly reaches the catalog's top entries, and never suggest a BiS item priced far above this tier's budget).
- The catalog has NO stat columns (health/defense/etc are unreliable for endgame gear in our data and were deliberately removed) — never invent specific numbers for armor_stats/weapon_stats/target_stats either; keep those fields qualitative (e.g. "High DEF, moderate STR") or omit precise numbers you cannot source from the WIKI text above.
- armor_reforge/weapon_reforge must be copied verbatim from the REFORGES list below — never invent a reforge name, never leave it as a vague word like "Epic" (that's a rarity, not a reforge). armor_ultimate_enchant/weapon_ultimate_enchant must be one of the exact IDs listed in the user prompt, or null.
- cost_budget / cost_optimal / cost_endgame are computed in code from the exact spec you give (stars/reforge/hot potato/ultimate enchant), not by you — do not try to compute a number for these fields yourself, any value you write here will be overwritten.
- pet_name and gemstones are not in this catalog — use the WIKI sections above for those, and if still uncertain, mark confidence implicitly by keeping the recommendation generic rather than naming an ultra-specific variant you're not sure exists.
- If the catalog says "No priced item found in this budget band", do not invent a specific item — describe the setup at the archetype level (e.g. "best available T4 mining armor") instead of naming an unverified item.
`

const ULTIMATE_ENCHANT_LIST = Array.from(ULTIMATE_ENCHANTS).join(', ')

// ── Prompt utilisateur (le wiki est dans le system caché) ────
function buildUserPrompt(method: any, tier: string): string {
  const n = (method.method || '').toLowerCase()
  const isSlayer  = n.includes('slayer')
  const isMining  = method.skill === 'mining' || n.includes('mining') || n.includes('glacite') || n.includes('crystal')
  const isFishing = method.skill === 'fishing' || n.includes('fishing') || n.includes('thunder')
  const isDungeon = /dungeon|floor|master|catacombs/.test(n)
  const isKuudra  = n.includes('kuudra')
  const activities = methodActivities(method)

  return `Generate compact setup for: "${method.method}" (${tier.toUpperCase()}, ${method.coins_display || ''})
${method.key_drops ? 'DROPS: ' + method.key_drops : ''}
${method.the_edge  ? 'EDGE: '  + method.the_edge  : ''}
${method.why_best  ? 'WHY: '   + method.why_best  : ''}

SLAYER MAX TIERS: Zombie T5 | Spider T5 | Wolf T4 | Enderman T4 (T5 DOES NOT EXIST) | Blaze T4 (T5 DOES NOT EXIST) | Vampire T5

You must pick a PRECISE, JUSTIFIED spec for the armor and the weapon — not just a name.
armor_reforge/weapon_reforge MUST be copied verbatim (exact spelling) from the REFORGES list in the system context — never invent a reforge name.
armor_ultimate_enchant/weapon_ultimate_enchant MUST be exactly one of: ${ULTIMATE_ENCHANT_LIST} — or null if none fits. Only recommend an ultimate enchant when it clearly serves this tier's target stat and stays within budget; most setups should leave this null.
armor_hot_potato_count/weapon_hot_potato_count: 0, 5, or 10 — 10 (fuming) only for END/LATE tiers where the budget supports it.
gear_justification explains WHY these specific stars/reforge/enchant choices serve this method's actual target stat (e.g. "5-star Pure for max DEF/HP survivability" or "Ancient reforge for the STR breakpoint needed at this tier") — never a generic restatement of the item name.
${activities.length ? `This method's activity: ${activities.join(' + ')}. weapon_name/tool/rod MUST be picked from the PER-ACTIVITY WEAPON/TOOL CATALOGS section(s) in the system context matching ${activities.join(' and/or ')} only — never a different activity's section, even though every item shown anywhere in that context is real and priced. A real item in the wrong functional slot (e.g. a real combat sword recommended as a foraging tool) is a critical failure even though the item itself exists and is priced correctly.` : ''}

Return ONLY raw JSON (no backticks, no explanation):
{
  "how_to": "2-3 sentences: exact steps to execute this method",
  "why_best": "1 sentence: why optimal at this tier",
  "armor_set": "Name",
  "armor_stars": 5,
  "armor_recomb": true,
  "armor_reforge": "exact reforge_name from REFORGES list",
  "armor_hot_potato_count": 10,
  "armor_ultimate_enchant": null,
  "armor_stats": "HP X | DEF X | STR X | CD X%",
  "armor_bonus": "Set bonus: short effect",
  "weapon_name": "Name",
  "weapon_stars": 5,
  "weapon_recomb": true,
  "weapon_reforge": "exact reforge_name from REFORGES list",
  "weapon_hot_potato_count": 10,
  "weapon_ultimate_enchant": null,
  "weapon_stats": "STR +X | CD +X%",
  "weapon_ability": "Ability: key mechanic",${isMining ? '\n  "tool": "DrillName + FuelTank + Engine",' : ''}${isFishing ? '\n  "rod": "RodName + line type",' : ''}
  "gear_justification": "2-3 sentences: why this exact combination of stars/reforge/enchant serves the tier's target stat",
  "pet_name": "Name",
  "pet_level": 100,
  "pet_rarity": "LEGENDARY",
  "pet_bonus": "Exact bonus: +X% or specific effect",
  "pet_alt": "Budget alternative name",
  "mp_target": 900,
  "power_stone": "Stone name",
  "accessories": ["Item1", "Item2", "Item3", "Item4", "Item5"],
  "enchants_weapon": ["Enchant V", "Enchant III"],
  "enchants_armor": ["Growth V", "Protection V"],${isMining ? '\n  "enchants_tool": ["Compact I", "Efficiency V"],' : ''}${isFishing ? '\n  "enchants_rod": ["Angler V", "Luck of the Sea V"],' : ''}
  "gemstones": "Weapon: Gem(stat) | Armor: Gem(stat)",
  "reforges": "Weapon: Name | Armor: Name",
  "target_stats": "STR X+ | CD X%+ | DEF X+ | HP X+${isMining ? ' | Mining Speed X+ | Fortune X+' : ''}${isFishing ? ' | SCC X%+' : ''}",
  "requirements": "Skills X+. Slayer X. Other requirements.",
  "cost_budget": "X-YM — what you compromise",
  "cost_optimal": "A-BM — full setup",
  "cost_endgame": "C-DB — BiS",
  "location": "Exact zone + spot"${isSlayer ? ',\n  "strategy": "Boss tier + spawn + rotation. 2 sentences."' : ''}${isDungeon || isKuudra ? ',\n  "team_config": "Class + role + floor/tier + key mechanic. 2 sentences."' : ''}${isMining ? ',\n  "hotm_perks": "Key perks. Powder priority."' : ''}
}`
}

// ── Génère et sauvegarde un setup ───────────────────────────
export async function generateOne(
  method:       any,
  tier:         string,
  wikiContext:  string,
  pricedItems:  PricedItem[] = [],
  activityGear: ActivityGearCategories = {}
): Promise<boolean> {
  const key = methodKey(method)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: [{
          type:          'text',
          text:          wikiContext,
          cache_control: { type: 'ephemeral' },
        }],
        messages: [{ role: 'user', content: buildUserPrompt(method, tier) }],
      }),
    })

    if (!res.ok) throw new Error(`Claude ${res.status}`)
    const data  = await res.json()
    const setup = parseJSON(data.content?.[0]?.text || '')

    await applyPreciseCost(setup, pricedItems, activityGear, methodActivities(method))

    await supabase.from('method_setups').upsert(
      { method_key: key, tier, setup: JSON.stringify(setup), generated_at: new Date().toISOString() },
      { onConflict: 'method_key, tier' }
    )
    return true
  } catch (e: any) {
    console.error(`Setup failed [${tier}/${key}]:`, e.message)
    return false
  }
}

// ── Handler ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('setup-generate-agent')
  try {
    const { data: analyses } = await supabase
      .from('claude_analysis')
      .select('section, content')
      .like('section', 'money_making_%')

    if (!analyses?.length) {
      const msg = 'No methods in DB — run money-making-agent first'
      await finishSync(logId, 'error', 0, undefined, msg)
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const [{ data: ctx }, pricedItems, activityGear] = await Promise.all([
      supabase.rpc('get_full_context'),
      loadPricedItems(),
      loadActivityGearCategories(),
    ])
    const baseWikiContext = buildWikiContext(ctx) + '\n' + GROUNDING_RULES

    let ok = 0, fail = 0

    for (const analysis of analyses) {
      const tier = analysis.section.replace('money_making_', '') as keyof typeof TIER_CONFIG
      let tierData: any
      try { tierData = JSON.parse(analysis.content) } catch { continue }

      const methods: any[] = [...(tierData.active || []), ...(tierData.vault || [])]

      const tierConfig = TIER_CONFIG[tier]
      // Contexte système spécifique au tier (wiki partagé + catalogue budgé) —
      // cache actif dès le 2e appel du MÊME tier, pas across-tier (le catalogue
      // change de bande de prix par tier, donc le cache ne peut pas être partagé
      // au-delà d'un tier sans réintroduire le risque de gear hors-budget).
      const wikiContext = tierConfig
        ? baseWikiContext + '\n\n' + gearCatalogForBudget(pricedItems, tierConfig.max_gear_cost) +
          '\n\n' + buildActivityGearCatalogSection(pricedItems, tierConfig.max_gear_cost, MONEY_MAKING_ACTIVITIES, activityGear)
        : baseWikiContext

      // Batch de 3 parallèles — même wikiContext → cache actif dès le 2e appel
      for (let i = 0; i < methods.length; i += 3) {
        const batch   = methods.slice(i, i + 3)
        const results = await Promise.all(batch.map(m => generateOne(m, tier, wikiContext, pricedItems, activityGear)))
        results.forEach(r => r ? ok++ : fail++)
      }
    }

    const result = { success: true, generated: ok, failed: fail, model: 'haiku-4-5', cached_context: 'per-tier' }
    await finishSync(logId, fail > 0 && ok === 0 ? 'error' : fail > 0 ? 'partial' : 'success', ok, result)
    return NextResponse.json(result)
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}