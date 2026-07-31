// app/api/player/skills/route.ts
// Lecture seule de player_skill_cards, ecrit par evolve-skills (chaine depuis
// player/sync sur un sync reussi — voir CLAUDE.md, section Skills). Cette route existait
// cote cron/ecriture mais jamais cote lecture avant le chantier frontend du 23 juillet.
// GET /api/player/skills?profile_id={profile_id}
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requirePlan } from '../../../../lib/get-plan'
import { skillProgress } from '../../../../lib/skill-xp'
import { SLAYER_BUG_FIX_DEPLOYED_AT } from '../../../../lib/money-making-constants'

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

  const [{ data, error }, { data: player }] = await Promise.all([
    supabase
      .from('player_skill_cards')
      .select('game_stage, networth, purse, cards, model, generated_at')
      .eq('hypixel_uuid', link.hypixel_uuid)
      .eq('profile_id', profileId)
      .single(),
    supabase
      .from('player_data')
      .select('skills, raw_profile')
      .eq('hypixel_uuid', link.hypixel_uuid)
      .eq('profile_id', profileId)
      .single(),
  ])

  if (error || !data) {
    return NextResponse.json({ error: 'Skills not generated yet — sync your account first' }, { status: 404 })
  }

  // Progression réelle (niveau + XP dans le niveau) pour la barre de la carte --
  // calculée depuis la vraie XP (player_data.raw_profile.skills_xp), pas
  // simplement recopiée du niveau déjà stocké, pour que les deux ne puissent
  // jamais diverger. "dungeoneering" n'a pas cette forme de courbe XP->niveau
  // (Catacombs a sa propre XP jamais capturée en base pour l'instant, voir
  // CLAUDE.md) -- reste sans `progress`, la SkillBar gère ce cas honnêtement
  // plutôt que d'inventer un niveau.
  const skillsXp = (player?.raw_profile as any)?.skills_xp || {}
  const cards = (data.cards || []).map((card: any) => {
    if (card.skill_key === 'dungeoneering' || card.skill_key === 'slayer') return card
    const xp = skillsXp[card.skill_key] ?? 0
    return { ...card, progress: skillProgress(card.skill_key, xp) }
  })

  // Carte Slayer générée avant le fix du bug Blaze/Spider max tier inversé (voir CLAUDE.md)
  // -- current/target de cette carte peuvent citer le mauvais max tier. Pur flag en lecture,
  // rien régénéré ; le frontend doit afficher un bandeau "à resync" plutôt que masquer.
  const hasSlayerCard = cards.some((c: any) => c.skill_key === 'slayer')
  const staleSlayerData = hasSlayerCard && new Date(data.generated_at) < new Date(SLAYER_BUG_FIX_DEPLOYED_AT)

  return NextResponse.json({ ...data, cards, stale_slayer_data: staleSlayerData })
}
