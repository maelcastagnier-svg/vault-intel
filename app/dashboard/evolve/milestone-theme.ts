// app/dashboard/evolve/milestone-theme.ts
// Pure CSS per-tier decor -- no new art assets, deliberately. Colors are
// variations/blends of the palette already established across the
// dashboard (gold #c9a84c primary accent, green #1baf7a success, blue
// #2a78d6 info, purple #9b59b6 rare/unlock, red #e34948 danger) rather than
// invented hues, escalating from muted (Starter) to vivid (Master) through
// intensity/glow rather than unrelated new colors.
export type TierTheme = { accent: string; bg: string; icon: string }

export const TIER_THEME: Record<string, TierTheme> = {
  Starter:       { accent: '#7a8a6e', bg: 'linear-gradient(180deg, #14150f, #0d0e0a)', icon: '🌱' },
  Amateur:       { accent: '#4a9d7a', bg: 'linear-gradient(180deg, #0e1512, #0a0f0c)', icon: '🌿' },
  Intermediate:  { accent: '#2a78d6', bg: 'linear-gradient(180deg, #0d1218, #0a0d10)', icon: '⚙️' },
  Skilled:       { accent: '#c9a84c', bg: 'linear-gradient(180deg, #16130a, #100e08)', icon: '⚔️' },
  Expert:        { accent: '#9b59b6', bg: 'linear-gradient(180deg, #14101a, #0e0b12)', icon: '🔮' },
  Professional:  { accent: '#e0703c', bg: 'linear-gradient(180deg, #170f0a, #100a07)', icon: '🔥' },
  Master:        { accent: '#f0d060', bg: 'linear-gradient(180deg, #1a1608, #120f06)', icon: '👑' },
}

export const DEFAULT_THEME: TierTheme = { accent: '#c9a84c', bg: 'linear-gradient(180deg, #111110, #0d0d0c)', icon: '🗺️' }
