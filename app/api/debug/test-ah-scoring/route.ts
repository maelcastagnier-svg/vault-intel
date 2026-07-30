// Temp debug route -- Bloc 3.3, verifies the exact->base cascade (3.2) and
// the top-25/category cap (3.1) on real data. Deleted after validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decodeItemBytes } from '@/lib/skyblock-item-decoder'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Re-derives the same scored/relevant list runAhCollect() computed internally
// (not returned by the route itself) so we can show real base-tier item
// names for Bloc 3.3 -- re-fetches live auctions + the same historical
// queries runAhCollect() already ran, read-only, no writes.
async function findBaseTierExamples() {
  const HYPIXEL_AH_URL = 'https://api.hypixel.net/v2/skyblock/auctions'
  const first = await fetch(HYPIXEL_AH_URL).then(r => r.json())
  let all: any[] = [...(first.auctions || []).filter((a: any) => a.bin && !a.claimed)]
  const total = first.totalPages as number
  if (total > 1) {
    const pages = Array.from({ length: total - 1 }, (_, i) => i + 1)
    const results = await Promise.all(pages.map(p => fetch(`${HYPIXEL_AH_URL}?page=${p}`).then(r => r.json()).catch(() => ({ auctions: [] }))))
    results.forEach(r => { all = all.concat((r.auctions || []).filter((a: any) => a.bin && !a.claimed)) })
  }

  const grouped = new Map<string, { decoded: any; price: number }[]>()
  for (const auc of all) {
    if (!auc.item_bytes) continue
    const decoded = decodeItemBytes(auc.item_bytes)
    if (!decoded?.item_id) continue
    const key = `${decoded.item_id}::${decoded.variant_key_full}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push({ decoded, price: auc.starting_bid })
  }

  const baseItemIds = [...new Set([...grouped.values()].map(v => v[0].decoded.item_id))]
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0]

  const histExact = new Set<string>()
  for (let i = 0; i < baseItemIds.length; i += 200) {
    const { data } = await supabase.from('price_history_ah_variants')
      .select('base_item_id, variant_key').in('base_item_id', baseItemIds.slice(i, i + 200)).gte('bucket_date', sevenDaysAgo)
    for (const h of data || []) histExact.add(`${h.base_item_id}::${h.variant_key}`)
  }
  const histBase = new Set<string>()
  for (let i = 0; i < baseItemIds.length; i += 200) {
    const { data } = await supabase.from('price_history_ah_variant_base')
      .select('base_item_id, variant_key_base').in('base_item_id', baseItemIds.slice(i, i + 200)).gte('bucket_date', sevenDaysAgo)
    for (const h of data || []) histBase.add(`${h.base_item_id}::${h.variant_key_base}`)
  }

  const examples: any[] = []
  for (const [, items] of grouped) {
    const d = items[0].decoded
    const exactKey = `${d.item_id}::${d.variant_key_full}`
    const baseKey  = `${d.item_id}::${d.variant_key_base}`
    if (!histExact.has(exactKey) && histBase.has(baseKey)) {
      examples.push({ item_name: d.item_name, base_item_id: d.item_id, variant_key_full: d.variant_key_full, total_stars: d.total_stars, is_recomb: d.is_recomb, listings: items.length })
    }
  }
  return examples.slice(0, 15)
}

export async function GET() {
  const baseTierExamples = await findBaseTierExamples()

  const { GET: ahCollectGET } = await import('../../cron/ah-collect/route')
  const req = new Request('http://localhost/debug', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const res = await ahCollectGET(req as any)
  const result = await res.json()

  const { data: liveByCat } = await supabase
    .from('ah_live')
    .select('category')
  const counts: Record<string, number> = {}
  for (const r of liveByCat || []) counts[r.category] = (counts[r.category] || 0) + 1

  const { data: baseTierSamples } = await supabase
    .from('ah_live')
    .select('item_name, base_item_id, variant_key, historical_avg, discount_pct, best_price, category')
    .order('discount_pct', { ascending: false })
    .limit(200)

  return NextResponse.json({
    run_result: result,
    ah_live_rows_per_category: counts,
    ah_live_total: (liveByCat || []).length,
    sample_top_by_discount: (baseTierSamples || []).slice(0, 10),
    base_tier_examples_no_exact_but_has_base: baseTierExamples,
  })
}
