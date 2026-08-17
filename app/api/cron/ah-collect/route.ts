// app/api/cron/ah-collect/route.ts
// Chaque minute :
// 1. Fetch toutes les pages AH Hypixel en parallèle
// 2. Decode NBT de chaque enchère
// 3. Group by variant → UPSERT dans ah_scan_buffer (moyenne glissante)
// 4. Compare avec price_history_ah → TOP 300 underpriced → ah_live
import { createClient }   from '@supabase/supabase-js'
import { NextResponse }    from 'next/server'
import { decodeItemBytes } from '@/lib/skyblock-item-decoder'
import { startSync, finishSync } from '../../../../lib/sync-log'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HYPIXEL_AH_URL = 'https://api.hypixel.net/v2/skyblock/auctions'
// Palier de sécurité global, pas la vraie cible fonctionnelle -- le vrai
// contrat (voir Bloc 3.1, audit du 30/31 juillet) est "top 25 par catégorie"
// (documenté partout côté produit : app/page.tsx, app/features/page.tsx,
// FlashAlertsPage.tsx, FreeFlashPreview.tsx -- confirmé par grep avant de
// trancher). Avec ~10 catégories AH réelles (confirmé en base : weapon/
// armor/misc/cosmetic/accessories/consumables/other_skins/helmet_skins/
// runes/dyes), 25/cat plafonne déjà à 250 total -- ce chiffre n'est qu'un
// filet de sécurité si Hypixel ajoutait un jour beaucoup plus de catégories.
const TOP_ITEMS_SAFETY_CEILING = 1000

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

// ── Logique extraite en fonction plain -- même pattern que
// runAhAggregate() -- pour être appelable directement (import + call) par
// une route de debug interne, sans passer par CRON_SECRET/HTTP. ──────────
export async function runAhCollect() {
  // Recalcule a chaque invocation — une instance serverless qui reste chaude
  // (cron toutes les minutes) ne doit jamais figer cette date au cold start,
  // sinon scan_date derive silencieusement vers la veille apres minuit UTC.
  const TODAY = new Date().toISOString().split('T')[0]

  // Anti-doublon
  const { data: lock } = await supabase
    .from('cron_locks').select('locked_until').eq('job_name', 'ah_collect').single()
  if (lock?.locked_until && new Date(lock.locked_until) > new Date()) {
    return { message: 'Already running' }
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

    // UPSERT batch avec moyenne glissante via fonction SQL native.
    // Envoi par batch de 500. Parallelise (Promise.all) au lieu d'un for
    // sequentiel -- chaque batch ecrit des variantes disjointes, aucune
    // dependance d'ordre entre eux (optimisation cout Vercel, 17 aout --
    // ah-collect est de loin le cron le plus couteux du projet, ~51h de
    // compute cumule sur 5 jours contre <3h pour tous les autres crons
    // reguliers combines -- toute reduction de duree par run se multiplie
    // par ~1440 runs/jour).
    // Lance en parallele avec fetchSoldAuctions() ci-dessous -- un appel API
    // Hypixel (I/O reseau) n'a aucune dependance avec des ecritures Supabase,
    // aucune raison de les serialiser.
    const bufferUpsertPromise = Promise.all(
      Array.from({ length: Math.ceil(bufferRows.length / 500) }, async (_, chunkIdx) => {
        const i = chunkIdx * 500
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
      })
    )

    // ── Fetch enchères BIN vendues → avg_sold_price par variante ──
    // Kickoff immediat (en parallele du buffer upsert ci-dessus), await plus
    // bas seulement au moment d'en avoir besoin.
    const soldAuctionsPromise = fetchSoldAuctions().catch(e => {
      console.error('Sold auctions fetch error:', e)
      return { auctions: [] as any[] }
    })

    await bufferUpsertPromise

    try {
      const { auctions: soldAuctions } = await soldAuctionsPromise

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

      // Update avg_sold_price dans ah_scan_buffer -- batch RPC (11 aout,
      // optimisation cout Vercel) au lieu d'un .update() sequentiel par
      // variante. Meme semantique UPDATE-only qu'avant (jamais d'INSERT,
      // une ligne sans match dans ah_scan_buffer est un no-op silencieux),
      // juste 1 aller-retour DB au lieu de potentiellement des centaines
      // chaque minute. Voir update_sold_prices_batch_rpc.sql.
      if (soldGroups.size > 0) {
        const soldRows = Array.from(soldGroups.entries()).map(([, { prices, decoded }]) => ({
          base_item_id:   decoded.item_id,
          variant_key:    decoded.variant_key_full,
          avg_sold_price: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
          sold_count:     prices.length,
        }))

        await Promise.all(
          Array.from({ length: Math.ceil(soldRows.length / 500) }, async (_, chunkIdx) => {
            const i = chunkIdx * 500
            const batch = soldRows.slice(i, i + 500)
            const { error } = await supabase.rpc('update_sold_prices_batch', { p_rows: batch })
            if (error) console.error('Sold prices batch update error', i, error)
          })
        )
      }
    } catch (e) {
      console.error('Sold auctions error:', e)
    }

    // 4. Compare avec price_history_ah → TOP 300
    const baseItemIds = [...new Set(bufferRows.map(r => r.base_item_id))]
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0]

    // price_history_ah_variants -- jamais price_history_ah -- un flip n'est
    // jamais scoré contre un historique base/blended qui mélange des
    // variantes différentes (voir plus bas). Chaque ligne de cette table EST
    // déjà l'exact (1 ligne par variant_key par jour), donc pas de filtre
    // granularity ici -- contrairement à price_history_ah qui distingue
    // DAILY (blended) d'un ancien DAILY_EXACT jamais réécrit depuis que
    // price_history_ah_variants existe (bug réel trouvé le 28 juillet :
    // cette requête ciblait encore price_history_ah + granularity=DAILY_EXACT,
    // une combinaison que ah-aggregate n'écrit plus du tout depuis sa
    // reconstruction -- historical restait donc systématiquement vide,
    // hist_precision toujours "none", et ah_live vidé puis réinséré à 0 ligne
    // à chaque run, alors que le buffer lui-même se remplissait normalement).
    // Batché -- un seul .in() avec ~2300+ base_item_id dépasse la limite de
    // longueur d'URL de PostgREST (requête GET), et l'erreur qui en résulte
    // n'était jamais vérifiée : `historical` retombait silencieusement à
    // vide, jamais un throw visible. Bug réel trouvé le 28 juillet en
    // instrumentant le retour (_debug_historical_rows_fetched restait à 0
    // malgré 65k lignes réelles dans la table) -- même famille de bug que le
    // granularity périmé plus haut, cette fois côté requête plutôt que côté
    // schéma.
    // Les deux boucles d'historique (exact + base) sont independantes -- deux
    // tables differentes, aucune donnee partagee entre elles -- et chacune
    // faisait deja ~10-15 aller-retours sequentiels avant cette passe.
    // Parallelisees ensemble (17 aout, optimisation cout Vercel).
    const chunks = (arr: string[], size: number) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

    const [historicalResults, historicalBaseResults] = await Promise.all([
      Promise.all(chunks(baseItemIds, 200).map(async batch => {
        const { data, error } = await supabase
          .from('price_history_ah_variants')
          .select('base_item_id, variant_key, avg_price')
          .in('base_item_id', batch)
          .gte('bucket_date', sevenDaysAgo)
        if (error) { console.error('historical fetch batch error', error.message); return [] }
        return data ?? []
      })),
      Promise.all(chunks(baseItemIds, 200).map(async batch => {
        const { data, error } = await supabase
          .from('price_history_ah_variant_base')
          .select('base_item_id, variant_key_base, avg_price')
          .in('base_item_id', batch)
          .gte('bucket_date', sevenDaysAgo)
        if (error) { console.error('historicalBase fetch batch error', error.message); return [] }
        return data ?? []
      })),
    ])
    const historical: { base_item_id: string; variant_key: string; avg_price: number }[] = historicalResults.flat()
    const historicalBase: { base_item_id: string; variant_key_base: string; avg_price: number }[] = historicalBaseResults.flat()

    const histExact = new Map<string, number[]>()
    for (const h of historical) {
      const k = `${h.base_item_id}::${h.variant_key}`
      if (!histExact.has(k)) histExact.set(k, [])
      histExact.get(k)!.push(Number(h.avg_price))
    }

    // ── Cascade exact→base→blended (Bloc 3.2, audit du 30/31 juillet) ────
    // Avant cette passe, un item sans historique EXACT suffisant (variante
    // rare — ex: Necron's 5★ avec peu de scans à cette combinaison précise
    // d'étoiles/reforge/ultimate) était silencieusement exclu de `relevant`
    // même quand un historique BASE solide existait (même étoiles+recomb,
    // juste le reforge/ultimate/hot potato ignorés) -- un vrai flip
    // exploitable disparaissait du classement sans raison métier.
    // Palier "base" (price_history_ah_variant_base) : même bucket 7 jours,
    // même batching par 200 base_item_id. Palier "blended"
    // (price_history_ah, __all_variants_blended__) calculé aussi pour
    // transparence (hist_precision visible sur chaque item scoré) mais
    // JAMAIS inclus dans `relevant` plus bas -- décision explicite avec
    // l'utilisateur (31 juillet) : comparer une variante précise contre une
    // moyenne qui mélange 0★ bradés et 5★ rares produit un discount_pct
    // trompeur dans les deux sens, l'objectif étant des flips précis entre
    // variantes réellement comparables, pas une couverture maximale au prix
    // de faux signaux.
    // historicalBase deja recupere plus haut, en parallele de historical.
    const histBase = new Map<string, number[]>()
    for (const h of historicalBase) {
      const k = `${h.base_item_id}::${h.variant_key_base}`
      if (!histBase.has(k)) histBase.set(k, [])
      histBase.get(k)!.push(Number(h.avg_price))
    }

    // Palier "blended" retire (11 aout, optimisation cout Vercel) : son
    // resultat n'etait jamais utilise -- le filtre `relevant` plus bas
    // exclut deja explicitement tout item avec hist_precision === 'blended'
    // (voir commentaire Bloc 3.2 ci-dessus, decision du 31 juillet). Ce
    // calcul faisait ~12 requetes Supabase batchees pour rien, chaque
    // minute -- ~17 000 requetes/jour gaspillees. hist_precision retombe
    // desormais directement sur 'none' au lieu de 'blended' quand ni exact
    // ni base ne matchent (seul effet observable : le compteur de
    // diagnostic precisionCounts.blended reste a 0 au lieu de compter ces
    // items -- aucun impact sur `relevant`/`ah_live`, qui les excluait deja).
    const avg = (arr: number[]) => arr.reduce((s, p) => s + p, 0) / arr.length

    // Seuils de pertinence — un flip n'est proposé que s'il est réellement
    // exploitable : comparé à l'historique d'une variante réellement
    // comparable (exact ou base -- jamais blended, voir plus haut), avec un
    // profit absolu et un volume qui prouvent qu'il est vendable, pas juste
    // une enchère isolée à un prix aberrant.
    const MIN_PROFIT_COINS = 500_000
    const MIN_VOLUME       = 3

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
      profit_coins:      number
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

      // Cascade exact→base→blended -- exact (même variant_key_full) toujours
      // préféré ; base (même étoiles+recomb, reforge/ultimate/hot potato
      // ignorés) en second recours quand l'exact n'a pas assez de données ;
      // blended calculé pour transparence mais jamais utilisé pour filtrer
      // `relevant` (voir le commentaire plus haut).
      const exactKey = `${d.item_id}::${d.variant_key_full}`
      const baseKey  = `${d.item_id}::${d.variant_key_base}`
      let histPrice = 0
      let precision: 'exact' | 'base' | 'blended' | 'none' = 'none'
      if (histExact.has(exactKey)) {
        histPrice = avg(histExact.get(exactKey)!)
        precision = 'exact'
      } else if (histBase.has(baseKey)) {
        histPrice = avg(histBase.get(baseKey)!)
        precision = 'base'
      }

      const discountPct = histPrice > 0 ? Math.round(((histPrice - bestPrice) / histPrice) * 100) : 0
      const spreadPct   = avgPrice  > 0 ? Math.round(((avgPrice - bestPrice)  / avgPrice)  * 100) : 0
      const profitCoins = histPrice > 0 ? Math.round(histPrice - bestPrice) : 0

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
        profit_coins:      profitCoins,
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

    // Filtre pertinence : precision exact OU base (jamais blended, voir plus
    // haut) + profit + volume minimums avant même de rentrer dans le
    // classement par catégorie.
    const relevant = scored.filter(item =>
      (item.hist_precision === 'exact' || item.hist_precision === 'base') &&
      item.profit_coins   >= MIN_PROFIT_COINS &&
      item.volume          >= MIN_VOLUME
    )

    // TOP 25 par catégorie (Bloc 3.1, audit du 30/31 juillet) -- aligné sur
    // la vraie cible documentée côté produit plutôt que le cap 50/cat +
    // 300 global précédent, qui pouvait affamer une petite catégorie
    // (confirmé en base avant ce fix : weapon/armor/misc/cosmetic saturaient
    // chacune leur cap à 50 pendant que runes/dyes tombaient à 1 ligne,
    // écrasées par le cap global de 300 appliqué APRÈS le cap par catégorie).
    // Pas de cap global fonctionnel nécessaire avec ~10 catégories réelles
    // (25×10=250) -- TOP_ITEMS_SAFETY_CEILING reste un filet de sécurité pur.
    const byCat = new Map<string, ScoredItem[]>()
    for (const item of relevant) {
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
      topItems.push(...catItems.slice(0, 25))
    }
    topItems.sort((a, b) =>
      (b.discount_pct * 0.6 + b.spread_pct * 0.4) -
      (a.discount_pct * 0.6 + a.spread_pct * 0.4)
    )
    const finalItems = topItems.slice(0, TOP_ITEMS_SAFETY_CEILING)

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

    // 500/lot comme partout ailleurs dans ce fichier (etait 50 -- 10x plus
    // d'aller-retours DB que necessaire pour un TOP_ITEMS_SAFETY_CEILING de
    // 1000 lignes max, optimisation cout Vercel du 17 aout).
    for (let i = 0; i < liveRows.length; i += 500) {
      await supabase.from('ah_live').insert(liveRows.slice(i, i + 500))
    }

    await supabase.from('cron_locks').update({ locked_until: null }).eq('job_name', 'ah_collect')

    const precisionCounts = { exact: 0, base: 0, blended: 0, none: 0 }
    for (const item of scored) precisionCounts[item.hist_precision as keyof typeof precisionCounts]++

    return {
      success:              true,
      total_bin:            binAuctions.length,
      total_pages:          totalPages,
      variants_grouped:     grouped.size,
      buffer_upserted:      bufferRows.length,
      scored_variants:      scored.length,
      scored_precision_breakdown: precisionCounts,
      relevant_after_filter: relevant.length,
      relevant_by_precision: {
        exact: relevant.filter(i => i.hist_precision === 'exact').length,
        base:  relevant.filter(i => i.hist_precision === 'base').length,
      },
      top_items:            finalItems.length,
      top_items_by_category: Array.from(byCat.entries()).map(([cat, items]) => ({ category: cat, count: Math.min(items.length, 25) })),
      relevance_thresholds: { min_profit_coins: MIN_PROFIT_COINS, min_volume: MIN_VOLUME, precision_required: 'exact_or_base' },
    }

  } catch (error: any) {
    await supabase.from('cron_locks').update({ locked_until: null }).eq('job_name', 'ah_collect')
    throw error
  }
}

// ── Handler ───────────────────────────────────────────────────
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const logId = await startSync('ah-collect')
  try {
    const result = await runAhCollect()
    const rows = (result as any).buffer_upserted ?? 0
    await finishSync(logId, 'success', rows, result)
    return NextResponse.json(result)
  } catch (error: any) {
    await finishSync(logId, 'error', 0, undefined, error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── Fetch enchères BIN vendues (prix réels de vente) ─────────
// Bug reel trouve le 30 juillet (audit architectural), diagnostic en 2 passes :
// 1re passe (fausse piste partielle) : l'URL utilisee, /v2/skyblock/auctions/ended,
// renvoyait "400 Missing API-Key header" sans cle, laissant croire que la cle etait
// le seul probleme.
// 2e passe (vraie cause, confirmee par un vrai test reseau direct + recherche de la
// doc Hypixel a jour) : ce chemin n'existe simplement pas. Le vrai endpoint est
// /v2/skyblock/auctions_ended (underscore, pas de slash) -- confirme en direct :
// 200 OK, aucune cle requise (endpoint public, comme /v2/skyblock/auctions), donnees
// reelles retournees. Avec la cle reelle du projet sur l'ANCIEN mauvais chemin,
// Hypixel repondait "404 Unknown endpoint" (le WAF valide d'abord la cle avant meme
// de router — d'ou les messages d'erreur trompeurs a chaque etape du diagnostic).
// L'ancien code ne gerait aucun de ces cas et repartait sur `{ auctions: [] }`
// silencieusement -- confirme en base : 0 ligne avec avg_sold_price > 0 sur 70 910
// lignes recentes de price_history_ah_variants.
async function fetchSoldAuctions(): Promise<{ auctions: any[] }> {
  const res = await fetch('https://api.hypixel.net/v2/skyblock/auctions_ended', {
    headers: { 'API-Key': process.env.HYPIXEL_API_KEY! },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`fetchSoldAuctions failed: HTTP ${res.status} — ${body.slice(0, 300)}`)
    return { auctions: [] }
  }
  const data = await res.json()
  if (!data.success) {
    console.error(`fetchSoldAuctions failed: Hypixel success:false — ${JSON.stringify(data).slice(0, 300)}`)
    return { auctions: [] }
  }
  // Filtre uniquement les BIN
  return { auctions: (data.auctions || []).filter((a: any) => a.bin) }
}