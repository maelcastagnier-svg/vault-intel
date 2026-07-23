// lib/get-plan.ts
// Helper partage pour la gating logic par tier d'abonnement — jamais duplique route par
// route. Le plan vient toujours de la table `subscriptions` liee a la session authentifiee
// reelle (auth.getUser()), jamais d'un parametre client. Meme principe que has_plan() cote
// SQL (voir migration), utilise pour les tables interrogees directement par le navigateur.
import { NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from './supabase-server'

export type Plan = 'free' | 'alert' | 'pro' | 'elite'

const PLAN_RANK: Record<Plan, number> = { free: 0, alert: 1, pro: 2, elite: 3 }

export async function getUserPlan(): Promise<{ user: { id: string; email: string } | null; plan: Plan }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { user: null, plan: 'free' }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('email', user.email)
    .single()

  const plan: Plan = (sub?.status === 'active' && ['alert', 'pro', 'elite'].includes(sub.plan))
    ? (sub.plan as Plan)
    : 'free'

  return { user: { id: user.id, email: user.email }, plan }
}

// Usage dans une route :
//   const gate = await requirePlan('pro')
//   if (!gate.ok) return gate.response
//   // gate.user, gate.plan disponibles ici
export async function requirePlan(minPlan: Plan): Promise<
  | { ok: true; user: { id: string; email: string }; plan: Plan }
  | { ok: false; response: NextResponse }
> {
  const { user, plan } = await getUserPlan()

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }
  if (PLAN_RANK[plan] < PLAN_RANK[minPlan]) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `This feature requires the ${minPlan} plan or above`, current_plan: plan, required_plan: minPlan },
        { status: 403 }
      ),
    }
  }
  return { ok: true, user, plan }
}
