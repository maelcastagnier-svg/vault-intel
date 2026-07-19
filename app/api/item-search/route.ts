// app/api/item-search/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q     = searchParams.get('q') || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

  if (q.length < 2) return NextResponse.json([])

  // Normalise : minuscules/majuscules/espaces → uppercase underscore
  const search = q.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
  if (!search) return NextResponse.json([])

  const [{ data: bazaarItems }, { data: ahItems }] = await Promise.all([
    // Bazaar — distinct item_id, trié par pertinence (starts with > contains)
    supabase
      .from('price_history')
      .select('item_id')
      .ilike('item_id', `%${search}%`)
      .gt('sell_price', 0)
      .order('item_id')
      .limit(limit),

    // AH — distinct base_item_id avec count variantes
    supabase
      .from('price_history_ah')
      .select('base_item_id, item_name')
      .ilike('base_item_id', `%${search}%`)
      .not('base_item_id', 'is', null)
      .order('base_item_id')
      .limit(limit * 3),
  ])

  // Déduplique AH par base_item_id
  const ahMap = new Map<string, { item_name: string; count: number }>()
  for (const row of ahItems || []) {
    if (!ahMap.has(row.base_item_id)) {
      ahMap.set(row.base_item_id, {
        item_name: row.item_name || row.base_item_id.replace(/_/g, ' '),
        count:     0,
      })
    }
    ahMap.get(row.base_item_id)!.count++
  }

  const seen    = new Set<string>()
  const results: any[] = []

  // Bazaar
  for (const row of bazaarItems || []) {
    const key = `bz:${row.item_id}`
    if (!seen.has(key)) {
      seen.add(key)
      results.push({
        item_id:       row.item_id,
        item_name:     row.item_id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()),
        source:        'bazaar',
        variant_count: 1,
      })
    }
  }

  // AH — 1 entrée par base_item_id
  for (const [base_item_id, { item_name, count }] of ahMap) {
    const key = `ah:${base_item_id}`
    if (!seen.has(key)) {
      seen.add(key)
      results.push({
        item_id:       base_item_id,
        item_name:     item_name,
        source:        'ah',
        variant_count: count,
      })
    }
  }

  // Trie : exact match en premier, puis starts with, puis contains
  results.sort((a, b) => {
    const aExact  = a.item_id === search ? 0 : a.item_id.startsWith(search) ? 1 : 2
    const bExact  = b.item_id === search ? 0 : b.item_id.startsWith(search) ? 1 : 2
    return aExact - bExact || a.item_id.localeCompare(b.item_id)
  })

  return NextResponse.json(results.slice(0, limit))
}