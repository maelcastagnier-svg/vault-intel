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

    const { userId, username, plan, force } = await req.json()

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

    if (!force && existing && existing.updated_at) {
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

    // Skills — real Hypixel XP thresholds per skill (cumulative), not an approximation
    // Standard skills cap at level 50, Farming/Mining/Fishing extend to 60 with bonus levels
    const SKILL_XP_TABLE_50 = [
      0, 50, 175, 375, 675, 1175, 1925, 2925, 4425, 6425, 9925, 14925, 22425, 32425, 47425,
      67425, 97425, 147425, 222425, 322425, 522425, 822425, 1222425, 1722425, 2322425,
      3022425, 3822425, 4722425, 5722425, 6822425, 8022425, 9322425, 10722425, 12222425,
      13822425, 15522425, 17322425, 19222425, 21222425, 23322425, 25522425, 27822425,
      30222425, 32722425, 35322425, 38072425, 40972425, 44072425, 47472425, 51372425
    ]
    const SKILL_XP_TABLE_60 = SKILL_XP_TABLE_50.concat([
      55172425, 59472425, 64472425, 70472425, 77472425, 85472425, 93472425, 101472425, 110472425
    ])
    const SKILLS_WITH_60_CAP = new Set(['farming', 'mining', 'fishing'])

    function skillXpDetail(xp: number, skillName: string): { level: number, progress: number, currentXp: number, nextLevelXp: number | null } {
      const table = SKILLS_WITH_60_CAP.has(skillName) ? SKILL_XP_TABLE_60 : SKILL_XP_TABLE_50
      let level = 0
      for (let i = 0; i < table.length; i++) {
        if (xp >= table[i]) level = i
        else break
      }
      const currentThreshold = table[level] || 0
      const nextThreshold = table[level + 1]
      const progress = nextThreshold ? Math.round(((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100) : 100
      return { level, progress, currentXp: Math.round(xp), nextLevelXp: nextThreshold || null }
    }

    const skills: Record<string, number> = {}
    const skillsDetailed: Record<string, any> = {}
    const xpMap = member.player_data?.experience || {}
    for (const [key, xp] of Object.entries(xpMap)) {
      if (key.startsWith('SKILL_')) {
        const name = key.replace('SKILL_', '').toLowerCase()
        const detail = skillXpDetail(xp as number, name)
        skills[name] = detail.level
        skillsDetailed[name] = detail
      }
    }

    // Slayers
    const slayers: Record<string, any> = {}
    const slayerData = member.slayer?.slayer_bosses || {}
    for (const [type, info] of Object.entries<any>(slayerData)) {
      slayers[type] = { claimed_levels: info.claimed_levels || {}, xp: info.xp || 0 }
    }

    // Dungeons — real Hypixel catacombs XP thresholds (cumulative), not an approximation
    const CATACOMBS_XP_TABLE = [
      0, 50, 125, 235, 395, 625, 955, 1425, 2095, 3045, 4385, 6275, 8940, 12700, 17960,
      25340, 35640, 50040, 70040, 97640, 135640, 188140, 259640, 356640, 488640, 668640,
      911640, 1239640, 1684640, 2284640, 3084640, 4149640, 5559640, 7459640, 9959640,
      13259640, 17559640, 23159640, 30359640, 39559640, 51559640, 66559640, 85559640,
      109559640, 139559640, 177559640, 225559640, 285559640, 360559640, 453559640, 569809640
    ]

    function xpToLevel(xp: number): number {
      let level = 0
      for (let i = 0; i < CATACOMBS_XP_TABLE.length; i++) {
        if (xp >= CATACOMBS_XP_TABLE[i]) level = i
        else break
      }
      return level
    }

    const cataXp = member.dungeons?.dungeon_types?.catacombs?.experience || 0
    const catacombsLevel = xpToLevel(cataXp)

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