// Temp debug route -- Bloc 4 (audit 8 blocs), fills the 11 Milestones axes
// that have real computeMilestones() support (30 juillet batch) but zero
// milestone_tasks rows referencing them. All target values below are
// pre-computed from verified real sources (see CLAUDE.md Bloc 4 section) --
// Haiku is used ONLY to write task_title/label/category copy from this
// already-fixed data, never to invent a threshold. Deleted after validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Row = {
  tier: string
  task_key: string
  requirement: Record<string, any>
  // Hints given to Haiku for copy generation -- never a number Haiku invents itself.
  hint: string
  calibration_note?: string
}

// ── LOT 1 — Boss kills (Kuudra/Arachne/Dragon) + Essence (7 remaining types) ──
// Kuudra 5 tiers confirmed via internal wiki cache (kuudra_teeth page table:
// Basic/Hot/Burning/Fiery/Infernal); real API keys none/hot/burning/fiery/infernal.
// Dragon 7 variants confirmed via our own wiki-scraped milestone_tasks rows
// (Young/Old/Protector/Strong/Superior/Unstable/Wise -- "Slay Dragons" category).
// Essence target=1 mirrors the existing Crimson vault task exactly (no target
// in requirement -> computeMilestones defaults to 1, "has used this essence").
const LOT1: Row[] = [
  { tier: 'Skilled',  task_key: 'kuudra_none',     requirement: { type: 'boss_kill', boss: 'kuudra', tier: 'none', target: 1 },    hint: 'Defeat Kuudra Tier 1 (Basic) at least once' },
  { tier: 'Skilled',  task_key: 'kuudra_hot',      requirement: { type: 'boss_kill', boss: 'kuudra', tier: 'hot', target: 1 },     hint: 'Defeat Kuudra Tier 2 (Hot) at least once' },
  { tier: 'Expert',   task_key: 'kuudra_burning',  requirement: { type: 'boss_kill', boss: 'kuudra', tier: 'burning', target: 1 }, hint: 'Defeat Kuudra Tier 3 (Burning) at least once' },
  { tier: 'Expert',   task_key: 'kuudra_fiery',    requirement: { type: 'boss_kill', boss: 'kuudra', tier: 'fiery', target: 1 },   hint: 'Defeat Kuudra Tier 4 (Fiery) at least once' },
  { tier: 'Master',   task_key: 'kuudra_infernal', requirement: { type: 'boss_kill', boss: 'kuudra', tier: 'infernal', target: 1 }, hint: 'Defeat Kuudra Tier 5 (Infernal), the hardest tier, at least once' },
  { tier: 'Amateur',  task_key: 'arachne',         requirement: { type: 'boss_kill', boss: 'arachne' }, hint: 'Defeat Arachne, the Spider\'s Den boss' },
  { tier: 'Intermediate', task_key: 'dragon_young',     requirement: { type: 'boss_kill', boss: 'dragon', variant: 'young' },     hint: 'Slay the Young Ender Dragon (easiest dragon variant)' },
  { tier: 'Intermediate', task_key: 'dragon_old',       requirement: { type: 'boss_kill', boss: 'dragon', variant: 'old' },       hint: 'Slay the Old Ender Dragon' },
  { tier: 'Skilled',      task_key: 'dragon_protector', requirement: { type: 'boss_kill', boss: 'dragon', variant: 'protector' }, hint: 'Slay the Protector Ender Dragon' },
  { tier: 'Skilled',      task_key: 'dragon_strong',    requirement: { type: 'boss_kill', boss: 'dragon', variant: 'strong' },    hint: 'Slay the Strong Ender Dragon' },
  { tier: 'Expert',       task_key: 'dragon_wise',      requirement: { type: 'boss_kill', boss: 'dragon', variant: 'wise' },      hint: 'Slay the Wise Ender Dragon' },
  { tier: 'Expert',       task_key: 'dragon_unstable',  requirement: { type: 'boss_kill', boss: 'dragon', variant: 'unstable' },  hint: 'Slay the Unstable Ender Dragon' },
  { tier: 'Master',       task_key: 'dragon_superior',  requirement: { type: 'boss_kill', boss: 'dragon', variant: 'superior' },  hint: 'Slay the Superior Ender Dragon, the hardest dragon variant' },
  { tier: 'Intermediate', task_key: 'essence_diamond', requirement: { type: 'essence_amount', essence_type: 'DIAMOND' }, hint: 'Use the Diamond Essence Shop' },
  { tier: 'Intermediate', task_key: 'essence_dragon',  requirement: { type: 'essence_amount', essence_type: 'DRAGON' },  hint: 'Use the Dragon Essence Shop' },
  { tier: 'Intermediate', task_key: 'essence_spider',  requirement: { type: 'essence_amount', essence_type: 'SPIDER' },  hint: 'Use the Spider Essence Shop' },
  { tier: 'Intermediate', task_key: 'essence_gold',    requirement: { type: 'essence_amount', essence_type: 'GOLD' },    hint: 'Use the Gold Essence Shop' },
  { tier: 'Expert',       task_key: 'essence_wither',  requirement: { type: 'essence_amount', essence_type: 'WITHER' },  hint: 'Use the Wither Essence Shop' },
  { tier: 'Expert',       task_key: 'essence_undead',  requirement: { type: 'essence_amount', essence_type: 'UNDEAD' },  hint: 'Use the Undead Essence Shop' },
  { tier: 'Expert',       task_key: 'essence_ice',     requirement: { type: 'essence_amount', essence_type: 'ICE' },     hint: 'Use the Ice Essence Shop' },
]

// ── LOT 2 — Slayer claimed levels (real, pre-computed by Hypixel -- only
// bosses/levels with directly-observed real claimed_levels keys on Cucumber,
// Blaze/Vampire skipped, zero real data to confirm their level-key names) +
// Jacob's medals (real medal rarities, target=1 = safe "first one" pattern,
// same as jacob_contest_participation's existing default) ──
const LOT2: Row[] = [
  { tier: 'Amateur',      task_key: 'zombie_lvl2', requirement: { type: 'slayer_claimed_level', boss: 'zombie', level: 2 }, hint: 'Claim Zombie Slayer Level 2' },
  { tier: 'Intermediate', task_key: 'zombie_lvl4', requirement: { type: 'slayer_claimed_level', boss: 'zombie', level: 4 }, hint: 'Claim Zombie Slayer Level 4' },
  { tier: 'Skilled',      task_key: 'zombie_lvl6', requirement: { type: 'slayer_claimed_level', boss: 'zombie', level: 6 }, hint: 'Claim Zombie Slayer Level 6 (max)' },
  { tier: 'Amateur',      task_key: 'spider_lvl1', requirement: { type: 'slayer_claimed_level', boss: 'spider', level: 1 }, hint: 'Claim Spider Slayer Level 1' },
  { tier: 'Intermediate', task_key: 'spider_lvl3', requirement: { type: 'slayer_claimed_level', boss: 'spider', level: 3 }, hint: 'Claim Spider Slayer Level 3' },
  { tier: 'Skilled',      task_key: 'spider_lvl4', requirement: { type: 'slayer_claimed_level', boss: 'spider', level: 4 }, hint: 'Claim Spider Slayer Level 4 (max)' },
  { tier: 'Amateur',      task_key: 'wolf_lvl2',   requirement: { type: 'slayer_claimed_level', boss: 'wolf', level: 2 },   hint: 'Claim Wolf Slayer Level 2' },
  { tier: 'Intermediate', task_key: 'wolf_lvl4',   requirement: { type: 'slayer_claimed_level', boss: 'wolf', level: 4 },   hint: 'Claim Wolf Slayer Level 4' },
  { tier: 'Skilled',      task_key: 'wolf_lvl6',   requirement: { type: 'slayer_claimed_level', boss: 'wolf', level: 6 },   hint: 'Claim Wolf Slayer Level 6 (max)' },
  { tier: 'Intermediate', task_key: 'enderman_lvl1', requirement: { type: 'slayer_claimed_level', boss: 'enderman', level: 1 }, hint: 'Claim Enderman Slayer Level 1' },
  { tier: 'Skilled',      task_key: 'enderman_lvl2', requirement: { type: 'slayer_claimed_level', boss: 'enderman', level: 2 }, hint: 'Claim Enderman Slayer Level 2' },
  { tier: 'Amateur',      task_key: 'jacob_bronze', requirement: { type: 'jacob_medal_count', rarity: 'bronze', target: 1 }, hint: 'Earn a Bronze medal from a Jacob\'s Farming Contest' },
  { tier: 'Intermediate', task_key: 'jacob_silver', requirement: { type: 'jacob_medal_count', rarity: 'silver', target: 1 }, hint: 'Earn a Silver medal from a Jacob\'s Farming Contest' },
  { tier: 'Skilled',      task_key: 'jacob_gold',   requirement: { type: 'jacob_medal_count', rarity: 'gold', target: 1 },   hint: 'Earn a Gold medal from a Jacob\'s Farming Contest' },
]

// ── LOT 3 — Dungeon floors (real official Catacombs F1-F7 / Master M1-M7
// numbering, target=1 = "played at least once", matches the type's own
// default) + Bank tier (real 6-tier system confirmed via internal wiki
// cache: Starter(0)->Gold(1)->Deluxe(2)->Super Deluxe(3)->Premier(4)->
// Luxurious(5)->Palatial(6)) ──
const LOT3: Row[] = [
  { tier: 'Amateur',      task_key: 'floor_1', requirement: { type: 'dungeon_floor_played', mode: 'catacombs', floor: '1', target: 1 }, hint: 'Complete Catacombs Floor 1' },
  { tier: 'Intermediate', task_key: 'floor_2', requirement: { type: 'dungeon_floor_played', mode: 'catacombs', floor: '2', target: 1 }, hint: 'Complete Catacombs Floor 2' },
  { tier: 'Intermediate', task_key: 'floor_3', requirement: { type: 'dungeon_floor_played', mode: 'catacombs', floor: '3', target: 1 }, hint: 'Complete Catacombs Floor 3' },
  { tier: 'Skilled',      task_key: 'floor_4', requirement: { type: 'dungeon_floor_played', mode: 'catacombs', floor: '4', target: 1 }, hint: 'Complete Catacombs Floor 4' },
  { tier: 'Skilled',      task_key: 'floor_5', requirement: { type: 'dungeon_floor_played', mode: 'catacombs', floor: '5', target: 1 }, hint: 'Complete Catacombs Floor 5' },
  { tier: 'Expert',       task_key: 'floor_6', requirement: { type: 'dungeon_floor_played', mode: 'catacombs', floor: '6', target: 1 }, hint: 'Complete Catacombs Floor 6' },
  { tier: 'Expert',       task_key: 'floor_7', requirement: { type: 'dungeon_floor_played', mode: 'catacombs', floor: '7', target: 1 }, hint: 'Complete Catacombs Floor 7 (final Catacombs floor)' },
  { tier: 'Professional', task_key: 'master_1', requirement: { type: 'dungeon_floor_played', mode: 'master_catacombs', floor: '1', target: 1 }, hint: 'Complete Master Catacombs Floor 1 (M1)' },
  { tier: 'Professional', task_key: 'master_2', requirement: { type: 'dungeon_floor_played', mode: 'master_catacombs', floor: '2', target: 1 }, hint: 'Complete Master Catacombs Floor 2 (M2)' },
  { tier: 'Professional', task_key: 'master_3', requirement: { type: 'dungeon_floor_played', mode: 'master_catacombs', floor: '3', target: 1 }, hint: 'Complete Master Catacombs Floor 3 (M3)' },
  { tier: 'Master',       task_key: 'master_4', requirement: { type: 'dungeon_floor_played', mode: 'master_catacombs', floor: '4', target: 1 }, hint: 'Complete Master Catacombs Floor 4 (M4)' },
  { tier: 'Master',       task_key: 'master_5', requirement: { type: 'dungeon_floor_played', mode: 'master_catacombs', floor: '5', target: 1 }, hint: 'Complete Master Catacombs Floor 5 (M5)' },
  { tier: 'Master',       task_key: 'master_6', requirement: { type: 'dungeon_floor_played', mode: 'master_catacombs', floor: '6', target: 1 }, hint: 'Complete Master Catacombs Floor 6 (M6)' },
  { tier: 'Master',       task_key: 'master_7', requirement: { type: 'dungeon_floor_played', mode: 'master_catacombs', floor: '7', target: 1 }, hint: 'Complete Master Catacombs Floor 7 (M7, the hardest dungeon floor in the game)' },
  { tier: 'Amateur',      task_key: 'bank_1', requirement: { type: 'bank_tier', target: 1 }, hint: 'Upgrade your Personal Bank to the Gold Account tier' },
  { tier: 'Intermediate', task_key: 'bank_2', requirement: { type: 'bank_tier', target: 2 }, hint: 'Upgrade your Personal Bank to the Deluxe Account tier' },
  { tier: 'Skilled',      task_key: 'bank_3', requirement: { type: 'bank_tier', target: 3 }, hint: 'Upgrade your Personal Bank to the Super Deluxe Account tier' },
  { tier: 'Expert',       task_key: 'bank_4', requirement: { type: 'bank_tier', target: 4 }, hint: 'Upgrade your Personal Bank to the Premier Account tier' },
  { tier: 'Professional', task_key: 'bank_5', requirement: { type: 'bank_tier', target: 5 }, hint: 'Upgrade your Personal Bank to the Luxurious Account tier' },
  { tier: 'Master',       task_key: 'bank_6', requirement: { type: 'bank_tier', target: 6 }, hint: 'Upgrade your Personal Bank to the Palatial Account tier (max)' },
]

// ── LOT 4 — Minions (no clean official ceiling maps to the real field
// semantics -- crafted_generators.length counts every tier upgrade ever
// bought across ALL minions, not distinct minion types, so "total real
// minion count" isn't a usable cap here; neither test profile has ANY
// data to calibrate a curve either -- single honest target=1 checkpoint,
// calibration_note explicit), Bestiary (real official milestone table,
// confirmed via internal wiki cache: V/X/XV/XX/XXV/XXX.../C -- checkpoints
// every 5, using the exact real numbers), Chocolate Factory (real official
// "Chocolate Factory Milestones" all-time-chocolate table, confirmed via
// internal wiki cache -- using literal real checkpoint values from that
// table), Auctions + Fishing (pure activity counters, no official ceiling
// exists for either -- calibrated from Cucumber's real observed values,
// calibration_note explicit per the 31 juillet clarification) ──
const LOT4: Row[] = [
  { tier: 'Amateur', task_key: 'minion_first', requirement: { type: 'minion_count', target: 1 }, hint: 'Craft your first minion', calibration_note: 'Aucune donnée de calibration disponible (Cucumber et Orange ont toutes deux 0 minion craftée) -- target=1 volontairement minimal, pas de courbe multi-tier inventée sans base réelle.' },
  { tier: 'Amateur',      task_key: 'bestiary_5',   requirement: { type: 'bestiary_milestone', target: 5 },   hint: 'Reach Bestiary Milestone V' },
  { tier: 'Intermediate', task_key: 'bestiary_15',  requirement: { type: 'bestiary_milestone', target: 15 },  hint: 'Reach Bestiary Milestone XV' },
  { tier: 'Skilled',      task_key: 'bestiary_30',  requirement: { type: 'bestiary_milestone', target: 30 },  hint: 'Reach Bestiary Milestone XXX' },
  { tier: 'Expert',       task_key: 'bestiary_50',  requirement: { type: 'bestiary_milestone', target: 50 },  hint: 'Reach Bestiary Milestone L' },
  { tier: 'Professional', task_key: 'bestiary_75',  requirement: { type: 'bestiary_milestone', target: 75 },  hint: 'Reach Bestiary Milestone LXXV' },
  { tier: 'Master',       task_key: 'bestiary_100', requirement: { type: 'bestiary_milestone', target: 100 }, hint: 'Reach Bestiary Milestone C (100+)' },
  { tier: 'Intermediate', task_key: 'choc_1m',  requirement: { type: 'chocolate_factory_amount', metric: 'total_chocolate', target: 1_000_000 },     hint: 'Earn 1 million lifetime Chocolate in the Chocolate Factory' },
  { tier: 'Skilled',      task_key: 'choc_100m', requirement: { type: 'chocolate_factory_amount', metric: 'total_chocolate', target: 100_000_000 },   hint: 'Earn 100 million lifetime Chocolate in the Chocolate Factory' },
  { tier: 'Expert',       task_key: 'choc_1b',   requirement: { type: 'chocolate_factory_amount', metric: 'total_chocolate', target: 1_000_000_000 }, hint: 'Earn 1 billion lifetime Chocolate in the Chocolate Factory' },
  { tier: 'Master',       task_key: 'choc_10b',  requirement: { type: 'chocolate_factory_amount', metric: 'total_chocolate', target: 10_000_000_000 }, hint: 'Earn 10 billion lifetime Chocolate in the Chocolate Factory' },
  { tier: 'Amateur', task_key: 'auction_5',  requirement: { type: 'auction_activity', metric: 'completed', target: 5 },  hint: 'Complete 5 Auction House sales', calibration_note: "Aucun plafond officiel documenté pour ce compteur d'activité -- calibré sur la valeur réelle observée de Cucumber (completed:56), à recalibrer si un profil plus avancé devient disponible." },
  { tier: 'Skilled', task_key: 'auction_25', requirement: { type: 'auction_activity', metric: 'completed', target: 25 }, hint: 'Complete 25 Auction House sales', calibration_note: "Aucun plafond officiel documenté pour ce compteur d'activité -- calibré sur la valeur réelle observée de Cucumber (completed:56), à recalibrer si un profil plus avancé devient disponible." },
  { tier: 'Amateur', task_key: 'fishing_25',  requirement: { type: 'fishing_activity', metric: 'sea_creature_kills', target: 25 },  hint: 'Catch 25 Sea Creatures', calibration_note: "Aucun plafond officiel documenté pour ce compteur d'activité (kill counter, pas un total d'espèces) -- calibré sur la valeur réelle observée de Cucumber (sea_creature_kills:333), à recalibrer si un profil plus avancé devient disponible." },
  { tier: 'Skilled', task_key: 'fishing_150', requirement: { type: 'fishing_activity', metric: 'sea_creature_kills', target: 150 }, hint: 'Catch 150 Sea Creatures', calibration_note: "Aucun plafond officiel documenté pour ce compteur d'activité (kill counter, pas un total d'espèces) -- calibré sur la valeur réelle observée de Cucumber (sea_creature_kills:333), à recalibrer si un profil plus avancé devient disponible." },
]

const LOTS: Record<string, Row[]> = { '1': LOT1, '2': LOT2, '3': LOT3, '4': LOT4 }

async function generateCopy(rows: Row[]): Promise<Map<string, { task_title: string; label: string; category: string }>> {
  const prompt = `You write short task copy for a Hypixel Skyblock milestone tracker. For each row below (task_key + a hint describing what the real requirement already is), output task_title (short imperative, e.g. "Defeat Kuudra Tier 5"), label (same as task_title or very slightly more descriptive), and category (2-4 word grouping label). Never invent or change any number -- the hint already states the exact real requirement, just phrase it well.

Rows:
${rows.map(r => `${r.task_key}: ${r.hint}`).join('\n')}

Return ONLY compact JSON: {"items":[{"task_key":"...","task_title":"...","label":"...","category":"..."}]}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const parsed = JSON.parse(clean)
  const map = new Map<string, { task_title: string; label: string; category: string }>()
  for (const item of parsed.items || []) map.set(item.task_key, item)
  return map
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const lotKey = url.searchParams.get('lot') || '1'
  const rows = LOTS[lotKey]
  if (!rows) return NextResponse.json({ error: 'unknown lot' }, { status: 400 })

  const copyMap = await generateCopy(rows)

  const dbRows = rows.map(r => {
    const copy = copyMap.get(r.task_key)
    if (!copy) throw new Error(`Haiku did not return copy for ${r.task_key}`)
    return {
      tier: r.tier,
      source: 'vault',
      category: copy.category,
      task_title: copy.task_title,
      label: copy.label,
      group_xp: 0,
      requirement: r.calibration_note ? { ...r.requirement, calibration_note: r.calibration_note } : r.requirement,
      task_key: `bloc4_${r.task_key}`,
    }
  })

  // Idempotent: delete any previous insert of this lot's task_keys before
  // re-inserting, so this debug route can be safely re-run while iterating.
  await supabase.from('milestone_tasks').delete().in('task_key', dbRows.map(r => r.task_key))
  const { error } = await supabase.from('milestone_tasks').insert(dbRows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, lot: lotKey, inserted: dbRows.length, rows: dbRows })
}
