// app/api/cron/setup-generate-agent/route.ts
// Génère tous les setups — lundi 7h UTC (après money-making-agent à 6h)
// Haiku + prompt caching — ~0.04€/semaine
// Claude fournit du TEXTE uniquement — le visuel est géré par React
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Clé unique identique entre agent et route ─────────────────
function methodKey(method: any): string {
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
function buildWikiContext(ctx: any): string {
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
async function generateOne(
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

  const { data: ctx } = await supabase.rpc('get_full_context')
  const wikiContext   = buildWikiContext(ctx)

  let ok = 0, fail = 0

  for (const analysis of analyses) {
    const tier = analysis.section.replace('money_making_', '')
    let tierData: any
    try { tierData = JSON.parse(analysis.content) } catch { continue }

    const methods: any[] = [...(tierData.active || []), ...(tierData.vault || [])]

    // Batch de 3 parallèles — même wikiContext → cache actif dès le 2e appel
    for (let i = 0; i < methods.length; i += 3) {
      const batch   = methods.slice(i, i + 3)
      const results = await Promise.all(batch.map(m => generateOne(m, tier, wikiContext)))
      results.forEach(r => r ? ok++ : fail++)
    }
  }

  return NextResponse.json({ success: true, generated: ok, failed: fail, model: 'haiku-4-5', cached_context: true })
}