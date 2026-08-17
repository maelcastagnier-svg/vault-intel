// Route de debug TEMPORAIRE -- verifie la migration 7 tiers de money-making-agent
// (budgets interpoles depuis milestone_tier_totals) avant de laisser tourner
// les 7 tiers en prod. A supprimer apres verification.
import { NextResponse } from 'next/server'
import { runMoneyMakingAgent } from '../../cron/money-making-agent/route'

export async function GET() {
  const result = await runMoneyMakingAgent(['starter', 'master'])
  return NextResponse.json(result)
}
