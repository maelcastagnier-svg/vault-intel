// app/api/cron/wiki-auto-sync/route.ts
// Sync automatique du wiki officiel (hypixelskyblock.minecraft.wiki), remplace le
// Fandom (hypixel-skyblock.fandom.com) — validé plus fiable et plus complet lors de
// l'investigation Milestones du 22 juillet. Même API MediaWiki, structure identique
// (vérifié : action=query/list=allpages et action=parse&prop=wikitext répondent pareil),
// seul le domaine change.
// 1. Pagine toutes les pages du wiki
// 2. Fetche le contenu de chaque page
// 3. Upsert dans game_mechanics_misc — contenu complet, plus de troncature à 8000
//    caractères (c'était une limite qu'on s'imposait nous-mêmes, jamais une contrainte
//    de l'API ou de la colonne jsonb)
// 4. Applique clean_wikitext sur les nouvelles pages
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WIKI_API = 'https://hypixelskyblock.minecraft.wiki/api.php'

// Pages à ignorer
const SKIP_PREFIXES = [
  'File:', 'Template:', 'Category:', 'User:', 'Talk:',
  'User_talk:', 'Template_talk:', 'MediaWiki:', 'Help:',
  'Module:', 'Project:', 'Hypixel_SkyBlock_Wiki:'
]

// Catégorisation automatique
function categorize(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('armor') || t.includes('helmet') || t.includes('chestplate') || t.includes('leggings') || t.includes('boots')) return 'armor_set'
  if (t.includes('sword') || t.includes('bow') || t.includes('staff') || t.includes('wand') || t.includes('blade') || t.includes('scythe')) return 'weapon'
  if (t.includes('(pet)') || t.includes('_pet')) return 'pet_guide'
  if (t.includes('slayer') || t.includes('horror') || t.includes('broodfather') || t.includes('packmaster') || t.includes('seraph') || t.includes('demonlord') || t.includes('bloodfiend')) return 'slayer_wiki'
  if (t.includes('dungeon') || t.includes('catacombs') || t.includes('floor')) return 'dungeon_wiki'
  if (t.includes('kuudra')) return 'kuudra_wiki'
  if (t.includes('fishing') || t.includes('trophy_fish') || t.includes('sea_creature')) return 'fishing_wiki'
  if (t.includes('mining') || t.includes('crystal_hollow') || t.includes('dwarven') || t.includes('glacite') || t.includes('hotm') || t.includes('heart_of_the_mountain')) return 'mining_wiki'
  if (t.includes('garden') || t.includes('pest') || t.includes('farming')) return 'farming_wiki'
  if (t.includes('talisman') || t.includes('accessory') || t.includes('artifact') || t.includes('ring') || t.includes('orb')) return 'accessory_wiki'
  if (t.includes('minion')) return 'minion_wiki'
  if (t.includes('enchant')) return 'enchant_wiki'
  if (t.includes('reforge')) return 'reforge_wiki'
  if (t.includes('mayor') || t.includes('election')) return 'mayor_wiki'
  if (t.includes('bazaar') || t.includes('auction')) return 'economy_wiki'
  if (t.includes('skill')) return 'skill_wiki'
  if (t.includes('gemstone')) return 'gemstone_wiki'
  return 'game_wiki'
}

// ── Fetch liste de pages (1 batch) ──────────────────────────
async function fetchPageBatch(continueToken?: string): Promise<{
  pages: { title: string; pageid: number }[]
  nextToken?: string
}> {
  const params = new URLSearchParams({
    action:      'query',
    list:        'allpages',
    aplimit:     '50', // 50 pages par batch pour rester sous 120s
    apnamespace: '0',
    format:      'json',
    origin:      '*'
  })
  if (continueToken) params.set('apcontinue', continueToken)

  const res  = await fetch(`${WIKI_API}?${params}`)
  const data = await res.json()

  const pages = (data?.query?.allpages || [])
    .filter((p: any) => !SKIP_PREFIXES.some(prefix => p.title.startsWith(prefix)))
    .map((p: any) => ({ title: p.title, pageid: p.pageid }))

  return {
    pages,
    nextToken: data?.continue?.apcontinue
  }
}

// ── Fetch contenu d'une page ─────────────────────────────────
async function fetchPageContent(title: string): Promise<string> {
  const url  = `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&origin=*`
  const res  = await fetch(url)
  const data = await res.json()
  return data?.parse?.wikitext?.['*'] || ''
}

// ── Upsert une page dans Supabase ───────────────────────────
async function upsertPage(title: string, content: string): Promise<boolean> {
  if (content.length < 100) return false

  const category = categorize(title)
  const key      = title.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 100)

  const { error } = await supabase
    .from('game_mechanics_misc')
    .upsert({
      category,
      key,
      value: {
        title,
        source:  'hypixelskyblock_wiki',
        content, // plus de troncature — la limite à 8000 caractères était auto-imposée
        chars:   content.length
      },
      updated_at: new Date().toISOString()
    }, { onConflict: 'category, key' })

  return !error
}

// ── Applique clean_wikitext sur les nouvelles pages ──────────
async function cleanNewPages(): Promise<number> {
  const { data, error } = await supabase.rpc('clean_new_wiki_pages')
  if (error) {
    console.error('clean_new_wiki_pages error:', error.message)
    return 0
  }
  return data || 0
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Récupère le token de continuation depuis la dernière exécution.
  // Clé renommée ('wiki_auto_sync' -> 'wiki_auto_sync_official') suite au changement de
  // source : le continue_token de la pagination Fandom n'a aucun sens sur le nouveau wiki
  // (page set totalement différent) — repart de zéro proprement plutôt que de réutiliser
  // un état incompatible. L'ancienne clé reste en base, inerte, pas de nettoyage nécessaire.
  const { data: stateData } = await supabase
    .from('game_mechanics_misc')
    .select('value')
    .eq('category', '_sync_state')
    .eq('key', 'wiki_auto_sync_official')
    .single()

  const continueToken = stateData?.value?.continue_token || undefined
  const isComplete    = stateData?.value?.is_complete || false

  // Si le scan précédent était complet, on recommence depuis le début
  const token = isComplete ? undefined : continueToken

  const logId = await startSync('wiki-auto-sync')

  try {
    // Fetch 1 batch de 50 pages
    const { pages, nextToken } = await fetchPageBatch(token)

    let scraped  = 0
    let skipped  = 0
    let inserted = 0

    // Scrape chaque page
    for (const page of pages) {
      try {
        const content = await fetchPageContent(page.title)
        if (content.length >= 100) {
          const ok = await upsertPage(page.title, content)
          if (ok) inserted++
          scraped++
        } else {
          skipped++
        }
        // Pause 200ms entre chaque page
        await new Promise(r => setTimeout(r, 200))
      } catch (err: any) {
        console.error('Page error ' + page.title + ':', err.message)
        skipped++
      }
    }

    // Applique clean_wikitext sur les nouvelles pages
    const cleaned = await cleanNewPages()

    // Sauvegarde l'état pour la prochaine exécution
    const totalScraped = (stateData?.value?.total_scraped || 0) + scraped
    await supabase
      .from('game_mechanics_misc')
      .upsert({
        category:   '_sync_state',
        key:        'wiki_auto_sync_official',
        value: {
          continue_token: nextToken || null,
          is_complete:    !nextToken,
          last_run:       new Date().toISOString(),
          total_scraped:  totalScraped
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'category, key' })

    await finishSync(logId, 'success', inserted, {
      batch_size: pages.length, scraped, skipped, cleaned,
      has_more: !!nextToken, total_scraped: totalScraped,
    })

    return NextResponse.json({
      success:      true,
      batch_size:   pages.length,
      scraped,
      inserted,
      skipped,
      cleaned,
      has_more:     !!nextToken,
      is_complete:  !nextToken,
      next_token:   nextToken || 'COMPLETE'
    })

  } catch (error: any) {
    console.error('wiki-auto-sync error:', error)
    await finishSync(logId, 'error', 0, undefined, error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}