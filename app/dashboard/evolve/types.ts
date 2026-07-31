// app/dashboard/evolve/types.ts
// Interfaces calquees exactement sur les 3 vraies reponses API (pas de champ suppose).

// ── /api/player/skills ──────────────────────────────────────────────────
export type Confidence = 'HIGH' | 'MED' | 'LOW'
export type TargetType = 'free_swap' | 'upgrade' | 'unlock_access'

// Setup object shape SkinArmorRender.tsx expects (armor_set/armor_*_color/
// armor_rarity/armor_stars/armor_reforge/enchants_armor) -- built server-side
// by lib/skill-setup-adapter.ts, attached to current/target as render_setup.
// Untyped here (matches SkinArmorRender's own `Record<string, any>` prop)
// since its exact fields vary by what was actually matched/owned.
export type RenderSetup = Record<string, any>

export interface SkillState {
  setup_items: string[]
  method: string
  coins_per_hour: number
  coins_display: string
  calculation: string
  confidence: Confidence
  // Exact name from the player's ALL OWNED ARMOR SETS list (equipped +
  // inventory + ender chest + backpacks + vault + wardrobe) that this card's
  // render_setup was resolved from -- null when nothing owned fits this
  // skill. See lib/skill-setup-adapter.ts (resolveOwnedArmorSet).
  armor_set_used?: string | null
  render_setup?: RenderSetup
}

export interface SkillTarget {
  type: TargetType
  goal: string
  requirements: string[]
  budget_estimate: number
  expected_coins_display: string
  reasoning: string
  render_setup?: RenderSetup
  // Weapon/tool/rod name, verified server-side against THIS skill's own
  // category-filtered gear catalog (never another skill's) -- null if
  // unverified/not applicable. See verifyGearName in evolve-skills/route.ts.
  gear_name?: string | null
}

// Depuis /api/player/skills, calculé depuis la vraie XP (player_data.raw_profile.
// skills_xp) -- absent pour "dungeoneering"/"slayer", qui n'ont pas cette forme de
// courbe XP->niveau (voir lib/skill-xp.ts et la route elle-même).
export interface SkillProgress {
  level: number
  xpIntoLevel: number
  xpForNextLevel: number | null
}

export interface SlayerBoss {
  boss: string
  current: SkillState
  target: SkillTarget
}

export interface SkillCardData {
  skill_key: string
  label: string
  unlocked: boolean
  current: SkillState
  target: SkillTarget
  bosses?: SlayerBoss[]
  progress?: SkillProgress
}

export interface SkillsResponse {
  game_stage: string
  networth: number
  purse: number
  cards: SkillCardData[]
  model: string
  generated_at: string
  // true si cette carte a été générée avant le fix du bug Slayer Blaze/Spider max tier
  // inversé (voir CLAUDE.md) -- current/target de la carte Slayer peuvent citer le
  // mauvais max tier tant que le joueur n'a pas resync.
  stale_slayer_data?: boolean
}

// ── /api/player/milestones ──────────────────────────────────────────────
export interface EvaluatedTask {
  category: string
  task_title: string
  label: string
  group_xp: number
  data_available: boolean
  current: number | null
  target: number | null
  met: boolean | null
}

export interface MilestoneTier {
  tier: string
  wiki_tasks: EvaluatedTask[]
  vault_tasks: EvaluatedTask[]
  tasks_known: number
  tasks_announced: number | null
  tasks_computable: number
  tasks_completed: number
}

export interface MilestonesResponse {
  tiers: MilestoneTier[]
}

// ── /api/player/missions ──────────────────────────────────────────────
export interface MissionRow {
  id: number
  mission_id: string
  activity: string
  title: string
  description: string
  difficulty: string
  progress: number
  progress_target: number
  progress_unit: string
  coins_reward: number
  xp_reward: number
  completed: boolean
  carried_over: boolean
}

export interface MissionsResponse {
  missions: MissionRow[]
  date: string
  generated: boolean
  carried_over?: boolean
  message?: string
}
