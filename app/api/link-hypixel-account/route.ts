// app/api/link-hypixel-account/route.ts
// POST { username } — lie le compte Hypixel donne au compte Vault authentifie.
// "Premier arrivant, premier servi" : pas de preuve cryptographique d'appartenance —
// proportionne puisque les donnees de jeu exposees ensuite (skills, slayers,
// collections...) sont deja publiques via l'API Hypixel officielle pour n'importe
// qui connaissant le pseudo. Refuse si ce compte Hypixel est deja lie a un AUTRE
// utilisateur Vault.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerSupabaseClient } from '../../../lib/supabase-server'

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { username } = await req.json()
  if (!username || typeof username !== 'string') {
    return NextResponse.json({ error: 'Username required' }, { status: 400 })
  }

  const mojangRes = await fetch(
    `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`
  )
  if (!mojangRes.ok) {
    return NextResponse.json({ error: 'Player not found on Mojang' }, { status: 404 })
  }
  const mojangData = await mojangRes.json()
  const rawId = mojangData.id as string | undefined
  if (!rawId) return NextResponse.json({ error: 'Invalid username' }, { status: 404 })

  const hypixelUuid = `${rawId.slice(0, 8)}-${rawId.slice(8, 12)}-${rawId.slice(12, 16)}-${rawId.slice(16, 20)}-${rawId.slice(20)}`
  const hypixelUsername = (mojangData.name as string) || username

  const { data: existingLink } = await adminClient
    .from('hypixel_account_links')
    .select('user_id')
    .eq('hypixel_uuid', hypixelUuid)
    .single()

  if (existingLink && existingLink.user_id !== user.id) {
    return NextResponse.json(
      { error: 'This Hypixel account is already linked to another Vault account' },
      { status: 409 }
    )
  }

  const { error } = await adminClient
    .from('hypixel_account_links')
    .upsert(
      {
        user_id: user.id,
        hypixel_uuid: hypixelUuid,
        hypixel_username: hypixelUsername,
        linked_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, hypixel_username: hypixelUsername })
}
