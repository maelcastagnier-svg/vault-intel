// app/api/cron/network-events-sync/route.ts
// Tier 1 du chantier "Cartographie exhaustive" (voir CLAUDE.md / WIKI-MAPPING.md) --
// le bloc Économie/Événements réseau était à 0% de couverture avant le 1er août.
// 4 endpoints publics légers, groupés dans un seul cron (même pattern que
// skyblock-resources-sync), zéro clé requise pour aucun des 4 (confirmé en direct).
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================
// /v2/resources/skyblock/election → skyblock_mayor_election
// ============================================================
async function syncElection(): Promise<number> {
  const res = await fetch('https://api.hypixel.net/v2/resources/skyblock/election')
  const data = await res.json()
  if (!data.success || !data.mayor) throw new Error('election API failed')

  const { error } = await supabase
    .from('skyblock_mayor_election')
    .upsert({
      current_mayor_key: data.mayor.key,
      current_mayor_name: data.mayor.name,
      current_mayor_perks: data.mayor.perks || [],
      current_mayor_election_year: data.mayor.election?.year ?? null,
      next_election_year: data.current?.year ?? null,
      next_election_candidates: data.current?.candidates ?? null,
      raw: data,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'current_mayor_key, current_mayor_election_year' })
  if (error) throw new Error('skyblock_mayor_election upsert: ' + error.message)
  return 1
}

// ============================================================
// /v2/skyblock/news → skyblock_news
// "text" est une date lisible ("22nd July 2026"), pas un timestamp -- parsée ici.
// ============================================================
function parseNewsDate(text: string): string | null {
  const cleaned = text.replace(/(\d+)(st|nd|rd|th)/, '$1')
  const d = new Date(cleaned)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

async function syncNews(): Promise<number> {
  const res = await fetch('https://api.hypixel.net/v2/skyblock/news')
  const data = await res.json()
  if (!data.success || !data.items) throw new Error('news API failed')

  const rows = (data.items as any[]).map(item => ({
    link: item.link,
    title: item.title,
    text_date: item.text,
    published_at: parseNewsDate(item.text),
    item_material: item.item?.material ?? null,
    raw: item,
    fetched_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('skyblock_news').upsert(rows, { onConflict: 'link' })
  if (error) throw new Error('skyblock_news upsert: ' + error.message)
  return rows.length
}

// ============================================================
// /v2/skyblock/firesales → skyblock_fire_sales
// Champs cross-vérifiés via hypixel-api-reborn (endpoint vide au moment du mapping,
// jamais deviné -- voir WIKI-MAPPING.md).
// ============================================================
async function syncFireSales(): Promise<number> {
  const res = await fetch('https://api.hypixel.net/v2/skyblock/firesales')
  const data = await res.json()
  if (!data.success) throw new Error('firesales API failed')

  const sales = data.sales || []
  if (sales.length === 0) return 0

  const rows = sales.map((s: any) => ({
    item_id: s.item_id,
    starts_at: new Date(s.start).toISOString(),
    ends_at: new Date(s.end).toISOString(),
    amount: s.amount,
    price: s.price,
    raw: s,
    fetched_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('skyblock_fire_sales').upsert(rows, { onConflict: 'item_id, starts_at' })
  if (error) throw new Error('skyblock_fire_sales upsert: ' + error.message)
  return rows.length
}

// ============================================================
// /v2/resources/skyblock/bingo → skyblock_bingo_events + skyblock_bingo_goals
// Endpoint public "resources/" -- distinct de /v2/skyblock/bingo (progression par
// joueur, nécessite HYPIXEL_API_KEY, pas câblé ici, voir discovery_queue).
// ============================================================
async function syncBingo(): Promise<number> {
  const res = await fetch('https://api.hypixel.net/v2/resources/skyblock/bingo')
  const data = await res.json()
  if (!data.success || !data.id) throw new Error('bingo resources API failed')

  const { error: eventErr } = await supabase
    .from('skyblock_bingo_events')
    .upsert({
      id: data.id,
      name: data.name,
      starts_at: new Date(data.start).toISOString(),
      ends_at: new Date(data.end).toISOString(),
      modifier: data.modifier ?? null,
      raw: data,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'id' })
  if (eventErr) throw new Error('skyblock_bingo_events upsert: ' + eventErr.message)

  const goals = (data.goals || []).map((g: any) => ({
    event_id: data.id,
    goal_id: g.id,
    name: g.name,
    lore: g.lore ?? null,
    required_amount: g.requiredAmount ?? null,
    tiers: g.tiers ?? null,
    progress: g.progress ?? null,
    raw: g,
  }))

  const { error: goalsErr } = await supabase
    .from('skyblock_bingo_goals')
    .upsert(goals, { onConflict: 'event_id, goal_id' })
  if (goalsErr) throw new Error('skyblock_bingo_goals upsert: ' + goalsErr.message)

  return 1 + goals.length
}

export async function runNetworkEventsSync() {
  const logId = await startSync('network-events-sync')
  const results: Record<string, any> = {}
  let totalRows = 0
  let hadError = false

  for (const [name, fn] of Object.entries({ election: syncElection, news: syncNews, fire_sales: syncFireSales, bingo: syncBingo })) {
    try {
      const rows = await fn()
      results[name] = { success: true, rows }
      totalRows += rows
    } catch (err: any) {
      hadError = true
      results[name] = { success: false, error: err.message }
    }
  }

  await finishSync(logId, hadError ? 'partial' : 'success', totalRows, { results })

  return { success: !hadError, total_rows: totalRows, results }
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runNetworkEventsSync()
  return NextResponse.json(result)
}
