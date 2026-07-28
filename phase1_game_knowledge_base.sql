-- Phase 1 — game knowledge base foundation
-- Run manually in the Supabase SQL editor (this project has no in-repo
-- migration runner, every schema change so far has been applied this way).
--
-- Two tables:
--   1. activity_gear_categories -- promotes the SKILL_GEAR_CATEGORIES const
--      (currently hardcoded in app/api/cron/evolve-skills/route.ts) to a real
--      table, shared by both Evolve Skills and Money Making so the two can
--      never independently drift on "what item category belongs to which
--      activity" the way that caused the Ragnarok Axe bug.
--   2. progression_tiers -- the 7-tier (Starter..Master) spine with real
--      networth/purse thresholds, bridging Milestones' 7-tier scale and
--      Money Making's existing 4-tier TIER_CONFIG (early/mid/end/late).

-- ── 1. activity_gear_categories ─────────────────────────────────────────
-- Real Hypixel item_stats.category values per activity (confirmed via a
-- live audit of item_stats before this table was designed -- see CLAUDE.md).
-- Zero rows for 'alchemy'/'enchanting': neither has a dedicated weapon/tool
-- slot, same as the current hardcoded behavior (absent key -> null).
CREATE TABLE activity_gear_categories (
  activity_key  text NOT NULL,
  item_category text NOT NULL,
  PRIMARY KEY (activity_key, item_category)
);

INSERT INTO activity_gear_categories (activity_key, item_category) VALUES
  ('farming', 'FARMING_TOOL'),
  ('mining', 'PICKAXE'),
  ('mining', 'DRILL'),
  ('foraging', 'AXE'),
  ('fishing', 'FISHING_ROD'),
  ('fishing', 'FISHING_NET'),
  ('fishing', 'VACUUM'),
  ('combat', 'SWORD'),
  ('combat', 'BOW'),
  ('combat', 'LONGSWORD'),
  ('combat', 'GAUNTLET'),
  ('combat', 'WAND'),
  ('dungeoneering', 'SWORD'),
  ('dungeoneering', 'BOW'),
  ('dungeoneering', 'LONGSWORD'),
  ('dungeoneering', 'GAUNTLET'),
  ('dungeoneering', 'WAND'),
  ('slayer', 'SWORD'),
  ('slayer', 'BOW'),
  ('slayer', 'LONGSWORD'),
  ('slayer', 'GAUNTLET'),
  ('slayer', 'WAND');

-- RLS: service-role only. This table is read exclusively from server-side
-- cron/generation routes (never the browser), same posture as
-- player_skill_cards -- no anon/authenticated policy needed.
ALTER TABLE activity_gear_categories ENABLE ROW LEVEL SECURITY;

-- ── 2. progression_tiers ─────────────────────────────────────────────────
-- Networth bands: boundaries at 5M/50M/150M/500M/1.5B/5B. The 50M/500M/5B
-- boundaries are REAL -- they are TIER_CONFIG's own early/mid/end/late
-- ceilings, already production-validated (lib/money-making-constants.ts).
-- The 5M/150M/1.5B boundaries are the geometric midpoint of each real band
-- (sqrt(50M*500M)=158M, sqrt(500M*5B)=1.58B), rounded for readability, and
-- are NOT yet confirmed against a real profile landing near that specific
-- split point -- see calibration_note per row.
--
-- purse_reference is intentionally NULL for 5 of 7 tiers: only Starter and
-- Expert have a real anchor (Orange and Cucumber, the only two real test
-- profiles available at Phase 1 time). Inventing 5 more numbers with zero
-- grounding would violate this project's "never fabricate a game constant"
-- rule extended to our own schema -- NULL is the honest answer until more
-- real profiles exist at those bands.
--
-- money_making_tier_key is deterministic BY CONSTRUCTION here (each 7-tier
-- band is a sub-split of exactly one real 4-tier band), but the SPLIT
-- POINTS inside each band are still provisional -- flagged explicitly per
-- the user's instruction to mark this "à revalider" pending more real
-- profiles across all 7 bands, not just the 2 currently available.
CREATE TABLE progression_tiers (
  tier_key            text PRIMARY KEY,
  tier_order          int NOT NULL UNIQUE,
  label               text NOT NULL,
  networth_min        bigint NOT NULL,
  networth_max        bigint,                  -- NULL = open-ended (Master)
  purse_reference     bigint,                  -- NULL = not yet anchored on a real profile
  money_making_tier_key text NOT NULL,         -- 'early' | 'mid' | 'end' | 'late'
  calibration_note    text NOT NULL
);

INSERT INTO progression_tiers (tier_key, tier_order, label, networth_min, networth_max, purse_reference, money_making_tier_key, calibration_note) VALUES
  ('starter', 1, 'Starter', 0, 5000000, 8100, 'early',
    'networth_max interpolated within the real early band (0-50M, TIER_CONFIG). purse_reference anchored on Orange, a real EARLY test profile (networth=purse=8,100) -- a single data point at the very floor, not a validated average for the whole band.'),
  ('amateur', 2, 'Amateur', 5000000, 50000000, NULL, 'early',
    'networth_max = TIER_CONFIG early ceiling (real, production-validated). networth_min and purse_reference are interpolated -- no real test profile lands in this band yet.'),
  ('intermediate', 3, 'Intermediate', 50000000, 150000000, NULL, 'mid',
    'networth_min = TIER_CONFIG mid floor (real). networth_max is the geometric midpoint of the real mid band (50M-500M), rounded. purse_reference not anchored -- no real test profile in this band.'),
  ('skilled', 4, 'Skilled', 150000000, 500000000, NULL, 'mid',
    'networth_max = TIER_CONFIG mid ceiling (real). networth_min and purse_reference interpolated -- no real test profile in this band.'),
  ('expert', 5, 'Expert', 500000000, 1500000000, 154827323, 'end',
    'networth_min = TIER_CONFIG end floor (real). networth_max is the geometric midpoint of the real end band (500M-5B), rounded. purse_reference anchored on Cucumber, a real MID-game_stage test profile whose networth (749,470,594) actually lands in this band (purse=154,827,323) -- a single data point, not a validated average.'),
  ('professional', 6, 'Professional', 1500000000, 5000000000, NULL, 'end',
    'networth_max = TIER_CONFIG end ceiling (real). networth_min and purse_reference interpolated -- no real test profile in this band.'),
  ('master', 7, 'Master', 5000000000, NULL, NULL, 'late',
    'networth_min = TIER_CONFIG late floor (real, open-ended). No real test profile reaches this band yet -- purse_reference not anchored.');

-- IMPORTANT semantic note (not enforced by the schema, documented here so it
-- is not lost): progression_tiers.networth_min/max is a NETWORTH-based gate,
-- directly analogous to TIER_CONFIG -- useful for gear budget purposes. It
-- is NOT the same concept as a player's "active" Milestones tier, which is
-- computed separately (buildMissionCandidates: the first tier with at least
-- one incomplete, data_available task). A player can have an Expert-band
-- networth while their real Milestones completion still sits at Starter
-- (exactly Cucumber's case: high networth from concentrated gear investment,
-- low breadth across neglected skills) -- this table does not try to
-- reconcile those two, deliberately.
ALTER TABLE progression_tiers ENABLE ROW LEVEL SECURITY;
