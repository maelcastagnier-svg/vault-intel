// app/api/cron/money-making-agent/route.ts
// Genere les 4 tiers (early/mid/end/late) en 4 appels Claude paralleles pour un developpement max par tier
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TIER_CONFIG = {
  early: { networth: '0-10M', target: '10M coins/hour per category', focus: 'Slayer T1-T2, basic farming, early minions, starter Bazaar flips' },
  mid: { networth: '10-500M', target: '25M coins/hour per category', focus: 'Slayer T3-T4, dungeons F1-F5, mid-tier crafting, Kuudra T1-T2' },
  end: { networth: '500M-5B', target: '40M+ coins/hour per category', focus: 'Slayer T5, dungeons F7/M1-M4, Kuudra T3-T5, high-value AH flips' },
  late: { networth: '5B+', target: '100M+ coins/hour per category', focus: 'Master Mode dungeons, top-tier gear crafting, rare item farming, whale-level flips' }
};

function buildSystemPrompt(tier: string, config: any) {
  return `You are Vault Money Making Agent for the ${tier.toUpperCase()} GAME tier (networth ${config.networth}). Cross-reference bazaar prices, AH prices, crafting costs, and known game mechanics (slayers, dungeons, kuudra, minions, garden) to find the best money-making paths for THIS tier specifically. Target: ${config.target}. Relevant focus areas: ${config.focus}.

Output ONLY [MONEY_MAKING_${tier.toUpperCase()}] in this exact structure:

[MONEY_MAKING_${tier.toUpperCase()}]
### BAZAAR FLIP
| Item | Buy | Sell | Spread | Capital Needed | Confidence |
3 rows. Flips realistically accessible and scalable at this networth tier.

### AH FLIP
| Item | Price Range | Target Profit | Capital Needed | Confidence |
3 rows. AH opportunities matching this tier's typical budget.

### FARMING METHODS
| Method | Coins/Hour | Setup Required | Requirements | Confidence |
4 rows. Cross-reference known mechanics (slayer costs/drops, dungeon loot, kuudra runs, minion production, garden) with current bazaar/AH sell prices to compute REAL coins/hour, not generic claims.

### VAULT EXCLUSIVE
| Method | Coins/Hour | Why This Works | Confidence |
3 rows. Original, non-obvious money-making combos discovered by cross-referencing data others don't combine — not just repeating known guides. Explain the specific price/mechanic correlation that makes it work.

Rules:
- Every coins/hour figure must be computed from real data (item prices × known drop rates or production rates), never invented.
- Never fabricate requirements or setups — base on actual game mechanics data provided.
- If data is insufficient for a confident pick, mark confidence LOW and explain the gap rather than omitting the row.
- Do not add sections or text outside this exact structure.`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: ctx } = await supabase.rpc('get_full_context');

    const bz = (ctx?.bazaar_live || []).map((i: any) => `${i.item_id} b=${i.buy_price} s=${i.sell_price}`).join('\n');
    const ah = (ctx?.ah_live || []).map((i: any) => `${i.item_id} min=${i.min_price} avg=${i.avg_price}`).join('\n');
    const slayers = (ctx?.slayers || []).map((s: any) => `${s.slayer_type} T${s.tier}: cost=${s.coin_cost} drops=${JSON.stringify(s.drops)}`).join('\n');
    const dungeons = (ctx?.dungeons || []).map((d: any) => `${d.floor} ${d.mode}: loot=${JSON.stringify(d.chest_loot)}`).join('\n');
    const kuudra = (ctx?.kuudra || []).map((k: any) => `T${k.tier}: avg_coins=${k.avg_coins_per_run}`).join('\n');
    const moneyMethods = (ctx?.money_methods || []).map((m: any) => `${m.method_name} (${m.category}): ${m.coins_per_hour_min}-${m.coins_per_hour_max}/h`).join('\n');

    const sharedContext = `BAZAAR:\n${bz}\n\nAH:\n${ah}\n\nSLAYERS:\n${slayers}\n\nDUNGEONS:\n${dungeons}\n\nKUUDRA:\n${kuudra}\n\nKNOWN METHODS:\n${moneyMethods}`;

    // Appelle les 4 tiers en parallele
    const tierPromises = Object.entries(TIER_CONFIG).map(async ([tier, config]) => {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system: [{ type: 'text', text: buildSystemPrompt(tier, config), cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: sharedContext }]
        })
      });

      if (!claudeRes.ok) return { tier, error: `${claudeRes.status}` };
      const data = await claudeRes.json();
      return { tier, content: data.content?.[0]?.text || '' };
    });

    const results = await Promise.all(tierPromises);

    for (const result of results) {
      if ('error' in result) continue;
      const section = `money_making_${result.tier}`;

      const { data: old } = await supabase.from('claude_analysis').select('*').eq('section', section).single();
      if (old) {
        await supabase.from('claude_memory').insert({ section, content: old.content, archived_at: new Date().toISOString() });
      }

      await supabase.from('claude_analysis').upsert({ section, content: result.content, updated_at: new Date().toISOString() }, { onConflict: 'section' });
    }

    return NextResponse.json({ status: 'done', results: results.map(r => ({ tier: r.tier, success: !('error' in r) })) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}