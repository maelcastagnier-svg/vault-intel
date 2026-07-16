// app/api/cron/skyblock-resources-sync/route.ts
// Sync quotidien depuis l'API officielle Hypixel
// Remplit : game_context, item_stats, collections, skill_unlocks
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

// ============================================================
// SYNC ITEMS — /v2/resources/skyblock/items
// → game_context + item_stats
// ============================================================
async function syncItems(): Promise<number> {
  const res  = await fetch(`https://api.hypixel.net/v2/resources/skyblock/items?key=${HYPIXEL_KEY}`)
  const data = await res.json()
  if (!data.success || !data.items) throw new Error('Hypixel items API failed')

  const items: any[] = data.items
  let processed = 0

  for (let i = 0; i < items.length; i += 50) {
    const batch = items.slice(i, i + 50)

    // game_context
    const gcRows = batch.map((item: any) => ({
      title:        item.id,
      content:      [
        'Name: ' + item.name,
        item.tier        ? 'Tier: ' + item.tier : null,
        item.category    ? 'Category: ' + item.category : null,
        item.stats       ? 'Stats: ' + JSON.stringify(item.stats) : null,
        item.requirements ? 'Requirements: ' + JSON.stringify(item.requirements) : null,
        item.description ? 'Description: ' + item.description : null
      ].filter(Boolean).join(' | '),
      last_updated: new Date().toISOString()
    }))

    await supabase.from('game_context').upsert(gcRows, { onConflict: 'title' })

    // item_stats (seulement items avec stats)
    const statsRows = batch
      .filter((item: any) => item.stats && Object.keys(item.stats).length > 0)
      .map((item: any) => {
        const s   = item.stats || {}
        const cat = (item.category || 'OTHER').toUpperCase()
        return {
          item_id:      item.id,
          display_name: item.name,
          health:       s.HEALTH       || s.health       || 0,
          defense:      s.DEFENSE      || s.defense      || 0,
          strength:     s.STRENGTH     || s.strength     || 0,
          crit_damage:  s.CRIT_DAMAGE  || s.crit_damage  || 0,
          crit_chance:  s.CRIT_CHANCE  || s.crit_chance  || 0,
          intelligence: s.INTELLIGENCE || s.intelligence || 0,
          speed:        s.SPEED        || s.speed        || 0,
          category:     cat.includes('HELMET')     ? 'HELMET'
                      : cat.includes('CHESTPLATE') ? 'CHESTPLATE'
                      : cat.includes('LEGGINGS')   ? 'LEGGINGS'
                      : cat.includes('BOOTS')      ? 'BOOTS'
                      : cat.includes('SWORD')      ? 'SWORD'
                      : cat.includes('BOW')        ? 'BOW'
                      : cat,
          raw_lore:     item.description || ''
        }
      })

    if (statsRows.length > 0) {
      await supabase.from('item_stats').upsert(statsRows, { onConflict: 'item_id' })
    }

    processed += batch.length
  }

  return processed
}

// ============================================================
// SYNC COLLECTIONS — /v2/resources/skyblock/collections
// → collections (item_id, item_name, category, max_tier, tiers)
// ============================================================
async function syncCollections(): Promise<number> {
  const res  = await fetch(`https://api.hypixel.net/v2/resources/skyblock/collections?key=${HYPIXEL_KEY}`)
  const data = await res.json()
  if (!data.success || !data.collections) throw new Error('Collections API failed')

  const rows: any[] = []

  for (const [category, catData] of Object.entries(data.collections as Record<string, any>)) {
    for (const [itemId, colData] of Object.entries((catData as any).items as Record<string, any>)) {
      const col = colData as any
      rows.push({
        item_id:    itemId,
        item_name:  col.name || itemId,
        skill_type: category,
        max_tier:   col.maxTiers || col.tiers?.length || 0,
        tiers:      JSON.stringify(col.tiers || []),
        updated_at: new Date().toISOString()
      })
    }
  }

  for (let i = 0; i < rows.length; i += 50) {
    await supabase.from('collections').upsert(rows.slice(i, i + 50), { onConflict: 'item_id' })
  }

  return rows.length
}

// ============================================================
// SYNC SKILLS — /v2/resources/skyblock/skills
// → skill_unlocks (skill_name, level, unlocks)
// ============================================================
async function syncSkills(): Promise<number> {
  const res  = await fetch(`https://api.hypixel.net/v2/resources/skyblock/skills?key=${HYPIXEL_KEY}`)
  const data = await res.json()
  if (!data.success || !data.skills) throw new Error('Skills API failed')

  const rows: any[] = []

  for (const [skillName, skillData] of Object.entries(data.skills as Record<string, any>)) {
    const levels = (skillData as any).levels || []
    levels.forEach((level: any, idx: number) => {
      rows.push({
        skill_name:   skillName.toLowerCase(),
        level:        idx + 1,
        unlocks:      JSON.stringify(level.unlocks || []),
        tier:         level.level || idx + 1
      })
    })
  }

  for (let i = 0; i < rows.length; i += 50) {
    await supabase.from('skill_unlocks').upsert(rows.slice(i, i + 50), { onConflict: 'skill_name, level' })
  }

  return rows.length
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [itemsCount, collectionsCount, skillsCount] = await Promise.all([
      syncItems(),
      syncCollections(),
      syncSkills()
    ])

    return NextResponse.json({
      success:     true,
      items:       itemsCount,
      collections: collectionsCount,
      skills:      skillsCount
    })

  } catch (error: any) {
    console.error('skyblock-resources-sync error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}