import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const steps: string[] = []
  try {
    steps.push('start')

    const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
    const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    steps.push('env check: HYPIXEL_KEY=' + (HYPIXEL_KEY ? 'present(' + HYPIXEL_KEY.length + 'chars)' : 'MISSING'))
    steps.push('env check: ANTHROPIC_KEY=' + (ANTHROPIC_KEY ? 'present' : 'MISSING'))
    steps.push('env check: SUPA_URL=' + (SUPA_URL ? 'present' : 'MISSING'))
    steps.push('env check: SUPA_KEY=' + (SUPA_KEY ? 'present' : 'MISSING'))

    if (!HYPIXEL_KEY || !SUPA_URL || !SUPA_KEY) {
      return NextResponse.json({ error: 'Missing env vars', steps }, { status: 500 })
    }

    const { userId, username, plan } = await req.json()
    steps.push('parsed body: userId=' + userId + ' username=' + username + ' plan=' + plan)

    if (!['pro', 'elite'].includes(plan)) {
      return NextResponse.json({ error: 'Evolve requires Pro or Elite plan', steps }, { status: 403 })
    }
    if (!username || !userId) {
      return NextResponse.json({ error: 'Missing username or userId', steps }, { status: 400 })
    }

    const supabase = createClient(SUPA_URL, SUPA_KEY)
    steps.push('supabase client created')

    steps.push('calling mojang...')
    const mojangRes = await fetch('https://api.mojang.com/users/profiles/minecraft/' + encodeURIComponent(username))
    steps.push('mojang status=' + mojangRes.status)
    if (!mojangRes.ok) {
      return NextResponse.json({ error: 'Mojang lookup failed', steps }, { status: 404 })
    }
    const mojangData = await mojangRes.json()
    const uuid = mojangData.id
    steps.push('uuid=' + uuid)

    steps.push('calling hypixel api...')
    const hypixelRes = await fetch('https://api.hypixel.net/v2/skyblock/profiles?key=' + HYPIXEL_KEY + '&uuid=' + uuid)
    steps.push('hypixel status=' + hypixelRes.status)
    const hypixelData = await hypixelRes.json()
    steps.push('hypixel success=' + hypixelData.success + ' cause=' + (hypixelData.cause || 'none'))

    if (!hypixelData.success) {
      return NextResponse.json({ error: 'Hypixel API error: ' + hypixelData.cause, steps }, { status: 502 })
    }

    const profiles = hypixelData.profiles || []
    steps.push('profiles count=' + profiles.length)

    const activeProfile = profiles.find((p: any) => p.selected) || profiles[0]
    if (!activeProfile) {
      return NextResponse.json({ error: 'No SkyBlock profile found', steps }, { status: 404 })
    }
    steps.push('active profile found: ' + activeProfile.profile_id)

    const member = activeProfile.members?.[uuid]
    if (!member) {
      return NextResponse.json({ error: 'Could not read member data for this uuid', steps }, { status: 404 })
    }
    steps.push('member data found')

    const purse = Math.round(member.currencies?.coin_purse || 0)
    const bank = Math.round(activeProfile.banking?.balance || 0)
    const networthEstimate = purse + bank
    steps.push('purse=' + purse + ' bank=' + bank)

    steps.push('upserting to supabase...')
    const record = {
      user_id: userId,
      hypixel_username: username,
      hypixel_uuid: uuid,
      purse,
      bank,
      networth: networthEstimate,
      game_stage: networthEstimate < 10_000_000 ? 'early' : networthEstimate < 500_000_000 ? 'mid' : networthEstimate < 5_000_000_000 ? 'end' : 'late',
      skin_url: 'https://mc-heads.net/body/' + uuid + '/300',
      last_synced: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data: saved, error } = await supabase
      .from('player_data')
      .upsert(record, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      steps.push('supabase error: ' + error.message)
      return NextResponse.json({ error: 'Supabase error: ' + error.message, steps }, { status: 500 })
    }

    steps.push('DONE — success')
    return NextResponse.json({ profile: saved, steps })

  } catch (e: any) {
    steps.push('CRASH: ' + (e.message || String(e)))
    return NextResponse.json({ error: 'Crashed: ' + (e.message || String(e)), steps }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data } = await supabase.from('player_data').select('*').eq('user_id', userId).single()
  return NextResponse.json({ profile: data || null })
}