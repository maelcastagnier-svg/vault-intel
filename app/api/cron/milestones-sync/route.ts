// app/api/cron/milestones-sync/route.ts
// Mensuel — refetch + reparse les 7 pages "SkyBlock Guide/Tasks/<Tier>" du wiki officiel
// (hypixelskyblock.minecraft.wiki, jamais tronqué contrairement à l'ancien scrape Fandom
// 8000 caractères qui traînait dans game_mechanics_misc depuis le 20 juillet) et upsert
// dans milestone_tasks. Ajoute aussi les tâches "vault" (Fairy Souls, seule catégorie
// sblevel_tasks vérifiée qui n'a AUCUN équivalent dans le guide wiki — voir CLAUDE.md).
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WIKI_API = 'https://hypixelskyblock.minecraft.wiki/api.php'
const TIERS = ['Starter', 'Amateur', 'Intermediate', 'Skilled', 'Expert', 'Professional', 'Master'] as const

// ── Roman -> Arabe (Skl/Coll utilisent ce format sur le wiki, ex: LX = 60) ──────
function romanToInt(roman: string): number {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
  let total = 0
  for (let i = 0; i < roman.length; i++) {
    const cur = map[roman[i]], next = map[roman[i + 1]]
    if (next && cur < next) total -= cur
    else total += cur
  }
  return total
}

function cleanWikitext(text: string): string {
  return text
    .replace(/\{\{SkyBlock XP\|[^}]*\}\}/g, '')
    .replace(/\{\{Skl\|([^|]+)\|([IVXLCDM]+)\}\}/g, '$1 $2')
    .replace(/\{\{Coll\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{MobType\|([^}]+)\}\}/g, '$1')
    .replace(/\[\[File:[^\]]*\]\]/g, '')
    .replace(/\[\[([^|\]]+)\|[^\]]*\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{Green\|([^}]*)\}\}/g, '$1')
    .replace(/\{\{Aqua\|([^}]*)\}\}/g, '$1')
    .replace(/\{\{Dark Purple\|([^}]*)\}\}/g, '$1')
    .replace(/\{\{Stat\|[^}]*\}\}/g, '')
    .replace(/\{\{Plainlist\|/g, '')
    .replace(/\}\}/g, '')
    .replace(/\{\{/g, '')
    .trim()
}

function extractXP(text: string): number {
  const m = text.match(/\{\{SkyBlock XP\|[^}]*\+([\d,]+)/)
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0
}

type Requirement =
  | { type: 'skill'; skill: string; level: number }
  | { type: 'collection'; item_name: string; tier: number }
  | { type: 'mobtype'; name: string }
  | { type: 'item'; item_name: string }

function extractRequirements(descRaw: string): Requirement[] {
  const reqs: Requirement[] = []
  const sklRe = /\{\{Skl\|([^|]+)\|([IVXLCDM]+)\}\}/g
  let m: RegExpExecArray | null
  while ((m = sklRe.exec(descRaw))) reqs.push({ type: 'skill', skill: m[1].trim().toLowerCase(), level: romanToInt(m[2]) })

  const collRe = /\{\{Coll\|([^|}]+?)\s+([IVXLCDM]+)\}\}/g
  while ((m = collRe.exec(descRaw))) reqs.push({ type: 'collection', item_name: m[1].trim(), tier: romanToInt(m[2]) })

  const mobRe = /\{\{MobType\|([^}]+)\}\}/g
  while ((m = mobRe.exec(descRaw))) reqs.push({ type: 'mobtype', name: m[1].trim() })

  const withoutTemplates = descRaw
    .replace(/\{\{Skl\|[^}]*\}\}/g, '')
    .replace(/\{\{Coll\|[^}]*\}\}/g, '')
    .replace(/\{\{MobType\|[^}]*\}\}/g, '')
    .replace(/\[\[File:[^\]]*\]\]/g, '')
  const linkRe = /\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/g
  while ((m = linkRe.exec(withoutTemplates))) {
    const name = m[1].trim()
    if (['Skill', 'Collections', 'Pets', 'Accessories', 'Museum', 'Mob Types'].includes(name)) continue
    reqs.push({ type: 'item', item_name: name })
  }
  return reqs
}

type ParsedTask = { name: string; task_title: string; description: string; xp: number; requirements: Requirement[] }

// ── Parse une page de tâches (table wikitext à 5 colonnes : Image|Name|Task|Description|XP) ──
function parseTierPage(wikitext: string): ParsedTask[] {
  const rows = wikitext.split(/\n\|-/).slice(1)
  const tasks: ParsedTask[] = []
  for (const row of rows) {
    const cells: string[] = []
    let current = ''
    for (const line of row.split('\n')) {
      if (/^\|(?!\|)/.test(line) && !line.trim().startsWith('|-')) {
        if (current.trim()) cells.push(current.trim())
        current = line.replace(/^\|/, '')
      } else {
        current += '\n' + line
      }
    }
    if (current.trim()) cells.push(current.trim())
    if (cells.length < 5) continue

    const [imgCell, name, taskTitle, descRaw, xpRaw] = cells
    if (!/^\[\[File:/.test(imgCell)) continue

    tasks.push({
      name:        cleanWikitext(name).trim(),
      task_title:  cleanWikitext(taskTitle).trim(),
      description: cleanWikitext(descRaw).replace(/\n\s*\n/g, '\n').trim(),
      xp:          extractXP(xpRaw + descRaw),
      requirements: extractRequirements(descRaw),
    })
  }
  return tasks
}

async function fetchTierPage(tier: string): Promise<string> {
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent('SkyBlock Guide/Tasks/' + tier)}&prop=wikitext&format=json`
  const res = await fetch(url)
  const data = await res.json()
  const wt = data?.parse?.wikitext?.['*']
  if (!wt) throw new Error(`No wikitext for tier ${tier}: ${JSON.stringify(data?.error || data)}`)
  return wt
}

// ── Fairy Souls — seule catégorie sblevel_tasks vérifiée (source: fairy_soul_locations,
// count(*)=255, déjà utilisée dans l'ancien milestones/route.ts) qui n'a AUCUN équivalent
// dans le guide wiki (confirmé : aucune mention "Fairy Soul" dans les 7 pages de tâches).
// Répartie sur 5 des 7 tiers en reprenant l'ancienne échelle déjà vérifiée [50,100,150,200,255].
const FAIRY_SOULS_BY_TIER: Record<string, number> = {
  Amateur:      50,
  Intermediate: 100,
  Skilled:      150,
  Expert:       200,
  Master:       255,
}

// ── Autres catégories sblevel_tasks confirmées absentes du guide wiki (réconciliation
// des 53 tâches réelles sblevel_tasks contre les 184 tâches wiki, 23 juillet) — ajoutées
// en data_available:false (requirement type "uncollected") plutôt que masquées, pour que
// Milestones reste honnête sur "184 tâches trackées aujourd'hui + X en attente de collecte"
// au lieu de donner l'impression que le guide s'arrête où on peut déjà calculer. Placement
// de tier = jugement éditorial (aucun seuil numérique n'est affiché tant que
// data_available reste false, donc rien n'est inventé), pas une constante de jeu.
const VAULT_GAP_TASKS: { tier: string; task_key: string; name: string; task_title: string; description: string }[] = [
  { tier: 'Starter',      task_key: 'complete_objectives',    name: 'Objectives',    task_title: 'Complete Tutorial Objectives', description: 'Complete the early SkyBlock tutorial objectives.' },
  { tier: 'Starter',      task_key: 'fast_travel_unlocked',   name: 'Fast Travel',   task_title: 'Unlock Fast Travel Zones',     description: 'Unlock fast travel access to more zones/islands.' },
  { tier: 'Amateur',      task_key: 'mining_fiesta',          name: 'Mining Fiesta', task_title: 'Participate in Mining Fiesta', description: 'Take part in the seasonal Mining Fiesta event.' },
  { tier: 'Amateur',      task_key: 'spooky_festival',        name: 'Spooky Festival', task_title: 'Participate in Spooky Festival', description: 'Take part in the seasonal Spooky Festival event.' },
  { tier: 'Amateur',      task_key: 'fishing_festival',       name: 'Fishing Festival', task_title: 'Participate in Fishing Festival', description: 'Take part in the seasonal Fishing Festival event.' },
  { tier: 'Amateur',      task_key: 'jacob_farming_contest',  name: 'Jacob Contest', task_title: "Participate in Jacob's Farming Contest", description: "Take part in Jacob's Farming Contest event." },
  { tier: 'Amateur',      task_key: 'farming',                name: 'Farming Activity', task_title: 'Farming Activity', description: 'Cumulative farming activity (crops harvested), distinct from Farming skill level.' },
  { tier: 'Amateur',      task_key: 'fishing',                name: 'Fishing Activity', task_title: 'Fishing Activity', description: 'Cumulative fishing activity (fish caught), distinct from Fishing skill level.' },
  { tier: 'Amateur',      task_key: 'mining',                 name: 'Mining Activity', task_title: 'Mining Activity', description: 'Cumulative mining activity (blocks mined), distinct from Mining skill level.' },
  { tier: 'Intermediate', task_key: 'essence_crimson_shop',   name: 'Crimson Essence Shop', task_title: 'Crimson Essence Shop', description: 'Purchase upgrades from the Crimson Essence shop.' },
  { tier: 'Intermediate', task_key: 'unlocking_relays',       name: 'Crystal Hollows Relays', task_title: 'Unlock Relays', description: 'Unlock fast travel relays in the Crystal Hollows.' },
  { tier: 'Professional', task_key: 'mythological_kills',     name: 'Mythological Creatures', task_title: 'Mythological Kills', description: 'Defeat mythological creatures during the Griffin burrow event.' },
]

// Reutilisable par le handler cron et par un test direct (meme pattern que runEvolveSkills).
export async function runMilestonesSync() {
  const logId = await startSync('milestones-sync')
  const results: Record<string, any> = {}
  let totalRows = 0
  let hadError = false

  for (const tier of TIERS) {
    try {
      const wikitext = await fetchTierPage(tier)
      const tasks = parseTierPage(wikitext)

      const rows = tasks.map(t => ({
        tier, source: 'wiki',
        name: t.name, task_title: t.task_title, description: t.description,
        xp: t.xp, requirements: t.requirements, task_key: null,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('milestone_tasks')
        .upsert(rows, { onConflict: 'tier, source, name, task_title' })
      if (error) throw new Error('upsert: ' + error.message)

      results[tier] = { success: true, tasks: rows.length }
      totalRows += rows.length
    } catch (err: any) {
      hadError = true
      results[tier] = { success: false, error: err.message }
    }
  }

  // Tâches Vault — Fairy Souls (calculable) + les 12 catégories sblevel_tasks confirmées
  // absentes du wiki (data_available:false, montrées comme roadmap en attente de collecte).
  const fairySoulsRows = Object.entries(FAIRY_SOULS_BY_TIER).map(([tier, target]) => ({
    tier, source: 'vault',
    name: 'Fairy Souls', task_title: 'Collect Fairy Souls',
    description: `Find and collect ${target} Fairy Souls across the islands.`,
    xp: 0,
    requirements: [{ type: 'fairy_souls', target }],
    task_key: 'fairy_souls',
    updated_at: new Date().toISOString(),
  }))
  const gapRows = VAULT_GAP_TASKS.map(t => ({
    tier: t.tier, source: 'vault',
    name: t.name, task_title: t.task_title, description: t.description,
    xp: 0,
    requirements: [{ type: 'uncollected', task_key: t.task_key }],
    task_key: t.task_key,
    updated_at: new Date().toISOString(),
  }))
  const vaultRows = [...fairySoulsRows, ...gapRows]
  const { error: vaultErr } = await supabase
    .from('milestone_tasks')
    .upsert(vaultRows, { onConflict: 'tier, source, name, task_title' })
  if (vaultErr) { hadError = true; results['vault_tasks'] = { success: false, error: vaultErr.message } }
  else { results['vault_tasks'] = { success: true, tasks: vaultRows.length }; totalRows += vaultRows.length }

  const failedTiers = Object.entries(results).filter(([, r]: any) => !r.success)
  await finishSync(
    logId,
    hadError ? (failedTiers.length === TIERS.length + 1 ? 'error' : 'partial') : 'success',
    totalRows,
    { results }
  )

  return { success: !hadError, total_tasks: totalRows, results }
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runMilestonesSync()
  return NextResponse.json(result)
}
