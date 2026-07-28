// lib/skill-xp.ts
// Real per-level XP curves for standard Hypixel Skyblock skills -- extracted
// verbatim from app/api/player/sync/route.ts (already validated in prod for
// computing player_data.skills levels) so app/api/player/skills/route.ts can
// also compute real progress-into-level for the Skills tab's XP bars,
// without duplicating these tables independently.
export function calcSkillLevel(xp: number, caps: number[]): number {
  let level = 0
  let total = 0
  for (const cap of caps) {
    total += cap
    if (xp >= total) level++
    else break
  }
  return level
}

// XP requis par level pour les skills standards
export const SKILL_XP = [50,125,200,300,500,750,1000,1500,2000,3500,5000,7500,10000,15000,20000,30000,50000,75000,100000,200000,300000,400000,500000,600000,700000,800000,900000,1000000,1100000,1200000,1300000,1400000,1500000,1600000,1700000,1800000,1900000,2000000,2100000,2200000,2300000,2400000,2500000,2600000,2750000,2900000,3100000,3400000,3700000,4000000,4300000,4600000,4900000,5200000,5500000,5800000,6100000,6400000,6700000,7000000]
export const RUNECRAFTING_XP = [50,100,125,160,200,250,315,400,500,625,785,1000,1250,1600,2000,2465,3125,4000,5000,6200,7800,9800,12200,15200,19050,23750,30000,38000,48000,60000,75000,93500,116500,145000,181000,226000,282000,352000,440000,550000]

export function getSkillLevel(skillName: string, xp: number): number {
  const xpTable = skillName.toUpperCase() === 'RUNECRAFTING' ? RUNECRAFTING_XP : SKILL_XP
  return calcSkillLevel(xp, xpTable)
}

// What a progress bar needs beyond the level number: how far into the
// current level, and how much XP the next level requires. xpForNextLevel is
// null once the table is exhausted (max level reached, nothing left to
// show progress toward).
export type SkillProgress = { level: number; xpIntoLevel: number; xpForNextLevel: number | null }

export function skillProgress(skillName: string, xp: number): SkillProgress {
  const xpTable = skillName.toUpperCase() === 'RUNECRAFTING' ? RUNECRAFTING_XP : SKILL_XP
  let level = 0
  let cumulative = 0
  for (const cap of xpTable) {
    if (xp >= cumulative + cap) {
      cumulative += cap
      level++
    } else {
      return { level, xpIntoLevel: xp - cumulative, xpForNextLevel: cap }
    }
  }
  return { level, xpIntoLevel: 0, xpForNextLevel: null }
}
