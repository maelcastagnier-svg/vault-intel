// app/api/cron/patch-collect/route.ts
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
    const rssRes = await fetch('https://hypixel.net/forums/skyblock-patch-notes.158/index.rss', {
      headers: { 'User-Agent': 'VaultBot/1.0' }
    }).then(r => r.text());

    const items: any[] = [];
    const itemBlocks = rssRes.split('<item>').slice(1);

    for (const block of itemBlocks.slice(0, 10)) {
      const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s) || block.match(/<title>(.*?)<\/title>/s);
      const descMatch = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s) || block.match(/<description>(.*?)<\/description>/s);
      const linkMatch = block.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/);

      if (!titleMatch || !titleMatch[1]?.trim()) continue;
      const title = titleMatch[1].trim().substring(0, 300);

      items.push({
        source: 'patch',
        title,
        content: (descMatch?.[1] || '').replace(/<[^>]*>/g, '').trim().substring(0, 800),
        link: linkMatch?.[1] || '',
        published_at: pubDateMatch?.[1] || new Date().toISOString(),
        created_at: new Date().toISOString()
      });
    }

    let inserted = 0;
    let skipped = 0;

    for (const item of items) {
      const { data: existing } = await supabase
        .from('game_knowledge')
        .select('id')
        .eq('title', item.title)
        .limit(1);

      if (existing && existing.length > 0) { skipped++; continue; }

      const { error } = await supabase.from('game_knowledge').insert(item);
      if (!error) inserted++;
    }

    return NextResponse.json({ status: 'done', inserted, skipped, totalFetched: items.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}