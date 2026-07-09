import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CACHE_HOURS = 6

export async function POST(req: Request) {
  try {
    const { userId, username, plan } = await req.json()

    if (!['pro', 'elite'].includes(plan)) {
      return NextResponse.json({ error: 'Evolve requires Pro or Elite plan' }, { status: 403 })
    }
    if (!username || !userId) {
      return NextResponse.json({ error: 'Missing username or userId' }, { status: 400 })
    }

    // Check cache
    const { data: existing } = await supabase
      .from('player_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (existing && existing.updated_at) {
      const ageHours = (Date.now() - new Date(existing.updated_at).getTime()) / 3600000
      if (ageHours < CACHE_HOURS) {
        return NextResponse.json({ profile: existing, cached: true })
      }
    }

    // Fetch SkyCrypt
    let skycryptData: any
    try {
      const res = await fetch('https://sky.shiiyu.moe/api/v2/profile/' + encodeURIComponent(username), {
        headers: { 'User-Agent': 'VaultApp/1.0' }
      })
      if (!res.ok) {
        const errText = await res.text()
        return NextResponse.json({ error: 'SkyCrypt returned ' + res.status + ' — check the username spelling' }, { status: 502 })
      }
      skycryptData = await res.json()
    } catch (e: any) {
      return NextResponse.json({ error: 'Could not reach SkyCrypt: ' + (e.message || 'network error') }, { status: 502 })
    }

    const profileKey = Object.keys(skycryptData.profiles || {})[0]
    const profile = skycryptData.profiles?.[profileKey]
    if (!profile) {
      return NextResponse.json({ error: 'No SkyBlock profile found for this username' }, { status: 404 })
    }

    const networth = profile.networth?.networth || 0
    const skills = profile.levels || {}
    const collections = profile.collections || {}
    const skinUrl = 'https://mc-heads.net/body/' + username + '/300'

    const skillsSummary = Object.entries(skills).slice(0, 10).map(([k, v]: [string, any]) =>
      k + ': lvl ' + (v?.level || 0)
    ).join(', ')

    const compactContext = {
      username,
      networth: Math.round(networth),
      skills: skillsSummary,
      catacombs_level: profile.dungeons?.catacombs?.level || 0,
      slayers: profile.slayers ? Object.entries(profile.slayers).map(([k, v]: [string, any]) => k + ' T' + (v?.claimed_levels ? Object.keys(v.claimed_levels).length : 0)).join(', ') : '',
      purse: Math.round(profile.purse || 0),
      fairy_souls: profile.fairy_souls?.collected || 0
    }

    // Call Claude for analysis — never let this crash the route
    let analysis = { game_stage: 'early', summary: '', priority_actions: [] as any[] }
    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error('ANTHROPIC_API_KEY is missing')
      } else {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1200,
            system: 'You are Vault Evolve, a Hypixel Skyblock progression coach. Given a player profile, classify their game stage (early/mid/end/late based on networth: <10M early, 10M-500M mid, 500M-5B end, 5B+ late) and give 3-5 SPECIFIC, ACTIONABLE priority recommendations. Be concise. Output raw JSON only, no markdown: {"game_stage":"early|mid|end|late","summary":"1-2 sentence overview","priority_actions":[{"title":"short action title","reason":"why this matters now","impact":"expected coins/hr or benefit"}]}',
            messages: [{ role: 'user', content: JSON.stringify(compactContext) }]
          })
        })

        if (!claudeRes.ok) {
          const errText = await claudeRes.text()
          console.error('Claude API error:', claudeRes.status, errText)
        } else {
          const claudeData = await claudeRes.json()
          const text = claudeData.content?.[0]?.text || '{}'
          const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1)
          analysis = JSON.parse(jsonStr)
        }
      }
    } catch (e: any) {
      console.error('Claude analysis failed:', e.message)
    }

    const record = {
      user_id: userId,
      hypixel_username: username,
      networth: Math.round(networth),
      skills: skills,
      slayers: profile.slayers || {},
      dungeons: profile.dungeons || {},
      pets: profile.pets || {},
      collections: collections,
      raw_skycrypt: profile,
      game_stage: analysis.game_stage,
      evolve_summary: analysis.summary,
      priority_actions: analysis.priority_actions,
      skin_url: skinUrl,
      last_synced: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data: saved, error } = await supabase
      .from('player_profiles')
      .upsert(record, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      console.error('Supabase upsert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
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

    const { data } = await supabase
      .from('player_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    return NextResponse.json({ profile: data || null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}