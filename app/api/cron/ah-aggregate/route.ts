import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getWeeklyBucket(): string {
  const d      = new Date()
  const day    = d.getUTCDay()
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1))
  return monday.toISOString().split('T')[0]
}

function getMonthlyBucket(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Lit tous les items actuels dans ah_live
    const { data: ahLive, error } = await supabase
      .from('ah_live')
      .select('base_item_id, variant_key, item_name, total_stars, is_recomb, reforge, has_dye, avg_price, buy_price, sell_price, volume')

    if (error) throw error
    if (!ahLive || ahLive.length === 0) {
      return NextResponse.json({ message: 'No data in ah_live to aggregate' })
    }

    const today         = new Date().toISOString().split('T')[0]
    const weeklyBucket  = getWeeklyBucket()
    const monthlyBucket = getMonthlyBucket()

    // Récupère la liquidité
    const { data: liquidityData } = await supabase
      .from('historic_import_progress')
      .select('item_id, liquidity')

    const liquidityMap = Object.fromEntries(
      (liquidityData || []).map(r => [r.item_id, r.liquidity as 'HIGH' | 'LOW'])
    )

    // Upsert dans price_history_ah pour chaque item
    type RpcJob = {
      item: typeof ahLive[0]
      bucket: { granularity: string; bucket_date: string }
    }
    const rpcQueue: RpcJob[] = []

    for (const item of ahLive) {
      const isHigh  = (liquidityMap[item.base_item_id] ?? 'LOW') === 'HIGH'
      const buckets = isHigh
        ? [
            { granularity: 'DAILY',   bucket_date: today         },
            { granularity: 'WEEKLY',  bucket_date: weeklyBucket  }
          ]
        : [
            { granularity: 'MONTHLY', bucket_date: monthlyBucket }
          ]

      for (const bucket of buckets) {
        rpcQueue.push({ item, bucket })
      }
    }

    const errors: string[] = []
    for (let i = 0; i < rpcQueue.length; i += 20) {
      const results = await Promise.all(
        rpcQueue.slice(i, i + 20).map(({ item, bucket }) =>
          supabase.rpc('upsert_ah_price_bucket', {
            p_base_item_id: item.base_item_id,
            p_variant_key:  item.variant_key,
            p_item_name:    item.item_name,
            p_total_stars:  item.total_stars,
            p_is_recomb:    item.is_recomb,
            p_reforge:      item.reforge,
            p_has_dye:      item.has_dye,
            p_buy_price:    item.buy_price,
            p_sell_price:   item.sell_price,
            p_avg_price:    item.avg_price,
            p_volume:       item.volume,
            p_granularity:  bucket.granularity,
            p_bucket_date:  bucket.bucket_date
          })
        )
      )
      results.forEach(({ error }) => {
        if (error) errors.push(error.message)
      })
    }

    return NextResponse.json({
      success:         true,
      items_processed: ahLive.length,
      buckets_written: rpcQueue.length,
      errors:          errors.slice(0, 3)
    })

  } catch (error: any) {
    console.error('ah-aggregate error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}