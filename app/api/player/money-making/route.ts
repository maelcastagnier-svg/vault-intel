// app/api/player/money-making/route.ts
// Personal Money Making — lecture seule des recommandations deja generees par l'agent
// Money Making general (cron/money-making-agent), filtrees sur le tier du joueur.
// Aucun appel Claude ici, aucune ecriture.
// GET /api/player/money-making?uuid={uuid}&profile_id={profile_id}
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '../../../../lib/supabase-server'

export const maxDuration = 15

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  // Auth reelle : session Vault requise, et cette session doit avoir lie un compte
  // Hypixel via /api/link-hypixel-account. Plus de uuid accepte en query param.
  const serverClient = await createServerSupabaseClient()
  const { data: { user: authUser } } = await serverClient.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: link } = await supabase
    .from('hypixel_account_links')
    .select('hypixel_uuid')
    .eq('user_id', authUser.id)
    .single()
  if (!link) return NextResponse.json({ error: 'No Hypixel account linked. Link one first via /api/link-hypixel-account' }, { status: 400 })

  const uuid      = link.hypixel_uuid
  const profileId = req.nextUrl.searchParams.get('profile_id')
  if (!profileId) return NextResponse.json({ error: 'profile_id required' }, { status: 400 })

  const { data: player, error: playerError } = await supabase
    .from('player_data')
    .select('game_stage')
    .eq('hypixel_uuid', uuid)
    .eq('profile_id', profileId)
    .single()

  if (playerError || !player) return NextResponse.json({ error: 'Player not synced yet' }, { status: 404 })
  if (!player.game_stage) return NextResponse.json({ error: 'Player game_stage not set yet' }, { status: 404 })

  const tier = String(player.game_stage).toLowerCase()
  const section = `money_making_${tier}`

  const { data: analysis, error: analysisError } = await supabase
    .from('claude_analysis')
    .select('content, updated_at')
    .eq('section', section)
    .single()

  if (analysisError || !analysis) {
    return NextResponse.json({ error: `No money making data for tier ${tier} yet` }, { status: 404 })
  }

  let parsed: any = {}
  try { parsed = JSON.parse(analysis.content) } catch { /* content malformed, return empty lists below */ }

  return NextResponse.json({
    tier,
    comparison_summary: parsed.comparison_summary || '',
    active: parsed.active || [],
    vault: parsed.vault || [],
    updated_at: analysis.updated_at,
  })
}
