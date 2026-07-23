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

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  // Tâches Vault (Fairy Souls)
  const vaultRows = Object.entries(FAIRY_SOULS_BY_TIER).map(([tier, target]) => ({
    tier, source: 'vault',
    name: 'Fairy Souls', task_title: 'Collect Fairy Souls',
    description: `Find and collect ${target} Fairy Souls across the islands.`,
    xp: 0,
    requirements: [{ type: 'fairy_souls', target }],
    task_key: 'fairy_souls',
    updated_at: new Date().toISOString(),
  }))
  const { error: vaultErr } = await supabase
    .from('milestone_tasks')
    .upsert(vaultRows, { onConflict: 'tier, source, name, task_title' })
  if (vaultErr) { hadError = true; results['vault_fairy_souls'] = { success: false, error: vaultErr.message } }
  else { results['vault_fairy_souls'] = { success: true, tasks: vaultRows.length }; totalRows += vaultRows.length }

  const failedTiers = Object.entries(results).filter(([, r]: any) => !r.success)
  await finishSync(
    logId,
    hadError ? (failedTiers.length === TIERS.length + 1 ? 'error' : 'partial') : 'success',
    totalRows,
    { results }
  )

  return NextResponse.json({ success: !hadError, total_tasks: totalRows, results })
}
