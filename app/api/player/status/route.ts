// app/api/player/status/route.ts
// Bootstrap pour EvolveSection.tsx : le lien Hypixel ET player_data (pour recuperer un
// profile_id deja connu) ont zero policy RLS publique (service-role only), donc le
// frontend ne peut pas les lire directement — cette route regroupe les deux lookups en
// un seul appel plutot que de forcer un vrai sync juste pour bootstrapper l'UI.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePlan } from '../../../../lib/get-plan'

export const maxDuration = 10

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Resilience against Crafatar-specific outages (real incident: crafatar.com
// returned a live 521 the same week SkinArmorRender started depending on it
// for a WebGL texture instead of a CSS background-image, crashing the whole
// dashboard on every setup click -- see the SceneErrorBoundary fix). Mojang's
// own session server is the authoritative source Crafatar itself reads from,
// confirmed reachable server-side and confirmed to serve the actual texture
// with permissive CORS (Access-Control-Allow-Origin: *, verified directly)
// -- a second live source, not a stored copy, so this doesn't touch the
// still-open question about redistributing Mojang-authored skin assets.
// Best-effort only: never let a slow/down Mojang API hold up this response,
// the client already has its own further fallback (local placeholder).
export async function resolveMojangSkinUrl(uuid: string): Promise<string | null> {
  try {
    const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const profile = await res.json()
    const texturesProp = (profile?.properties || []).find((p: any) => p.name === 'textures')
    if (!texturesProp?.value) return null
    const decoded = JSON.parse(Buffer.from(texturesProp.value, 'base64').toString('utf8'))
    const url: string | undefined = decoded?.textures?.SKIN?.url
    return url ? url.replace(/^http:/, 'https:') : null
  } catch {
    return null
  }
}

export async function GET() {
  const gate = await requirePlan('pro')
  if (!gate.ok) return gate.response

  const { data: link } = await supabase
    .from('hypixel_account_links')
    .select('hypixel_uuid, hypixel_username')
    .eq('user_id', gate.user.id)
    .single()

  if (!link) return NextResponse.json({ linked: false })

  const { data: player } = await supabase
    .from('player_data')
    .select('profile_id, last_synced')
    .eq('hypixel_uuid', link.hypixel_uuid)
    .order('last_synced', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({
    linked: true,
    hypixel_username: link.hypixel_username,
    hypixel_uuid: link.hypixel_uuid,
    profile_id: player?.profile_id || null,
    last_synced: player?.last_synced || null,
    mojang_skin_url: await resolveMojangSkinUrl(link.hypixel_uuid),
  })
}
