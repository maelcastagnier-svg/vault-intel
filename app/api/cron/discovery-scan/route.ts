// app/api/cron/discovery-scan/route.ts
// Volet 2, point 2 (2 août, demandé explicitement par l'utilisateur) -- la boucle de
// découverte (discovery_queue) du chantier cartographie exhaustive ne tournait que
// pendant une session manuelle : dès qu'on arrêtait d'y travailler, plus aucune nouvelle
// page/mécanique n'était jamais signalée. Ce cron automatise la partie mécanique de
// l'Étape A (repérer une référence jamais vue) -- la partie jugement (est-ce un vrai
// système ? faut-il une table ?) reste humaine/Claude en session, zéro appel Claude ici
// (règle 6).
//
// Mécanisme : wiki-auto-sync recrawl déjà tout le wiki en continu (*/30 min) -- une page
// réellement nouvelle (jamais vue avant) obtient un `created_at` distinct de son
// `updated_at` (colonne ajoutée par migration le 2 août, jamais réécrite par l'upsert de
// wiki-auto-sync). Ce cron liste les pages dont `created_at` est postérieur au dernier
// run réussi de CE cron, et les logue dans discovery_queue si elles n'y sont pas déjà.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getWatermark(): Promise<string> {
  const { data } = await supabase
    .from('sync_log')
    .select('started_at')
    .eq('job_name', 'discovery-scan')
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  // Premier run : pas d'historique -- on part de maintenant pour ne rien reporter
  // rétroactivement (les 10k+ pages déjà connues ont toutes created_at=maintenant
  // suite à la migration d'ajout de colonne, ce ne sont pas de vraies nouveautés).
  return data?.started_at ?? new Date().toISOString()
}

// Pre-filtre bruit (25 août, optimisation coût -- extrait du triage manuel de
// 414 entrées le 25 août : ~70% des pages "nouvelles" détectées sont en fait
// du contenu vanilla Minecraft/changelogs/travel scrolls, jamais une
// mécanique Skyblock distincte). Appliqué ICI, à l'insertion, avant tout
// triage Haiku/Claude Code futur -- réduit d'autant le volume qui aurait
// besoin d'un jugement (humain, Claude Code, ou Haiku plus tard). Patterns
// gérés dans `discovery_queue_noise_patterns` (table, pas en dur ici) pour
// rester extensible sans redéploiement de code.
async function loadNoisePatterns(): Promise<RegExp[]> {
  const { data } = await supabase
    .from('discovery_queue_noise_patterns')
    .select('pattern')
    .eq('active', true)
  return (data || []).map(r => new RegExp(r.pattern, 'i'))
}

async function scanNewWikiPages(): Promise<{ pending: number; auto_resolved: number }> {
  const since = await getWatermark()

  const { data: newPages, error } = await supabase
    .from('game_mechanics_misc')
    .select('key, category, value')
    .eq('value->>source', 'hypixelskyblock_wiki')
    .gt('created_at', since)
  if (error) throw new Error('game_mechanics_misc scan: ' + error.message)
  if (!newPages || newPages.length === 0) return { pending: 0, auto_resolved: 0 }

  // Ne pas re-logger une page déjà présente dans discovery_queue (idempotent d'un run à l'autre)
  const { data: existing } = await supabase
    .from('discovery_queue')
    .select('reference_name')
    .eq('discovered_via', 'discovery-scan cron')
  const alreadyLogged = new Set((existing || []).map(e => e.reference_name))

  const noisePatterns = await loadNoisePatterns()
  const isNoise = (refName: string) => noisePatterns.some(re => re.test(refName))

  const rows = newPages
    .map(p => {
      const title = (p.value as any)?.title ?? p.key
      const refName = `wiki: ${title}`
      return { refName, category: p.category, key: p.key }
    })
    .filter(p => !alreadyLogged.has(p.refName))
    .map(p => {
      const noise = isNoise(p.refName)
      return {
        source: 'wiki-auto-sync (nouvelle page)',
        reference_name: p.refName,
        discovered_via: 'discovery-scan cron',
        status: noise ? 'resolved' : 'pending',
        resolved_at: noise ? new Date().toISOString() : null,
        notes: noise
          ? `Nouvelle page apparue dans game_mechanics_misc (category=${p.category}, key=${p.key}) -- auto-resolue par discovery_queue_noise_patterns (bruit vanilla connu), zero intervention manuelle.`
          : `Nouvelle page apparue dans game_mechanics_misc (category=${p.category}, key=${p.key}) -- jamais vue avant ce run. À trier : vrai nouveau système/mécanique, ou variante/item mineur sans besoin de table dédiée.`,
      }
    })

  if (rows.length === 0) return { pending: 0, auto_resolved: 0 }
  const { error: insErr } = await supabase.from('discovery_queue').insert(rows)
  if (insErr) throw new Error('discovery_queue insert: ' + insErr.message)
  return {
    pending: rows.filter(r => r.status === 'pending').length,
    auto_resolved: rows.filter(r => r.status === 'resolved').length,
  }
}

export async function runDiscoveryScan() {
  const logId = await startSync('discovery-scan')
  let result = { pending: 0, auto_resolved: 0 }
  let status: 'success' | 'error' = 'success'
  let errorMsg: string | undefined
  try {
    result = await scanNewWikiPages()
  } catch (err: any) {
    status = 'error'
    errorMsg = err.message
  }
  const total = result.pending + result.auto_resolved
  await finishSync(logId, status, total, { new_entries: total, ...result }, errorMsg)
  return { success: status === 'success', new_entries: total, ...result, error: errorMsg }
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runDiscoveryScan()
  return NextResponse.json(result)
}
