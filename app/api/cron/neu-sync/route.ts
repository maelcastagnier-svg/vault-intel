// app/api/cron/neu-sync/route.ts
// Sync hebdomadaire depuis le repo GitHub NotEnoughUpdates
// Met à jour toutes les tables depuis les fichiers NEU constants
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NEU_RAW = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants'

// ── Fetch un fichier NEU ─────────────────────────────────────
async function fetchNEU(filename: string): Promise<any> {
  const res = await fetch(`${NEU_RAW}/${filename}`)
  if (!res.ok) throw new Error(`NEU fetch failed for ${filename}: ${res.status}`)
  return res.json()
}

// ── Upsert cache brut ────────────────────────────────────────
async function updateRawCache(filename: string, content: any): Promise<void> {
  await supabase
    .from('neu_constants_raw')
    .upsert(
      { file_path: 'constants/' + filename, content, fetched_at: new Date().toISOString() },
      { onConflict: 'file_path' }
    )
}

// ============================================================
// REFORGES → reforges
// ============================================================
async function syncReforges(data: any): Promise<number> {
  const source = data.reforges || data
  if (!source || typeof source !== 'object') return 0

  const rows = Object.entries(source).map(([name, r]: [string, any]) => ({
    name,
    type:  r.itemType || r.type || 'ANY',
    stats: r.stats || r.reforgeStats || {}
  }))

  await supabase.from('reforges').upsert(rows, { onConflict: 'name' })
  return rows.length
}

// ============================================================
// REFORGE STONES → reforge_stones
// ============================================================
async function syncReforgeStones(data: any): Promise<number> {
  const source = data.reforgeStones || data
  if (!source || typeof source !== 'object') return 0

  const rows = Object.entries(source).map(([name, s]: [string, any]) => ({
    name,
    reforge_name: s.reforgeName || s.reforge || name,
    item_type:    s.itemType || 'ANY',
    costs:        s.reforgeCosts || {}
  }))

  await supabase.from('reforge_stones').upsert(rows, { onConflict: 'name' })
  return rows.length
}

// ============================================================
// PETS → pets
// ============================================================
async function syncPets(data: any): Promise<number> {
  const source = data.pets || data
  if (!source || typeof source !== 'object') return 0

  const rows = Object.entries(source).map(([petId, p]: [string, any]) => ({
    name:         petId,
    display_name: p.name || petId,
    type:         p.type || 'UNKNOWN',
    rarity:       p.rarity || 'COMMON',
    stats:        p.stats || {}
  }))

  await supabase.from('pets').upsert(rows, { onConflict: 'name' })
  return rows.length
}

// ============================================================
// GEMSTONES → gemstones
// ============================================================
async function syncGemstones(data: any): Promise<number> {
  const source = data.gemstones || data
  if (!source || typeof source !== 'object') return 0

  const rows = Object.entries(source).map(([name, g]: [string, any]) => ({
    name,
    type:      g.type || name.split('_')[0],
    slot_type: g.slotType || g.slot_type || 'ANY',
    stats:     g.stats || {}
  }))

  await supabase.from('gemstones').upsert(rows, { onConflict: 'name' })
  return rows.length
}

// ============================================================
// ENCHANTEMENTS → enchantments
// ============================================================
async function syncEnchantments(data: any): Promise<number> {
  if (!data.enchants) return 0

  const enchantMap: Record<string, string[]> = {}
  for (const [itemType, enchants] of Object.entries(data.enchants)) {
    for (const enchant of (enchants as string[])) {
      const key = enchant.toLowerCase()
      if (!enchantMap[key]) enchantMap[key] = []
      if (!enchantMap[key].includes(itemType)) enchantMap[key].push(itemType)
    }
  }

  const rows = Object.entries(enchantMap).map(([name, item_types]) => ({
    name,
    item_types,
    max_level: data.max_xp_table_levels?.[name] || data.max_xp_table_levels?.[name.toUpperCase()] || 5,
    xp_costs:  data.enchants_xp_cost?.[name] || data.enchants_xp_cost?.[name.toUpperCase()] || [0]
  }))

  await supabase.from('enchantments').upsert(rows, { onConflict: 'name' })
  return rows.length
}

// ============================================================
// TROPHY FISH → fishing_data
// ============================================================
async function syncTrophyFish(data: any): Promise<number> {
  const source = data.trophyFish || data
  if (!source || typeof source !== 'object') return 0

  const rows = Object.entries(source).map(([name, f]: [string, any]) => ({
    name,
    zone:                'Crimson Isle',
    drops:               f.drops || {},
    avg_coins_per_catch: f.avgCoins || 0
  }))

  await supabase.from('fishing_data').upsert(rows, { onConflict: 'name' })
  return rows.length
}

// ============================================================
// ATTRIBUTE SHARDS → attribute_shards
// ============================================================
async function syncAttributeShards(data: any): Promise<number> {
  const source = data.attribute_shards || data.attributeShards || data
  if (!source || typeof source !== 'object') return 0

  const rows = Object.entries(source).map(([name, s]: [string, any]) => ({
    name,
    description:   s.description || '',
    max_level:     s.maxLevel || 10,
    applicable_to: s.applicableTo || []
  }))

  await supabase.from('attribute_shards').upsert(rows, { onConflict: 'name' })
  return rows.length
}

// ============================================================
// BESTIARY → bestiary_milestones
// ============================================================
async function syncBestiary(data: any): Promise<number> {
  const source = data.mobs || data
  if (!source || typeof source !== 'object') return 0

  const rows = Object.entries(source).map(([mobId, m]: [string, any]) => ({
    mob_id:              mobId,
    display_name:        m.name || mobId,
    milestones:          m.milestones || [],
    kills_per_milestone: m.killsPerMilestone || []
  }))

  await supabase.from('bestiary_milestones').upsert(rows, { onConflict: 'mob_id' })
  return rows.length
}

// ============================================================
// LEVELING → skill_unlocks (skill_name, level)
// ============================================================
async function syncLeveling(data: any): Promise<number> {
  const source = data.leveling_caps || data.leveling || {}
  const rows: any[] = []

  for (const [skill, caps] of Object.entries(source)) {
    if (Array.isArray(caps)) {
      caps.forEach((xp: number, idx: number) => {
        rows.push({
          skill_name:   skill.toLowerCase(),
          level:        idx + 1,
          unlocks:      JSON.stringify([]),
          tier:         idx + 1
        })
      })
    }
  }

  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 50) {
      await supabase.from('skill_unlocks').upsert(rows.slice(i, i + 50), { onConflict: 'skill_name, level' })
    }
  }

  return rows.length
}

// ============================================================
// RIFT GUIDE → rift_items
// ============================================================
async function syncRiftItems(data: any): Promise<number> {
  const source = data.items || data
  if (!source || typeof source !== 'object') return 0

  const rows = Object.entries(source).map(([name, item]: [string, any]) => ({
    name,
    description: (item as any).description || '',
    category:    (item as any).category || 'MISC',
    cost:        (item as any).cost || {}
  }))

  if (rows.length > 0) {
    await supabase.from('rift_items').upsert(rows, { onConflict: 'name' })
  }

  return rows.length
}

// ============================================================
// CALENDAR + ESSENCE COSTS → game_mechanics_misc
// ============================================================
async function syncToMisc(data: any, category: string): Promise<number> {
  if (!data || typeof data !== 'object') return 0

  const rows = Object.entries(data).map(([key, value]) => ({
    category,
    key,
    value:      value as any,
    updated_at: new Date().toISOString()
  }))

  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 50) {
      await supabase.from('game_mechanics_misc').upsert(rows.slice(i, i + 50), { onConflict: 'category, key' })
    }
  }

  return rows.length
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
const SYNC_TARGETS = [
  { file: 'reforges.json',         fn: syncReforges,         category: '' },
  { file: 'reforgestones.json',    fn: syncReforgeStones,    category: '' },
  { file: 'pets.json',             fn: syncPets,             category: '' },
  { file: 'gemstones.json',        fn: syncGemstones,        category: '' },
  { file: 'enchants.json',         fn: syncEnchantments,     category: '' },
  { file: 'trophyfish.json',       fn: syncTrophyFish,       category: '' },
  { file: 'attribute_shards.json', fn: syncAttributeShards,  category: '' },
  { file: 'bestiary.json',         fn: syncBestiary,         category: '' },
  { file: 'leveling.json',         fn: syncLeveling,         category: '' },
  { file: 'rift_guide.json',       fn: syncRiftItems,        category: '' },
  { file: 'calendar.json',         fn: (d: any) => syncToMisc(d.events || d, 'calendar'), category: 'calendar' },
  { file: 'essencecosts.json',     fn: (d: any) => syncToMisc(d.essence || d, 'essence_cost'), category: 'essence' },
  { file: 'garden.json',           fn: (d: any) => syncToMisc(d, 'garden'), category: 'garden' },
  { file: 'zones.json',            fn: (d: any) => syncToMisc(d, 'zones'), category: 'zones' },
  { file: 'misc.json',             fn: (d: any) => syncToMisc(d, 'misc'), category: 'misc' }
]

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, any> = {}

  for (const target of SYNC_TARGETS) {
    try {
      const data  = await fetchNEU(target.file)
      await updateRawCache(target.file, data)
      const count = await target.fn(data)
      results[target.file] = { success: true, rows: count }
    } catch (err: any) {
      console.error(`NEU sync error for ${target.file}:`, err.message)
      results[target.file] = { success: false, error: err.message }
    }
  }

  const successful = Object.values(results).filter((r: any) => r.success).length
  const failed     = Object.values(results).filter((r: any) => !r.success).length

  return NextResponse.json({ success: failed === 0, successful, failed, results })
}