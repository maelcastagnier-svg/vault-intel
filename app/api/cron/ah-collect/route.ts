// app/api/cron/ah-collect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractVariantFromName } from '../../../../lib/text-variant-extractor';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Protection anti-chevauchement
  const { data: lock } = await supabase.from('cron_locks').select('*').eq('job_name', 'ah_collect').single();
  if (lock && lock.locked_until && new Date(lock.locked_until) > new Date()) {
    return NextResponse.json({ status: 'skipped', reason: 'already running' });
  }
  await supabase.from('cron_locks').upsert({
    job_name: 'ah_collect',
    locked_until: new Date(Date.now() + 55000).toISOString()
  });

  const runs: any[] = [];

  try {
    // PASSE 1 — scan immediat
    runs.push(await scanAndSave());

    // Attend 30s pour un vrai rafraichissement dans la meme execution
    await new Promise(r => setTimeout(r, 30000));

    // PASSE 2 — deuxieme scan, 30s plus frais
    runs.push(await scanAndSave());

    await supabase.from('cron_locks').update({ locked_until: null }).eq('job_name', 'ah_collect');
    return NextResponse.json({ status: 'done', runs });
  } catch (e: any) {
    await supabase.from('cron_locks').update({ locked_until: null }).eq('job_name', 'ah_collect');
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function scanAndSave() {
  const firstPage = await fetch('https://api.hypixel.net/v2/skyblock/auctions?page=0').then(r => r.json());
  const totalPages = Math.min(firstPage.totalPages || 1, 50);
  const nowIso = new Date().toISOString();

  const itemGroups: Record<string, { prices: number[]; displayName: string; bestUuid: string; bestPrice: number; baseItemId: string; variantKey: string; totalStars: number; recombobulated: boolean }> = {};

  const processPage = (pageData: any) => {
    for (const auc of (pageData.auctions || [])) {
      if (auc.bin !== true) continue;
      if (!auc.starting_bid || auc.starting_bid <= 0) continue;
      if (!auc.item_name || !auc.uuid) continue;

      const variant = extractVariantFromName(auc.item_name);
      const cleanBaseName = variant.baseName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
      if (!cleanBaseName) continue;

      const groupKey = `${cleanBaseName}__${variant.variantKey}`;

      if (!itemGroups[groupKey]) {
        itemGroups[groupKey] = {
          prices: [], displayName: auc.item_name, bestUuid: auc.uuid, bestPrice: auc.starting_bid,
          baseItemId: cleanBaseName, variantKey: variant.variantKey, totalStars: variant.totalStars, recombobulated: variant.recombobulated
        };
      }
      itemGroups[groupKey].prices.push(auc.starting_bid);
      if (auc.starting_bid < itemGroups[groupKey].bestPrice) {
        itemGroups[groupKey].bestUuid = auc.uuid;
        itemGroups[groupKey].bestPrice = auc.starting_bid;
      }
    }
  };

  processPage(firstPage);

  const BATCH = 8;
  for (let start = 1; start < totalPages; start += BATCH) {
    const end = Math.min(start + BATCH, totalPages);
    const promises = [];
    for (let i = start; i < end; i++) {
      promises.push(fetch(`https://api.hypixel.net/v2/skyblock/auctions?page=${i}`).then(r => r.json()).catch(() => null));
    }
    const results = await Promise.all(promises);
    for (const pageData of results) if (pageData) processPage(pageData);
  }

  const rows: any[] = [];
  const priceHistoryRows: any[] = [];

  // Recupere les moyennes 1j/semaine/mois pour tous les items en une seule requete
  const { data: bulkAverages } = await supabase.rpc('get_bulk_price_averages');
  const avgMap: Record<string, { value: number; points: number; timeframe: string }> = {};
  for (const a of (bulkAverages || [])) {
    // Priorise le mois (plus stable) si assez de points, sinon semaine, sinon jour
    if (a.avg_month && a.points_month >= 15) {
      avgMap[a.item_id] = { value: a.avg_month, points: a.points_month, timeframe: 'month' };
    } else if (a.avg_week && a.points_week >= 8) {
      avgMap[a.item_id] = { value: a.avg_week, points: a.points_week, timeframe: 'week' };
    } else if (a.avg_1d && a.points_1d >= 3) {
      avgMap[a.item_id] = { value: a.avg_1d, points: a.points_1d, timeframe: 'day' };
    }
  }

  for (const [groupKey, group] of Object.entries(itemGroups)) {
    if (group.prices.length < 3) continue;

    const sorted = [...group.prices].sort((a, b) => a - b);
    const liveMedian = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    if (isNaN(min) || isNaN(max) || isNaN(liveMedian) || liveMedian <= 0) continue;

    // Reference intemporelle basee sur le groupe complet (base item + variante), pas juste le nom brut
    const ref = avgMap[groupKey];
    const reference = ref ? ref.value : liveMedian;

    const spreadPct = ((reference - min) / reference) * 100;
    if (spreadPct > 150 || spreadPct < 5) continue;

    priceHistoryRows.push({
      item_id: groupKey, item_name: group.displayName, source: 'AH',
      buy_price: min, sell_price: max, avg_price: Math.round(reference),
      volume: group.prices.length, timestamp: nowIso
    });

    rows.push({
      item_id: groupKey, item_name: group.displayName,
      min_price: min, avg_price: Math.round(reference), max_price: max,
      volume: group.prices.length, timestamp: nowIso, created_at: nowIso,
      best_auction_uuid: group.bestUuid,
      base_item_id: group.baseItemId,
      variant_key: group.variantKey,
      total_stars: group.totalStars
    });
  }

  rows.sort((a, b) => (b.avg_price - b.min_price) - (a.avg_price - a.min_price));
  const top50 = rows.slice(0, 50);

  await supabase.from('ah_4h').delete().not('item_id', 'is', null);
  let inserted = 0;
  if (top50.length > 0) {
    const { error } = await supabase.from('ah_4h').insert(top50);
    if (!error) inserted = top50.length;
  }

  let phInserted = 0;
  for (let i = 0; i < priceHistoryRows.length; i += 500) {
    const chunk = priceHistoryRows.slice(i, i + 500);
    const { error } = await supabase.from('price_history').insert(chunk);
    if (!error) phInserted += chunk.length;
  }

  return { ah_4h_inserted: inserted, price_history_inserted: phInserted, pagesScanned: totalPages, timestamp: nowIso };
}