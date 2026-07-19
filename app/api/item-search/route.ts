// app/api/item-search/route.ts
// Utilise la fonction SQL search_items() pour une recherche ultra-rapide
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

  if (q.length < 1) return NextResponse.json([])

  const search = q.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
  if (!search) return NextResponse.json([])

  const { data, error } = await supabase.rpc('search_items', {
    search_term:  search,
    result_limit: limit,
  })

  if (error) {
    console.error('search_items error:', error.message)
    return NextResponse.json([])
  }

  // Déduplique (starts-with peut chevaucher contains si race)
  const seen    = new Set<string>()
  const results = []
  for (const row of data || []) {
    const key = `${row.source}:${row.item_id}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({
      item_id:       row.item_id,
      item_name:     row.item_name,
      source:        row.source,
      variant_count: Number(row.variant_count),
    })
  }

  return NextResponse.json(results)
}