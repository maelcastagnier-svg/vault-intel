// app/api/cron/setup-generate-agent/route.ts
// Génère tous les setups — lundi 7h
// Haiku + prompt caching → ~0.04€/semaine au lieu de 0.85€
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseClaudeJSON(text: string): any {
  const clean = text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()
  return JSON.parse(clean)
}

// ── Construit le contexte wiki UNE FOIS pour tout le run ────
function buildWikiContext(ctx: any): string {
  const wikiSection = (items: any[], maxChars = 1000) =>
    (items || []).map((w: any) => `[${w.key}]\n${(w.content || '').slice(0, maxChars)}`).join('\n\n')

  return [
    '=== ARMOR SETS ===', wikiSection(ctx?.wiki_armor_sets, 1000),
    '=== WEAPONS ===',    wikiSection(ctx?.wiki_weapons, 600),
    '=== SLAYERS ===',    wikiSection(ctx?.wiki_slayers, 1000),
    '=== KUUDRA ===',     wikiSection(ctx?.wiki_kuudra, 800),
    '=== MINING ===',     wikiSection(ctx?.wiki_mining, 800),
    '=== FISHING ===',    wikiSection(ctx?.wiki_fishing, 600),
    '=== FARMING ===',    wikiSection(ctx?.wiki_farming, 500),
    '=== PETS ===',       wikiSection(ctx?.wiki_pets, 400),
    '=== ENCHANTMENTS ===',
    (ctx?.enchantments || []).map((e: any) =>
      `${e.name}[${(e.item_types||[]).join(',')}]max=${e.max_level}`
    ).join(' | '),
    '=== REFORGES ===',
    (ctx?.reforges || []).map((r: any) =>
      `${r.reforge_name}:${JSON.stringify(r.stats)}`
    ).join(' | '),
  ].join('\n')
}

// ── Prompt USER uniquement (le wiki est dans le system caché) ─
function buildUserPrompt(method: any, tier: string): string {
  const isSlayer  = (method.method || '').toLowerCase().includes('slayer')
  const isMining  = method.skill === 'mining'
  const isFishing = method.skill === 'fishing'
  const isDungeon = !!(method.method || '').toLowerCase().match(/dungeon|floor|master|catacombs/)
  const isKuudra  = (method.method || '').toLowerCase().includes('kuudra')

  return `Generate compact setup JSON for this method.

METHOD: ${method.method}
TIER: ${tier.toUpperCase()}
COINS: ${method.coins_display}
${method.key_drops ? 'DROPS: ' + method.key_drops : ''}
${method.the_edge ? 'EDGE: ' + method.the_edge : ''}
${method.why_best ? 'WHY BEST: ' + method.why_best : ''}

Return ONLY raw JSON (no backticks):
{
  "how_to": "Step-by-step HOW in 2-3 sentences. What to do, where, in what order.",
  "why_best": "Why optimal at ${tier} vs alternatives. 1 sentence.",
  "armor": {
    "set": "Set Name",
    "stars": 5,
    "recomb": true,
    "total_stats": "HP X | DEF X | STR X | CD X%",
    "set_bonus": "Bonus: short effect"
  },
  "weapon": {
    "name": "Name",
    "stars": 5,
    "recomb": true,
    "stats": "STR +X | CD +X%",
    "ability": "Ability: key mechanic"
  },${isMining ? '\n  "tool": "DrillName + FuelTank + Engine",' : ''}${isFishing ? '\n  "rod": "RodName + Line type",' : ''}
  "pet": {
    "name": "Name",
    "level": 100,
    "rarity": "LEGENDARY",
    "bonus": "Exact: +X% or specific effect",
    "alternative": "Budget alt name"
  },
  "accessories": {
    "mp_target": 900,
    "power_stone": "Name",
    "must_have": ["Item1", "Item2", "Item3", "Item4", "Item5"]
  },
  "enchants": {
    "weapon": ["Enchant V", "Enchant III"],
    "armor": ["Growth V", "Protection V"]${isMining ? ',\n    "drill": ["Compact I", "Efficiency V"]' : ''}${isFishing ? ',\n    "rod": ["Angler V", "Luck of the Sea V"]' : ''}
  },
  "gemstones": "Weapon: Gem (stat) | Armor: Gem (stat)",
  "reforges": "Weapon: Name (why) | Armor: Name (why)",
  "target_stats": "STR X+ | CD X%+ | DEF X+ | HP X+${isMining ? ' | Mining Speed X+ | Fortune X+' : ''}${isFishing ? ' | SCC X%+' : ''}",
  "requirements": "Skills X+. Slayer X. Unlocks: X.",
  "cost_estimate": "Budget: X-YM | Optimal: A-BM | BiS: C-DB",
  "location": "Zone + exact spot"${isSlayer ? ',\n  "strategy": "Boss tier + spawn + kill rotation. 2 sentences."' : ''}${(isDungeon || isKuudra) ? ',\n  "team_config": "Class + role + floor/tier + key mechanic. 2 sentences."' : ''}${isMining ? ',\n  "hotm_perks": "Key perks list. Powder priority."' : ''}
}`
}

// ── Génère un setup avec Haiku + cache ──────────────────────
async function generateSetup(
  method:      any,
  tier:        string,
  cachedSystem: string
): Promise<{ ok: boolean; key: string; cached_hit?: boolean }> {
  const methodKey = (method.id || method.method || '')
    .toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 80)

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
        'anthropic-beta':    'prompt-caching-2024-07-31' // Active le prompt caching
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001', // Haiku — 20x moins cher
        max_tokens: 1500,
        system: [{
          type:          'text',
          text:          cachedSystem,   // Wiki context — mis en cache après le 1er appel
          cache_control: { type: 'ephemeral' }
        }],
        messages: [{
          role:    'user',
          content: buildUserPrompt(method, tier)
        }]
      })
    })

    if (!claudeRes.ok) throw new Error('Claude ' + claudeRes.status)
    const data    = await claudeRes.json()
    const content = data.content?.[0]?.text || ''
    const setup   = parseClaudeJSON(content)

    // Log si le cache a été utilisé
    const usage      = data.usage || {}
    const cachedHit  = (usage.cache_read_input_tokens || 0) > 0

    await supabase.from('method_setups').upsert({
      method_key:   methodKey,
      tier,
      setup:        JSON.stringify(setup),
      generated_at: new Date().toISOString()
    }, { onConflict: 'method_key, tier' })

    return { ok: true, key: methodKey, cached_hit: cachedHit }

  } catch (e: any) {
    console.error('Setup error ' + methodKey + ':', e.message)
    return { ok: false, key: methodKey }
  }
}

// ── Handler principal ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Charge les méthodes depuis DB
    const { data: analyses } = await supabase
      .from('claude_analysis')
      .select('section, content')
      .like('section', 'money_making_%')

    if (!analyses?.length) {
      return NextResponse.json({ error: 'No methods — run money-making-agent first' })
    }

    // Charge le wiki UNE SEULE FOIS
    const { data: ctx } = await supabase.rpc('get_full_context')
    const wikiContext   = buildWikiContext(ctx)

    const results: any[] = []
    let cache_hits = 0

    // Traite chaque tier séquentiellement
    for (const analysis of analyses) {
      const tier = analysis.section.replace('money_making_', '')
      let tierData: any
      try { tierData = JSON.parse(analysis.content) } catch { continue }

      const methods = [...(tierData.active || []), ...(tierData.vault || [])]

      // Batch de 3 en parallèle — même wikiContext → cache actif dès le 2ème appel
      for (let i = 0; i < methods.length; i += 3) {
        const batch     = methods.slice(i, i + 3)
        const batchRes  = await Promise.all(
          batch.map(m => generateSetup(m, tier, wikiContext))
        )
        batchRes.forEach((r, idx) => {
          if (r.cached_hit) cache_hits++
          results.push({ tier, method: batch[idx].method, ok: r.ok, cache: r.cached_hit })
        })
      }
    }

    return NextResponse.json({
      success:          true,
      setups_generated: results.filter(r => r.ok).length,
      setups_failed:    results.filter(r => !r.ok).length,
      cache_hits,
      model:            'claude-haiku-4-5-20251001',
      results
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}