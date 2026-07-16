// app/admin/wiki-scraper/page.tsx
// Scraper complet du Fandom Wiki Hypixel Skyblock
// Pagine toutes les pages → filtre les pertinentes → sauvegarde dans Supabase
'use client'
import { useState, useRef } from 'react'
import { createClient } from '../../../lib/supabase'

const supabase   = createClient()
const FANDOM_API = 'https://hypixel-skyblock.fandom.com/api.php'

// Pages à ignorer (maintenance, meta, templates)
const SKIP_PREFIXES = [
  'File:', 'Template:', 'Category:', 'User:', 'Talk:', 'User_talk:',
  'Template_talk:', 'File_talk:', 'MediaWiki:', 'Help:', 'Special:',
  'Module:', 'Project:', 'Hypixel_SkyBlock_Wiki:'
]

// Catégorisation automatique depuis le titre
function categorize(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('armor') || t.includes('helmet') || t.includes('chestplate') || t.includes('leggings') || t.includes('boots')) return 'armor_set'
  if (t.includes('sword') || t.includes('bow') || t.includes('staff') || t.includes('wand') || t.includes('axe') || t.includes('blade') || t.includes('scythe')) return 'weapon'
  if (t.includes('(pet)') || t.includes('_pet')) return 'pet_guide'
  if (t.includes('slayer') || t.includes('horror') || t.includes('broodfather') || t.includes('packmaster') || t.includes('seraph') || t.includes('demonlord') || t.includes('bloodfiend')) return 'slayer_wiki'
  if (t.includes('dungeon') || t.includes('catacombs') || t.includes('floor')) return 'dungeon_wiki'
  if (t.includes('kuudra')) return 'kuudra_wiki'
  if (t.includes('fishing') || t.includes('trophy_fish') || t.includes('sea_creature')) return 'fishing_wiki'
  if (t.includes('mining') || t.includes('crystal_hollow') || t.includes('dwarven') || t.includes('glacite') || t.includes('hotm') || t.includes('heart_of_the_mountain')) return 'mining_wiki'
  if (t.includes('garden') || t.includes('pest') || t.includes('farming')) return 'farming_wiki'
  if (t.includes('foraging')) return 'foraging_wiki'
  if (t.includes('talisman') || t.includes('accessory') || t.includes('artifact') || t.includes('ring') || t.includes('orb')) return 'accessory_wiki'
  if (t.includes('minion')) return 'minion_wiki'
  if (t.includes('enchant')) return 'enchant_wiki'
  if (t.includes('reforge') || t.includes('reforge_stone')) return 'reforge_wiki'
  if (t.includes('mayor') || t.includes('election') || t.includes('jerry')) return 'mayor_wiki'
  if (t.includes('bazaar') || t.includes('auction') || t.includes('flip')) return 'economy_wiki'
  if (t.includes('skill')) return 'skill_wiki'
  if (t.includes('gemstone')) return 'gemstone_wiki'
  if (t.includes('boss') || t.includes('mob') || t.includes('monster')) return 'mob_wiki'
  return 'game_wiki'
}

// Pages prioritaires à scrapper en premier
const PRIORITY_CATEGORIES = [
  'armor_set', 'weapon', 'slayer_wiki', 'dungeon_wiki', 'kuudra_wiki',
  'fishing_wiki', 'mining_wiki', 'farming_wiki', 'accessory_wiki',
  'minion_wiki', 'pet_guide', 'economy_wiki', 'mayor_wiki'
]

type ScrapeStatus = 'idle' | 'listing' | 'scraping' | 'done'

type PageResult = {
  title:    string
  category: string
  status:   'success' | 'failed' | 'empty' | 'skipped'
  chars?:   number
  error?:   string
}

export default function WikiScraperAdmin() {
  const [status,      setStatus]      = useState<ScrapeStatus>('idle')
  const [allPages,    setAllPages]    = useState<{ title: string; category: string }[]>([])
  const [results,     setResults]     = useState<PageResult[]>([])
  const [progress,    setProgress]    = useState(0)
  const [currentPage, setCurrentPage] = useState('')
  const [phase,       setPhase]       = useState('')
  const stopRef = useRef(false)

  // ── PHASE 1 : Récupère toutes les pages via pagination ────
  async function fetchAllPageTitles(): Promise<{ title: string; category: string }[]> {
    const pages: { title: string; category: string }[] = []
    let continueToken: string | null = null
    let batch = 0

    do {
      const params = new URLSearchParams({
        action:    'query',
        list:      'allpages',
        aplimit:   '500',
        apnamespace: '0', // Namespace 0 = articles principaux uniquement
        format:    'json',
        origin:    '*'
      })

      if (continueToken) params.set('apcontinue', continueToken)

      const res  = await fetch(`${FANDOM_API}?${params}`)
      const data = await res.json()

      const rawPages = data?.query?.allpages || []

      for (const p of rawPages) {
        const title = p.title as string

        // Skip pages de maintenance
        const isSkip = SKIP_PREFIXES.some(prefix => title.startsWith(prefix))
        if (isSkip) continue

        // Skip pages trop courtes ou meta
        if (title.length < 3) continue

        pages.push({ title, category: categorize(title) })
      }

      continueToken = data?.continue?.apcontinue || null
      batch++
      setPhase(`Listing pages... batch ${batch} (${pages.length} found)`)

      // Pause entre les requêtes
      await new Promise(r => setTimeout(r, 200))

    } while (continueToken && !stopRef.current)

    return pages
  }

  // ── PHASE 2 : Scrape le contenu de chaque page ───────────
  async function scrapePages(pages: { title: string; category: string }[]) {
    const total = pages.length
    let idx     = 0

    for (const p of pages) {
      if (stopRef.current) break

      setCurrentPage(p.title)
      setProgress(Math.round((idx / total) * 100))
      idx++

      let result: PageResult = { title: p.title, category: p.category, status: 'failed' }

      try {
        const url  = `${FANDOM_API}?action=parse&page=${encodeURIComponent(p.title)}&prop=wikitext&format=json&origin=*`
        const res  = await fetch(url)
        const data = await res.json()

        if (data.error) {
          result = { ...result, status: 'skipped', error: data.error.info }
        } else {
          const text = data?.parse?.wikitext?.['*'] || ''

          if (text.length < 100) {
            result = { ...result, status: 'empty' }
          } else {
            // Sauvegarde dans Supabase
            const key = p.title.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 100)

            const { error } = await supabase
              .from('game_mechanics_misc')
              .upsert({
                category:   p.category,
                key,
                value: {
                  title:   p.title,
                  source:  'fandom_wiki',
                  content: text.slice(0, 8000),
                  chars:   text.length
                },
                updated_at: new Date().toISOString()
              }, { onConflict: 'category, key' })

            result = error
              ? { ...result, status: 'failed', error: error.message }
              : { ...result, status: 'success', chars: text.length }
          }
        }
      } catch (err: any) {
        result = { ...result, status: 'failed', error: err.message }
      }

      setResults(prev => [result, ...prev].slice(0, 200)) // Garde les 200 derniers
      await new Promise(r => setTimeout(r, 300)) // Respecte le rate limit Fandom
    }
  }

  async function startScraper(priorityOnly = false) {
    stopRef.current = false
    setStatus('listing')
    setResults([])
    setProgress(0)
    setAllPages([])

    try {
      // Phase 1 — Liste toutes les pages
      setPhase('Fetching page list...')
      const pages = await fetchAllPageTitles()

      // Trie : prioritaires en premier, puis le reste
      const sorted = priorityOnly
        ? pages.filter(p => PRIORITY_CATEGORIES.includes(p.category))
        : [
            ...pages.filter(p => PRIORITY_CATEGORIES.includes(p.category)),
            ...pages.filter(p => !PRIORITY_CATEGORIES.includes(p.category))
          ]

      setAllPages(sorted)
      setStatus('scraping')
      setPhase('Scraping content...')

      // Phase 2 — Scrape le contenu
      await scrapePages(sorted)

    } catch (err: any) {
      console.error('Scraper error:', err)
    }

    setStatus('done')
    setPhase('')
    setProgress(100)
  }

  function stopScraper() {
    stopRef.current = true
  }

  const successCount = results.filter(r => r.status === 'success').length
  const failedCount  = results.filter(r => r.status === 'failed').length
  const emptyCount   = results.filter(r => r.status === 'empty').length
  const skippedCount = results.filter(r => r.status === 'skipped').length
  const totalChars   = results.reduce((s, r) => s + (r.chars || 0), 0)

  // Catégories découvertes
  const categoryCounts = results.reduce((acc, r) => {
    if (r.status === 'success') acc[r.category] = (acc[r.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const statusColor = (s: PageResult['status']) => ({
    success: '#1baf7a',
    failed:  '#e34948',
    empty:   '#eda100',
    skipped: '#6b6960'
  }[s])

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', padding: '2rem', fontFamily: 'Space Mono, monospace', color: '#e8e6df' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: '#c9a84c', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
            VAULT ADMIN
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f0d68a', marginBottom: 4 }}>
            🕸️ Fandom Wiki — Complete Scraper
          </div>
          <div style={{ fontSize: 11, color: '#6b6960' }}>
            Scrape l'intégralité du Fandom Wiki Hypixel Skyblock par pagination automatique.
            {allPages.length > 0 && ` ${allPages.length} pages détectées.`}
          </div>
        </div>

        {/* Contrôles */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <button
            onClick={() => startScraper(true)}
            disabled={status === 'listing' || status === 'scraping'}
            style={{
              background:   status !== 'idle' && status !== 'done' ? '#1a1a18' : '#c9a84c',
              color:        status !== 'idle' && status !== 'done' ? '#6b6960' : '#0a0a0a',
              border:       'none', padding: '10px 20px', borderRadius: 6,
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Space Mono, monospace'
            }}
          >
            ⚡ Priority Only (fast)
          </button>

          <button
            onClick={() => startScraper(false)}
            disabled={status === 'listing' || status === 'scraping'}
            style={{
              background:   'transparent',
              color:        status !== 'idle' && status !== 'done' ? '#6b6960' : '#c9a84c',
              border:       '1px solid #c9a84c40',
              padding:      '10px 20px', borderRadius: 6,
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Space Mono, monospace'
            }}
          >
            🌐 Full Wiki (slow)
          </button>

          {(status === 'listing' || status === 'scraping') && (
            <button
              onClick={stopScraper}
              style={{
                background: '#e3494815', color: '#e34948',
                border: '1px solid #e3494840', padding: '10px 20px',
                borderRadius: 6, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'Space Mono, monospace'
              }}
            >
              ⏹ Stop
            </button>
          )}
        </div>

        {/* Progress */}
        {(status === 'listing' || status === 'scraping') && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b6960', marginBottom: 6 }}>
              <span>{phase}</span>
              <span>{progress}% — {results.length} pages traitées</span>
            </div>
            <div style={{ height: 4, background: '#1a1a18', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: (status === 'listing' ? '20' : progress) + '%',
                background: '#c9a84c', transition: 'width 0.3s ease', borderRadius: 2
              }} />
            </div>
            {currentPage && (
              <div style={{ fontSize: 9, color: '#6b6960', marginTop: 4 }}>
                → {currentPage}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        {results.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Success',  count: successCount,              color: '#1baf7a' },
              { label: 'Empty',    count: emptyCount,                color: '#eda100' },
              { label: 'Skipped',  count: skippedCount,              color: '#6b6960' },
              { label: 'Failed',   count: failedCount,               color: '#e34948' },
              { label: 'MB saved', count: (totalChars / 1e6).toFixed(1), color: '#c9a84c' },
            ].map(s => (
              <div key={s.label} style={{
                background: s.color + '12', border: '1px solid ' + s.color + '30',
                borderRadius: 8, padding: '8px 14px'
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 9, color: s.color + 'aa', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Catégories */}
        {Object.keys(categoryCounts).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, color: '#6b6960', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Pages par catégorie
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(categoryCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => (
                  <div key={cat} style={{
                    background: '#111110', border: '1px solid rgba(201,168,76,0.15)',
                    borderRadius: 4, padding: '3px 8px', fontSize: 9
                  }}>
                    <span style={{ color: '#c9a84c' }}>{count}</span>
                    <span style={{ color: '#6b6960', marginLeft: 4 }}>{cat}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* Feed résultats temps réel */}
        <div>
          <div style={{ fontSize: 9, color: '#6b6960', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Live feed (200 dernières)
          </div>
          <div style={{ maxHeight: 500, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {results.map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 10px', background: '#111110',
                borderLeft: '2px solid ' + statusColor(r.status),
                borderRadius: 3, fontSize: 9
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ color: '#6b6960', marginRight: 6 }}>[{r.category}]</span>
                  <span style={{ color: '#e8e6df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.title.slice(0, 50)}
                  </span>
                  {r.error && <span style={{ color: '#e34948', marginLeft: 6 }}>— {r.error.slice(0, 30)}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 8 }}>
                  {r.chars && <span style={{ color: '#6b6960' }}>{(r.chars / 1000).toFixed(1)}K</span>}
                  <span style={{ color: statusColor(r.status), fontWeight: 700, textTransform: 'uppercase' }}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Instructions */}
        {status === 'idle' && (
          <div style={{ marginTop: 20, background: '#111110', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 10, padding: 20, fontSize: 11, color: '#6b6960', lineHeight: 1.9 }}>
            <div style={{ color: '#c9a84c', fontWeight: 700, marginBottom: 8 }}>⚡ Priority Only vs 🌐 Full Wiki</div>
            <div><strong style={{ color: '#e8e6df' }}>Priority Only</strong> — Scrape uniquement les pages pertinentes (armures, armes, slayers, donjons, farming, fishing, mining...). ~200-400 pages. ~5-10 min.</div>
            <div style={{ marginTop: 6 }}><strong style={{ color: '#e8e6df' }}>Full Wiki</strong> — Scrape toutes les pages du wiki (3000-5000 pages). ~2-3 heures. Couvre TOUT le contenu du jeu.</div>
            <div style={{ marginTop: 10, color: '#1baf7a' }}>✅ Laisse la page ouverte pendant le scraping</div>
            <div style={{ color: '#1baf7a' }}>✅ Tu peux arrêter et reprendre — les pages déjà sauvegardées sont préservées</div>
          </div>
        )}

        {status === 'done' && (
          <div style={{ marginTop: 20, background: '#1baf7a12', border: '1px solid #1baf7a30', borderRadius: 10, padding: 16, fontSize: 11 }}>
            <div style={{ color: '#1baf7a', fontWeight: 700, marginBottom: 4 }}>✅ Scraping terminé</div>
            <div style={{ color: '#6b6960' }}>
              {successCount} pages sauvegardées — {(totalChars / 1e6).toFixed(2)} MB de données wiki dans Supabase.
              Claude peut maintenant utiliser tout ce contexte pour des analyses ultra-précises.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}