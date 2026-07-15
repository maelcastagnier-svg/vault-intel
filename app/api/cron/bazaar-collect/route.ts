import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HYPIXEL_BAZAAR_URL = 'https://api.hypixel.net/v2/skyblock/bazaar'
const TOP_ITEMS          = 25

type BazaarItem = {
  item_id:    string
  item_name:  string
  buy_price:  number
  sell_price: number
  avg_price:  number
  volume:     number
  spread:     number
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res  = await fetch(HYPIXEL_BAZAAR_URL)
    const data = await res.json()

    if (!data.success || !data.products) {
      throw new Error('Hypixel API returned no products')
    }

    const items: BazaarItem[] = (
      Object.entries(data.products) as [string, any][]
    )
      .map(([item_id, product]) => {
        const qs = product.quick_status
        if (!qs) return null

        const buy  = qs.buyPrice  || 0
        const sell = qs.sellPrice || 0
        const vol  = qs.buyVolume || 0
        const avg  = (buy + sell) / 2

        if (sell <= 0 || buy <= 0 || vol < 500_000 || sell < 500) return null

        const spread = ((buy - sell) / sell) * 100

        return {
          item_id,
          item_name:  item_id.replace(/_/g, ' '),
          buy_price:  buy,
          sell_price: sell,
          avg_price:  avg,
          volume:     vol,
          spread:     Math.round(spread * 100) / 100
        } as BazaarItem
      })
      .filter((i): i is BazaarItem => i !== null)
      .filter(i => i.spread >= 10 && i.spread <= 80)
      .sort((a, b) => b.spread - a.spread)
      .slice(0, TOP_ITEMS)

    // 1. Snapshot bazaar_1h (DELETE + INSERT)
    await supabase.from('bazaar_1h').delete().neq('item_id', '')
    await supabase.from('bazaar_1h').insert(
      items.map(item => ({
        ...item,
        scanned_at: new Date().toISOString()
      }))
    )

    // 2. Upsert price_history (bucket DAILY)
    const bucketDate = new Date().toISOString().split('T')[0]

    for (let i = 0; i < items.length; i += 20) {
      await Promise.all(
        items.slice(i, i + 20).map(item =>
          supabase.rpc('upsert_bazaar_price_bucket', {
            p_item_id:     item.item_id,
            p_item_name:   item.item_name,
            p_buy_price:   item.buy_price,
            p_sell_price:  item.sell_price,
            p_avg_price:   item.avg_price,
            p_volume:      item.volume,
            p_bucket_date: bucketDate
          }).then()
        )
      )
    }

    return NextResponse.json({
      success:      true,
      items_scanned: items.length,
      bucket_date:  bucketDate
    })

  } catch (error: any) {
    console.error('bazaar-collect error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}