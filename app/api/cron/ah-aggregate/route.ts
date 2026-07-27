// app/api/cron/ah-aggregate/route.ts
// 23h59 chaque soir :
// 1. Lit ah_scan_buffer (toutes les variantes du jour)
// 2. INSERT dans price_history_ah_variants (1 DAILY_EXACT par variante exacte)
// 3. INSERT dans price_history_ah (1 DAILY par item = moyenne toutes variantes, __all_variants_blended__)
// 4. INSERT dans price_history_ah_variant_base (1 row par variant_key_base = palier
//    intermédiaire entre l'exact et le blended, ex: tous les "5 stars" peu importe reforge/gems)
// 5. TRUNCATE ah_scan_buffer
import { createClient } from '@supabase/supabase-js'
import { NextResponse }  from 'next/server'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Logique extraite en fonction plain pour pouvoir être appelée directement
// (import + call) par une route de debug interne, sans repasser par HTTP --
// un self-fetch depuis une autre route du même déploiement se heurte au mur
// SSO de Vercel Deployment Protection (ce trafic n'a pas le cookie de bypass),
// donc CRON_SECRET n'atteint jamais le handler. L'appel direct court-circuite
// entièrement ce problème.
export async function runAhAggregate() {
    // 1. Lit tout le buffer
    const { data: buffer, error: bufErr } = await supabase
      .from('ah_scan_buffer')
      .select('*')
      .order('scan_date', { ascending: true })

    if (bufErr) throw new Error('Buffer read: ' + bufErr.message)
    if (!buffer || buffer.length === 0) {
      return { message: 'Buffer empty' }
    }

    // ── TABLE 1 : price_history_ah_variants ───────────────────
    // 1 row par variante exacte (variant_key_full) par jour
    const variantRows = buffer
      .filter(b => b.scan_count >= 3) // données fiables uniquement
      .map(b => ({
        base_item_id:     b.base_item_id,
        variant_key:      b.variant_key,
        variant_key_base: b.variant_key_base,
        item_name:        b.item_name,
        bucket_date:      b.scan_date,
        avg_price:        b.avg_price,
        min_price:        b.min_price,
        max_price:        b.max_price,
        sell_price:       b.min_price,
        avg_sold_price:   b.avg_sold_price || 0,
        sold_count:       b.sold_count     || 0,
        volume:           b.volume,
        data_points:      b.scan_count,
        total_stars:      b.total_stars,
        master_stars:     b.master_stars,
        is_recomb:        b.is_recomb,
        reforge:          b.reforge,
        hot_potato_count: b.hot_potato_count,
        ultimate_enchant: b.ultimate_enchant,
        ultimate_level:   b.ultimate_level,
        gems:             b.gems,
        gems_summary:     b.gems_summary,
        attributes:       b.attributes,
        attribute_1:      b.attribute_1,
        attribute_1_level:b.attribute_1_level,
        attribute_2:      b.attribute_2,
        attribute_2_level:b.attribute_2_level,
        has_dye:          b.has_dye,
        auction_uuid:     b.best_uuid,
      }))

    let variantsInserted = 0
    for (let i = 0; i < variantRows.length; i += 100) {
      const { error } = await supabase
        .from('price_history_ah_variants')
        .upsert(variantRows.slice(i, i + 100), {
          onConflict:       'base_item_id, variant_key, bucket_date',
          ignoreDuplicates: true,
        })
      if (!error) variantsInserted += Math.min(100, variantRows.length - i)
    }

    // ── TABLE 2 : price_history_ah ────────────────────────────
    // 1 row par item (base_item_id) par jour = moyenne toutes variantes
    // Groupe par base_item_id + scan_date
    const itemMap = new Map<string, { prices: number[]; volumes: number[]; scan_date: string }>()
    for (const b of buffer) {
      const key = `${b.base_item_id}::${b.scan_date}`
      if (!itemMap.has(key)) {
        itemMap.set(key, { prices: [], volumes: [], scan_date: b.scan_date })
      }
      itemMap.get(key)!.prices.push(Number(b.avg_price))
      itemMap.get(key)!.volumes.push(Number(b.volume))
    }

    const dailyRows = Array.from(itemMap.entries()).map(([key, { prices, volumes, scan_date }]) => {
      const base_item_id = key.split('::')[0]
      const avg_price    = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
      const volume       = volumes.reduce((s, v) => s + v, 0)
      return {
        base_item_id,
        // Placeholder pour "moyenne toutes variantes confondues" — pas un vrai
        // variant_key. Anciennement 'nostar_norecomb_noreforge', qui collidait
        // avec le VRAI variant_key du plain item (0 star/no recomb/no reforge)
        // utilisé ailleurs (RadarSection, SetupOverlay) pour dire "Base item" —
        // un flip pouvait silencieusement se faire comparer à cette moyenne
        // blended en croyant comparer contre le plain item. Renommé pour ne
        // plus jamais être confondu avec un variant_key réel.
        variant_key:      '__all_variants_blended__',
        variant_key_base: '__all_variants_blended__',
        granularity:      'DAILY',
        bucket_date:      scan_date,
        avg_price,
        sell_price:       avg_price,
        buy_price:        avg_price,
        volume,
        data_points:      prices.length,
      }
    })

    let dailyInserted = 0
    for (let i = 0; i < dailyRows.length; i += 100) {
      const { error } = await supabase
        .from('price_history_ah')
        .upsert(dailyRows.slice(i, i + 100), {
          onConflict:       'base_item_id, variant_key, granularity, bucket_date',
          ignoreDuplicates: true,
        })
      if (!error) dailyInserted += Math.min(100, dailyRows.length - i)
    }

    // ── TABLE 3 : price_history_ah_variant_base ───────────────
    // 1 row par (base_item_id, variant_key_base) par jour — palier intermédiaire
    // entre l'exact (Table 1, variant_key_full) et le blended toutes-variantes
    // (Table 2). Ex: "5 stars" regroupe toutes les combinaisons de reforge/gems/
    // enchants à 5 étoiles, plutôt que soit une variante ultra-précise soit une
    // moyenne qui écrase même la distinction en étoiles.
    // Regroupe les mêmes lignes fiables (scan_count >= 3) que Table 1.
    type BaseGroup = {
      weightedPriceSum: number
      weightTotal:      number
      minPrices:        number[]
      maxPrices:        number[]
      volumeSum:        number
      dataPointsSum:    number
      variantKeys:      Set<string>
      best:             any // ligne au plus haut scan_count du groupe — source des champs descriptifs (non agrégés)
    }
    const baseGroupMap = new Map<string, BaseGroup>()

    for (const b of buffer) {
      if (b.scan_count < 3) continue
      const key = `${b.base_item_id}::${b.variant_key_base}::${b.scan_date}`
      if (!baseGroupMap.has(key)) {
        baseGroupMap.set(key, {
          weightedPriceSum: 0, weightTotal: 0,
          minPrices: [], maxPrices: [], volumeSum: 0, dataPointsSum: 0,
          variantKeys: new Set(), best: b,
        })
      }
      const g = baseGroupMap.get(key)!
      g.weightedPriceSum += Number(b.avg_price) * b.scan_count // pondéré par fiabilité
      g.weightTotal      += b.scan_count
      g.minPrices.push(Number(b.min_price))
      g.maxPrices.push(Number(b.max_price))
      g.volumeSum        += Number(b.volume)
      g.dataPointsSum    += b.scan_count
      g.variantKeys.add(b.variant_key)
      if (b.scan_count > g.best.scan_count) g.best = b
    }

    // Seuil de fiabilité minimum avant d'écrire la ligne base : soit assez de
    // scans au total, soit assez de variantes exactes distinctes contribuant.
    const BASE_MIN_DATA_POINTS = 10
    const BASE_MIN_VARIANTS    = 2

    const baseRows = Array.from(baseGroupMap.entries())
      .filter(([, g]) => g.dataPointsSum >= BASE_MIN_DATA_POINTS || g.variantKeys.size >= BASE_MIN_VARIANTS)
      .map(([key, g]) => {
        const [base_item_id, variant_key_base, bucket_date] = key.split('::')
        const avg_price = Math.round(g.weightedPriceSum / g.weightTotal)
        return {
          base_item_id,
          variant_key_base,
          item_name:              g.best.item_name,
          bucket_date,
          avg_price,
          min_price:              Math.min(...g.minPrices),
          max_price:              Math.max(...g.maxPrices),
          sell_price:             avg_price,
          volume:                 g.volumeSum,
          data_points:            g.dataPointsSum,
          contributing_variants:  g.variantKeys.size,
          total_stars:            g.best.total_stars,
          master_stars:           g.best.master_stars,
          is_recomb:              g.best.is_recomb,
          ultimate_enchant:       g.best.ultimate_enchant,
          ultimate_level:         g.best.ultimate_level,
          attribute_1:            g.best.attribute_1,
          attribute_1_level:      g.best.attribute_1_level,
          attribute_2:            g.best.attribute_2,
          attribute_2_level:      g.best.attribute_2_level,
        }
      })

    let baseInserted = 0
    for (let i = 0; i < baseRows.length; i += 100) {
      const { error } = await supabase
        .from('price_history_ah_variant_base')
        .upsert(baseRows.slice(i, i + 100), {
          onConflict:       'base_item_id, variant_key_base, bucket_date',
          ignoreDuplicates: true,
        })
      if (!error) baseInserted += Math.min(100, baseRows.length - i)
    }

    // 5. TRUNCATE buffer
    await supabase.from('ah_scan_buffer')
      .delete()
      .lte('scan_date', new Date().toISOString().split('T')[0])

    return {
      success:           true,
      buffer_size:       buffer.length,
      variants_inserted: variantsInserted,
      daily_inserted:    dailyInserted,
      base_inserted:     baseInserted,
      base_groups_seen:  baseGroupMap.size,
      date:              buffer[0]?.scan_date,
    }
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await runAhAggregate())
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}