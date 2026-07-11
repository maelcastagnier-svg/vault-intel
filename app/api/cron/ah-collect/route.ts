// app/api/cron/ah-collect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

  // Protection anti-chevauchement — verifie qu'aucune execution n'est deja en cours
  const { data: lock } = await supabase.from('cron_locks').select('*').eq('job_name', 'ah_collect').single();
  if (lock && lock.locked_until && new Date(lock.locked_until) > new Date()) {
    return NextResponse.json({ status: 'skipped', reason: 'already running' });
  }
  await supabase.from('cron_locks').upsert({
    job_name: 'ah_collect',
    locked_until: new Date(Date.now() + 55000).toISOString()
  });

  try {
    const firstPage = await fetch('https://api.hypixel.net/v2/skyblock/auctions?page=0').then(r => r.json());
    const totalPages = Math.min(firstPage.totalPages || 1, 50);
    const nowIso = new Date().toISOString();

    const itemGroups: Record<string, { prices: number[]; displayName: string; bestUuid: string; bestPrice: number }> = {};

    const processPage = (pageData: any) => {
      for (const auc of (pageData.auctions || [])) {
        if (auc.bin !== true) continue;
        if (!auc.starting_bid || auc.starting_bid <= 0) continue;
        if (!auc.item_name || !auc.uuid) continue;
        const itemName = auc.item_name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
        if (!itemName) continue;
        if (!itemGroups[itemName]) {
          itemGroups[itemName] = { prices: [], displayName: auc.item_name, bestUuid: auc.uuid, bestPrice: auc.starting_bid };
        }
        itemGroups[itemName].prices.push(auc.starting_bid);
        if (auc.starting_bid < itemGroups[itemName].bestPrice) {
          itemGroups[itemName].bestUuid = auc.uuid;
          itemGroups[itemName].bestPrice = auc.starting_bid;
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

    for (const [itemId, group] of Object.entries(itemGroups)) {
      if (group.prices.length < 2) continue;
      const min = Math.min(...group.prices);
      const max = Math.max(...group.prices);
      const avg = group.prices.reduce((a, b) => a + b, 0) / group.prices.length;
      if (isNaN(min) || isNaN(max) || isNaN(avg)) continue;

      priceHistoryRows.push({
        item_id: itemId, item_name: group.displayName, source: 'AH',
        buy_price: min, sell_price: max, avg_price: Math.round(avg),
        volume: group.prices.length, timestamp: nowIso
      });

      rows.push({
        item_id: itemId, item_name: group.displayName,
        min_price: min, avg_price: Math.round(avg), max_price: max,
        volume: group.prices.length, timestamp: nowIso, created_at: nowIso,
        best_auction_uuid: group.bestUuid
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

    await supabase.from('cron_locks').update({ locked_until: null }).eq('job_name', 'ah_collect');

    return NextResponse.json({ status: 'done', ah_4h_inserted: inserted, price_history_inserted: phInserted, pagesScanned: totalPages });
  } catch (e: any) {
    await supabase.from('cron_locks').update({ locked_until: null }).eq('job_name', 'ah_collect');
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}