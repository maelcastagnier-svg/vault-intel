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

// ─── 7 tiers réels (vision V1, 17 août) ─────────────────────────
// TIER_CONFIG (4 bandes) reste la SEULE source de vérité pour les mécaniques
// de jeu (accès/interdits Slayer/Kuudra/Dungeons/etc.) -- ce texte est du
// vrai savoir de jeu curé à la main, jamais dupliqué ni réinventé pour les
// 7 tiers. Ce qui distingue réellement 2 tiers adjacents partageant le même
// money_making_tier_key (ex: Starter et Amateur, tous deux "early") c'est
// le BUDGET -- interpolé proportionnellement à la vraie borne networth_max
// de chaque tier dans `milestone_tier_totals` (jamais un chiffre inventé,
// un calcul transparent sur des ancres déjà réelles/validées). Un tier dont
// networth_max égale la borne réelle de sa bande (Amateur=early, Skilled=mid,
// Professional=end) hérite du budget exact de TIER_CONFIG, sans interpolation.
export type MilestoneTierRow = {
  tier: string
  tier_order: number
  networth_min: number
  networth_max: number | null
  money_making_tier_key: TierKey
}

// Champs widened (pas les unions litterales de TIER_CONFIG `as const`) --
// label/networth/target/max_gear_cost/capital varient reellement par tier
// reel, seuls access/forbidden restent des chaines heritees telles quelles.
// Meme ordre/libelles que TIER_ORDER dans app/api/player/milestones/route.ts
// (milestone_tier_totals.tier), en minuscule -- clé money_making_methods.tier
// / section claude_analysis, jamais le nom capitalisé stocké côté Milestones.
export const SEVEN_TIER_KEYS = ['starter', 'amateur', 'intermediate', 'skilled', 'expert', 'professional', 'master'] as const

export type SevenTierConfig = {
  label: string
  networth: string
  target: number
  max_gear_cost: number
  capital: number
  access: string
  forbidden: string
  tier_key: string
  tier_order: number
}

export function buildSevenTierConfig(rows: MilestoneTierRow[]): Record<string, SevenTierConfig> {
  // Plafond réel de chaque bande de 4 = le plus grand networth_max parmi les
  // tiers qui partagent ce money_making_tier_key (Master/late reste sans
  // plafond -> fraction toujours 1, cohérent avec un budget non capé).
  const ceilingByKey = new Map<TierKey, number>()
  for (const r of rows) {
    if (r.networth_max == null) continue
    const cur = ceilingByKey.get(r.money_making_tier_key) ?? 0
    if (r.networth_max > cur) ceilingByKey.set(r.money_making_tier_key, r.networth_max)
  }

  const out: Record<string, SevenTierConfig> = {}
  for (const r of rows) {
    const base = TIER_CONFIG[r.money_making_tier_key]
    const ceiling = ceilingByKey.get(r.money_making_tier_key)
    const fraction = r.networth_max == null || !ceiling ? 1 : Math.min(1, r.networth_max / ceiling)

    out[r.tier.toLowerCase()] = {
      ...base,
      label: r.tier.toUpperCase(),
      networth: r.networth_max != null
        ? `${(r.networth_min / 1_000_000).toFixed(0)}M-${(r.networth_max / 1_000_000).toFixed(0)}M`
        : `${(r.networth_min / 1_000_000_000).toFixed(1)}B+`,
      target: Math.max(1, Math.round(base.target * fraction)),
      max_gear_cost: Math.round(base.max_gear_cost * fraction),
      capital: Math.round(base.capital * fraction),
      tier_key: r.money_making_tier_key,
      tier_order: r.tier_order,
    }
  }
  return out
}

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
