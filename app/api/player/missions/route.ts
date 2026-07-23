// app/api/player/missions/route.ts
// Refonte complète (23 juillet) — remplace l'ancien générateur indépendant (if/else codés
// en dur sur skills/slayers/dungeons, aucun lien avec Milestones) par un vrai pioche dans
// les tâches Milestones non complétées du joueur, comme prévu depuis le 22 juillet
// (voir CLAUDE.md, section "Milestones vs Daily Missions").
//
// Logique : trouve le tier ACTUEL du joueur (le premier tier, Starter→Master, qui a encore
// au moins une tâche data_available:true non complétée), casse ses tâches composites en
// requirements individuelles non satisfaites (ex: "Skill Level Up" 7/10 -> 3 missions
// concrètes, une par skill manquant), classe par proximité de complétion (current/target)
// pour prioriser les victoires rapides, garde les 5 premières. Jamais de tier supérieur au
// tier actuel — reste "réalisable à l'instant T", pas des objectifs de plusieurs semaines.
// Aucune donnée data_available:false n'est jamais utilisée (musée, essence, minions...).
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '../../../../lib/supabase-server'
import { computeMilestones } from '../milestones/route'

export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TIER_ORDER = ['Starter', 'Amateur', 'Intermediate', 'Skilled', 'Expert', 'Professional', 'Master']
const TIER_DIFFICULTY: Record<string, string> = {
  Starter: 'EASY', Amateur: 'EASY',
  Intermediate: 'MEDIUM', Skilled: 'MEDIUM',
  Expert: 'HARD', Professional: 'HARD', Master: 'HARD',
}

const MAX_MISSIONS = 5

type MissionCandidate = {
  tier: string
  task_name: string
  task_title: string
  label: string
  unit: string
  current: number
  target: number
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// ── Trouve le tier actuel + les missions candidates ────────────────────────
export async function buildMissionCandidates(uuid: string, profileId: string): Promise<MissionCandidate[] | null> {
  const result = await computeMilestones(uuid, profileId)
  if ('error' in result) return null

  for (const tierData of result.tiers) {
    const allTasks = [...tierData.wiki_tasks, ...tierData.vault_tasks]
    const computable = allTasks.filter((t: any) => t.data_available)
    if (computable.length === 0) continue // rien de mesurable ici, tier suivant
    const allDone = computable.every((t: any) => t.completed)
    if (allDone) continue // tier deja acquis (pour ce qu'on sait verifier), tier suivant

    // Tier actuel trouve : casse les tâches incomplètes en requirements individuelles
    const candidates: MissionCandidate[] = []
    for (const task of computable) {
      if (task.completed) continue
      for (const req of task.requirements_detail as any[]) {
        if (req.met) continue
        candidates.push({
          tier: tierData.tier,
          task_name: task.name,
          task_title: task.task_title,
          label: req.label, unit: req.unit,
          current: req.current, target: req.target,
        })
      }
    }
    // Classe par proximite de completion (current/target desc) — victoires rapides d'abord
    candidates.sort((a, b) => (b.current / b.target) - (a.current / a.target))
    return candidates.slice(0, MAX_MISSIONS)
  }
  return [] // tous les tiers verifiables sont completes
}

function toMissionRow(c: MissionCandidate, uuid: string, profileId: string, today: string) {
  return {
    hypixel_uuid:     uuid,
    profile_id:       profileId,
    mission_date:     today,
    mission_id:       slugify(`${c.tier}_${c.task_title}_${c.label}`),
    activity:         c.unit === 'level' ? 'SKILL' : c.unit === 'Fairy Souls' ? 'FAIRY_SOULS' : 'COLLECTION',
    title:            `Reach ${c.label}`,
    description:      `Part of the ${c.tier} tier's "${c.task_title}" milestone.`,
    difficulty:       TIER_DIFFICULTY[c.tier] || 'MEDIUM',
    progress:         Math.round(c.current),
    progress_target:  Math.round(c.target),
    progress_unit:    c.unit,
    pct_contribution: 0,
    coins_reward:     0, // pas de recompense inventee — aucun modele economique verifie pour une requirement partielle
    xp_reward:        0,
    completed:        false,
    carried_over:     false,
  }
}

// ── GET : retourne ou génère les missions ─────────────────────
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

  // Recalculee a chaque requete — jamais au niveau module (meme bug que ah-collect :
  // une instance serverless qui reste chaude fait derailler la date apres minuit UTC).
  const TODAY = new Date().toISOString().split('T')[0]

  const uuid      = link.hypixel_uuid
  const profileId = req.nextUrl.searchParams.get('profile_id')
  if (!profileId) return NextResponse.json({ error: 'profile_id required' }, { status: 400 })

  // Verifie si des missions existent pour aujourd'hui
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

  // Verifie missions incomplètes de la veille
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

  // Genere de nouvelles missions depuis Milestones
  const candidates = await buildMissionCandidates(uuid, profileId)
  if (candidates === null) return NextResponse.json({ error: 'Player not synced yet' }, { status: 404 })

  if (candidates.length === 0) {
    return NextResponse.json({ missions: [], date: TODAY, generated: true, message: 'All verifiable Milestones tasks are complete for now.' })
  }

  const missionRows = candidates.map(c => toMissionRow(c, uuid, profileId, TODAY))
  const { data: inserted, error } = await supabase
    .from('player_missions')
    .insert(missionRows)
    .select()

  if (error) throw error

  return NextResponse.json({ missions: inserted, date: TODAY, generated: true })
}
