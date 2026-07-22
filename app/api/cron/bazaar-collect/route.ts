import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const maxDuration = 60

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
  spread_pct: number
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

    // Hypixel renvoie tout le catalogue Bazaar en un seul fetch — on en tire deux listes
    // distinctes depuis les mêmes données, pas deux collectes séparées :
    //  - allItems : tout produit avec un prix valide, pour l'historique price_history
    //    (chaque item doit avoir son point quotidien, illiquide ou non — un volume faible
    //    est une donnée légitime, pas du bruit à exclure)
    //  - flipCandidates : sous-ensemble filtré spread 10-80%, top 25, pour bazaar_1h
    //    (scope volontairement restreint, sert uniquement la feature Bazaar Flip)
    const allItems: BazaarItem[] = (
      Object.entries(data.products) as [string, any][]
    )
      .map(([item_id, product]) => {
        const qs = product.quick_status
        if (!qs) return null

        const buy  = qs.buyPrice  || 0
        const sell = qs.sellPrice || 0
        const vol  = qs.buyVolume || 0
        const avg  = (buy + sell) / 2

        if (sell <= 0 || buy <= 0) return null

        const spread     = buy - sell
        const spread_pct = Math.round(((buy - sell) / sell) * 10000) / 100

        return {
          item_id,
          item_name:  item_id.replace(/_/g, ' '),
          buy_price:  buy,
          sell_price: sell,
          avg_price:  avg,
          volume:     vol,
          spread,
          spread_pct
        } as BazaarItem
      })
      .filter((i): i is BazaarItem => i !== null)

    const flipCandidates = allItems
      .filter(i => i.spread_pct >= 10 && i.spread_pct <= 80)
      .sort((a, b) => b.spread_pct - a.spread_pct)
      .slice(0, TOP_ITEMS)

    // 1. Snapshot bazaar_1h (DELETE + INSERT) — flip candidates uniquement
    await supabase.from('bazaar_1h').delete().neq('item_id', '')
    await supabase.from('bazaar_1h').insert(
      flipCandidates.map(item => ({
        item_id:    item.item_id,
        item_name:  item.item_name,
        buy_price:  item.buy_price,
        sell_price: item.sell_price,
        avg_price:  item.avg_price,
        volume:     item.volume,
        spread:     item.spread,
        spread_pct: item.spread_pct,
        timestamp:  new Date().toISOString(),
        scanned_at: new Date().toISOString()
      }))
    )

    // 2. Upsert price_history (bucket DAILY) — catalogue complet, batché
    const bucketDate = new Date().toISOString().split('T')[0]

    for (let i = 0; i < allItems.length; i += 500) {
      const batch = allItems.slice(i, i + 500).map(item => ({
        item_id:     item.item_id,
        item_name:   item.item_name,
        buy_price:   item.buy_price,
        sell_price:  item.sell_price,
        avg_price:   item.avg_price,
        volume:      item.volume,
        bucket_date: bucketDate,
      }))
      const { error } = await supabase.rpc('upsert_bazaar_price_bucket_batch', { p_rows: batch })
      if (error) console.error('Bazaar batch upsert error', i, error)
    }

    return NextResponse.json({
      success:              true,
      items_total:          allItems.length,
      flip_candidates:      flipCandidates.length,
      bucket_date:          bucketDate
    })

  } catch (error: any) {
    console.error('bazaar-collect error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}