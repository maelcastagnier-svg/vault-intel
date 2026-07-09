import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CACHE_HOURS = 6

const CATACOMBS_XP_TABLE = [
  0, 50, 125, 235, 395, 625, 955, 1425, 2095, 3045, 4385, 6275, 8940, 12700, 17960,
  25340, 35640, 50040, 70040, 97640, 135640, 188140, 259640, 356640, 488640, 668640,
  911640, 1239640, 1684640, 2284640, 3084640, 4149640, 5559640, 7459640, 9959640,
  13259640, 17559640, 23159640, 30359640, 39559640, 51559640, 66559640, 85559640,
  109559640, 139559640, 177559640, 225559640, 285559640, 360559640, 453559640, 569809640
]
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
const GARDEN_XP_TABLE = [
  0, 60, 160, 260, 380, 500, 700, 900, 1200, 1500, 2000, 2500, 3000, 3500, 4000,
  4500, 5000, 5500, 6000, 6500, 7000, 8000, 9000, 10000, 11000, 12000
]

function xpToLevel(xp: number, table: number[]): number {
  let level = 0
  for (let i = 0; i < table.length; i++) {
    if (xp >= table[i]) level = i
    else break
  }
  return level
}

function skillDetail(xp: number, skillName: string) {
  const table = SKILLS_WITH_60_CAP.has(skillName) ? SKILL_XP_TABLE_60 : SKILL_XP_TABLE_50
  const level = xpToLevel(xp, table)
  const currentThreshold = table[level] || 0
  const nextThreshold = table[level + 1]
  const progress = nextThreshold ? Math.round(((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100) : 100
  return { level, progress, xp: Math.round(xp) }
}

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

    // Skills with precise progress
    const skills: Record<string, number> = {}
    const skillsDetailed: Record<string, any> = {}
    const xpMap = member.player_data?.experience || {}
    for (const [key, xp] of Object.entries(xpMap)) {
      if (key.startsWith('SKILL_')) {
        const name = key.replace('SKILL_', '').toLowerCase()
        const detail = skillDetail(xp as number, name)
        skills[name] = detail.level
        skillsDetailed[name] = detail
      }
    }

    // Dungeons — real xp table
    const cataXp = member.dungeons?.dungeon_types?.catacombs?.experience || 0
    const catacombsLevel = xpToLevel(cataXp, CATACOMBS_XP_TABLE)

    // Slayers
    const slayers: Record<string, any> = {}
    const slayerData = member.slayer?.slayer_bosses || {}
    for (const [type, info] of Object.entries<any>(slayerData)) {
      slayers[type] = { claimed_levels: Object.keys(info.claimed_levels || {}).length, xp: info.xp || 0 }
    }

    // Mining core / HOTM
    const miningCore = member.mining_core || {}
    const hotmLevel = miningCore.experience ? xpToLevel(miningCore.experience, [0, 200, 700, 1500, 3000, 6000, 10000, 15000, 22000, 30000]) : 0
    const powderMithril = miningCore.powder_mithril || 0
    const powderGemstone = miningCore.powder_gemstone || 0

    // Garden — separate endpoint, profile-level not member-level
    let gardenLevel = 0
    let gardenXp = 0
    try {
      const gardenRes = await fetch('https://api.hypixel.net/v2/skyblock/garden?key=' + HYPIXEL_KEY + '&profile=' + activeProfile.profile_id)
      const gardenData = await gardenRes.json()
      if (gardenData.success && gardenData.garden) {
        gardenXp = gardenData.garden.garden_experience || 0
        gardenLevel = xpToLevel(gardenXp, GARDEN_XP_TABLE)
      }
    } catch (e) {}

    const collections = member.collection || {}
    const collectionTiers = member.unlocked_coll_tiers || []
    const fairySouls = member.fairy_soul?.total_collected || 0
    const skinUrl = 'https://mc-heads.net/body/' + uuid + '/300'

    const stageFromNetworth = networthEstimate < 10_000_000 ? 'early' :
      networthEstimate < 500_000_000 ? 'mid' :
      networthEstimate < 5_000_000_000 ? 'end' : 'late'

    // Pull ALL verified methods, then filter to ones the player can realistically access now
    let allMethods: any[] = []
    try {
      const { data: methodsData } = await supabase
        .from('money_making_methods')
        .select('method_name, category, coins_per_hour_min, coins_per_hour_max, requirements, setup')
        .eq('verified', true)
        .order('coins_per_hour_max', { ascending: false })
        .limit(30)
      allMethods = methodsData || []
    } catch (e) {}

    function meetsRequirement(reqKey: string, reqVal: any): boolean {
      const skillMap: Record<string, number> = { ...skills, catacombs: catacombsLevel, hotm: hotmLevel, garden: gardenLevel }
      if (reqKey.includes('level') || reqKey.includes('_level')) {
        const skillName = reqKey.replace('_level', '').replace('level', '').toLowerCase() || Object.keys(skillMap).find(k => reqKey.toLowerCase().includes(k)) || ''
        const playerLevel = skillMap[skillName] ?? 0
        return playerLevel >= (typeof reqVal === 'number' ? reqVal : 0)
      }
      if (reqKey === 'capital') return purse + bank >= reqVal
      return true // unknown requirement types default to "assume met" rather than hiding
    }

    const unlockedMethods = allMethods.filter(m => {
      const reqs = m.requirements || {}
      return Object.entries(reqs).every(([k, v]) => meetsRequirement(k, v))
    })
    const lockedMethods = allMethods.filter(m => !unlockedMethods.includes(m)).slice(0, 8)

    const compactContext = {
      username,
      networth_estimate: networthEstimate,
      purse,
      bank,
      skills: Object.fromEntries(Object.entries(skillsDetailed).map(([k, v]: [string, any]) => [k, v.level + ' (' + v.progress + '% to next)'])),
      catacombs_level: catacombsLevel,
      hotm_level: hotmLevel,
      garden_level: gardenLevel,
      slayers: Object.entries(slayers).map(([k, v]: [string, any]) => k + ': T' + v.claimed_levels).join(', '),
      fairy_souls: fairySouls,
      collection_tiers_unlocked: collectionTiers.length,
      current_stage_guess: stageFromNetworth,
      methods_currently_accessible: unlockedMethods.map(m => m.method_name + ' [' + m.category + '] ' + Math.round(m.coins_per_hour_min/1e6) + '-' + Math.round(m.coins_per_hour_max/1e6) + 'M/h setup=' + JSON.stringify(m.setup)),
      methods_locked_soon: lockedMethods.map(m => m.method_name + ' req=' + JSON.stringify(m.requirements))
    }

    let analysis: any = {
      game_stage: stageFromNetworth, summary: '', priority_actions: [],
      next_tier: '', next_tier_progress: 0, next_tier_route: [],
      personalized_money_making: [], setup_route: []
    }

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
            max_tokens: 2200,
            system: 'You are Vault Evolve, a Hypixel Skyblock progression coach. Given a real player profile (skills, garden, mining, slayers, currently-accessible money methods, locked methods with their requirements), produce a complete progression plan. Be specific, use the real levels given, never invent stats. Output raw JSON only, no markdown: {"game_stage":"early|mid|end|late","summary":"1-2 sentences on overall state","priority_actions":[{"title":"...","reason":"...","impact":"..."}] (3-5 items, most impactful first),"next_tier":"mid|end|late","next_tier_progress":0-100,"next_tier_route":[{"step":"...","target":"..."}] (3-4 concrete milestones to reach next tier),"personalized_money_making":[{"method":"...","coins_per_hour":"...","why_now":"1 sentence why this fits their CURRENT skills/unlocks","setup_needed":"gear/pet/tool needed if any"}] (pick 3-5 from methods_currently_accessible only, ranked by coins/hr),"setup_route":[{"skill_or_area":"e.g. Mining, Farming, Combat","current_level":X,"next_milestone_level":Y,"unlocks_at_milestone":"what becomes available","priority":"high|medium|low"}] (cover 4-6 key skill areas: farming, mining, combat, garden, dungeoneering, fishing based on what data is available)}',
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
      collections,
      pets: member.pets_data?.pets || [],
      fairy_souls: fairySouls,
      skin_url: skinUrl,
      game_stage: analysis.game_stage || stageFromNetworth,
      evolve_summary: analysis.summary || '',
      priority_actions: analysis.priority_actions || [],
      next_tier: analysis.next_tier || '',
      next_tier_progress: analysis.next_tier_progress || 0,
      next_tier_route: analysis.next_tier_route || [],
      raw_profile: {
        profile_id: activeProfile.profile_id,
        cute_name: activeProfile.cute_name,
        skills_detailed: skillsDetailed,
        hotm_level: hotmLevel,
        garden_level: gardenLevel,
        personalized_money_making: analysis.personalized_money_making || [],
        setup_route: analysis.setup_route || []
      },
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