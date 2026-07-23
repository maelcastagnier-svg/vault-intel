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
    profile_id: player?.profile_id || null,
    last_synced: player?.last_synced || null,
  })
}
