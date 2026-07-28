// app/dashboard/evolve/skill-display.ts
// Shared display constants for SkillCard (Slayer accordion) and
// SkillProgressOverlay (the 8 non-Slayer skills) -- kept in one place so the
// two never drift on what a given TargetType/Confidence looks like.
import type { TargetType } from './types'

export const TARGET_TYPE_STYLE: Record<TargetType, { label: string; color: string; bg: string }> = {
  free_swap:     { label: '✓ FREE SWAP — already owned', color: '#1baf7a', bg: 'rgba(27,175,122,0.08)' },
  upgrade:       { label: '↑ UPGRADE — purchase needed', color: '#c9a84c', bg: 'rgba(201,168,76,0.08)' },
  unlock_access: { label: '🔓 UNLOCK — not started yet', color: '#9b59b6', bg: 'rgba(155,89,182,0.08)' },
}

export const CONFIDENCE_COLOR: Record<string, string> = { HIGH: '#1baf7a', MED: '#c9a84c', LOW: '#6b6960' }

export function fmtCoins(n: number): string {
  if (!n) return '0'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}
