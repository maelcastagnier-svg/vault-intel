// app/api/market-data/route.ts
// URGENCE SECURITE corrigee le 23 juillet — cette route n'avait AUCUNE verification d'auth
// ni de plan : n'importe qui (meme non connecte) recevait deja Money Making complet
// (Active + Vault Exclusive des 4 tiers), Patch Analysis complet et Radar. Toujours
// service-role cote DB (les 8 sections + insight_patch ne sont pas gatees par RLS, elles
// n'ont jamais de policy publique), mais le CONTENU retourne depend maintenant strictement
// du plan reel de la session (jamais un parametre client).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserPlan } from '../../../lib/get-plan'
import { filterMoneyMaking, filterPatchAnalysisContent, filterPatchInsight } from '../../../lib/gate-content'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { plan } = await getUserPlan()

  const sections = [
    'flash_alerts', 'ah_sniper', 'patch_analysis', 'radar',
    'money_making_early', 'money_making_mid',
    'money_making_end', 'money_making_late'
  ]
  const raw: Record<string, string> = {}

  for (const section of sections) {
    const { data } = await supabase
      .from('claude_analysis')
      .select('content')
      .eq('section', section)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    raw[section] = data?.content || ''
  }

  const { data: insights } = await supabase
    .from('insight_patch')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  const isAlert = plan === 'alert' || plan === 'pro' || plan === 'elite'
  const isPro   = plan === 'pro' || plan === 'elite'

  const result: Record<string, string> = {
    // Flash Alerts / AH Sniper — commentaire IA, reserve Alert+ (l'apercu Free passe par
    // les vues ah_live_free_preview/bazaar_1h_free_preview, pas par cette route)
    flash_alerts: isAlert ? raw.flash_alerts : '',
    ah_sniper:    isAlert ? raw.ah_sniper    : '',
    // Patch Analysis — Alert+ complet, Free tronque a titre+impact (repli seulement,
    // /api/patch-insights est la source principale de PatchSection.tsx)
    patch_analysis: isAlert ? raw.patch_analysis : filterPatchAnalysisContent(raw.patch_analysis, plan),
    // Radar — reserve Pro+
    radar: isPro ? raw.radar : '',
  }

  // Money Making — reserve Pro+, Vault Exclusive en plus reserve Elite
  for (const tier of ['early', 'mid', 'end', 'late']) {
    const key = `money_making_${tier}`
    if (!isPro) { result[key] = ''; continue }
    try {
      const parsed = JSON.parse(raw[key] || '{}')
      const filtered = filterMoneyMaking(parsed, plan)
      result[key] = JSON.stringify(filtered)
    } catch {
      result[key] = ''
    }
  }

  // insight_patch — meme regle que patch_analysis, en repli
  const filteredInsights = (insights || [])
    .map(i => filterPatchInsight(i, plan))
    .filter(Boolean)

  return NextResponse.json({ ...result, insights: filteredInsights })
}
