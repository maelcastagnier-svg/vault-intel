// app/api/cron/ah-collect/route.ts
// Chaque minute :
// 1. Fetch toutes les pages AH Hypixel en parallèle
// 2. Decode NBT de chaque enchère
// 3. Group by variant → UPSERT dans ah_scan_buffer (moyenne glissante)
// 4. Compare avec price_history_ah → TOP 300 underpriced → ah_live
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

// ── Fetch toutes les pages en parallèle ──────────────────────
async function fetchAllAuctions(): Promise<{ auctions: any[]; totalPages: number }> {
  const first    = await fetch(HYPIXEL_AH_URL).then(r => r.json())
  const total    = first.totalPages as number
  let all: any[] = [...(first.auctions || []).filter((a: any) => a.bin && !a.claimed)]

  if (total > 1) {
    const pages   = Array.from({ length: total - 1 }, (_, i) => i + 1)
    const results = await Promise.all(
      pages.map(p => fetch(`${HYPIXEL_AH_URL}?page=${p}`)
        .then(r => r.json())
        .catch(() => ({ auctions: [] }))
      )
    )
    results.forEach(r => {
      all = all.concat((r.auctions || []).filter((a: any) => a.bin && !a.claimed))
    })
  }

  return { auctions: all, totalPages: total }
}

// ── Handler ───────────────────────────────────────────────────
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Anti-doublon
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
    const { auctions: binAuctions, totalPages } = await fetchAllAuctions()

    // 2. Decode NBT + groupe par variant_key_full en mémoire
    type GroupItem = {
      decoded:  ReturnType<typeof decodeItemBytes> & {}
      price:    number
      uuid:     string
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
        category: auc.category ?? null,
      })
    }

    // 3. UPSERT dans ah_scan_buffer (moyenne glissante, 1 row par variante)
    const bufferRows: any[] = []

    for (const [, items] of grouped) {
      const d        = items[0].decoded
      const prices   = items.map(i => i.price).sort((a, b) => a - b)
      const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length
      const minPrice = prices[0]
      const maxPrice = prices[prices.length - 1]
      const volume   = items.length
      const bestItem = items.reduce((best, i) => i.price < best.price ? i : best, items[0])

      bufferRows.push({
        base_item_id:     d.item_id,
        variant_key:      d.variant_key_full,
        variant_key_base: d.variant_key_base,
        item_name:        d.item_name,
        avg_price:        avgPrice,
        min_price:        minPrice,
        max_price:        maxPrice,
        volume,
        scan_count:       1,
        total_stars:      d.total_stars,
        master_stars:     d.master_stars,
        is_recomb:        d.is_recomb,
        reforge:          d.reforge,
        hot_potato_count: d.hot_potato_count,
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
        category:         items[0].category,
        best_price:       minPrice,
        best_uuid:        bestItem.uuid,
        scan_date:        TODAY,
        last_scan_at:     new Date().toISOString(),
      })
    }

    // UPSERT batch avec moyenne glissante via fonction SQL native
    // Envoi par batch de 500 pour éviter les payloads trop lourds
    for (let i = 0; i < bufferRows.length; i += 500) {
      const batch = bufferRows.slice(i, i + 500).map(r => ({
        base_item_id:     r.base_item_id,
        variant_key:      r.variant_key,
        variant_key_base: r.variant_key_base,
        item_name:        r.item_name,
        avg_price:        r.avg_price,
        min_price:        r.min_price,
        max_price:        r.max_price,
        volume:           r.volume,
        best_price:       r.best_price,
        best_uuid:        r.best_uuid,
        category:         r.category,
        total_stars:      r.total_stars,
        master_stars:     r.master_stars,
        is_recomb:        r.is_recomb,
        reforge:          r.reforge,
        ultimate_enchant: r.ultimate_enchant,
        attribute_1:      r.attribute_1,
        attribute_1_level:r.attribute_1_level,
        attribute_2:      r.attribute_2,
        attribute_2_level:r.attribute_2_level,
        scan_date:        r.scan_date,
        last_scan_at:     r.last_scan_at,
      }))
      try {
        await supabase.rpc('upsert_scan_buffer_batch', { p_rows: batch })
      } catch (e) {
        console.error('Buffer upsert error batch', i, e)
      }
    }

    // ── Fetch enchères BIN vendues → avg_sold_price par variante ──
    try {
      const { auctions: soldAuctions } = await fetchSoldAuctions()

      // Groupe les ventes par variante
      const soldGroups = new Map<string, { prices: number[]; decoded: any }>()
      for (const auc of soldAuctions) {
        if (!auc.item_bytes) continue
        const decoded = decodeItemBytes(auc.item_bytes)
        if (!decoded?.item_id) continue
        const key = `${decoded.item_id}::${decoded.variant_key_full}`
        if (!soldGroups.has(key)) soldGroups.set(key, { prices: [], decoded })
        soldGroups.get(key)!.prices.push(auc.price)
      }

      // Update avg_sold_price dans ah_scan_buffer
      if (soldGroups.size > 0) {
        const soldRows = Array.from(soldGroups.entries()).map(([, { prices, decoded }]) => ({
          base_item_id:   decoded.item_id,
          variant_key:    decoded.variant_key_full,
          avg_sold_price: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
          sold_count:     prices.length,
        }))

        // Update sold prices dans le buffer
        for (const row of soldRows) {
          await supabase.from('ah_scan_buffer')
            .update({
              avg_sold_price: row.avg_sold_price,
              sold_count:     row.sold_count,
            })
            .eq('base_item_id', row.base_item_id)
            .eq('variant_key', row.variant_key)
        }
      }
    } catch (e) {
      console.error('Sold auctions error:', e)
    }

    // 4. Compare avec price_history_ah → TOP 300
    const baseItemIds = [...new Set(bufferRows.map(r => r.base_item_id))]
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0]

    const { data: historical } = await supabase
      .from('price_history_ah')
      .select('base_item_id, variant_key, variant_key_base, avg_price, granularity')
      .in('base_item_id', baseItemIds)
      .in('granularity', ['DAILY_EXACT', 'DAILY', 'MONTHLY'])
      .gte('bucket_date', sevenDaysAgo)

    // Maps historiques par niveau de précision
    const histExact = new Map<string, number[]>()
    const histBase  = new Map<string, number[]>()
    const histMthly = new Map<string, number[]>()

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
      } else {
        const k = `${h.base_item_id}::nostar_norecomb`
        if (!histMthly.has(k)) histMthly.set(k, [])
        histMthly.get(k)!.push(price)
      }
    }

    const avg = (arr: number[]) => arr.reduce((s, p) => s + p, 0) / arr.length

    // Score chaque variante
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

    for (const [, items] of grouped) {
      const d         = items[0].decoded
      const prices    = items.map(i => i.price).sort((a, b) => a - b)
      const bestPrice = prices[0]
      const avgPrice  = prices.reduce((s, p) => s + p, 0) / prices.length
      const bestItem  = items.reduce((best, i) => i.price < best.price ? i : best, items[0])

      const exactKey = `${d.item_id}::${d.variant_key_full}`
      const baseKey  = `${d.item_id}::${d.variant_key_base}`
      const mthlyKey = `${d.item_id}::nostar_norecomb`

      let histPrice = 0, precision = 'none'
      if      (histExact.has(exactKey)) { histPrice = avg(histExact.get(exactKey)!); precision = 'exact' }
      else if (histBase.has(baseKey))   { histPrice = avg(histBase.get(baseKey)!);   precision = 'base'  }
      else if (histMthly.has(mthlyKey)) { histPrice = avg(histMthly.get(mthlyKey)!); precision = 'monthly' }

      const discountPct = histPrice > 0 ? Math.round(((histPrice - bestPrice) / histPrice) * 100) : 0
      const spreadPct   = avgPrice  > 0 ? Math.round(((avgPrice - bestPrice)  / avgPrice)  * 100) : 0

      scored.push({
        base_item_id:      d.item_id,
        variant_key_full:  d.variant_key_full,
        variant_key_base:  d.variant_key_base,
        item_name:         d.item_name,
        category:          items[0].category,
        best_price:        bestPrice,
        best_uuid:         bestItem.uuid,
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

    // TOP 300 par catégorie (max 50/cat)
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

    // DELETE + INSERT ah_live
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

    await supabase.from('cron_locks').update({ locked_until: null }).eq('job_name', 'ah_collect')

    return NextResponse.json({
      success:          true,
      total_bin:        binAuctions.length,
      total_pages:      totalPages,
      variants_grouped: grouped.size,
      buffer_upserted:  bufferRows.length,
      top_items:        finalItems.length,
      hist_precision: {
        exact:   finalItems.filter(i => i.hist_precision === 'exact').length,
        base:    finalItems.filter(i => i.hist_precision === 'base').length,
        monthly: finalItems.filter(i => i.hist_precision === 'monthly').length,
        none:    finalItems.filter(i => i.hist_precision === 'none').length,
      }
    })

  } catch (error: any) {
    await supabase.from('cron_locks').update({ locked_until: null }).eq('job_name', 'ah_collect')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── Fetch enchères BIN vendues (prix réels de vente) ─────────
async function fetchSoldAuctions(): Promise<{ auctions: any[] }> {
  const res = await fetch('https://api.hypixel.net/v2/skyblock/auctions/ended')
  if (!res.ok) return { auctions: [] }
  const data = await res.json()
  // Filtre uniquement les BIN
  return { auctions: (data.auctions || []).filter((a: any) => a.bin) }
}