// app/api/item-search/route.ts
// Recherche d'items pour le dropdown Radar
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

  // Recherche dans Bazaar
  const [{ data: bazaarItems }, { data: ahItems }] = await Promise.all([
    supabase
      .from('price_history')
      .select('item_id')
      .ilike('item_id', `%${search}%`)
      .limit(limit),
    supabase
      .from('price_history_ah')
      .select('base_item_id, item_name')
      .ilike('base_item_id', `%${search}%`)
      .in('granularity', ['DAILY', 'DAILY_EXACT'])
      .limit(limit),
  ])

  const results = [
    ...new Set([
      ...(bazaarItems || []).map(i => ({
        item_id:   i.item_id,
        item_name: i.item_id.replace(/_/g, ' '),
        source:    'bazaar'
      })),
      ...(ahItems || []).map(i => ({
        item_id:   i.base_item_id,
        item_name: i.item_name || i.base_item_id.replace(/_/g, ' '),
        source:    'ah'
      })),
    ])
  ]

  // Déduplique par item_id
  const seen = new Set<string>()
  const unique = results.filter(r => {
    const key = r.item_id + r.source
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return NextResponse.json(unique.slice(0, limit))
}