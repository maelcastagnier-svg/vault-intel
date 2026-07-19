// app/api/item-search/route.ts
// Priorité : base_item_id starts-with > base_item_id contains
// item_name utilisé uniquement en fallback si aucun résultat base_item_id
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function toLabel(id: string): string {
  return id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function cleanItemName(name: string): string {
  return (name || '')
    .replace(/[✪➊➋➌➍➎➏➐➑➒➓✦✿]/g, '')
    .replace(/\b(Ancient|Fabled|Withered|Heroic|Spicy|Itchy|Gentle|Epic|Odd|Fast|Fair|Deadly|Shiny|Keen|Rapid|Unpleasant|Nasty|Stained|Loving|Paranoid|Demonic|Forceful|Hurtful|Strong|Superior|Godly|Zealous|Bizarre|Silky|Bloody|Shaded|Mystical|Perfect|Spiritual|Headstrong|Clean|Fierce|Heavy|Light|Sharp|Wise|Fruitful|Candied|Treacherous|Renowned|Spiked|Titanic|Jaded|Lush|Chomp|Stellar|Dirty|Pure|Necrotic|Undead|Noisy|Sandy|Stiff|Lucky)\s/gi, '')
    .replace(/\s+/g, ' ').trim()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q     = searchParams.get('q') || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

  if (q.length < 1) return NextResponse.json([])

  const search = q.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
  if (!search) return NextResponse.json([])

  // ── 2 requêtes : starts-with (priorité 1) + contains (priorité 2) ──
  const [
    { data: bzStarts }, { data: bzContains },
    { data: ahStarts }, { data: ahContains },
    { data: ahScanStarts },
  ] = await Promise.all([
    // Bazaar starts-with
    supabase.from('price_history').select('item_id').ilike('item_id', `${search}%`).gt('sell_price', 0).order('item_id').limit(limit),
    // Bazaar contains
    supabase.from('price_history').select('item_id').ilike('item_id', `%${search}%`).not('item_id', 'ilike', `${search}%`).gt('sell_price', 0).order('item_id').limit(limit),
    // AH DAILY starts-with
    supabase.from('price_history_ah').select('base_item_id, item_name, variant_key').ilike('base_item_id', `${search}%`).not('base_item_id', 'is', null).in('granularity', ['DAILY','DAILY_EXACT','MONTHLY']).order('base_item_id').limit(limit * 3),
    // AH DAILY contains
    supabase.from('price_history_ah').select('base_item_id, item_name, variant_key').ilike('base_item_id', `%${search}%`).not('base_item_id', 'ilike', `${search}%`).not('base_item_id', 'is', null).in('granularity', ['DAILY','DAILY_EXACT','MONTHLY']).order('base_item_id').limit(limit * 3),
    // AH SCAN starts-with (items récents pas encore en DAILY)
    supabase.from('price_history_ah').select('base_item_id, item_name, variant_key').ilike('base_item_id', `${search}%`).not('base_item_id', 'is', null).eq('granularity', 'SCAN').eq('bucket_date', new Date().toISOString().split('T')[0]).order('base_item_id').limit(limit * 3),
  ])

  // ── Groupe AH par base_item_id ────────────────────────────
  function groupAH(rows: any[], priority: number) {
    const map = new Map<string, { item_name: string; variants: Set<string>; priority: number }>()
    for (const row of rows || []) {
      if (!map.has(row.base_item_id)) {
        map.set(row.base_item_id, {
          item_name: cleanItemName(row.item_name) || toLabel(row.base_item_id),
          variants:  new Set(),
          priority,
        })
      }
      if (row.variant_key) map.get(row.base_item_id)!.variants.add(row.variant_key)
    }
    return map
  }

  const ahStartsMap   = groupAH(ahStarts     || [], 0)
  const ahScanMap     = groupAH(ahScanStarts || [], 0) // SCAN = même priorité que DAILY starts-with
  const ahContainsMap = groupAH(ahContains   || [], 1)

  // Merge SCAN dans ahStartsMap (sans écraser)
  for (const [id, val] of ahScanMap) {
    if (!ahStartsMap.has(id)) ahStartsMap.set(id, val)
  }

  // ── Construit résultats ordonnés ──────────────────────────
  const seen    = new Set<string>()
  const results: any[] = []

  // 1. Bazaar starts-with
  for (const row of bzStarts || []) {
    const key = `bz:${row.item_id}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ item_id: row.item_id, item_name: toLabel(row.item_id), source: 'bazaar', variant_count: 1, _priority: 0 })
  }

  // 2. AH starts-with
  for (const [id, { item_name, variants }] of ahStartsMap) {
    const key = `ah:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ item_id: id, item_name, source: 'ah', variant_count: variants.size, _priority: 0 })
  }

  // 3. Bazaar contains
  for (const row of bzContains || []) {
    const key = `bz:${row.item_id}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ item_id: row.item_id, item_name: toLabel(row.item_id), source: 'bazaar', variant_count: 1, _priority: 1 })
  }

  // 4. AH contains
  for (const [id, { item_name, variants }] of ahContainsMap) {
    const key = `ah:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ item_id: id, item_name, source: 'ah', variant_count: variants.size, _priority: 1 })
  }

  // Retire _priority du résultat final
  const final = results.slice(0, limit).map(({ _priority, ...r }) => r)
  return NextResponse.json(final)
}