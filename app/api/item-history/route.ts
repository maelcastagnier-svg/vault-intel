// app/api/item-history/route.ts
// Retourne l'historique de prix d'un item (Bazaar ou AH)
// avec sélecteur de période : 1D / 1W / 1M / 1Y / 3Y
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/item-history?item_id=HYPERION&source=ah&period=1M&variant=nostar_norecomb_noreforge
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const item_id  = searchParams.get('item_id')
  const source   = searchParams.get('source') || 'bazaar' // bazaar | ah
  const period   = searchParams.get('period') || '1M'     // 1D|1W|1M|1Y|3Y
  const variant  = searchParams.get('variant') || null

  if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 })

  // Calcule la date de début selon la période
  const periodMap: Record<string, string> = {
    '1D': '1 day',
    '1W': '7 days',
    '1M': '30 days',
    '1Y': '365 days',
    '3Y': '1095 days',
  }
  const interval = periodMap[period] || '30 days'
  const startDate = new Date(Date.now() - parseInt(interval) * 86_400_000).toISOString().split('T')[0]

  if (source === 'bazaar') {
    const { data, error } = await supabase
      .from('price_history')
      .select('bucket_date, buy_price, sell_price, volume')
      .eq('item_id', item_id)
      .gte('bucket_date', startDate)
      .gt('sell_price', 0)
      .order('bucket_date', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      item_id,
      source: 'bazaar',
      period,
      data: (data || []).map(d => ({
        date:       d.bucket_date,
        buy_price:  Number(d.buy_price),
        sell_price: Number(d.sell_price),
        volume:     Number(d.volume),
      }))
    })
  }

  // AH — groupé par variante ou toutes variantes confondues
  let query = supabase
    .from('price_history_ah')
    .select('bucket_date, avg_price, sell_price, volume, variant_key')
    .eq('base_item_id', item_id)
    .in('granularity', ['DAILY', 'DAILY_EXACT', 'MONTHLY'])
    .gte('bucket_date', startDate)
    .gt('avg_price', 0)
    .order('bucket_date', { ascending: true })

  if (variant) query = query.eq('variant_key', variant)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrège par date si plusieurs variantes
  const byDate = new Map<string, { prices: number[]; volumes: number[] }>()
  for (const d of data || []) {
    if (!byDate.has(d.bucket_date)) byDate.set(d.bucket_date, { prices: [], volumes: [] })
    byDate.get(d.bucket_date)!.prices.push(Number(d.avg_price))
    byDate.get(d.bucket_date)!.volumes.push(Number(d.volume))
  }

  const aggregated = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { prices, volumes }]) => ({
      date,
      avg_price:  Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
      sell_price: Math.round(Math.min(...prices)),
      volume:     volumes.reduce((s, v) => s + v, 0),
    }))

  // Variantes disponibles pour cet item
  const { data: variants } = await supabase
    .from('price_history_ah')
    .select('variant_key')
    .eq('base_item_id', item_id)
    .in('granularity', ['DAILY', 'DAILY_EXACT'])
    .order('variant_key')

  const uniqueVariants = [...new Set((variants || []).map(v => v.variant_key))]

  return NextResponse.json({
    item_id,
    source: 'ah',
    period,
    variant: variant || 'all',
    available_variants: uniqueVariants,
    data: aggregated,
  })
}

// GET /api/item-history/search?q=HYPER&source=bazaar
// (endpoint séparé pour la recherche d'items)