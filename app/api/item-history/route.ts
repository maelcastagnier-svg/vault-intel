// app/api/item-history/route.ts
// Historique de prix :
// Bazaar  → price_history (DAILY)
// AH row  → price_history_ah (DAILY, prix moyen toutes variantes)
// AH vars → price_history_ah_variants (DAILY_EXACT, prix par variante NBT)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PERIOD_DAYS: Record<string, number> = {
  '1D': 1, '1W': 7, '1M': 30, '1Y': 365, '3Y': 1095,
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const item_id = searchParams.get('item_id')
  const source  = searchParams.get('source') || 'bazaar'
  const period  = searchParams.get('period')  || '1M'
  const variant = searchParams.get('variant') || null

  if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 })

  const days      = PERIOD_DAYS[period] || 30
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0]
  const useScans  = period === '1D' || period === '1W'

  // ── BAZAAR ────────────────────────────────────────────────────
  if (source === 'bazaar') {
    const { data } = await supabase
      .from('price_history')
      .select('bucket_date, buy_price, sell_price, avg_price, volume')
      .eq('item_id', item_id)
      .gte('bucket_date', startDate)
      .gt('sell_price', 0)
      .order('bucket_date', { ascending: true })

    return NextResponse.json({
      item_id, source: 'bazaar', period,
      data: (data || []).map(d => ({
        date:       d.bucket_date,
        buy_price:  Number(d.buy_price),
        sell_price: Number(d.sell_price),
        avg_price:  Number(d.avg_price),
        volume:     Number(d.volume),
      }))
    })
  }

  // ── AH avec variante spécifique ───────────────────────────────
  if (variant && variant !== 'all') {
    // Cherche dans price_history_ah_variants
    let q = supabase
      .from('price_history_ah_variants')
      .select('bucket_date, avg_price, min_price, max_price, volume, data_points')
      .eq('base_item_id', item_id)
      .eq('variant_key', variant)
      .gt('avg_price', 0)
      .order('bucket_date', { ascending: true })

    if (useScans) {
      // Pour 1D/1W → lit directement ah_scan_buffer
      const { data: scanData } = await supabase
        .from('ah_scan_buffer')
        .select('last_scan_at, avg_price, min_price, max_price, volume, scan_count')
        .eq('base_item_id', item_id)
        .eq('variant_key', variant)

      return NextResponse.json({
        item_id, source: 'ah', period, variant,
        data: (scanData || []).map(d => ({
          date:      d.last_scan_at,
          avg_price: Number(d.avg_price),
          min_price: Number(d.min_price),
          max_price: Number(d.max_price),
          volume:    Number(d.volume),
        }))
      })
    }

    q = q.gte('bucket_date', startDate)
    const { data } = await q

    return NextResponse.json({
      item_id, source: 'ah', period, variant,
      data: (data || []).map(d => ({
        date:      d.bucket_date,
        avg_price: Number(d.avg_price),
        min_price: Number(d.min_price),
        max_price: Number(d.max_price),
        volume:    Number(d.volume),
      }))
    })
  }

  // ── AH toutes variantes (prix moyen global) ───────────────────
  // Lit price_history_ah (1 row par item par jour = moyenne globale)
  const { data: rowData } = await supabase
    .from('price_history_ah')
    .select('bucket_date, avg_price, sell_price, buy_price, volume')
    .eq('base_item_id', item_id)
    .eq('variant_key', '__all_variants_blended__')
    .eq('granularity', 'DAILY')
    .gte('bucket_date', startDate)
    .gt('avg_price', 0)
    .order('bucket_date', { ascending: true })

  // Variantes disponibles depuis price_history_ah_variants
  const { data: variantRows } = await supabase
    .from('price_history_ah_variants')
    .select('variant_key, data_points')
    .eq('base_item_id', item_id)
    .gt('avg_price', 0)

  const variantMap = new Map<string, number>()
  for (const r of variantRows || []) {
    variantMap.set(r.variant_key, (variantMap.get(r.variant_key) || 0) + r.data_points)
  }

  const variants = Array.from(variantMap.entries())
    .sort(([ak, av], [bk, bv]) => {
      if (ak === 'nostar_norecomb_noreforge') return -1
      if (bk === 'nostar_norecomb_noreforge') return 1
      return bv - av
    })
    .map(([key, points]) => ({ key, data_points: points }))

  return NextResponse.json({
    item_id,
    source: 'ah',
    period,
    variant: 'all',
    available_variants: variants,
    data: (rowData || []).map(d => ({
      date:      d.bucket_date,
      avg_price: Number(d.avg_price),
      sell_price:Number(d.sell_price),
      buy_price: Number(d.buy_price),
      volume:    Number(d.volume),
    }))
  })
}