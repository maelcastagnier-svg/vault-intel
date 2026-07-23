// app/api/player/milestones/route.ts
// Restructuré le 23 juillet (2e passe) — milestone_tasks stocke maintenant UNE requirement
// individuelle par ligne (pas une catégorie composite regroupant plusieurs requirements),
// après avoir découvert que le wiki lui-même annonce 2237 tâches individuelles sur les 7
// tiers (120/247/448/507/479/294/142, page "SkyBlock Guide") alors que l'ancien schéma n'en
// stockait que 179 en groupant tout par catégorie. milestone_tier_totals garde ce total
// annoncé par tier, pour afficher honnêtement "X tâches connues sur ~Y annoncées" — le wiki
// marque lui-même sa section "Tasks" comme obsolète, et les sous-pages par tier sont
// démontrées incomplètes au-delà de Starter/Master (voir CLAUDE.md).
//
// Progression calculée UNIQUEMENT pour les requirements d'un type vérifiable avec certitude
// contre des données déjà collectées et validées :
// - skill      -> player_data.skills[skill] (niveau déjà calculé, pas de conversion XP)
// - collection -> player_data.collections + table `collections` (tiers réels)
// - fairy_souls -> player_data.fairy_souls (comptage déjà vérifié)
// Tout le reste (item/mobtype/uncollected — accessoires précis, minions, musée, essence,
// dojo...) reste data_available:false : jamais de statut de complétion inventé.
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
  | { type: 'uncollected'; task_key: string }

type TaskRow = {
  tier: string; source: string; category: string; task_title: string
  label: string; group_xp: number; requirement: Requirement
}

export type EvaluatedTask = {
  category: string
  task_title: string
  label: string
  group_xp: number
  data_available: boolean
  current: number | null
  target: number | null
  met: boolean | null
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
    .select('tier, source, category, task_title, label, group_xp, requirement')
    .order('tier')

  if (!taskRows || taskRows.length === 0) {
    return { error: 'Milestone tasks not synced yet', status: 503 }
  }

  const { data: totalsRows } = await supabase.from('milestone_tier_totals').select('tier, announced_total')
  const announcedByTier = new Map<string, number>((totalsRows || []).map((r: any) => [r.tier, r.announced_total]))

  // Collections referencees par au moins une requirement 'collection' -> 1 seule requete batch
  const collectionNames = new Set<string>()
  for (const row of taskRows as TaskRow[]) {
    if (row.requirement.type === 'collection') collectionNames.add(row.requirement.item_name)
  }
  const { data: collectionDefs } = collectionNames.size > 0
    ? await supabase.from('collections').select('item_id, item_name, tiers').in('item_name', Array.from(collectionNames))
    : { data: [] as any[] }

  const collectionTiersByName = new Map<string, number[]>()
  const collectionItemIdByName = new Map<string, string>()
  for (const def of collectionDefs || []) {
    try {
      // Champ reel confirme en base : "amountRequired" (camelCase), pas "amount_required".
      const tiers = JSON.parse(def.tiers) as { tier: number; amountRequired: number }[]
      collectionTiersByName.set(def.item_name, tiers.map(t => t.amountRequired))
      collectionItemIdByName.set(def.item_name, def.item_id)
    } catch { /* tiers malformees, requirement ignoree */ }
  }

  const skills      = player.skills || {}
  const collections = player.collections || {}
  const fairySouls  = player.fairy_souls ?? 0

  function evaluateTask(row: TaskRow): EvaluatedTask {
    const r = row.requirement
    const base = { category: row.category, task_title: row.task_title, label: row.label, group_xp: row.group_xp }

    if (r.type === 'skill') {
      const current = skills[r.skill] ?? 0
      return { ...base, data_available: true, current, target: r.level, met: current >= r.level }
    }
    if (r.type === 'collection') {
      const itemId = collectionItemIdByName.get(r.item_name)
      const tierAmounts = collectionTiersByName.get(r.item_name)
      if (!itemId || !tierAmounts || !tierAmounts[r.tier - 1]) {
        return { ...base, data_available: false, current: null, target: null, met: null }
      }
      const target  = tierAmounts[r.tier - 1]
      const current = collections[itemId] ?? 0
      return { ...base, data_available: true, current, target, met: current >= target }
    }
    if (r.type === 'fairy_souls') {
      return { ...base, data_available: true, current: fairySouls, target: r.target, met: fairySouls >= r.target }
    }
    // item / mobtype / uncollected : pas verifiable aujourd'hui
    return { ...base, data_available: false, current: null, target: null, met: null }
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
    const completed  = computable.filter(t => t.met)
    return {
      tier,
      wiki_tasks,
      vault_tasks,
      tasks_known:      all.length,               // ce qu'on a reussi a scraper/ajouter
      tasks_announced:  announcedByTier.get(tier) ?? null, // total annonce par le wiki lui-meme
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
