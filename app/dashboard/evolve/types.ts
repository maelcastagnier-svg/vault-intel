// app/dashboard/evolve/types.ts
// Interfaces calquees exactement sur les 3 vraies reponses API (pas de champ suppose).

// ── /api/player/skills ──────────────────────────────────────────────────
export type Confidence = 'HIGH' | 'MED' | 'LOW'
export type TargetType = 'free_swap' | 'upgrade' | 'unlock_access'

export interface SkillState {
  setup_items: string[]
  method: string
  coins_per_hour: number
  coins_display: string
  calculation: string
  confidence: Confidence
}

export interface SkillTarget {
  type: TargetType
  goal: string
  requirements: string[]
  budget_estimate: number
  expected_coins_display: string
  reasoning: string
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
