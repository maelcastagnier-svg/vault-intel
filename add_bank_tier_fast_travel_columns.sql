-- Adds player_data.bank_tier + player_data.fast_travel_zones -- 2nd zone of
-- the resumed "collecte totale" initiative. Run manually in the Supabase SQL
-- editor, same workflow as every prior migration in this project.
--
-- bank_tier: real integer from member.profile.personal_bank_upgrade (the
-- Personal Bank upgrade tier -- distinct from the already-collected `bank`
-- column, which is the coop-shared bank balance from profile.banking.balance).
--
-- fast_travel_zones: real string array from member.player_data.visited_zones
-- (every zone the player can instantly warp to via the Fast Travel menu).
ALTER TABLE player_data ADD COLUMN IF NOT EXISTS bank_tier integer DEFAULT 0;
ALTER TABLE player_data ADD COLUMN IF NOT EXISTS fast_travel_zones jsonb DEFAULT '[]'::jsonb;
