// app/api/player/missions/route.ts
// Génère ou retourne les missions journalières du joueur
// GET /api/player/missions?uuid={uuid}&profile_id={profile_id}
// POST /api/player/missions/complete → marque mission comme terminée
// Un joueur peut avoir plusieurs profils Skyblock, chacun avec sa propre progression
// (voir player_data.profile_id) — profile_id est donc requis ici aussi.
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TODAY = new Date().toISOString().split('T')[0]

// ── Génère missions selon profil joueur ───────────────────────
function generateMissions(player: any): any[] {
  const skills  = player.skills || {}
  const slayers = player.slayers || {}
  const dungeons= player.dungeons || {}
  const stage   = player.game_stage || 'EARLY'
  const missions: any[] = []

  // ── FARMING ──────────────────────────────────────────────────
  if (skills.farming >= 0) {
    const farmingLvl = skills.farming || 0
    if (farmingLvl < 20) {
      missions.push({ id: 'farm_crops_1', activity: 'FARMING', title: 'Récolte 1000 crops', description: 'Farme n\'importe quel crop en zone farming', xp_reward: 500, coins_reward: 50000, difficulty: 'EASY', progress_target: 1000, progress_unit: 'crops', pct_contribution: 0.5 })
    } else if (farmingLvl < 40) {
      missions.push({ id: 'farm_crops_2', activity: 'FARMING', title: 'Récolte 5000 crops', description: 'Farme en Garden ou Farming Island', xp_reward: 2000, coins_reward: 200000, difficulty: 'MEDIUM', progress_target: 5000, progress_unit: 'crops', pct_contribution: 1.5 })
    } else {
      missions.push({ id: 'farm_crops_3', activity: 'FARMING', title: 'Récolte 20K crops', description: 'Session farming intensive en Garden', xp_reward: 5000, coins_reward: 500000, difficulty: 'HARD', progress_target: 20000, progress_unit: 'crops', pct_contribution: 3.0 })
    }
  }

  // ── SLAYER ───────────────────────────────────────────────────
  const zombieXP = slayers.zombie?.xp || 0
  const spiderXP = slayers.spider?.xp || 0
  const wolfXP   = slayers.wolf?.xp   || 0
  const endermanXP = slayers.enderman?.xp || 0
  const blazeXP  = slayers.blaze?.xp  || 0

  if (zombieXP < 1000) {
    missions.push({ id: 'zombie_t1', activity: 'SLAYER', title: 'Kill Zombie Slayer T1 ×3', description: 'Via Maddox → kill zombies anywhere → boss spawns', xp_reward: 800, coins_reward: 80000, difficulty: 'EASY', progress_target: 3, progress_unit: 'kills', pct_contribution: 1.0 })
  } else if (zombieXP < 100000) {
    missions.push({ id: 'zombie_t3', activity: 'SLAYER', title: 'Kill Zombie Slayer T3 ×2', description: 'Via Maddox → kill zombies → T3 boss', xp_reward: 2000, coins_reward: 150000, difficulty: 'MEDIUM', progress_target: 2, progress_unit: 'kills', pct_contribution: 2.0 })
  }

  if (endermanXP > 0 || stage !== 'EARLY') {
    const tier = endermanXP < 10000 ? 'T1' : endermanXP < 100000 ? 'T2' : endermanXP < 400000 ? 'T3' : 'T4'
    missions.push({ id: `enderman_${tier.toLowerCase()}`, activity: 'SLAYER', title: `Kill Enderman ${tier} ×2`, description: 'Via Maddox → kill endermen in The End → boss spawns', xp_reward: tier === 'T4' ? 5000 : 1500, coins_reward: tier === 'T4' ? 400000 : 100000, difficulty: tier === 'T4' ? 'HARD' : 'MEDIUM', progress_target: 2, progress_unit: 'kills', pct_contribution: tier === 'T4' ? 4.0 : 2.0 })
  }

  // ── DUNGEONS ──────────────────────────────────────────────────
  const catacombsRuns = Object.values(dungeons.catacombs?.runs || {}).reduce((s: number, v: any) => s + v, 0)
  if (stage === 'MID' || stage === 'END' || stage === 'LATE') {
    missions.push({ id: 'dungeon_run', activity: 'DUNGEONS', title: 'Complète 3 runs Catacombs', description: 'Finit 3 floors en Catacombs (n\'importe quel floor)', xp_reward: 3000, coins_reward: 300000, difficulty: 'MEDIUM', progress_target: 3, progress_unit: 'runs', pct_contribution: 2.5 })
  }

  // ── MINING ────────────────────────────────────────────────────
  if (skills.mining < 30) {
    missions.push({ id: 'mine_mithril', activity: 'MINING', title: 'Mine 500 Mithril', description: 'Mine dans Dwarven Mines ou Crystal Hollows', xp_reward: 600, coins_reward: 30000, difficulty: 'EASY', progress_target: 500, progress_unit: 'blocks', pct_contribution: 0.5 })
  }

  // ── FISHING ──────────────────────────────────────────────────
  if (skills.fishing < 25) {
    missions.push({ id: 'fish_catch', activity: 'FISHING', title: 'Catch 50 poissons', description: 'Pêche n\'importe où (ocean, hub, mushroom island)', xp_reward: 400, coins_reward: 20000, difficulty: 'EASY', progress_target: 50, progress_unit: 'fish', pct_contribution: 0.5 })
  }

  // ── COMBAT ────────────────────────────────────────────────────
  missions.push({ id: 'combat_kills', activity: 'COMBAT', title: 'Kill 200 mobs', description: 'Kill n\'importe quels mobs (Spiders Den, Crimson Isle...)', xp_reward: 300, coins_reward: 15000, difficulty: 'EASY', progress_target: 200, progress_unit: 'kills', pct_contribution: 0.3 })

  // Limite à 5 missions par jour
  return missions.slice(0, 5)
}

// ── GET : retourne ou génère les missions ─────────────────────
export async function GET(req: NextRequest) {
  const uuid      = req.nextUrl.searchParams.get('uuid')
  const profileId = req.nextUrl.searchParams.get('profile_id')
  if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 })
  if (!profileId) return NextResponse.json({ error: 'profile_id required' }, { status: 400 })

  // Vérifie si des missions existent pour aujourd'hui
  const { data: existing } = await supabase
    .from('player_missions')
    .select('*')
    .eq('hypixel_uuid', uuid)
    .eq('profile_id', profileId)
    .eq('mission_date', TODAY)
    .order('created_at')

  if (existing && existing.length > 0) {
    return NextResponse.json({ missions: existing, date: TODAY, generated: false })
  }

  // Vérifie missions incomplètes de la veille
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]
  const { data: incomplete } = await supabase
    .from('player_missions')
    .select('*')
    .eq('hypixel_uuid', uuid)
    .eq('profile_id', profileId)
    .eq('mission_date', yesterday)
    .eq('completed', false)

  if (incomplete && incomplete.length > 0) {
    // Porte les missions incomplètes à aujourd'hui
    const carried = incomplete.map((m: any) => ({
      ...m,
      id:           undefined,
      mission_date: TODAY,
      carried_over: true,
    }))
    const { error } = await supabase.from('player_missions').insert(carried)
    if (!error) return NextResponse.json({ missions: carried, date: TODAY, carried_over: true })
  }

  // Génère nouvelles missions
  const { data: player } = await supabase
    .from('player_data')
    .select('*')
    .eq('hypixel_uuid', uuid)
    .eq('profile_id', profileId)
    .single()

  if (!player) return NextResponse.json({ error: 'Player not synced yet' }, { status: 404 })

  const missionTemplates = generateMissions(player)
  const missionRows = missionTemplates.map(m => ({
    hypixel_uuid:     uuid,
    profile_id:       profileId,
    mission_date:     TODAY,
    mission_id:       m.id,
    activity:         m.activity,
    title:            m.title,
    description:      m.description,
    difficulty:       m.difficulty,
    progress:         0,
    progress_target:  m.progress_target,
    progress_unit:    m.progress_unit,
    pct_contribution: m.pct_contribution,
    coins_reward:     m.coins_reward,
    xp_reward:        m.xp_reward,
    completed:        false,
    carried_over:     false,
  }))

  const { data: inserted, error } = await supabase
    .from('player_missions')
    .insert(missionRows)
    .select()

  if (error) throw error

  return NextResponse.json({ missions: inserted, date: TODAY, generated: true })
}