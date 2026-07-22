// app/api/player/sync/debug-list-profiles/route.ts
// TEMPORAIRE — liste les profils Skyblock d'un joueur (profile_id + cute_name).
// Read-only. À supprimer une fois le profile_id du profil "Orange" récupéré.
import { NextRequest, NextResponse } from 'next/server'

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username')
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
    const profiles    = (profileData.profiles || []) as any[]

    return NextResponse.json({
      uuid,
      profiles: profiles.map(p => ({
        profile_id: p.profile_id,
        cute_name:  p.cute_name,
        selected:   p.selected ?? false,
        purse:      p.members?.[uuid.replace(/-/g, '')]?.currencies?.coin_purse ?? null,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
