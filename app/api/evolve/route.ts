import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CACHE_HOURS = 6

export async function POST(req: Request) {
  try {
    const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
    const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!HYPIXEL_KEY || !SUPA_URL || !SUPA_KEY) {
      return NextResponse.json({ error: 'Server misconfigured — missing env vars' }, { status: 500 })
    }

    const { userId, username, plan } = await req.json()

    if (!['pro', 'elite'].includes(plan)) {
      return NextResponse.json({ error: 'Evolve requires Pro or Elite plan' }, { status: 403 })
    }
    if (!username || !userId) {
      return NextResponse.json({ error: 'Missing username or userId' }, { status: 400 })
    }

    const supabase = createClient(SUPA_URL, SUPA_KEY)

    const { data: existing } = await supabase
      .from('player_data')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (existing && existing.updated_at) {
      const ageHours = (Date.now() - new Date(existing.updated_at).getTime()) / 3600000
      if (ageHours < CACHE_HOURS) {
        return NextResponse.json({ profile: existing, cached: true })
      }
    }

    const mojangRes = await fetch('https://api.mojang.com/users/profiles/minecraft/' + encodeURIComponent(username))
    if (!mojangRes.ok) {
      return NextResponse.json({ error: 'Username not found on Mojang — check spelling' }, { status: 404 })
    }
    const mojangData = await mojangRes.json()
    const uuid = mojangData.id

    const hypixelRes = await fetch('https://api.hypixel.net/v2/skyblock/profiles?key=' + HYPIXEL_KEY + '&uuid=' + uuid)
    const hypixelData = await hypixelRes.json()
    if (!hypixelData.success) {
      return NextResponse.json({ error: 'Hypixel API error: ' + (hypixelData.cause || 'unknown') }, { status: 502 })
    }

    const profiles = hypixelData.profiles || []
    const activeProfile = profiles.find((p: any) => p.selected) || profiles[0]
    if (!activeProfile) {
      return NextResponse.json({ error: 'No SkyBlock profile found' }, { status: 404 })
    }

    const member = activeProfile.members?.[uuid]
    if (!member) {
      return NextResponse.json({ error: 'Could not read member data' }, { status: 404 })
    }

    const purse = Math.round(member.currencies?.coin_purse || 0)
    const bank = Math.round(activeProfile.banking?.balance || 0)
    const networthEstimate = purse + bank

    // Skills
    const skills: Record<string, number> = {}
    const xpMap = member.player_data?.experience || {}
    for (const [key, xp] of Object.entries(xpMap)) {
      if (key.startsWith('SKILL_')) {
        const name = key.replace('SKILL_', '').toLowerCase()
        skills[name] = Math.floor(Math.sqrt((xp as number) / 10) / 2)
      }
    }

    // Slayers
    const slayers: Record<string, any> = {}
    const slayerData = member.slayer?.slayer_bosses || {}
    for (const [type, info] of Object.entries<any>(slayerData)) {
      slayers[type] = { claimed_levels: info.claimed_levels || {}, xp: info.xp || 0 }
    }

    // Dungeons
    const cataXp = member.dungeons?.dungeon_types?.catacombs?.experience || 0
    const catacombsLevel = cataXp ? Math.floor(Math.sqrt(cataXp / 10) / 2) : 0

    const fairySouls = member.fairy_soul?.total_collected || 0
    const skinUrl = 'https://mc-heads.net/body/' + uuid + '/300'

    const stageFromNetworth = networthEstimate < 10_000_000 ? 'early' :
      networthEstimate < 500_000_000 ? 'mid' :
      networthEstimate < 5_000_000_000 ? 'end' : 'late'

    let methods: any[] = []
    try {
      const { data: methodsData } = await supabase
        .from('money_making_methods')
        .select('method_name, category, coins_per_hour_min, coins_per_hour_max, requirements')
        .eq('verified', true)
        .order('coins_per_hour_max', { ascending: false })
        .limit(15)
      methods = methodsData || []
    } catch (e) {}

    const compactContext = {
      username,
      purse,
      bank,
      networth_estimate: networthEstimate,
      skills,
      catacombs_level: catacombsLevel,
      slayers: Object.entries(slayers).map(([k, v]: [string, any]) => k + ': ' + Object.keys(v.claimed_levels || {}).length + ' levels claimed').join(', '),
      fairy_souls: fairySouls,
      current_stage_guess: stageFromNetworth,
      available_methods: methods.map(m => m.method_name + ' [' + m.category + '] ' + Math.round(m.coins_per_hour_min/1e6) + '-' + Math.round(m.coins_per_hour_max/1e6) + 'M/h req=' + JSON.stringify(m.requirements))
    }

    let analysis: any = { game_stage: stageFromNetworth, summary: '', priority_actions: [], next_tier: '', next_tier_progress: 0, next_tier_route: [] }

    if (ANTHROPIC_KEY) {
      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            system: 'You are Vault Evolve, a Hypixel Skyblock progression coach. Given a player profile and verified money-making methods, do 3 things: (1) confirm/refine game stage (early <10M, mid 10M-500M, end 500M-5B, late 5B+ networth), (2) give 3-5 specific priority actions to improve NOW, (3) build a concrete "next_tier_route": 3-4 steps to reach the NEXT stage, referencing available_methods with specific coins/hr targets. Output raw JSON only, no markdown fence: {"game_stage":"early|mid|end|late","summary":"1-2 sentences","priority_actions":[{"title":"...","reason":"...","impact":"..."}],"next_tier":"mid|end|late","next_tier_progress":0-100,"next_tier_route":[{"step":"...","target":"..."}]}',
            messages: [{ role: 'user', content: JSON.stringify(compactContext) }]
          })
        })
        if (claudeRes.ok) {
          const claudeData = await claudeRes.json()
          const text = claudeData.content?.[0]?.text || '{}'
          const startIdx = text.indexOf('{')
          const endIdx = text.lastIndexOf('}')
          if (startIdx !== -1 && endIdx !== -1) {
            analysis = JSON.parse(text.substring(startIdx, endIdx + 1))
          }
        } else {
          console.error('Claude API error:', claudeRes.status, await claudeRes.text())
        }
      } catch (e: any) {
        console.error('Claude call failed:', e.message)
      }
    }

    const record = {
      user_id: userId,
      hypixel_username: username,
      hypixel_uuid: uuid,
      purse,
      bank,
      networth: networthEstimate,
      skills,
      slayers,
      dungeons: { catacombs_level: catacombsLevel, experience: cataXp },
      collections: member.collection || {},
      pets: member.pets_data?.pets || [],
      fairy_souls: fairySouls,
      skin_url: skinUrl,
      game_stage: analysis.game_stage || stageFromNetworth,
      evolve_summary: analysis.summary || '',
      priority_actions: analysis.priority_actions || [],
      next_tier: analysis.next_tier || '',
      next_tier_progress: analysis.next_tier_progress || 0,
      next_tier_route: analysis.next_tier_route || [],
      raw_profile: { profile_id: activeProfile.profile_id, cute_name: activeProfile.cute_name },
      last_synced: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data: saved, error } = await supabase
      .from('player_data')
      .upsert(record, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Supabase error: ' + error.message }, { status: 500 })
    }

    return NextResponse.json({ profile: saved, cached: false })

  } catch (e: any) {
    console.error('Evolve route crashed:', e.message)
    return NextResponse.json({ error: 'Server error: ' + (e.message || 'unknown') }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await supabase.from('player_data').select('*').eq('user_id', userId).single()
    return NextResponse.json({ profile: data || null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}