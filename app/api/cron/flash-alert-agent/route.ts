// app/api/cron/flash-alerts-agent/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SYSTEM_PROMPT = `You are Vault Flash Agent. Cross-reference price_history (7d/30d trends), bazaar live prices, AH live prices, and recent patches to find the best REAL, ACTIONABLE flips right now. Output ONLY [FLASH_ALERTS] — no extra commentary, no deviation from the exact format below.

CRITICAL RULE: Every AH row MUST include the exact uuid value from the AH LIVE data. Copy it character-for-character. If uuid=none, write "none".

CRITICAL — REALISM CHECK before recommending any AH flip:
- avg_price and max_price from a single low-volume snapshot are UNRELIABLE. If only 2-3 auctions exist for an item, the "average" can be skewed by one overpriced outlier listing that will never actually sell.
- price_history entries show a "points=" count (data points collected over 30 days). Fewer than 5 points = LOW statistical confidence, treat the trend as unconfirmed. 5-20 points = MEDIUM confidence. 20+ points = HIGH confidence, safe to trust the trend.
- Never recommend a relist_at price near max_price or avg_price unless price_history 7d/30d data confirms that price level is a REAL, RECURRING trading range, not a one-off outlier — and confirm this using the points= count, not just the number itself.
- Prefer relist targets close to the median/typical range seen in price_history over the raw single-snapshot average.
- If you cannot verify the relist price is realistic, lower your confidence to MEDIUM or LOW and say so explicitly in the reason, or exclude the item.
- A "profit" of several times the buy price is a red flag, not a good sign — flag it as UNVERIFIED/LOW confidence unless price_history explicitly confirms that range trades regularly with sufficient data points.

[FLASH_ALERTS]
### BAZAAR FLIP
| Item | Buy | Sell | Spread | Action | Confidence |
Exactly 5 rows. Only items with sustained spread confirmed by 7d/30d trend. Real volume required.

### AH FLIP — SHORT TERM
| Item | UUID | Snipe Below | Relist At | Profit | Confidence | Reason |
Exactly 5 rows minimum. Relist At must be realistic, cite price_history support.

### AH FLIP — MID TERM
| Item | UUID | Current Range | Target Entry | Est. Profit | Confidence | Reason |
Exactly 3 rows minimum. Based on 7d/30d trend and patch impact.

Rules:
- Cross-check every pick against recent patches: exclude anything recently nerfed or flooded with supply.
- Never fabricate a UUID. Use exactly what is provided, or "none".
- If fewer strong candidates exist than the minimum row count, include the best available rather than leaving rows empty.
- Do not add sections, headers, or text outside this exact structure.`;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Recupere le contexte via la fonction Supabase existante
    const { data: ctx } = await supabase.rpc('get_full_context');

    const bz = (ctx?.bazaar_live || []).map((i: any) =>
      `${i.item_id} b=${i.buy_price} s=${i.sell_price} sp=${i.spread_pct}%`
    ).join('\n');

    const ah = (ctx?.ah_live || []).map((i: any) =>
      `${i.item_id} min=${i.min_price} avg=${i.avg_price} max=${i.max_price} uuid=${i.best_auction_uuid || 'none'}`
    ).join('\n');

    const pr = (ctx?.price_summary || []).slice(0, 40).map((i: any) =>
      `${i.item_id} 7d=${Math.round(i.avg_7d || 0)} 30d=${Math.round(i.avg_30d || 0)} ${i.trend} vol=${Math.round(i.volatility || 0)} points=${i.data_points_30d || 0}`
    ).join('\n');

    const patches = (ctx?.knowledge || []).slice(0, 5).map((k: any) =>
      `${k.title}: ${(k.content || '').substring(0, 150)}`
    ).join('\n');

    const userContent = `BAZAAR LIVE:\n${bz}\n\nAH LIVE:\n${ah}\n\nPRICE TRENDS (7d/30d):\n${pr}\n\nRECENT PATCHES:\n${patches}`;

    // 2. Appelle Claude directement
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return NextResponse.json({ error: `Claude API failed: ${claudeRes.status}`, detail: errText.substring(0, 300) }, { status: 502 });
    }

    const claudeData = await claudeRes.json();
    const content = claudeData.content?.[0]?.text || '';

    // 3. Archive l'ancienne analyse, sauvegarde la nouvelle
    const { data: oldAnalysis } = await supabase
      .from('claude_analysis')
      .select('*')
      .eq('section', 'flash_alerts')
      .single();

    if (oldAnalysis) {
      await supabase.from('claude_memory').insert({
        section: 'flash_alerts',
        content: oldAnalysis.content,
        archived_at: new Date().toISOString()
      });
    }

    await supabase.from('claude_analysis').upsert({
      section: 'flash_alerts',
      content,
      updated_at: new Date().toISOString()
    }, { onConflict: 'section' });

    return NextResponse.json({ status: 'done', contentLength: content.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}