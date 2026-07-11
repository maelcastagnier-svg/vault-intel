// app/api/cron/bazaar-collect/route.ts
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

  try {
    const bazaarRes = await fetch('https://api.hypixel.net/v2/skyblock/bazaar').then(r => r.json());
    const products = bazaarRes.products || {};
    const rows: any[] = [];
    const priceHistoryRows: any[] = [];
    const nowIso = new Date().toISOString();

    for (const [itemId, data] of Object.entries(products) as [string, any][]) {
      const buyPrice = data.quick_status?.buyPrice;
      const sellPrice = data.quick_status?.sellPrice;
      if (buyPrice == null || buyPrice <= 0 || sellPrice == null || sellPrice <= 0) continue;

      const volume = (data.quick_status?.buyVolume || 0) + (data.quick_status?.sellVolume || 0);
      priceHistoryRows.push({
        item_id: itemId, item_name: itemId.replace(/_/g, ' '), source: 'BAZAAR',
        buy_price: buyPrice, sell_price: sellPrice, avg_price: (buyPrice + sellPrice) / 2,
        volume, timestamp: nowIso
      });

      const spreadRaw = buyPrice - sellPrice;
      const spreadPct = (spreadRaw / buyPrice) * 100;
      if (isNaN(spreadPct) || spreadPct < 10 || spreadPct > 80 || volume < 500000 || buyPrice < 500) continue;

      rows.push({
        item_id: itemId, buy_price: buyPrice, sell_price: sellPrice,
        spread: Math.round(spreadRaw * 100) / 100, spread_pct: Math.round(spreadPct * 10) / 10,
        volume, created_at: nowIso
      });
    }

    rows.sort((a, b) => b.spread_pct - a.spread_pct);
    const top20 = rows.slice(0, 20);

    await supabase.from('bazaar_1h').delete().not('item_id', 'is', null);
    let inserted = 0;
    if (top20.length > 0) {
      const { error } = await supabase.from('bazaar_1h').insert(top20);
      if (!error) inserted = top20.length;
    }

    let phInserted = 0;
    for (let i = 0; i < priceHistoryRows.length; i += 500) {
      const chunk = priceHistoryRows.slice(i, i + 500);
      const { error } = await supabase.from('price_history').insert(chunk);
      if (!error) phInserted += chunk.length;
    }

    return NextResponse.json({ status: 'done', bazaar_1h_inserted: inserted, price_history_inserted: phInserted });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}