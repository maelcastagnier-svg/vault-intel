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
// 🔴 Bug réel corrigé (25 août, trouvé en vérifiant les sources multi-net
// demandées par l'utilisateur) : `item.stats` mélange des clés MAJUSCULES
// (DAMAGE/STRENGTH/FEROCITY...) et minuscules (damage/strength/...) selon
// l'item côté API Hypixel elle-même (confirmé en inspectant les 1376 items
// avec stats -- ni un artefact de notre parsing ni une supposition). Le
// code d'origine ne lisait QUE la casse minuscule -- chaque item exposant
// ses stats en MAJUSCULES (Hyperion, Vorpal Katana, la plupart des armes/
// armures haut de gamme) se retrouvait avec 0 partout, silencieusement,
// depuis la création de ce cron. `readStat` lit les deux casses. Colonnes
// `damage`/`ferocity` ajoutées (absentes avant, jamais aucune arme n'avait
// son dégât de base capturé ici).
function readStat(s: Record<string, unknown>, key: string): number {
  const upper = Number(s[key.toUpperCase()])
  if (!isNaN(upper) && s[key.toUpperCase()] !== undefined) return upper
  const lower = Number(s[key.toLowerCase()])
  return isNaN(lower) ? 0 : lower
}

export async function syncItemStats(): Promise<number> {
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
        health:       Math.round(readStat(s, 'health')),
        defense:      Math.round(readStat(s, 'defense')),
        strength:     Math.round(readStat(s, 'strength')),
        crit_damage:  Math.round(readStat(s, 'critical_damage')),
        crit_chance:  Math.round(readStat(s, 'critical_chance')),
        intelligence: Math.round(readStat(s, 'intelligence')),
        speed:        Math.round(readStat(s, 'speed')),
        damage:       Math.round(readStat(s, 'damage')),
        ferocity:     Math.round(readStat(s, 'ferocity')),
        category:     item.category || 'OTHER',
        rarity:       item.tier || null,
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
