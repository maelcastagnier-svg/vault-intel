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
