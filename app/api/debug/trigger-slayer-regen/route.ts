import { NextResponse } from 'next/server'
import { runMoneyMakingAgent } from '../../cron/money-making-agent/route'
import { runSetupGenerateAgent } from '../../cron/setup-generate-agent/route'
import { runEvolveSkills } from '../../cron/evolve-skills/route'

const CUCUMBER_PROFILE_ID = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'

export async function GET() {
  const mm = await runMoneyMakingAgent(['mid', 'end', 'late'])
  const setup = await runSetupGenerateAgent(['mid', 'end', 'late'])
  const evolve = await runEvolveSkills([CUCUMBER_PROFILE_ID])
  return NextResponse.json({ mm, setup, evolve })
}
