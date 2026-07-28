// TEMP debug route -- validates skillProgress() against real Cucumber/Orange
// data before merging feat/skill-bars-overlay. Deleted after validation.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { skillProgress } from '../../../../lib/skill-xp'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PROFILES = {
  cucumber: 'b077f27a-60f7-46d9-be13-c4689a01dc3b',
  orange: '35938937-7db6-4f5e-95c5-fecae9084be5',
}

export async function GET() {
  const out: any = {}
  for (const [name, profileId] of Object.entries(PROFILES)) {
    const { data: player, error: playerErr } = await supabase
      .from('player_data')
      .select('skills, raw_profile')
      .eq('profile_id', profileId)
      .single()

    const { data: cards, error: cardsErr } = await supabase
      .from('player_skill_cards')
      .select('cards')
      .eq('profile_id', profileId)
      .single()

    const skillsXp = (player?.raw_profile as any)?.skills_xp || {}
    const skillKeys = Object.keys(skillsXp)
    const progressPerSkill = Object.fromEntries(
      skillKeys.map(k => [k, skillProgress(k, skillsXp[k])])
    )

    const cardSample = (cards?.cards || []).find((c: any) => c.skill_key === 'farming')

    out[name] = {
      playerErr: playerErr?.message,
      cardsErr: cardsErr?.message,
      skillsXp,
      progressPerSkill,
      farmingCard_render_setup_current: cardSample?.current?.render_setup,
      farmingCard_render_setup_target: cardSample?.target?.render_setup,
      allSkillKeys: (cards?.cards || []).map((c: any) => c.skill_key),
    }
  }
  return NextResponse.json(out)
}
