// app/api/setup/generate/route.ts
// On-demand: génère le setup complet pour une méthode donnée
// Cache dans method_setups pour éviter de regenerer
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================
// PROMPT SETUP
// ============================================================
function buildSetupPrompt(method: any, tier: string, ctx: any): string {
  const wikiSection = (items: any[], maxChars = 1500) =>
    (items || []).map((w: any) => `[${w.key}]\n${(w.content || '').slice(0, maxChars)}`).join('\n\n')

  const wikiData = [
    '=== WIKI ARMOR SETS ===', wikiSection(ctx?.wiki_armor_sets, 1500),
    '=== WIKI WEAPONS ===',   wikiSection(ctx?.wiki_weapons, 1000),
    '=== WIKI SLAYERS ===',   wikiSection(ctx?.wiki_slayers, 1500),
    '=== WIKI KUUDRA ===',    wikiSection(ctx?.wiki_kuudra, 1500),
    '=== WIKI MINING ===',    wikiSection(ctx?.wiki_mining, 1500),
    '=== WIKI FISHING ===',   wikiSection(ctx?.wiki_fishing, 1000),
    '=== WIKI FARMING ===',   wikiSection(ctx?.wiki_farming, 1000),
    '=== WIKI PETS ===',      wikiSection(ctx?.wiki_pets, 800),
    '=== ENCHANTMENTS ===',   (ctx?.enchantments || []).map((e: any) => `${e.name} [${(e.item_types||[]).join(',')}] max=${e.max_level}`).join('\n'),
    '=== REFORGES ===',       (ctx?.reforges || []).map((r: any) => `${r.reforge_name} (${r.item_types}): ${JSON.stringify(r.stats)}`).join('\n'),
  ].join('\n')

  const isVault  = method.skills_combined !== undefined
  const isSlayer = method.skill === 'combat' && (method.method || '').toLowerCase().includes('slayer')
  const isMining = method.skill === 'mining'
  const isFishing = method.skill === 'fishing'
  const isDungeon = method.skill === 'combat' && ((method.method || '').toLowerCase().includes('dungeon') || (method.method || '').toLowerCase().includes('floor') || (method.method || '').toLowerCase().includes('master'))
  const isKuudra = (method.method || '').toLowerCase().includes('kuudra')

  return `You are Vault Setup Engine. Generate the OPTIMAL and COMPLETE gear setup for this exact money-making method.

METHOD: ${method.method}
TIER: ${tier.toUpperCase()}
SKILL: ${isVault ? (method.skills_combined || []).join(' + ') : method.skill}
COINS/HOUR: ${method.coins_display}
${method.the_edge ? 'THE EDGE: ' + method.the_edge : ''}
${method.key_drops ? 'KEY DROPS: ' + method.key_drops : ''}

=== RULES ===
- Use ONLY real item names from the wiki data provided
- Every stat must come from wiki data (HP, DEF, STR, CD, INT)
- Enchantments must use names from the enchantments list with correct item_types
- Reforges must use names from the reforges list
- Stars: use ⭐ symbols (max 5 for regular items, 7 for dungeons)
- Recomb: mention if recommended (true for high-value items)
- Be SPECIFIC and PRECISE — no vague recommendations

=== REQUIRED SECTIONS (include ALL) ===
1. armor — set name + stars + recomb + per-piece stats (HP/DEF/STR from wiki) + set bonus + WHY this armor
2. weapon — name + stars + recomb + key stat + special ability + WHY${isMining ? '\n   tool: drill model + fuel tank + engine + WHY' : ''}${isFishing ? '\n   rod: rod name + line + WHY' : ''}
3. pet — name + level + rarity + exact bonus it provides + alternative
4. accessories — MP target number + power stone name + top 5 must-have accessories
5. enchants — list for weapon, list for armor${isMining ? ', list for drill' : ''}${isFishing ? ', list for rod' : ''}
6. gemstones — by slot type + which gem + stat gained
7. reforges — armor reforge + weapon reforge + why
8. potions — which potions matter for this method + why
9. target_stats — specific numbers: STR X+, CD Y%+, DEF Z+, HP W+, MANA V+${isMining ? ', MINING_SPEED Q+, FORTUNE R+' : ''}${isFishing ? ', SCC X%+' : ''}
10. requirements — skill levels, slayer levels, progression gates, capital
11. cost_estimate — low/mid/high budget options in coins
12. location — exact spawn/zone + best route/spot${isSlayer ? '\n13. strategy — boss tier, spawn location, kill rotation, when to reset' : ''}${isDungeon || isKuudra ? '\n13. team_config — class/role, floor/tier, party size, boss mechanics to know' : ''}${isMining ? '\n13. hotm_perks — which HotM perks to activate + powder priority' : ''}

=== OUTPUT FORMAT (strict JSON only) ===
{
  "method": "${method.method}",
  "tier": "${tier}",
  "armor": {
    "set": "Armor Set Name",
    "stars": 5,
    "recomb": true,
    "pieces": [
      {"name": "Piece Name", "hp": 0, "def": 0, "str": 0, "cd": 0, "int": 0}
    ],
    "set_bonus": "Set bonus description",
    "why": "Why this armor for this method"
  },
  "weapon": {
    "name": "Weapon Name",
    "stars": 5,
    "recomb": true,
    "key_stat": "STR +X",
    "ability": "Ability name + effect",
    "why": "Why this weapon"
  },${isMining ? `
  "tool": {
    "drill": "Drill name",
    "fuel_tank": "Tank name",
    "engine": "Engine name",
    "why": "Why this configuration"
  },` : ''}${isFishing ? `
  "rod": {
    "name": "Rod name",
    "line": "Line type",
    "why": "Why"
  },` : ''}
  "pet": {
    "name": "Pet Name",
    "level": 100,
    "rarity": "LEGENDARY",
    "bonus": "Exact bonus from wiki",
    "alternative": "Second best pet if budget is lower"
  },
  "accessories": {
    "mp_target": 900,
    "power_stone": "Power stone name",
    "must_have": ["Accessory 1", "Accessory 2", "Accessory 3", "Accessory 4", "Accessory 5"]
  },
  "enchants": {
    "weapon": ["Enchant I Name V", "Enchant 2 Name III"],
    "armor": ["Growth V", "Protection V"]${isMining ? ',\n    "drill": ["Compact I", "Efficiency V"]' : ''}${isFishing ? ',\n    "rod": ["Angler V", "Expertise VI"]' : ''}
  },
  "gemstones": [
    {"slot": "Weapon", "gem": "Jasper", "stat": "+STR"},
    {"slot": "Armor", "gem": "Ruby", "stat": "+DEF"}
  ],
  "reforges": {
    "weapon": "Reforge name + reason",
    "armor": "Reforge name + reason"
  },
  "potions": ["Potion 1 + why", "Potion 2 + why"],
  "target_stats": {
    "strength": "800+",
    "crit_damage": "600%+",
    "defense": "1500+",
    "health": "15000+",
    "mana": "3000+"${isMining ? ',\n    "mining_speed": "2000+",\n    "fortune": "500+"' : ''}${isFishing ? ',\n    "sea_creature_chance": "400%+"' : ''}
  },
  "requirements": {
    "skills": "Combat 40+, etc.",
    "slayer": "Slayer type X+",
    "other": "Any other requirement"
  },
  "cost_estimate": {
    "budget": "X-YM coins — what you compromise",
    "optimal": "A-BM coins — full setup",
    "endgame": "C-DB coins — BiS everything"
  },
  "location": "Exact zone + best spot"${isSlayer ? `,
  "strategy": "Boss tier, spawn, kill rotation, reset timing"` : ''}${isDungeon || isKuudra ? `,
  "team_config": "Class, role, floor/tier, party size, key mechanics"` : ''}${isMining ? `,
  "hotm_perks": "Which perks to unlock first + powder priority"` : ''}
}

Wiki data for reference:
${wikiData}`
}

// ============================================================
// HANDLER
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const { method, tier } = await req.json()
    if (!method || !tier) return NextResponse.json({ error: 'method and tier required' }, { status: 400 })

    const methodKey = (method.id || method.method || '').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 80)

    // Check cache
    const { data: cached } = await supabase
      .from('method_setups')
      .select('setup, generated_at')
      .eq('method_key', methodKey)
      .eq('tier', tier)
      .single()

    // Cache valide 12h
    if (cached?.setup) {
      const age = Date.now() - new Date(cached.generated_at).getTime()
      if (age < 12 * 60 * 60 * 1000) {
        return NextResponse.json({ setup: JSON.parse(cached.setup), cached: true })
      }
    }

    // Fetch contexte wiki
    const { data: ctx } = await supabase.rpc('get_full_context')

    // Appel Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 4000,
        messages:   [{ role: 'user', content: buildSetupPrompt(method, tier, ctx) }]
      })
    })

    if (!claudeRes.ok) throw new Error('Claude API error: ' + claudeRes.status)
    const data    = await claudeRes.json()
    const content = data.content?.[0]?.text || ''

    // Parse JSON
    let setup: any
    try {
      setup = JSON.parse(content.replace(/```json\n?|```\n?/g, '').trim())
    } catch {
      throw new Error('Setup JSON parse failed: ' + content.slice(0, 200))
    }

    // Sauvegarde cache
    await supabase.from('method_setups').upsert({
      method_key:   methodKey,
      tier,
      setup:        JSON.stringify(setup),
      generated_at: new Date().toISOString()
    }, { onConflict: 'method_key, tier' })

    return NextResponse.json({ setup, cached: false })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}