// app/api/player/skills/route.ts
// Lecture seule de player_skill_cards, ecrit par evolve-skills (chaine depuis
// player/sync sur un sync reussi — voir CLAUDE.md, section Skills). Cette route existait
// cote cron/ecriture mais jamais cote lecture avant le chantier frontend du 23 juillet.
// GET /api/player/skills?profile_id={profile_id}
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requirePlan } from '../../../../lib/get-plan'

export const maxDuration = 15

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  // Evolve Skills reserve Pro+.
  const gate = await requirePlan('pro')
  if (!gate.ok) return gate.response

  const { data: link } = await supabase
    .from('hypixel_account_links')
    .select('hypixel_uuid')
    .eq('user_id', gate.user.id)
    .single()
  if (!link) return NextResponse.json({ error: 'No Hypixel account linked. Link one first via /api/link-hypixel-account' }, { status: 400 })

  const profileId = req.nextUrl.searchParams.get('profile_id')
  if (!profileId) return NextResponse.json({ error: 'profile_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('player_skill_cards')
    .select('game_stage, networth, purse, cards, model, generated_at')
    .eq('hypixel_uuid', link.hypixel_uuid)
    .eq('profile_id', profileId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Skills not generated yet — sync your account first' }, { status: 404 })
  }

  return NextResponse.json(data)
}
