// app/api/item-history/route.ts
// Historique de prix d'un item avec gestion des variantes
// 1D/1W → SCAN (granularité minute)
// 1M/1Y/3Y → DAILY + DAILY_EXACT + MONTHLY
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PERIOD_DAYS: Record<string, number> = {
  '1D': 1, '1W': 7, '1M': 30, '1Y': 365, '3Y': 1095,
}

function buildVariantLabel(vk: string): string {
  if (!vk || vk === 'nostar_norecomb_noreforge') return '✦ Base item (no upgrades)'
  const parts: string[] = []
  const stars = vk.match(/^(\d+)star/)
  if (stars) parts.push(`⭐ ${stars[1]} stars`)
  else if (!vk.startsWith('nostar')) parts.push('⭐ Stars')
  if (vk.includes('_recomb') && !vk.includes('norecomb')) parts.push('✦ Recomb')
  const ultimate = vk.match(/(ofa|soul_eater|last_stand|fatal_tempo|wise|inferno|bank|combo|jerry|swarm|habanero)(\d+)?/)
  if (ultimate) parts.push(`⚡ ${ultimate[1].toUpperCase().replace(/_/g, ' ')}`)
  const attrs = vk.match(/([a-z_]+\d+)(?:_[a-z_]+\d+)?$/)
  if (attrs && !['noreforge','norecomb','nostar'].some(x => attrs[1].includes(x))) {
    const attrStr = attrs[0].replace(/_/g, ' ')
    if (!parts.some(p => p.includes(attrStr))) parts.push(`🔮 ${attrStr}`)
  }
  return parts.length > 0 ? parts.join(' · ') : vk
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
  const granularities = useScans
    ? ['SCAN']
    : ['DAILY', 'DAILY_EXACT', 'MONTHLY']

  // ── BAZAAR ────────────────────────────────────────────────
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

  // ── AH — variantes disponibles ────────────────────────────
  const { data: allVariantRows } = await supabase
    .from('price_history_ah')
    .select('variant_key, granularity')
    .eq('base_item_id', item_id)
    .in('granularity', ['DAILY', 'DAILY_EXACT', 'SCAN'])
    .gt('avg_price', 0)

  // Agrège variantes : compte pts et qualité
  const variantMap = new Map<string, { count: number; has_exact: boolean; has_scan: boolean }>()
  for (const row of allVariantRows || []) {
    if (!variantMap.has(row.variant_key)) {
      variantMap.set(row.variant_key, { count: 0, has_exact: false, has_scan: false })
    }
    const v = variantMap.get(row.variant_key)!
    v.count++
    if (row.granularity === 'DAILY_EXACT') v.has_exact = true
    if (row.granularity === 'SCAN')        v.has_scan  = true
  }

  // Trie : base item en premier, puis par data points décroissant
  const variants = Array.from(variantMap.entries())
    .sort(([ak, av], [bk, bv]) => {
      const aBase = ak === 'nostar_norecomb_noreforge' ? -1 : 0
      const bBase = bk === 'nostar_norecomb_noreforge' ? -1 : 0
      if (aBase !== bBase) return aBase - bBase
      return bv.count - av.count
    })
    .map(([key, meta]) => ({
      key,
      label:       buildVariantLabel(key),
      data_points: meta.count,
      has_exact:   meta.has_exact,
      has_scan:    meta.has_scan,
    }))

  // ── AH — données historiques ──────────────────────────────
  let query = supabase
    .from('price_history_ah')
    .select('bucket_date, avg_price, sell_price, volume, variant_key, granularity, created_at')
    .eq('base_item_id', item_id)
    .gte(useScans ? 'created_at' : 'bucket_date', useScans
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : startDate
    )
    .gt('avg_price', 0)
    .in('granularity', granularities)
    .order(useScans ? 'created_at' : 'bucket_date', { ascending: true })
    .limit(useScans ? 2000 : 1500)

  if (variant && variant !== 'all') {
    query = query.eq('variant_key', variant)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrège par date/heure
  const byDate = new Map<string, { prices: number[]; volumes: number[]; gran: string }>()
  for (const d of data || []) {
    // Pour les SCAN : groupe par heure pour lisibilité
    const dateKey = useScans
      ? new Date(d.created_at).toISOString().slice(0, 13) + ':00'
      : d.bucket_date
    if (!byDate.has(dateKey)) byDate.set(dateKey, { prices: [], volumes: [], gran: d.granularity })
    byDate.get(dateKey)!.prices.push(Number(d.avg_price))
    byDate.get(dateKey)!.volumes.push(Number(d.volume))
  }

  const aggregated = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { prices, volumes, gran }]) => ({
      date,
      avg_price:   Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
      sell_price:  Math.round(Math.min(...prices)),
      volume:      volumes.reduce((s, v) => s + v, 0),
      granularity: gran,
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