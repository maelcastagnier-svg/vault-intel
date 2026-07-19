// app/api/item-search/route.ts
// 2 queries seulement : starts-with (priorité) + contains (secondaire)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const toLabel = (id: string) =>
  id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q     = searchParams.get('q') || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

  if (q.length < 1) return NextResponse.json([])

  const search = q.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
  if (!search) return NextResponse.json([])

  // 2 queries parallèles : starts-with uniquement pour la rapidité
  const [{ data: bzData }, { data: ahData }] = await Promise.all([
    supabase
      .from('price_history')
      .select('item_id')
      .ilike('item_id', `${search}%`)
      .gt('sell_price', 0)
      .order('item_id')
      .limit(limit),
    supabase
      .from('price_history_ah')
      .select('base_item_id, item_name')
      .ilike('base_item_id', `${search}%`)
      .not('base_item_id', 'is', null)
      .order('base_item_id')
      .limit(limit * 3),
  ])

  // Groupe AH par base_item_id
  const ahMap = new Map<string, { name: string; count: number }>()
  for (const row of ahData || []) {
    if (!ahMap.has(row.base_item_id)) {
      ahMap.set(row.base_item_id, { name: toLabel(row.base_item_id), count: 0 })
    }
    ahMap.get(row.base_item_id)!.count++
  }

  const seen    = new Set<string>()
  const results: any[] = []

  // Bazaar starts-with
  for (const row of bzData || []) {
    const key = `bz:${row.item_id}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ item_id: row.item_id, item_name: toLabel(row.item_id), source: 'bazaar', variant_count: 1 })
  }

  // AH starts-with
  for (const [id, { name, count }] of ahMap) {
    const key = `ah:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ item_id: id, item_name: name, source: 'ah', variant_count: count })
  }

  // Si peu de résultats → ajoute les contains
  if (results.length < 10) {
    const [{ data: bzExtra }, { data: ahExtra }] = await Promise.all([
      supabase.from('price_history').select('item_id').ilike('item_id', `%${search}%`).not('item_id', 'ilike', `${search}%`).gt('sell_price', 0).order('item_id').limit(limit),
      supabase.from('price_history_ah').select('base_item_id, item_name').ilike('base_item_id', `%${search}%`).not('base_item_id', 'ilike', `${search}%`).not('base_item_id', 'is', null).order('base_item_id').limit(limit * 2),
    ])
    for (const row of bzExtra || []) {
      const key = `bz:${row.item_id}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({ item_id: row.item_id, item_name: toLabel(row.item_id), source: 'bazaar', variant_count: 1 })
    }
    for (const row of ahExtra || []) {
      const key = `ah:${row.base_item_id}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({ item_id: row.base_item_id, item_name: toLabel(row.base_item_id), source: 'ah', variant_count: 1 })
    }
  }

  return NextResponse.json(results.slice(0, limit))
}