// app/api/cron/setup-generate-agent/route.ts
// Génère tous les setups — lundi 7h UTC (après money-making-agent à 6h)
// Haiku + prompt caching — ~0.04€/semaine
// Claude fournit du TEXTE uniquement — le visuel est géré par React
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TIER_CONFIG } from '../../../../lib/money-making-constants'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Catalogue d'items réels, prix réels — évite le hallucinated gear ──
// item_stats = vrais stat blocks Hypixel (item_id/category/health/defense/
// strength/crit_damage/crit_chance/intelligence/speed), confirmé via
// skyblock-resources-sync/route.ts. price_history_ah = prix AH réel le plus
// récent (moyenne toutes variantes, DAILY, __all_variants_blended__).
// Jointure faite en JS (item_id commun aux deux tables).
type PricedItem = {
  item_id: string; display_name: string; category: string
  health: number; defense: number; strength: number
  crit_damage: number; crit_chance: number; intelligence: number; speed: number
  price: number
}

export async function loadPricedItems(): Promise<PricedItem[]> {
  const since = new Date(Date.now() - 4 * 86_400_000).toISOString().split('T')[0]

  const [{ data: stats }, { data: prices }] = await Promise.all([
    supabase.from('item_stats')
      .select('item_id, display_name, category, health, defense, strength, crit_damage, crit_chance, intelligence, speed'),
    supabase.from('price_history_ah')
      .select('base_item_id, avg_price, bucket_date')
      .eq('variant_key', '__all_variants_blended__')
      .eq('granularity', 'DAILY')
      .gte('bucket_date', since)
      .gt('avg_price', 0)
      .order('bucket_date', { ascending: false }),
  ])

  // Le prix le plus récent par item (premier vu, puisque trié desc par date)
  const latestPrice = new Map<string, number>()
  for (const p of prices || []) {
    if (!latestPrice.has(p.base_item_id)) latestPrice.set(p.base_item_id, Number(p.avg_price))
  }

  return (stats || [])
    .filter(s => latestPrice.has(s.item_id))
    .map(s => ({
      item_id:      s.item_id,
      display_name: s.display_name,
      category:     s.category || 'OTHER',
      health:       s.health       || 0,
      defense:      s.defense      || 0,
      strength:     s.strength     || 0,
      crit_damage:  s.crit_damage  || 0,
      crit_chance:  s.crit_chance  || 0,
      intelligence: s.intelligence || 0,
      speed:        s.speed        || 0,
      price:        latestPrice.get(s.item_id)!,
    }))
}

// Filtre par bande de budget du tier + score de puissance brut (proxy simple,
// pas une formule de jeu officielle — sert juste à trier, pas à afficher).
// Bande large (budget/25 → budget×3) pour inclure du budget jusqu'au BiS,
// sans laisser un tier bas polluer le catalogue d'un tier haut (ex: Mithril,
// prix réel bien sous le plancher LATE, n'apparaît jamais dans ce catalogue-là).
export function gearCatalogForBudget(priced: PricedItem[], maxGearCost: number): string {
  const minPrice = maxGearCost / 25
  const maxPrice = maxGearCost * 3

  const rows = priced
    .filter(s => s.price >= minPrice && s.price <= maxPrice)
    .map(s => ({
      ...s,
      power: s.health + s.defense * 2 + s.strength + s.crit_damage * 2 + s.crit_chance * 2 + s.intelligence * 0.5 + s.speed,
    }))
    .sort((a, b) => b.power - a.power)
    .slice(0, 60)

  if (rows.length === 0) {
    return '=== REAL GEAR CATALOG (priced, in-budget) ===\nNo priced item found in this budget band — rely on the wiki sections above only, and mark confidence LOW on any specific item name you are not certain still exists.'
  }

  return '=== REAL GEAR CATALOG (actual traded items, current AH price, filtered to this tier\'s budget) ===\n' +
    rows.map(s =>
      `${s.item_id} "${s.display_name}" [${s.category}] price=${Math.round(s.price).toLocaleString()} | ` +
      `HP${s.health} DEF${s.defense} STR${s.strength} CD${s.crit_damage} CC${s.crit_chance} INT${s.intelligence} SPD${s.speed}`
    ).join('\n')
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
- cost_budget / cost_optimal / cost_endgame must be consistent with the "price=" values shown in the catalog for the items you actually name, not invented numbers.
- pet_name and gemstones are not in this catalog — use the WIKI sections above for those, and if still uncertain, mark confidence implicitly by keeping the recommendation generic rather than naming an ultra-specific variant you're not sure exists.
- If the catalog says "No priced item found in this budget band", do not invent a specific item — describe the setup at the archetype level (e.g. "best available T4 mining armor") instead of naming an unverified item.
`

// ── Prompt utilisateur (le wiki est dans le system caché) ────
function buildUserPrompt(method: any, tier: string): string {
  const n = (method.method || '').toLowerCase()
  const isSlayer  = n.includes('slayer')
  const isMining  = method.skill === 'mining' || n.includes('mining') || n.includes('glacite') || n.includes('crystal')
  const isFishing = method.skill === 'fishing' || n.includes('fishing') || n.includes('thunder')
  const isDungeon = /dungeon|floor|master|catacombs/.test(n)
  const isKuudra  = n.includes('kuudra')

  return `Generate compact setup for: "${method.method}" (${tier.toUpperCase()}, ${method.coins_display || ''})
${method.key_drops ? 'DROPS: ' + method.key_drops : ''}
${method.the_edge  ? 'EDGE: '  + method.the_edge  : ''}
${method.why_best  ? 'WHY: '   + method.why_best  : ''}

SLAYER MAX TIERS: Zombie T5 | Spider T4 | Wolf T4 | Enderman T4 (T5 DOES NOT EXIST) | Blaze T5 | Vampire T5

Return ONLY raw JSON (no backticks, no explanation):
{
  "how_to": "2-3 sentences: exact steps to execute this method",
  "why_best": "1 sentence: why optimal at this tier",
  "armor_set": "Name",
  "armor_stars": 5,
  "armor_recomb": true,
  "armor_stats": "HP X | DEF X | STR X | CD X%",
  "armor_bonus": "Set bonus: short effect",
  "weapon_name": "Name",
  "weapon_stars": 5,
  "weapon_recomb": true,
  "weapon_stats": "STR +X | CD +X%",
  "weapon_ability": "Ability: key mechanic",${isMining ? '\n  "tool": "DrillName + FuelTank + Engine",' : ''}${isFishing ? '\n  "rod": "RodName + line type",' : ''}
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
  method:      any,
  tier:        string,
  wikiContext: string
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

  const { data: analyses } = await supabase
    .from('claude_analysis')
    .select('section, content')
    .like('section', 'money_making_%')

  if (!analyses?.length) {
    return NextResponse.json({ error: 'No methods in DB — run money-making-agent first' }, { status: 400 })
  }

  const [{ data: ctx }, pricedItems] = await Promise.all([
    supabase.rpc('get_full_context'),
    loadPricedItems(),
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
      ? baseWikiContext + '\n\n' + gearCatalogForBudget(pricedItems, tierConfig.max_gear_cost)
      : baseWikiContext

    // Batch de 3 parallèles — même wikiContext → cache actif dès le 2e appel
    for (let i = 0; i < methods.length; i += 3) {
      const batch   = methods.slice(i, i + 3)
      const results = await Promise.all(batch.map(m => generateOne(m, tier, wikiContext)))
      results.forEach(r => r ? ok++ : fail++)
    }
  }

  return NextResponse.json({ success: true, generated: ok, failed: fail, model: 'haiku-4-5', cached_context: 'per-tier' })
}