// lib/money-making-constants.ts
// Partagé entre cron/money-making-agent (bibliothèque générale par tier) et
// cron/evolve-skills (cartes personnalisées par joueur) — un seul jeu de
// benchmarks coins/h et de rappels de mécaniques de jeu, pour que les deux
// crons ne dérivent jamais l'un de l'autre.

export const TIER_CONFIG = {
  early: {
    label: 'EARLY', networth: '0-50M', target: 10,
    max_gear_cost: 5_000_000, capital: 500_000,
    access: 'Zombie/Spider/Wolf Slayer T1-T2 | Dwarven Mines HotM 1-3 | Basic fishing | Basic crops | Basic foraging',
    forbidden: 'Kuudra, Enderman/Blaze/Vampire Slayer, Crystal Hollows, Garden, Thunder Fishing, Dungeons F4+, any gear >5M total'
  },
  mid: {
    label: 'MID', networth: '50M-500M', target: 25,
    max_gear_cost: 100_000_000, capital: 10_000_000,
    access: 'Zombie T3-T4, Spider T3-T4, Wolf T3-T4 (MAX), Enderman T1-T2 | Dungeons F4-F6 | Kuudra T1-T2 | Crystal Hollows HotM 4-6 | Trophy Fishing basic | Garden basic',
    forbidden: 'M1-M7, Kuudra T3+, Enderman T3+, Blaze/Vampire Slayer, Thunder Fishing, Divan Drill (1B+), any gear >100M'
  },
  end: {
    label: 'END', networth: '500M-5B', target: 50,
    max_gear_cost: 1_000_000_000, capital: 200_000_000,
    access: 'Zombie T5, Spider T5 (MAX), Enderman T3-T4 (MAX T4 ONLY), Blaze T4 (MAX), Vampire T4-T5 | Dungeons M1-M4 | Kuudra T3-T5 | Crystal Hollows advanced | Thunder Fishing | Pest Farming',
    forbidden: 'M5-M7, Enderman T5 (DOES NOT EXIST), any single gear piece >1B'
  },
  late: {
    label: 'LATE', networth: '5B+', target: 70,
    max_gear_cost: 9_999_999_999, capital: 1_000_000_000,
    access: 'All slayers at MAX tier | M5-M7 | All Kuudra | Max fortune farming | Max SCC fishing | Divan Drill',
    forbidden: 'Nothing — Enderman boss MAX still T4'
  }
} as const

export type TierKey = keyof typeof TIER_CONFIG
export type TierConfig = (typeof TIER_CONFIG)[TierKey]

// Contamination du bug Slayer Blaze/Spider max tier inversé (corrigé le 31 juillet 2026,
// voir CLAUDE.md section "Cartographie exhaustive Hypixel Skyblock"). Ces 3 méthodes ont
// été générées par Claude avec l'ancien GAME_TRUTHS erroné (Blaze T5/Spider T4 au lieu de
// Blaze T4/Spider T5) — masquées ici en pur code (aucune régénération, coût réel évité)
// en attendant une régénération groupée future. Ne pas retirer sans régénérer d'abord.
export const SLAYER_BUG_CONTAMINATED_METHOD_IDS = new Set([
  'blaze_t5_slayer_grind',                        // claude_analysis.money_making_end + method_setups(tier=end)
  'blaze_t5_slayer_scorched_books_arbitrage',      // claude_analysis.money_making_late + method_setups(tier=late)
  'spider_t4_slayer',                              // claude_analysis.money_making_mid + method_setups(tier=mid)
])

// Timestamp du merge du fix (commit a365b4e) — tout player_skill_cards généré avant cette
// date peut porter la même contamination sur sa carte Slayer (current/target basés sur le
// mauvais max tier). Utilisé pour flaguer `stale_slayer_data` côté API plutôt que masquer.
export const SLAYER_BUG_FIX_DEPLOYED_AT = '2026-07-31T17:38:48Z'

export const GAME_TRUTHS = `
=== SLAYER SYSTEM (mandatory — always describe this way) ===
Slayer bosses are SUMMONED via Maddox NPC, NOT naturally spawning.
Process: Talk to Maddox → get quest → kill X [mob type] in their zone → boss spawns at your location.
Always write: "Via Maddox quest → kill [mob] in [zone] → boss summons there"
Zones: Zombie=anywhere | Spider=Spider's Den | Wolf=The Park | Enderman=The End | Blaze=Crimson Isle | Vampire=The Rift

=== SLAYER MAX TIERS ===
Zombie T5 ✅ | Spider T5 ✅ | Wolf T4 ✅ | Enderman T4 ✅ (T5 DOES NOT EXIST) | Blaze T4 ✅ (T5 DOES NOT EXIST) | Vampire T5 ✅

=== REALISTIC COINS/HOUR RANGES ===
Early: Slayer 2-5M/h | Mining 3-8M/h | Fishing 2-4M/h
Mid: Slayer 8-20M/h | Mining 10-25M/h | Fishing 12-25M/h | Dungeons 15-30M/h
End: Slayer 25-80M/h | Mining 25-60M/h | Fishing 30-70M/h | Kuudra 50-120M/h
Late: Best methods 70-150M/h
If a method doesn't reach the tier target, pick best available and note the gap honestly.
`
