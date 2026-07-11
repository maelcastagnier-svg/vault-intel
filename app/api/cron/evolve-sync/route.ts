// app/api/cron/evolve-sync/route.ts
// Sync Evolve — calculs joueur en JS/SQL pur + 1 seul appel Claude pour le jugement
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SKILL_XP_TABLE_50 = [0,50,175,375,675,1175,1925,2925,4425,6425,9925,14925,22425,32425,47425,67425,97425,147425,222425,322425,522425,822425,1222425,1722425,2322425,3022425,3822425,4722425,5722425,6822425,8022425,9322425,10722425,12222425,13822425,15522425,17322425,19222425,21222425,23322425,25522425,27822425,30222425,32722425,35322425,38072425,40972425,44072425,47472425,51172425];

function calcSkillLevel(xp: number): { level: number; progress: number } {
  for (let i = SKILL_XP_TABLE_50.length - 1; i >= 0; i--) {
    if (xp >= SKILL_XP_TABLE_50[i]) {
      const nextReq = SKILL_XP_TABLE_50[i + 1] || SKILL_XP_TABLE_50[i];
      const progress = nextReq > SKILL_XP_TABLE_50[i] ? Math.round(((xp - SKILL_XP_TABLE_50[i]) / (nextReq - SKILL_XP_TABLE_50[i])) * 100) : 100;
      return { level: i, progress };
    }
  }
  return { level: 0, progress: 0 };
}

async function calculateSenitherWeight(skills: Record<string, number>, catacombsLevel: number) {
  const { data: formulas } = await supabase.from('weight_formulas').select('*').eq('formula_system', 'senither');
  if (!formulas) return 0;

  let totalWeight = 0;
  for (const f of formulas) {
    if (f.category === 'skills' && skills[f.sub_key] !== undefined) {
      const xp = skills[f.sub_key];
      totalWeight += Math.pow(xp / f.param2, f.param1) / 10;
    }
    if (f.category === 'dungeons' && f.sub_key === 'catacombs') {
      totalWeight += Math.pow(catacombsLevel, 2) * f.param1;
    }
  }
  return Math.round(totalWeight);
}

function generateSetupRoute(skills: Record<string, { level: number }>, stage: string, unlocks: any[]) {
  const KEY_AREAS = ['farming', 'mining', 'combat', 'foraging', 'fishing'];
  const priorityOrder: Record<string, number> = { early: 1, mid: 2, end: 3, late: 4 };
  const route = [];

  for (const area of KEY_AREAS) {
    const currentLevel = skills[area]?.level || 0;
    const areaUnlocks = unlocks.filter(u => u.skill_name === area && u.level > currentLevel).sort((a, b) => a.level - b.level);
    if (areaUnlocks.length === 0) continue;

    const next = areaUnlocks[0];
    const isBehind = priorityOrder[next.tier] <= priorityOrder[stage];
    route.push({
      skill_or_area: area.charAt(0).toUpperCase() + area.slice(1),
      current_level: currentLevel,
      next_milestone_level: next.level,
      unlocks_at_milestone: next.unlocks,
      priority: isBehind ? 'high' : (next.tier === stage ? 'medium' : 'low')
    });
  }

  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  route.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  return route.slice(0, 6);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: players } = await supabase.from('player_data').select('*');
    if (!players || players.length === 0) {
      return NextResponse.json({ status: 'no_players' });
    }

    const results = [];

    for (const player of players) {
      try {
        const uuidRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${player.hypixel_username}`).then(r => r.json());
        const uuid = uuidRes.id;

        const hypixelRes = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}&key=${process.env.HYPIXEL_API_KEY}`).then(r => r.json());
        const activeProfile = hypixelRes.profiles?.find((p: any) => p.selected);
        const member = activeProfile?.members?.[uuid.replace(/-/g, '')];
        if (!member) continue;

        const skillsRaw = member.player_data?.experience || {};
        const skillsDetailed: Record<string, any> = {};
        const skillXpValues: Record<string, number> = {};

        for (const [key, xp] of Object.entries(skillsRaw)) {
          const skillName = key.replace('SKILL_', '').toLowerCase();
          const { level, progress } = calcSkillLevel(xp as number);
          skillsDetailed[skillName] = { level, progress, xp };
          skillXpValues[skillName] = xp as number;
        }

        const catacombsXp = member.dungeons?.dungeon_types?.catacombs?.experience || 0;
        const catacombsLevel = calcSkillLevel(catacombsXp).level;
        const purse = member.currencies?.coin_purse || 0;
        const bank = activeProfile?.banking?.balance || 0;
        const networthEstimate = purse + bank;

        const weight = await calculateSenitherWeight(skillXpValues, catacombsLevel);

        const stage = networthEstimate < 10000000 ? 'early' : networthEstimate < 500000000 ? 'mid' : networthEstimate < 5000000000 ? 'end' : 'late';

        const { data: unlocks } = await supabase.from('skill_unlocks').select('*');
        const setupRoute = generateSetupRoute(skillsDetailed, stage, unlocks || []);

        // 1 SEUL appel Claude pour le jugement (resume + actions prioritaires + money making personnalise)
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            system: [{ type: 'text', text: `You are Vault Evolve Agent. Analyze this player's real profile and produce: (1) a concise summary of strengths/weaknesses, (2) priority actions grouped by category, (3) 2-3 personalized money-making suggestions based on their actual skill levels and stage. Output as JSON: {"summary":"...","priority_actions":[{"category":"...","actions":[{"title":"...","reason":"...","impact":"..."}]}],"personalized_money_making":[{"method":"...","coins_per_hour":"...","why_now":"..."}]}`, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: `Stage: ${stage}, Weight: ${weight}, Networth: ${networthEstimate}, Skills: ${JSON.stringify(skillsDetailed)}, Catacombs: ${catacombsLevel}` }]
          })
        });

        let claudeAnalysis: any = {};
        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          try { claudeAnalysis = JSON.parse(claudeData.content?.[0]?.text || '{}'); } catch (e) {}
        }

        await supabase.from('player_data').update({
          networth: networthEstimate,
          game_stage: stage,
          raw_profile: {
            skills_detailed: skillsDetailed,
            catacombs_level: catacombsLevel,
            senither_weight: weight,
            setup_route: setupRoute,
            evolve_summary: claudeAnalysis.summary || '',
            priority_actions_by_category: claudeAnalysis.priority_actions || [],
            personalized_money_making: claudeAnalysis.personalized_money_making || []
          },
          updated_at: new Date().toISOString()
        }).eq('id', player.id);

        results.push({ player: player.hypixel_username, status: 'success', stage, weight });
      } catch (e: any) {
        results.push({ player: player.hypixel_username, status: 'error', message: e.message });
      }
    }

    return NextResponse.json({ status: 'done', results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}