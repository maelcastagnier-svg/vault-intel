// app/api/player/sync/debug-mining-core/route.ts
// TEMPORAIRE — inspecte la structure brute de member.mining_core avant de coder le mapping.
// Read-only, aucune écriture. À supprimer une fois le décodage HOTM validé et branché.
import { NextRequest, NextResponse } from 'next/server'

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

export async function GET(req: NextRequest) {
  const username  = req.nextUrl.searchParams.get('username')
  const profileId = req.nextUrl.searchParams.get('profile_id')
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })

  try {
    const mojangRes  = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`
    )
    if (!mojangRes.ok) return NextResponse.json({ error: 'Player not found on Mojang' }, { status: 404 })
    const mojangData = await mojangRes.json()
    const uuid = mojangData.id
      ? `${mojangData.id.slice(0,8)}-${mojangData.id.slice(8,12)}-${mojangData.id.slice(12,16)}-${mojangData.id.slice(16,20)}-${mojangData.id.slice(20)}`
      : null
    if (!uuid) return NextResponse.json({ error: 'Invalid username' }, { status: 404 })

    const profileRes  = await fetch(
      `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`,
      { headers: { 'API-Key': HYPIXEL_KEY } }
    )
    const profileData = await profileRes.json()
    const profiles    = profileData.profiles || []

    const profile = profileId
      ? profiles.find((p: any) => p.profile_id === profileId)
      : profiles.find((p: any) => p.selected) || profiles[profiles.length - 1]
    if (!profile) return NextResponse.json({ error: 'No matching Skyblock profile found' }, { status: 404 })

    const member = profile.members?.[uuid.replace(/-/g, '')]
    if (!member) return NextResponse.json({ error: 'Player data not found in profile' }, { status: 404 })

    return NextResponse.json({
      profile_id:  profile.profile_id,
      cute_name:   profile.cute_name,
      has_mining_core: !!member.mining_core,
      mining_core: member.mining_core ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
