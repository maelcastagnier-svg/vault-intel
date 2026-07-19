// app/api/item-history/route.ts
// Retourne l'historique de prix d'un item (Bazaar ou AH)
// avec toutes les variantes disponibles
// GET /api/item-history?item_id=HYPERION&source=ah&period=1M&variant=nostar_norecomb_noreforge
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PERIOD_INTERVALS: Record<string, number> = {
  '1D': 1, '1W': 7, '1M': 30, '1Y': 365, '3Y': 1095,
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const item_id = searchParams.get('item_id')
  const source  = searchParams.get('source') || 'bazaar'
  const period  = searchParams.get('period')  || '1M'
  const variant = searchParams.get('variant') || null

  if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 })

  const days      = PERIOD_INTERVALS[period] || 30
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0]

  // ── BAZAAR ────────────────────────────────────────────────────
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
      item_id, source: 'bazaar', period,
      data: (data || []).map(d => ({
        date:       d.bucket_date,
        buy_price:  Number(d.buy_price),
        sell_price: Number(d.sell_price),
        volume:     Number(d.volume),
      }))
    })
  }

  // ── AH — liste toutes les variantes disponibles ────────────
  const { data: variantRows } = await supabase
    .from('price_history_ah')
    .select('variant_key, granularity')
    .eq('base_item_id', item_id)
    .in('granularity', ['DAILY', 'DAILY_EXACT', 'SCAN'])
    .gt('avg_price', 0)

  // Compte les variantes uniques avec leur granularité la plus précise
  const variantMap = new Map<string, { count: number; has_daily_exact: boolean }>()
  for (const row of variantRows || []) {
    if (!variantMap.has(row.variant_key)) {
      variantMap.set(row.variant_key, { count: 0, has_daily_exact: false })
    }
    const v = variantMap.get(row.variant_key)!
    v.count++
    if (row.granularity === 'DAILY_EXACT') v.has_daily_exact = true
  }

  // Trie : DAILY_EXACT en premier, puis par count décroissant
  const variants = Array.from(variantMap.entries())
    .sort(([, a], [, b]) => {
      if (a.has_daily_exact !== b.has_daily_exact) return a.has_daily_exact ? -1 : 1
      return b.count - a.count
    })
    .map(([vk, meta]) => ({
      key:             vk,
      data_points:     meta.count,
      has_daily_exact: meta.has_daily_exact,
      label:           buildVariantLabel(vk),
    }))

  // ── AH — historique pour la variante demandée ─────────────
  let query = supabase
    .from('price_history_ah')
    .select('bucket_date, avg_price, sell_price, volume, variant_key, granularity')
    .eq('base_item_id', item_id)
    .gte('bucket_date', startDate)
    .gt('avg_price', 0)
    .order('bucket_date', { ascending: true })

  // Filtre par variante si spécifié, sinon prend les DAILY (toutes variantes agrégées)
  if (variant && variant !== 'all') {
    query = query.eq('variant_key', variant).in('granularity', ['DAILY_EXACT', 'DAILY', 'MONTHLY', 'SCAN'])
  } else {
    // Pas de filtre variante → agrège par date (moyenne pondérée)
    query = query.in('granularity', ['DAILY', 'DAILY_EXACT', 'MONTHLY'])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrège par date (plusieurs variantes ou granularités par jour)
  const byDate = new Map<string, { prices: number[]; volumes: number[]; granularities: string[] }>()
  for (const d of data || []) {
    const key = d.bucket_date
    if (!byDate.has(key)) byDate.set(key, { prices: [], volumes: [], granularities: [] })
    const entry = byDate.get(key)!
    entry.prices.push(Number(d.avg_price))
    entry.volumes.push(Number(d.volume))
    entry.granularities.push(d.granularity)
  }

  const aggregated = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { prices, volumes, granularities }]) => ({
      date,
      avg_price:   Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
      sell_price:  Math.round(Math.min(...prices)),
      volume:      volumes.reduce((s, v) => s + v, 0),
      granularity: granularities.includes('DAILY_EXACT') ? 'DAILY_EXACT'
                 : granularities.includes('DAILY') ? 'DAILY' : granularities[0],
    }))

  return NextResponse.json({
    item_id,
    source:             'ah',
    period,
    selected_variant:   variant || 'all',
    available_variants: variants,
    data:               aggregated,
  })
}

// ── Transforme variant_key en label lisible ────────────────────
function buildVariantLabel(vk: string): string {
  if (vk === 'nostar_norecomb_noreforge') return '✦ Base item'
  const parts: string[] = []
  const m = vk.match(/^(\d+)star/)
  if (m) parts.push(`⭐ ${m[1]} stars`)
  if (vk.includes('recomb')) parts.push('✦ Recomb')
  const reforgeMatch = vk.match(/_([\w]+)$/)
  if (reforgeMatch && !['noreforge','norecomb','nostar'].includes(reforgeMatch[1])) {
    parts.push(`🔮 ${reforgeMatch[1]}`)
  }
  const ultimateMatch = vk.match(/_(ofa|soul_eater|last_stand|fatal_tempo|wise|inferno|bank|combo|jerry|swarm)\d+/)
  if (ultimateMatch) parts.push(`⚡ ${ultimateMatch[1].toUpperCase()}`)
  return parts.length > 0 ? parts.join(' · ') : vk
}