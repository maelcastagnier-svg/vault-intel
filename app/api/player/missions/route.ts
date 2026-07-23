// app/api/player/missions/route.ts
// Pioche dans les tâches Milestones non complétées du joueur (voir CLAUDE.md, section
// "Milestones vs Daily Missions"). Simplifié le 23 juillet suite à la restructuration de
// milestone_tasks en granularité individuelle : chaque tâche Milestones EST déjà une
// requirement individuelle (plus besoin de casser des tâches composites en sous-requirements
// ici, computeMilestones le fait directement).
//
// Logique : trouve le tier ACTUEL du joueur (le premier tier, Starter→Master, qui a encore
// au moins une tâche data_available:true non complétée), classe ses tâches calculables non
// complétées par proximité de complétion (current/target) pour prioriser les victoires
// rapides, garde les 5 premières. Jamais un tier au-dessus du tier actuel — reste
// "réalisable à l'instant T", pas des objectifs de plusieurs semaines. Aucune donnée
// data_available:false n'est jamais utilisée (musée, essence, minions, uncollected...).
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requirePlan } from '../../../../lib/get-plan'
import { computeMilestones, EvaluatedTask } from '../milestones/route'

export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TIER_DIFFICULTY: Record<string, string> = {
  Starter: 'EASY', Amateur: 'EASY',
  Intermediate: 'MEDIUM', Skilled: 'MEDIUM',
  Expert: 'HARD', Professional: 'HARD', Master: 'HARD',
}

const MAX_MISSIONS = 5

type MissionCandidate = { tier: string; task: EvaluatedTask }

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// ── Trouve le tier actuel + les missions candidates ────────────────────────
export async function buildMissionCandidates(uuid: string, profileId: string): Promise<MissionCandidate[] | null> {
  const result = await computeMilestones(uuid, profileId)
  if ('error' in result) return null

  for (const tierData of result.tiers) {
    const allTasks = [...tierData.wiki_tasks, ...tierData.vault_tasks]
    const computable = allTasks.filter(t => t.data_available)
    if (computable.length === 0) continue // rien de mesurable ici, tier suivant
    const allDone = computable.every(t => t.met)
    if (allDone) continue // tier deja acquis (pour ce qu'on sait verifier), tier suivant

    // Tier actuel trouve : classe les taches non completees par proximite de completion
    const incomplete = computable.filter(t => !t.met)
    incomplete.sort((a, b) => (b.current! / b.target!) - (a.current! / a.target!))
    return incomplete.slice(0, MAX_MISSIONS).map(task => ({ tier: tierData.tier, task }))
  }
  return [] // tous les tiers verifiables sont completes
}

function toMissionRow(c: MissionCandidate, uuid: string, profileId: string, today: string) {
  const { task, tier } = c
  return {
    hypixel_uuid:     uuid,
    profile_id:       profileId,
    mission_date:     today,
    mission_id:       slugify(`${tier}_${task.task_title}_${task.label}`),
    activity:         task.target === null ? 'OTHER' : task.label.includes('Fairy Souls') ? 'FAIRY_SOULS' : /level \d+$/.test(task.label) ? 'SKILL' : 'COLLECTION',
    title:            `Reach ${task.label}`,
    description:      `Part of the ${tier} tier's "${task.task_title}" milestone.`,
    difficulty:       TIER_DIFFICULTY[tier] || 'MEDIUM',
    progress:         Math.round(task.current ?? 0),
    progress_target:  Math.round(task.target ?? 0),
    progress_unit:    task.category,
    pct_contribution: 0,
    coins_reward:     0, // pas de recompense inventee — aucun modele economique verifie
    xp_reward:        0,
    completed:        false,
    carried_over:     false,
  }
}

// ── GET : retourne ou génère les missions ─────────────────────
export async function GET(req: NextRequest) {
  // Daily Missions reserve Elite (Skills/Milestones sont Pro, Daily Missions est la
  // couche d'engagement au-dessus, reservee au tier le plus eleve — voir CLAUDE.md).
  const gate = await requirePlan('elite')
  if (!gate.ok) return gate.response

  const { data: link } = await supabase
    .from('hypixel_account_links')
    .select('hypixel_uuid')
    .eq('user_id', gate.user.id)
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
