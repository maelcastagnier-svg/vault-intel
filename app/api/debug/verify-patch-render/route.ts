import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { filterPatchInsight } from '../../../../lib/gate-content'

const supabaseService = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const TEST_EMAIL = 'mael.castagnier+patchtest@gmail.com'

// Reproduire une session SSR via cookies bruts est fragile (@supabase/ssr encode
// la session dans un format de cookie spécifique, pas un couple access/refresh
// token simple) -- filterPatchInsight() est la fonction PURE que /api/patch-insights
// applique réellement au plan résolu, donc on la rejoue directement ici avec un
// plan 'alert' pour prouver fidèlement ce qu'un vrai utilisateur Alert+ recevrait,
// sans avoir à fausser l'auth SSR.
export async function GET() {
  await supabaseService.auth.admin.createUser({ email: TEST_EMAIL, password: 'VaultPatchTest2026!', email_confirm: true })
  await supabaseService.from('subscriptions').insert({ email: TEST_EMAIL, username: 'patchtest', plan: 'alert', status: 'active' })

  const { data, error } = await supabaseService
    .from('insight_patch')
    .select('*')
    .in('status', ['active', null])
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const normalized = (data || []).map(p => ({
    ...p,
    patch_type: p.patch_type || (p.is_alpha ? 'alpha' : 'live'),
    items_affected: Array.isArray(p.items_affected) ? p.items_affected : [],
    methods_affected: Array.isArray(p.methods_affected) ? p.methods_affected : [],
    predicted_items: Array.isArray(p.predicted_items) ? p.predicted_items : [],
    gameplay_changes: Array.isArray(p.gameplay_changes) ? p.gameplay_changes : [],
  }))

  const asAlertUser = normalized.map(p => filterPatchInsight(p, 'alert')).filter(Boolean)
  const asFreeUser  = normalized.map(p => filterPatchInsight(p, 'free')).filter(Boolean)

  const withGameplay = asAlertUser.filter((p: any) => p.mechanics_impact || (p.gameplay_changes || []).length > 0)
  const freeLeaksGameplay = asFreeUser.some((p: any) => 'mechanics_impact' in p || 'gameplay_changes' in p)

  return NextResponse.json({
    alert_user_total: asAlertUser.length,
    alert_user_patches_with_gameplay_content: withGameplay.length,
    alert_user_sample: withGameplay[0] || null,
    free_user_leaks_gameplay_fields: freeLeaksGameplay,
  })
}
