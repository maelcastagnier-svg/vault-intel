// app/api/cron/skyblock-resources-sync/route.ts
// Sync quotidien depuis l'API officielle Hypixel (/v2/resources/skyblock/*).
// Reconstruit ce qui a été supprimé le 16 juillet (commit 7df1fa4), avec des mappings
// vérifiés contre la structure réelle de chaque réponse (voir sync_log.details pour le
// détail de chaque run).
//
// - skills   → table `skills` : ladder complet 1→cap, plus riche que les quelques
//   niveaux repères chargés manuellement à l'origine (pas une régression, un complément).
// - collections → table `collections`, même mapping que celui déjà utilisé et vérifié
//   le 2026-07-21 pour construire les seuils de Milestones.
// - items    → table `item_stats`, uniquement les items qui exposent un champ `stats`
//   (armures/armes). `items_catalog` (radar) reste géré séparément par update-catalog,
//   ce cron-ci ne touche pas à cette table.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

// ============================================================
// /v2/resources/skyblock/skills → skills
// Vérifié : levels[].totalExpRequired est un total CUMULATIF (confirmé : niveau 1
// Farming = 50, identique à la valeur déjà en base et à leveling.json de NEU-REPO).
// ============================================================
async function syncSkills(): Promise<number> {
  const res  = await fetch(`https://api.hypixel.net/v2/resources/skyblock/skills?key=${HYPIXEL_KEY}`)
  const data = await res.json()
  if (!data.success || !data.skills) throw new Error('skills API failed')

  const rows: any[] = []
  for (const [skillName, skillData] of Object.entries<any>(data.skills)) {
    const levels = skillData.levels || []
    let prevCumulative = 0
    levels.forEach((lvl: any, idx: number) => {
      const cumulative = lvl.totalExpRequired ?? prevCumulative
      rows.push({
        skill_name:   skillName.toLowerCase(),
        level:        lvl.level ?? idx + 1,
        xp_required:  Math.round(cumulative - prevCumulative),
        cumulative_xp: Math.round(cumulative),
        reward:       (lvl.unlocks || []).join('; ') || null,
      })
      prevCumulative = cumulative
    })
  }

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase
      .from('skills')
      .upsert(rows.slice(i, i + 100), { onConflict: 'skill_name, level' })
    if (error) throw new Error('skills upsert: ' + error.message)
  }
  return rows.length
}

// ============================================================
// /v2/resources/skyblock/collections → collections
// ============================================================
async function syncCollections(): Promise<number> {
  const res  = await fetch(`https://api.hypixel.net/v2/resources/skyblock/collections?key=${HYPIXEL_KEY}`)
  const data = await res.json()
  if (!data.success || !data.collections) throw new Error('collections API failed')

  const rows: any[] = []
  for (const [category, catData] of Object.entries<any>(data.collections)) {
    for (const [itemId, colData] of Object.entries<any>(catData.items || {})) {
      rows.push({
        item_id:    itemId,
        item_name:  colData.name || itemId,
        skill_type: category,
        max_tier:   colData.maxTiers || (colData.tiers || []).length || 0,
        tiers:      JSON.stringify(colData.tiers || []),
        updated_at: new Date().toISOString(),
      })
    }
  }

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase
      .from('collections')
      .upsert(rows.slice(i, i + 100), { onConflict: 'item_id' })
    if (error) throw new Error('collections upsert: ' + error.message)
  }
  return rows.length
}

// ============================================================
// /v2/resources/skyblock/items → item_stats (items avec un champ `stats` uniquement)
// ============================================================
async function syncItemStats(): Promise<number> {
  const res  = await fetch(`https://api.hypixel.net/v2/resources/skyblock/items?key=${HYPIXEL_KEY}`)
  const data = await res.json()
  if (!data.success || !data.items) throw new Error('items API failed')

  const rows = (data.items as any[])
    .filter(item => item.stats && Object.keys(item.stats).length > 0 && item.id)
    .map(item => {
      const s = item.stats
      return {
        item_id:      item.id,
        display_name: item.name,
        health:       Math.round(s.health       || 0),
        defense:      Math.round(s.defense      || 0),
        strength:     Math.round(s.strength     || 0),
        crit_damage:  Math.round(s.crit_damage  || 0),
        crit_chance:  Math.round(s.crit_chance  || 0),
        intelligence: Math.round(s.intelligence || 0),
        speed:        Math.round(s.speed        || 0),
        category:     item.category || 'OTHER',
        raw_lore:     (item.lore || []).join('\n') || null,
      }
    })

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from('item_stats')
      .upsert(rows.slice(i, i + 200), { onConflict: 'item_id' })
    if (error) throw new Error('item_stats upsert: ' + error.message)
  }
  return rows.length
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('skyblock-resources-sync')
  const results: Record<string, any> = {}
  let totalRows = 0
  let hadError = false

  for (const [name, fn] of Object.entries({ skills: syncSkills, collections: syncCollections, item_stats: syncItemStats })) {
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

  return NextResponse.json({ success: !hadError, total_rows: totalRows, results })
}
