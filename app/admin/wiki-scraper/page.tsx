// app/admin/wiki-scraper/page.tsx
// Page admin — scrape le Wiki Hypixel depuis TON navigateur
// Lance cette page une fois par semaine pour enrichir la DB
'use client'
import { useState } from 'react'
import { createClient } from '../../../lib/supabase'

const supabase = createClient()

const WIKI_API = 'https://wiki.hypixel.net/api.php'

// Toutes les pages à scrapper
const WIKI_PAGES = [
  // Guides money making
  { category: 'wiki_guide', key: 'fishing',          page: 'Fishing'               },
  { category: 'wiki_guide', key: 'trophy_fishing',   page: 'Trophy_Fishing'        },
  { category: 'wiki_guide', key: 'garden',           page: 'Garden'                },
  { category: 'wiki_guide', key: 'pest_farming',     page: 'Pests'                 },
  { category: 'wiki_guide', key: 'crystal_hollows',  page: 'Crystal_Hollows'       },
  { category: 'wiki_guide', key: 'hotm',             page: 'Heart_of_the_Mountain' },
  { category: 'wiki_guide', key: 'crimson_isle',     page: 'Crimson_Isle'          },
  { category: 'wiki_guide', key: 'kuudra',           page: 'Kuudra'                },
  { category: 'wiki_guide', key: 'dungeons',         page: 'Dungeons'              },
  { category: 'wiki_guide', key: 'slayer',           page: 'Slayer'                },
  { category: 'wiki_guide', key: 'bazaar',           page: 'Bazaar'                },
  { category: 'wiki_guide', key: 'auction_house',    page: 'Auction_House'         },
  { category: 'wiki_guide', key: 'foraging',         page: 'Foraging'              },
  { category: 'wiki_guide', key: 'mining',           page: 'Mining'                },
  { category: 'wiki_guide', key: 'rift',             page: 'The_Rift'              },
  { category: 'wiki_guide', key: 'farming',          page: 'Farming'               },
  { category: 'wiki_guide', key: 'diana',            page: 'Diana'                 },
  { category: 'wiki_guide', key: 'combat',           page: 'Combat'                },
  // Armures
  { category: 'armor_set',  key: 'necron',           page: 'Necron\'s_Armor'       },
  { category: 'armor_set',  key: 'crimson',          page: 'Crimson_Armor'         },
  { category: 'armor_set',  key: 'superior_dragon',  page: 'Superior_Dragon_Armor' },
  { category: 'armor_set',  key: 'storm',            page: 'Storm\'s_Armor'        },
  { category: 'armor_set',  key: 'terror',           page: 'Terror_Armor'          },
  { category: 'armor_set',  key: 'fervor',           page: 'Fervor_Armor'          },
  { category: 'armor_set',  key: 'hollow',           page: 'Hollow_Armor'          },
  { category: 'armor_set',  key: 'aurora',           page: 'Aurora_Armor'          },
  { category: 'armor_set',  key: 'goldor',           page: 'Goldor\'s_Armor'       },
  { category: 'armor_set',  key: 'grim_reaper',      page: 'Grim_Reaper_Scythe'    },
  // Armes
  { category: 'weapon',     key: 'hyperion',         page: 'Hyperion'              },
  { category: 'weapon',     key: 'midas_staff',      page: 'Midas_Staff'           },
  { category: 'weapon',     key: 'terminator',       page: 'Terminator'            },
  { category: 'weapon',     key: 'astraea',          page: 'Astraea'               },
  { category: 'weapon',     key: 'juju_shortbow',    page: 'Juju_Shortbow'         },
  { category: 'weapon',     key: 'valkyrie',         page: 'Valkyrie'              },
  { category: 'weapon',     key: 'reaper_scythe',    page: 'Reaper_Scythe'         },
  // Pets
  { category: 'pet_guide',  key: 'enderman_pet',     page: 'Enderman_(Pet)'        },
  { category: 'pet_guide',  key: 'griffin_pet',      page: 'Griffin_(Pet)'         },
  { category: 'pet_guide',  key: 'golden_dragon',    page: 'Golden_Dragon_(Pet)'   },
  { category: 'pet_guide',  key: 'bee_pet',          page: 'Bee_(Pet)'             },
  { category: 'pet_guide',  key: 'lion_pet',         page: 'Lion_(Pet)'            },
  // Donjons par floor
  { category: 'dungeon_wiki', key: 'f7',             page: 'Catacombs/Floor_VII'   },
  { category: 'dungeon_wiki', key: 'm7',             page: 'Catacombs/Master_Mode' },
  { category: 'dungeon_wiki', key: 'f6',             page: 'Catacombs/Floor_VI'    },
  // Slayers
  { category: 'slayer_wiki', key: 'zombie',          page: 'Revenant_Horror'       },
  { category: 'slayer_wiki', key: 'spider',          page: 'Tarantula_Broodfather' },
  { category: 'slayer_wiki', key: 'wolf',            page: 'Sven_Packmaster'       },
  { category: 'slayer_wiki', key: 'enderman',        page: 'Voidgloom_Seraph'      },
  { category: 'slayer_wiki', key: 'blaze',           page: 'Inferno_Demonlord'     },
  { category: 'slayer_wiki', key: 'vampire',         page: 'Riftstalker_Bloodfiend' },
]

type PageResult = {
  key:      string
  category: string
  status:   'pending' | 'success' | 'failed' | 'empty'
  chars?:   number
  error?:   string
}

export default function WikiScraperAdmin() {
  const [running,  setRunning]  = useState(false)
  const [results,  setResults]  = useState<PageResult[]>([])
  const [progress, setProgress] = useState(0)
  const [current,  setCurrent]  = useState('')

  async function fetchWikiPage(page: string): Promise<string> {
    // Fetch direct depuis le browser — pas de CORS
    const url  = `${WIKI_API}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&origin=*`
    const res  = await fetch(url)
    const data = await res.json()
    return data?.parse?.wikitext?.['*'] || ''
  }

  async function runScraper() {
    setRunning(true)
    setResults([])
    setProgress(0)

    const total = WIKI_PAGES.length

    for (let i = 0; i < WIKI_PAGES.length; i++) {
      const p = WIKI_PAGES[i]
      setCurrent(p.page)
      setProgress(Math.round((i / total) * 100))

      let result: PageResult = { key: p.key, category: p.category, status: 'pending' }

      try {
        const text = await fetchWikiPage(p.page)

        if (text.length < 100) {
          result = { ...result, status: 'empty' }
        } else {
          // Sauvegarde dans Supabase
          const { error } = await supabase
            .from('game_mechanics_misc')
            .upsert({
              category:   p.category,
              key:        p.key,
              value:      { page: p.page, content: text.slice(0, 8000), chars: text.length },
              updated_at: new Date().toISOString()
            }, { onConflict: 'category, key' })

          if (error) {
            result = { ...result, status: 'failed', error: error.message }
          } else {
            result = { ...result, status: 'success', chars: text.length }
          }
        }
      } catch (err: any) {
        result = { ...result, status: 'failed', error: err.message }
      }

      setResults(prev => [...prev, result])

      // Délai pour ne pas spam le wiki
      await new Promise(r => setTimeout(r, 500))
    }

    setProgress(100)
    setCurrent('')
    setRunning(false)
  }

  const successCount = results.filter(r => r.status === 'success').length
  const failedCount  = results.filter(r => r.status === 'failed').length
  const emptyCount   = results.filter(r => r.status === 'empty').length

  const statusColor = (s: PageResult['status']) => ({
    success: '#1baf7a',
    failed:  '#e34948',
    empty:   '#eda100',
    pending: '#6b6960'
  }[s])

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', padding: '2rem', fontFamily: 'Space Mono, monospace', color: '#e8e6df' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: '#c9a84c', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
            VAULT ADMIN
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f0d68a', marginBottom: 4 }}>
            Wiki Scraper
          </div>
          <div style={{ fontSize: 11, color: '#6b6960' }}>
            Scrapes {WIKI_PAGES.length} pages depuis ton navigateur et les sauvegarde dans Supabase.
            Lance une fois par semaine.
          </div>
        </div>

        {/* Bouton + progress */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={runScraper}
            disabled={running}
            style={{
              background:    running ? '#1a1a18' : '#c9a84c',
              color:         running ? '#6b6960' : '#0a0a0a',
              border:        'none',
              padding:       '10px 24px',
              borderRadius:  6,
              fontSize:      12,
              fontWeight:    700,
              cursor:        running ? 'not-allowed' : 'pointer',
              fontFamily:    'Space Mono, monospace',
              marginBottom:  12
            }}
          >
            {running ? '⏳ Scraping...' : '🚀 Start Wiki Scraper'}
          </button>

          {running && (
            <div>
              <div style={{ fontSize: 10, color: '#6b6960', marginBottom: 6 }}>
                {progress}% — {current}
              </div>
              <div style={{ height: 4, background: '#1a1a18', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: progress + '%', background: '#c9a84c', transition: 'width 0.3s ease', borderRadius: 2 }} />
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        {results.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Success', count: successCount, color: '#1baf7a' },
              { label: 'Empty',   count: emptyCount,   color: '#eda100' },
              { label: 'Failed',  count: failedCount,  color: '#e34948' },
            ].map(s => (
              <div key={s.label} style={{ background: s.color + '12', border: '1px solid ' + s.color + '30', borderRadius: 8, padding: '8px 14px' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 9, color: s.color + 'aa', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
            <div style={{ background: '#c9a84c12', border: '1px solid #c9a84c30', borderRadius: 8, padding: '8px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#c9a84c' }}>
                {results.reduce((s, r) => s + (r.chars || 0), 0).toLocaleString()}
              </div>
              <div style={{ fontSize: 9, color: '#c9a84caa', textTransform: 'uppercase' }}>Chars saved</div>
            </div>
          </div>
        )}

        {/* Résultats */}
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {results.map((r, i) => (
              <div
                key={i}
                style={{
                  display:        'flex',
                  justifyContent: 'space-between',
                  alignItems:     'center',
                  padding:        '7px 12px',
                  background:     '#111110',
                  borderLeft:     '2px solid ' + statusColor(r.status),
                  borderRadius:   4,
                  fontSize:       10
                }}
              >
                <div>
                  <span style={{ color: '#6b6960', marginRight: 8 }}>[{r.category}]</span>
                  <span style={{ color: '#e8e6df' }}>{r.key}</span>
                  {r.error && <span style={{ color: '#e34948', marginLeft: 8 }}>— {r.error.slice(0, 40)}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {r.chars && <span style={{ color: '#6b6960' }}>{r.chars.toLocaleString()} chars</span>}
                  <span style={{ color: statusColor(r.status), fontWeight: 700, textTransform: 'uppercase' }}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Instructions */}
        {results.length === 0 && !running && (
          <div style={{ background: '#111110', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 10, padding: 20, fontSize: 11, color: '#6b6960', lineHeight: 1.8 }}>
            <div style={{ color: '#c9a84c', fontWeight: 700, marginBottom: 8 }}>ℹ️ Comment ça marche</div>
            <div>1. Clique sur "Start Wiki Scraper"</div>
            <div>2. Le browser fetch les {WIKI_PAGES.length} pages wiki directement (pas de blocage)</div>
            <div>3. Chaque page est sauvegardée dans Supabase (game_mechanics_misc)</div>
            <div>4. Claude utilise ces données pour générer des analyses plus précises</div>
            <div style={{ marginTop: 12, color: '#eda100' }}>⚠️ Lance depuis ton navigateur, pas depuis Vercel</div>
          </div>
        )}
      </div>
    </div>
  )
}