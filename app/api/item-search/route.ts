// app/api/item-search/route.ts
// Recherche d'items pour le dropdown Radar
// Prioritise base_item_id propre, déduplique les variantes SkyCofl
// GET /api/item-search?q=hyper&limit=20
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

  const search = q.toUpperCase().replace(/\s+/g, '_')

  const [{ data: bazaarItems }, { data: ahItems }] = await Promise.all([
    // Bazaar — item_id direct
    supabase
      .from('price_history')
      .select('item_id')
      .ilike('item_id', `%${search}%`)
      .gt('sell_price', 0)
      .order('item_id')
      .limit(limit),

    // AH — base_item_id + count des variantes disponibles
    supabase
      .from('price_history_ah')
      .select('base_item_id, item_name, variant_key, granularity')
      .ilike('base_item_id', `%${search}%`)
      .in('granularity', ['DAILY', 'DAILY_EXACT', 'SCAN'])
      .order('base_item_id')
      .limit(limit * 5), // plus large pour grouper ensuite
  ])

  // Groupe les AH par base_item_id et compte les variantes
  const ahGroups = new Map<string, { item_name: string; variant_count: number }>()
  for (const row of ahItems || []) {
    if (!ahGroups.has(row.base_item_id)) {
      ahGroups.set(row.base_item_id, {
        item_name:     row.item_name || row.base_item_id.replace(/_/g, ' '),
        variant_count: 0,
      })
    }
    // Compte variantes uniques
    const existing = ahGroups.get(row.base_item_id)!
    existing.variant_count++
  }

  // Déduplique et formate
  const seen    = new Set<string>()
  const results: any[] = []

  // Bazaar d'abord
  for (const row of bazaarItems || []) {
    const key = `bazaar:${row.item_id}`
    if (!seen.has(key)) {
      seen.add(key)
      results.push({
        item_id:       row.item_id,
        item_name:     row.item_id.replace(/_/g, ' '),
        source:        'bazaar',
        variant_count: 1,
      })
    }
  }

  // AH ensuite — 1 entrée par base_item_id (avec le count de variantes)
  for (const [base_item_id, { item_name, variant_count }] of ahGroups) {
    const key = `ah:${base_item_id}`
    if (!seen.has(key)) {
      seen.add(key)
      results.push({
        item_id:       base_item_id,
        item_name:     item_name,
        source:        'ah',
        variant_count: Math.min(variant_count, 99),
      })
    }
  }

  return NextResponse.json(results.slice(0, limit))
}