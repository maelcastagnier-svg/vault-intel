// app/api/cron/ah-collect/route.ts
// Scan complet AH Hypixel — decode NBT — compare avec historique 3 niveaux
// → TOP 300 underpriced dans ah_live
import { createClient }   from '@supabase/supabase-js'
import { NextResponse }    from 'next/server'
import { decodeItemBytes } from '@/lib/skyblock-item-decoder'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HYPIXEL_AH_URL = 'https://api.hypixel.net/v2/skyblock/auctions'
const TOP_ITEMS      = 300
const TODAY          = new Date().toISOString().split('T')[0]

const MAX_PAGES_PER_RUN = 30  // ~30 × 2.3MB = 69MB max par run

// ── Fetch pages AH avec pagination par run ───────────────────
async function fetchAllAuctions(): Promise<{ auctions: any[]; totalPages: number; pagesScanned: number }> {
  const first     = await fetch(HYPIXEL_AH_URL).then(r => r.json())
  const total     = first.totalPages as number
  let all: any[]  = [...(first.auctions || []).filter((a: any) => a.bin && !a.claimed)]

  // Pages suivantes en batch de 10 — max MAX_PAGES_PER_RUN
  const pagesToFetch = Math.min(MAX_PAGES_PER_RUN - 1, total - 1)

  for (let i = 1; i <= pagesToFetch; i += 10) {
    const batch   = Array.from({ length: Math.min(10, pagesToFetch - i + 1) }, (_, j) => i + j)
    const results = await Promise.all(
      batch.map(p => fetch(`${HYPIXEL_AH_URL}?page=${p}`).then(r => r.json()))
    )
    results.forEach(r => { all = all.concat((r.auctions || []).filter((a: any) => a.bin && !a.claimed)) })
  }

  return { auctions: all, totalPages: total, pagesScanned: pagesToFetch + 1 }
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: lock } = await supabase
    .from('cron_locks').select('locked_until').eq('job_name', 'ah_collect').single()

  if (lock?.locked_until && new Date(lock.locked_until) > new Date()) {
    return NextResponse.json({ message: 'Already running' })
  }

  await supabase.from('cron_locks').upsert(
    { job_name: 'ah_collect', locked_until: new Date(Date.now() + 120_000).toISOString() },
    { onConflict: 'job_name' }
  )

  try {
    // 1. Fetch toutes les BIN
    const { auctions: binAuctions, totalPages, pagesScanned } = await fetchAllAuctions()

    // 2. Decode NBT + groupe par variant_key_full
    type GroupItem = {
      decoded:  ReturnType<typeof decodeItemBytes> & {}
      price:    number
      uuid:     string
      seller:   string
      category: string | null
    }

    const grouped = new Map<string, GroupItem[]>()

    for (const auc of binAuctions) {
      if (!auc.item_bytes) continue
      const decoded = decodeItemBytes(auc.item_bytes)
      if (!decoded || !decoded.item_id) continue

      const key = `${decoded.item_id}::${decoded.variant_key_full}`
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push({
        decoded,
        price:    auc.starting_bid,
        uuid:     auc.uuid,
        seller:   auc.auctioneer,
        category: auc.category ?? null,
      })
    }

    // 3. Insère SCAN dans price_history_ah
    const scanRows: any[] = []

    for (const [, items] of grouped) {
      const d        = items[0].decoded
      const prices   = items.map(i => i.price).sort((a, b) => a - b)
      const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length

      scanRows.push({
        base_item_id:     d.item_id,
        variant_key:      d.variant_key_full,
        variant_key_base: d.variant_key_base,
        item_name:        d.item_name,
        granularity:      'SCAN',
        bucket_date:      TODAY,
        avg_price:        avgPrice,
        sell_price:       prices[0],
        buy_price:        avgPrice,
        volume:           items.length,
        data_points:      items.length,
        total_stars:      d.total_stars,
        master_stars:     d.master_stars,
        is_recomb:        d.is_recomb,
        reforge:          d.reforge,
        hot_potato_count: d.hot_potato_count,
        art_of_war_count: d.art_of_war_count,
        art_of_peace_count: d.art_of_peace_count,
        wood_singularity: d.wood_singularity,
        transmitted_count:d.transmitted_count,
        mana_disintegrator:d.mana_disintegrator,
        silex_applied:    d.silex_applied,
        enchantments:     Object.keys(d.enchantments).length > 0 ? d.enchantments : null,
        ultimate_enchant: d.ultimate_enchant,
        ultimate_level:   d.ultimate_level,
        gems:             Object.keys(d.gems).length > 0 ? d.gems : null,
        gems_summary:     d.gems_summary || null,
        attributes:       Object.keys(d.attributes).length > 0 ? d.attributes : null,
        attribute_1:      d.attribute_1,
        attribute_1_level:d.attribute_1_level,
        attribute_2:      d.attribute_2,
        attribute_2_level:d.attribute_2_level,
        has_dye:          d.has_dye,
        dye_item:         d.dye_item,
        item_skin:        d.item_skin,
        item_origin:      d.item_origin,
        auction_uuid:     items[0].uuid,
        seller_uuid:      items[0].seller,
        raw_price:        prices[0],
        item_count:       d.item_count,
        item_uuid:        d.item_uuid,
      })
    }

    // SCAN → insert simple pour conserver tout l'historique intraday
    // La contrainte unique sur DAILY/DAILY_EXACT/MONTHLY empêche les doublons agrégés
    // mais les SCAN multiples par jour sont voulus (historique de prix toutes les minutes)
    for (let i = 0; i < scanRows.length; i += 100) {
      await supabase.from('price_history_ah').insert(scanRows.slice(i, i + 100))
    }

    // 4. Historique 7j — fallback à 3 niveaux
    const baseItemIds = [...new Set(scanRows.map(r => r.base_item_id))]
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0]

    const { data: historical } = await supabase
      .from('price_history_ah')
      .select('base_item_id, variant_key, variant_key_base, avg_price, granularity')
      .in('base_item_id', baseItemIds)
      .in('granularity', ['DAILY_EXACT', 'DAILY', 'MONTHLY'])
      .gte('bucket_date', sevenDaysAgo)

    // Maps par niveau de précision
    const histExact = new Map<string, number[]>() // DAILY_EXACT (variant_key_full)
    const histBase  = new Map<string, number[]>() // DAILY (variant_key_base)
    const histMthly = new Map<string, number[]>() // MONTHLY (nostar_norecomb)

    for (const h of historical || []) {
      const price = Number(h.avg_price)
      if (h.granularity === 'DAILY_EXACT') {
        const k = `${h.base_item_id}::${h.variant_key}`
        if (!histExact.has(k)) histExact.set(k, [])
        histExact.get(k)!.push(price)
      } else if (h.granularity === 'DAILY') {
        const k = `${h.base_item_id}::${h.variant_key_base || h.variant_key}`
        if (!histBase.has(k)) histBase.set(k, [])
        histBase.get(k)!.push(price)
      } else if (h.granularity === 'MONTHLY') {
        const k = `${h.base_item_id}::nostar_norecomb`
        if (!histMthly.has(k)) histMthly.set(k, [])
        histMthly.get(k)!.push(price)
      }
    }

    const avg = (arr: number[]) => arr.reduce((s, p) => s + p, 0) / arr.length

    // 5. Score chaque item
    type ScoredItem = {
      base_item_id:      string
      variant_key_full:  string
      variant_key_base:  string
      item_name:         string
      category:          string | null
      best_price:        number
      best_uuid:         string
      avg_price:         number
      historical_avg:    number
      discount_pct:      number
      spread_pct:        number
      volume:            number
      hist_precision:    string
      total_stars:       number
      master_stars:      number
      is_recomb:         boolean
      reforge:           string | null
      has_dye:           boolean
      ultimate_enchant:  string | null
      attribute_1:       string | null
      attribute_1_level: number | null
      attribute_2:       string | null
      attribute_2_level: number | null
    }

    const scored: ScoredItem[] = []

    for (const [key, items] of grouped) {
      const d         = items[0].decoded
      const prices    = items.map(i => i.price).sort((a, b) => a - b)
      const bestPrice = prices[0]
      const avgPrice  = prices.reduce((s, p) => s + p, 0) / prices.length

      // Fallback à 3 niveaux
      const exactKey = `${d.item_id}::${d.variant_key_full}`
      const baseKey  = `${d.item_id}::${d.variant_key_base}`
      const mthlyKey = `${d.item_id}::nostar_norecomb`

      let histPrice  = 0
      let precision  = 'none'

      if (histExact.has(exactKey)) {
        histPrice = avg(histExact.get(exactKey)!)
        precision = 'exact'
      } else if (histBase.has(baseKey)) {
        histPrice = avg(histBase.get(baseKey)!)
        precision = 'base'
      } else if (histMthly.has(mthlyKey)) {
        histPrice = avg(histMthly.get(mthlyKey)!)
        precision = 'monthly'
      }

      const discountPct = histPrice > 0
        ? Math.round(((histPrice - bestPrice) / histPrice) * 100)
        : 0
      const spreadPct   = avgPrice > 0
        ? Math.round(((avgPrice - bestPrice) / avgPrice) * 100)
        : 0

      scored.push({
        base_item_id:      d.item_id,
        variant_key_full:  d.variant_key_full,
        variant_key_base:  d.variant_key_base,
        item_name:         d.item_name,
        category:          items[0].category,
        best_price:        bestPrice,
        best_uuid:         items[0].uuid,
        avg_price:         avgPrice,
        historical_avg:    histPrice,
        discount_pct:      discountPct,
        spread_pct:        spreadPct,
        volume:            items.length,
        hist_precision:    precision,
        total_stars:       d.total_stars,
        master_stars:      d.master_stars,
        is_recomb:         d.is_recomb,
        reforge:           d.reforge,
        has_dye:           d.has_dye,
        ultimate_enchant:  d.ultimate_enchant,
        attribute_1:       d.attribute_1,
        attribute_1_level: d.attribute_1_level,
        attribute_2:       d.attribute_2,
        attribute_2_level: d.attribute_2_level,
      })
    }

    // 6. TOP 300 par catégorie (max 50 par cat)
    const byCat = new Map<string, ScoredItem[]>()
    for (const item of scored) {
      const cat = item.category ?? 'other'
      if (!byCat.has(cat)) byCat.set(cat, [])
      byCat.get(cat)!.push(item)
    }

    const topItems: ScoredItem[] = []
    for (const [, catItems] of byCat) {
      catItems.sort((a, b) =>
        (b.discount_pct * 0.6 + b.spread_pct * 0.4) -
        (a.discount_pct * 0.6 + a.spread_pct * 0.4)
      )
      topItems.push(...catItems.slice(0, 50))
    }

    topItems.sort((a, b) =>
      (b.discount_pct * 0.6 + b.spread_pct * 0.4) -
      (a.discount_pct * 0.6 + a.spread_pct * 0.4)
    )

    const finalItems = topItems.slice(0, TOP_ITEMS)

    // 7. DELETE + INSERT ah_live
    await supabase.from('ah_live').delete().gte('id', 0)

    const liveRows = finalItems.map(item => ({
      item_id:           item.base_item_id,
      base_item_id:      item.base_item_id,
      variant_key:       item.variant_key_full,
      variant_key_base:  item.variant_key_base,
      item_name:         item.item_name?.slice(0, 299) ?? '',
      total_stars:       item.total_stars,
      master_stars:      item.master_stars,
      is_recomb:         item.is_recomb,
      reforge:           item.reforge,
      has_dye:           item.has_dye,
      ultimate_enchant:  item.ultimate_enchant,
      attribute_1:       item.attribute_1,
      attribute_1_level: item.attribute_1_level,
      attribute_2:       item.attribute_2,
      attribute_2_level: item.attribute_2_level,
      category:          item.category,
      best_price:        item.best_price,
      best_auction_uuid: item.best_uuid,
      buy_price:         item.avg_price,
      sell_price:        item.best_price,
      avg_price:         item.avg_price,
      min_price:         item.best_price,
      max_price:         item.avg_price,
      historical_avg:    item.historical_avg,
      discount_pct:      item.discount_pct,
      spread_pct:        item.spread_pct,
      volume:            item.volume,
      timestamp:         new Date().toISOString(),
      scanned_at:        new Date().toISOString(),
    }))

    for (let i = 0; i < liveRows.length; i += 50) {
      await supabase.from('ah_live').insert(liveRows.slice(i, i + 50))
    }

    await supabase.from('cron_locks')
      .update({ locked_until: null })
      .eq('job_name', 'ah_collect')

    const withExact   = finalItems.filter(i => i.hist_precision === 'exact').length
    const withBase    = finalItems.filter(i => i.hist_precision === 'base').length
    const withMonthly = finalItems.filter(i => i.hist_precision === 'monthly').length
    const noHistory   = finalItems.filter(i => i.hist_precision === 'none').length

    return NextResponse.json({
      success:          true,
      total_bin:        binAuctions.length,
      decoded_ok:       scanRows.length,
      scans_inserted:   scanRows.length,
      top_items:        finalItems.length,
      pages_scanned:    pagesScanned,
      total_pages:      totalPages,
      history_precision: { exact: withExact, base: withBase, monthly: withMonthly, none: noHistory }
    })

  } catch (error: any) {
    await supabase.from('cron_locks')
      .update({ locked_until: null })
      .eq('job_name', 'ah_collect')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}