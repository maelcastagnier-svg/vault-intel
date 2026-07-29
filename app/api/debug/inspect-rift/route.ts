// TEMP debug route -- fetches Cucumber's REAL raw Hypixel profile and
// summarizes member.rift (already known to exist as a top-level member key)
// plus currencies.motes (Rift's currency). Zero Claude cost -- Hypixel API
// only. Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CUCUMBER_PROFILE_ID = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'

// Shallow summary: for each key, show its type + a short preview, not the full value
// -- Rift is a big nested area, we want an overview before deciding what to map.
function summarize(obj: any, depth = 0): any {
  if (depth > 2 || obj === null || typeof obj !== 'object') {
    return obj
  }
  if (Array.isArray(obj)) {
    return `[array len=${obj.length}] ${JSON.stringify(obj.slice(0, 5))}`
  }
  const out: Record<string, any> = {}
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (value !== null && typeof value === 'object') {
      out[key] = summarize(value, depth + 1)
    } else {
      out[key] = value
    }
  }
  return out
}

export async function GET() {
  const { data: player } = await supabase
    .from('player_data').select('hypixel_uuid').eq('profile_id', CUCUMBER_PROFILE_ID).single()
  if (!player) return NextResponse.json({ error: 'Cucumber not found in player_data' }, { status: 404 })

  const uuid = player.hypixel_uuid
  const profileRes = await fetch(
    `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`,
    { headers: { 'API-Key': process.env.HYPIXEL_API_KEY! } }
  )
  if (!profileRes.ok) {
    return NextResponse.json({ error: `Hypixel HTTP ${profileRes.status}`, body: (await profileRes.text()).slice(0, 500) }, { status: 502 })
  }
  const profileData = await profileRes.json()
  if (!profileData.success) {
    return NextResponse.json({ error: 'Hypixel API returned success:false', raw: profileData }, { status: 502 })
  }

  const profiles = profileData.profiles || []
  const profile = profiles.find((p: any) => p.profile_id === CUCUMBER_PROFILE_ID) || profiles[0]
  const member = profile?.members?.[uuid.replace(/-/g, '')]
  if (!member) return NextResponse.json({ error: 'No member data found', profileCount: profiles.length })

  const rift = member.rift || {}

  return NextResponse.json({
    riftTopLevelKeys: Object.keys(rift),
    riftSummary: summarize(rift, 0),
    motes: member.currencies?.motes ?? 'MISSING',
  })
}
