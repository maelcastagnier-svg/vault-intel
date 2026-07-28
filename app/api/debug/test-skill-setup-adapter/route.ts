import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runEvolveSkills } from '../../cron/evolve-skills/route'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Compte de test réel déjà utilisé toute la session (Voxui09, lié à un vrai
// compte Vault jetable lors des chantiers Evolve/Money Making précédents) --
// Cucumber (MID, real Groovy Fig armor equipped) et Orange (EARLY, profil
// quasi-vide) sont ses deux profils SkyBlock réels, retrouvés par leurs
// signatures déjà documentées (game_stage/networth) plutôt qu'un nom de
// profil stocké (player_data n'a pas de colonne cute_name).
export async function GET() {
  const { data: profiles, error } = await supabase
    .from('player_data')
    .select('profile_id, hypixel_username, game_stage, networth, purse, equipped_armor')
    .ilike('hypixel_username', 'voxui09')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!profiles || profiles.length === 0) return NextResponse.json({ error: 'No profiles found for Voxui09' }, { status: 404 })

  const profileIds = profiles.map(p => p.profile_id)
  const runResult = await runEvolveSkills(profileIds)

  const { data: cards } = await supabase
    .from('player_skill_cards')
    .select('profile_id, game_stage, networth, purse, cards')
    .in('profile_id', profileIds)

  const summary = (cards || []).map(row => {
    const allCards = row.cards || []
    const sample = allCards.slice(0, 3).map((c: any) => ({
      skill_key: c.skill_key,
      current_render_setup: c.current?.render_setup,
      target_type: c.target?.type,
      target_armor_set: c.target?.armor_set,
      target_armor_reforge: c.target?.armor_reforge,
      target_armor_stars: c.target?.armor_stars,
      target_render_setup: c.target?.render_setup,
    }))
    return {
      profile_id: row.profile_id,
      game_stage: row.game_stage,
      networth: row.networth,
      purse: row.purse,
      total_cards: allCards.length,
      cards_with_target_armor: allCards.filter((c: any) => c.target?.render_setup?.armor_set).length,
      sample_cards: sample,
    }
  })

  return NextResponse.json({
    profiles_found: profiles.map(p => ({ profile_id: p.profile_id, game_stage: p.game_stage, networth: p.networth, purse: p.purse, has_equipped_armor: Object.keys(p.equipped_armor || {}).length })),
    run_result: runResult,
    summary,
  })
}
