// app/api/setup/generate/route.ts
// Lit depuis DB — fallback on-demand avec JSON parse robuste
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

export async function POST(req: NextRequest) {
  try {
    const { method, tier } = await req.json()
    if (!method || !tier) return NextResponse.json({ error: 'method and tier required' }, { status: 400 })

    const methodKey = (method.id || method.method || '')
      .toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 80)

    // ── Cache DB ─────────────────────────────────────────────
    const { data: cached } = await supabase
      .from('method_setups')
      .select('setup, generated_at')
      .eq('method_key', methodKey)
      .eq('tier', tier)
      .single()

    if (cached?.setup) {
      try {
        return NextResponse.json({ setup: JSON.parse(cached.setup), cached: true })
      } catch {}
    }

    // ── Fallback on-demand ───────────────────────────────────
    const { data: ctx } = await supabase.rpc('get_full_context')
    const wikiSection = (items: any[], n = 800) =>
      (items || []).map((w: any) => `[${w.key}]\n${(w.content||'').slice(0,n)}`).join('\n\n')

    const isSlayer  = (method.method||'').toLowerCase().includes('slayer')
    const isMining  = method.skill === 'mining'
    const isFishing = method.skill === 'fishing'
    const isDungeon = !!(method.method||'').toLowerCase().match(/dungeon|floor|master|catacombs/)
    const isKuudra  = (method.method||'').toLowerCase().includes('kuudra')

    const wiki = [
      wikiSection(ctx?.wiki_armor_sets, 800),
      wikiSection(ctx?.wiki_weapons, 500),
      wikiSection(ctx?.wiki_slayers, 800),
      wikiSection(ctx?.wiki_kuudra, 600),
      wikiSection(ctx?.wiki_mining, 600),
      wikiSection(ctx?.wiki_fishing, 400),
      wikiSection(ctx?.wiki_pets, 300),
      (ctx?.enchantments||[]).map((e: any) => `${e.name}[${(e.item_types||[]).join(',')}]${e.max_level}`).join(' '),
      (ctx?.reforges||[]).map((r: any) => `${r.reforge_name}:${JSON.stringify(r.stats)}`).join(' '),
    ].join('\n')

    const prompt = `Vault Setup Engine. Compact setup JSON for: ${method.method} (${tier}, ${method.coins_display})
${method.key_drops ? 'DROPS: '+method.key_drops : ''}
${method.the_edge ? 'EDGE: '+method.the_edge : ''}

Return ONLY raw JSON no backticks:
{"how_to":"Step-by-step HOW in 2-3 sentences","why_best":"Why optimal 1 sentence","armor":{"set":"Name","stars":5,"recomb":true,"total_stats":"HP X|DEF X|STR X|CD X%","set_bonus":"Bonus: effect"},"weapon":{"name":"Name","stars":5,"recomb":true,"stats":"STR +X","ability":"Ability: effect"}${isMining?',"tool":"DrillName+Tank+Engine"':''}${isFishing?',"rod":"RodName+Line"':''},"pet":{"name":"Name","level":100,"rarity":"LEGENDARY","bonus":"Exact bonus","alternative":"Budget alt"},"accessories":{"mp_target":900,"power_stone":"Name","must_have":["A1","A2","A3","A4","A5"]},"enchants":{"weapon":["Ench V"],"armor":["Growth V"]${isMining?',"drill":["Compact I"]':''}${isFishing?',"rod":["Angler V"]':''}},"gemstones":"Weapon:Gem(stat)|Armor:Gem(stat)","reforges":"Weapon:Name|Armor:Name","target_stats":"STR X+|CD X%+|DEF X+|HP X+","requirements":"Skills+slayer+unlocks in 1 line","cost_estimate":"Budget:X-YM|Optimal:A-BM|BiS:C-DB","location":"Zone+spot"${isSlayer?',"strategy":"Boss tier+spawn+rotation 2 sentences"':''}${(isDungeon||isKuudra)?',"team_config":"Class+role+floor/tier 2 sentences"':''}${isMining?',"hotm_perks":"Key perks+powder priority"':''}}

Wiki:
${wiki}`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
    })

    if (!claudeRes.ok) throw new Error('Claude ' + claudeRes.status)
    const data    = await claudeRes.json()
    const setup   = parseClaudeJSON(data.content?.[0]?.text || '')

    await supabase.from('method_setups').upsert({
      method_key: methodKey, tier,
      setup: JSON.stringify(setup),
      generated_at: new Date().toISOString()
    }, { onConflict: 'method_key, tier' })

    return NextResponse.json({ setup, cached: false })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}