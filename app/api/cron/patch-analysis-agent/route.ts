// app/api/cron/patch-analysis-agent/route.ts
// Genere Patch Analysis (avec memoire predictive insight_patch) + Radar en 2 appels paralleles
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PATCH_SYSTEM_PROMPT = `You are Vault Patch Analysis Agent. You have access to your own past predictions (insight_patch table) — use them to check if past predictions were confirmed or contradicted by what actually happened, and note this explicitly.

Cover the most recent LIVE patch not yet fully analyzed, plus one upcoming Alpha/PTL patch if available.

Output ONLY [PATCH_ANALYSIS] in this structure:

[PATCH_ANALYSIS]
## LIVE
### [Patch Title]
- Summary of key economic/mechanic changes
- Items/methods directly affected (buffed, nerfed, new)
- Market impact prediction (which items will rise/fall in value and why)
- If this patch relates to a past prediction you made, state whether it was CONFIRMED or CONTRADICTED

Alpha Upcoming
### [Alpha Patch Title]
- What's being tested, expected live release impact
- Early market positioning opportunities before it goes live

At the end, include a machine-readable block:
[PATCH_DETAILS]
{"patch_title": "...", "revision_of": null, "predictions": [{"item_id": "...", "predicted_direction": "up|down", "confidence": "high|medium|low", "reasoning": "..."}]}

Rules: Base predictions on real economic mechanisms (supply/demand shifts, new content driving demand, nerfs reducing droprates), not speculation. Cite specific items when possible.`;

const RADAR_SYSTEM_PROMPT = `You are Vault Radar Agent. Provide a long-term economic radar — items and methods with sustained momentum, not momentary noise. Cross-reference price trends, patch impacts, and known money-making methods.

Output ONLY [RADAR] in this structure:

[RADAR]
### RISING
| Item/Method | Trend | Why | Time Horizon |
5 rows. Items/methods gaining value or relevance, with a real mechanism explaining why (patch-driven demand, supply reduction, meta shift).

### FALLING
| Item/Method | Trend | Why | Time Horizon |
5 rows. Items/methods losing value or relevance.

### STABLE HIGH-VALUE ("Marble Pillars")
| Item/Method | Why It's Stable | Reliability |
3 rows. Items/methods with consistently strong, unchanging value — reliable long-term holds or income sources.

Rules: Every entry must cite a real mechanism (patch reference, trend data, mechanic change), never generic hype language. If the market shows no strong signal, say so honestly rather than inventing one.`;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: ctx } = await supabase.rpc('get_full_context');

    const { data: pastPredictions } = await supabase
      .from('insight_patch')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    const pr = (ctx?.price_summary || []).slice(0, 40).map((i: any) =>
      `${i.item_id} 7d=${Math.round(i.avg_7d || 0)} 30d=${Math.round(i.avg_30d || 0)} ${i.trend}`
    ).join('\n');

    const patches = (ctx?.knowledge || []).slice(0, 8).map((k: any) =>
      `${k.title}: ${(k.content || '').substring(0, 300)}`
    ).join('\n\n');

    const pastPredictionsText = (pastPredictions || []).map((p: any) =>
      `${p.patch_title}: ${JSON.stringify(p.predictions)}`
    ).join('\n');

    const patchUserContent = `RECENT PATCHES:\n${patches}\n\nYOUR PAST PREDICTIONS:\n${pastPredictionsText}\n\nPRICE TRENDS:\n${pr}`;
    const radarUserContent = `PRICE TRENDS (7d/30d):\n${pr}\n\nRECENT PATCHES:\n${patches}`;

    const [patchRes, radarRes] = await Promise.all([
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 3000,
          system: [{ type: 'text', text: PATCH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: patchUserContent }]
        })
      }),
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 2000,
          system: [{ type: 'text', text: RADAR_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: radarUserContent }]
        })
      })
    ]);

    const patchData = patchRes.ok ? await patchRes.json() : null;
    const radarData = radarRes.ok ? await radarRes.json() : null;
    const patchContent = patchData?.content?.[0]?.text || '';
    const radarContent = radarData?.content?.[0]?.text || '';

    // Sauvegarde Patch Analysis
    if (patchContent) {
      const { data: old } = await supabase.from('claude_analysis').select('*').eq('section', 'patch_analysis').single();
      if (old) await supabase.from('claude_memory').insert({ section: 'patch_analysis', content: old.content, archived_at: new Date().toISOString() });
      await supabase.from('claude_analysis').upsert({ section: 'patch_analysis', content: patchContent, updated_at: new Date().toISOString() }, { onConflict: 'section' });

      // Extrait le bloc PATCH_DETAILS et l'insere dans insight_patch pour la memoire predictive
      const detailsMatch = patchContent.match(/\[PATCH_DETAILS\]\s*({[\s\S]*})/);
      if (detailsMatch) {
        try {
          const details = JSON.parse(detailsMatch[1]);
          await supabase.from('insight_patch').insert({
            patch_title: details.patch_title,
            revision_of: details.revision_of,
            predictions: details.predictions,
            created_at: new Date().toISOString()
          });
        } catch (e) {}
      }
    }

    // Sauvegarde Radar
    if (radarContent) {
      const { data: old } = await supabase.from('claude_analysis').select('*').eq('section', 'radar').single();
      if (old) await supabase.from('claude_memory').insert({ section: 'radar', content: old.content, archived_at: new Date().toISOString() });
      await supabase.from('claude_analysis').upsert({ section: 'radar', content: radarContent, updated_at: new Date().toISOString() }, { onConflict: 'section' });
    }

    return NextResponse.json({ status: 'done', patchSuccess: !!patchContent, radarSuccess: !!radarContent });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}