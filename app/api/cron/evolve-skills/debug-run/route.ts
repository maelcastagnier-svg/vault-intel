// app/api/cron/evolve-skills/debug-run/route.ts
// TEMPORAIRE — déclenche runEvolveSkills() sans le header CRON_SECRET (indisponible en local),
// puis relit les cartes sauvegardées pour inspection (la fonction ne retourne plus le detail
// complet en prod). Pour valider le fix "owned but not equipped". À supprimer après validation.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runEvolveSkills } from '../route'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const profileIdsParam = req.nextUrl.searchParams.get('profile_ids')
  const filterProfileIds = profileIdsParam ? profileIdsParam.split(',') : undefined
  const runResult = await runEvolveSkills(filterProfileIds)

  let query = supabase.from('player_skill_cards').select('*')
  if (filterProfileIds?.length) query = query.in('profile_id', filterProfileIds)
  const { data: saved } = await query

  return NextResponse.json({ runResult, saved })
}
