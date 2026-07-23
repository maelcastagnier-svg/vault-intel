// app/api/player/milestones/route.ts
// Refonte complète (23 juillet) — remplace l'ancien système de paliers codés en dur
// (skill levels/slayer XP/dungeon floors/fairy souls/top-10 collections, un flat array)
// par le vrai guide de complétion à 7 tiers (Starter->Master), sourcé de milestone_tasks
// (rempli par le cron milestones-sync depuis le wiki officiel + Fairy Souls en tâche Vault).
//
// Progression calculée UNIQUEMENT pour les tâches dont TOUTES les requirements sont d'un
// type qu'on peut vérifier avec certitude contre des données déjà collectées et validées :
// - skill      -> player_data.skills[skill] (niveau déjà calculé, pas de conversion XP)
// - collection -> player_data.collections + table `collections` (tiers réels, déjà utilisée
//                 et vérifiée dans l'ancien système)
// - fairy_souls -> player_data.fairy_souls (comptage déjà vérifié, table fairy_soul_locations)
// Toute tâche contenant ne serait-ce qu'une requirement d'un autre type (item/mobtype —
// accessoires précis, minions, musée, essence, dojo...) reste data_available:false : on
// n'invente jamais un statut de complétion sans savoir vraiment le vérifier.
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '../../../../lib/supabase-server'

export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TIER_ORDER = ['Starter', 'Amateur', 'Intermediate', 'Skilled', 'Expert', 'Professional', 'Master']

type Requirement =
  | { type: 'skill'; skill: string; level: number }
  | { type: 'collection'; item_name: string; tier: number }
  | { type: 'fairy_souls'; target: number }
  | { type: 'mobtype'; name: string }
  | { type: 'item'; item_name: string }

type TaskRow = {
  tier: string; source: string; name: string; task_title: string
  description: string; xp: number; requirements: Requirement[]
}

type RequirementDetail = {
  label: string           // ex: "Farming level 4", "Wheat Collection IV"
  unit: string            // ex: "level", "Wheat" — pour progress_unit cote missions
  current: number
  target: number
  met: boolean
}

type EvaluatedTask = {
  name: string
  task_title: string
  description: string
  xp: number
  data_available: boolean
  progress_pct: number | null
  completed: boolean | null
  requirements_met: number | null
  requirements_total: number
  requirements_detail: RequirementDetail[] // seulement rempli si data_available
}

// Logique reutilisable par le handler GET (auth reelle) et par des tests directs
// (meme pattern que runEvolveSkills dans evolve-skills/route.ts).
export async function computeMilestones(uuid: string, profileId: string) {
  const { data: player, error } = await supabase
    .from('player_data')
    .select('skills, collections, fairy_souls')
    .eq('hypixel_uuid', uuid)
    .eq('profile_id', profileId)
    .single()

  if (error || !player) return { error: 'Player not synced yet', status: 404 }

  const { data: taskRows } = await supabase
    .from('milestone_tasks')
    .select('tier, source, name, task_title, description, xp, requirements')
    .order('tier')

  if (!taskRows || taskRows.length === 0) {
    return { error: 'Milestone tasks not synced yet', status: 503 }
  }

  // Collections referencees par au moins une requirement 'collection' -> 1 seule requete batch
  const collectionNames = new Set<string>()
  for (const row of taskRows as TaskRow[]) {
    for (const r of row.requirements || []) {
      if (r.type === 'collection') collectionNames.add(r.item_name)
    }
  }
  const { data: collectionDefs } = collectionNames.size > 0
    ? await supabase.from('collections').select('item_id, item_name, tiers').in('item_name', Array.from(collectionNames))
    : { data: [] as any[] }

  const collectionTiersByName = new Map<string, number[]>()
  const collectionItemIdByName = new Map<string, string>()
  for (const def of collectionDefs || []) {
    try {
      // Champ reel confirme en base : "amountRequired" (camelCase), pas "amount_required" —
      // c'etait deja silencieusement casse dans l'ancien milestones/route.ts (meme faute).
      const tiers = JSON.parse(def.tiers) as { tier: number; amountRequired: number }[]
      collectionTiersByName.set(def.item_name, tiers.map(t => t.amountRequired))
      collectionItemIdByName.set(def.item_name, def.item_id)
    } catch { /* tiers malformees, requirement ignoree */ }
  }

  const skills      = player.skills || {}
  const collections = player.collections || {}
  const fairySouls  = player.fairy_souls ?? 0

  function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }

  function evaluateRequirement(r: Requirement): RequirementDetail | null {
    if (r.type === 'skill') {
      const current = skills[r.skill] ?? 0
      return { label: `${capitalize(r.skill)} level ${r.level}`, unit: 'level', current, target: r.level, met: current >= r.level }
    }
    if (r.type === 'collection') {
      const itemId = collectionItemIdByName.get(r.item_name)
      const tierAmounts = collectionTiersByName.get(r.item_name)
      if (!itemId || !tierAmounts || !tierAmounts[r.tier - 1]) return null
      const target  = tierAmounts[r.tier - 1]
      const current = collections[itemId] ?? 0
      return { label: `${r.item_name} Collection ${r.tier}`, unit: r.item_name, current, target, met: current >= target }
    }
    if (r.type === 'fairy_souls') {
      return { label: `Collect ${r.target} Fairy Souls`, unit: 'Fairy Souls', current: fairySouls, target: r.target, met: fairySouls >= r.target }
    }
    return null // item / mobtype : pas verifiable aujourd'hui
  }

  function evaluateTask(row: TaskRow): EvaluatedTask {
    const reqs = row.requirements || []
    const details = reqs.map(evaluateRequirement)
    const allVerifiable = reqs.length > 0 && details.every((d): d is RequirementDetail => d !== null)

    if (!allVerifiable) {
      return {
        name: row.name, task_title: row.task_title, description: row.description, xp: row.xp,
        data_available: false, progress_pct: null, completed: null,
        requirements_met: null, requirements_total: reqs.length, requirements_detail: [],
      }
    }

    const met = details.filter(d => d!.met).length
    return {
      name: row.name, task_title: row.task_title, description: row.description, xp: row.xp,
      data_available: true,
      progress_pct: Math.round((met / reqs.length) * 100),
      completed: met === reqs.length,
      requirements_met: met,
      requirements_total: reqs.length,
      requirements_detail: details as RequirementDetail[],
    }
  }

  const byTier = new Map<string, { wiki_tasks: EvaluatedTask[]; vault_tasks: EvaluatedTask[] }>()
  for (const tier of TIER_ORDER) byTier.set(tier, { wiki_tasks: [], vault_tasks: [] })

  for (const row of taskRows as TaskRow[]) {
    const bucket = byTier.get(row.tier)
    if (!bucket) continue
    const evaluated = evaluateTask(row)
    if (row.source === 'vault') bucket.vault_tasks.push(evaluated)
    else bucket.wiki_tasks.push(evaluated)
  }

  const tiers = TIER_ORDER.map(tier => {
    const { wiki_tasks, vault_tasks } = byTier.get(tier)!
    const all = [...wiki_tasks, ...vault_tasks]
    const computable = all.filter(t => t.data_available)
    const completed  = computable.filter(t => t.completed)
    return {
      tier,
      wiki_tasks,
      vault_tasks,
      tasks_total:      all.length,
      tasks_computable: computable.length,
      tasks_completed:  completed.length,
    }
  })

  return { tiers }
}

// ── Handler ───────────────────────────────────────────────────
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

  const profileId = req.nextUrl.searchParams.get('profile_id')
  if (!profileId) return NextResponse.json({ error: 'profile_id required' }, { status: 400 })

  const result = await computeMilestones(link.hypixel_uuid, profileId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
