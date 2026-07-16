// app/api/cron/wiki-sync/route.ts
// Sync hebdomadaire depuis le Wiki Hypixel via proxy AllOrigins
// Met à jour : game_mechanics_misc (dungeons, guides, fishing, mining, farming)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WIKI_BASE = 'https://wiki.hypixel.net/api.php'

// ── Fetch via proxy AllOrigins ───────────────────────────────
async function fetchWikiViaProxy(page: string): Promise<string> {
  const wikiUrl  = `${WIKI_BASE}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json`
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(wikiUrl)}`

  const res = await fetch(proxyUrl, {
    headers: { 'Accept': 'application/json' }
  })

  if (!res.ok) throw new Error(`Proxy fetch failed: ${res.status}`)

  const wrapper = await res.json()
  if (!wrapper.contents) throw new Error('Empty proxy response')

  const inner = JSON.parse(wrapper.contents)
  return inner?.parse?.wikitext?.['*'] || ''
}

// Fallback — corsproxy.io
async function fetchWikiFallback(page: string): Promise<string> {
  const wikiUrl  = `${WIKI_BASE}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json`
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(wikiUrl)}`

  const res = await fetch(proxyUrl)
  if (!res.ok) throw new Error(`Fallback proxy failed: ${res.status}`)

  const data = await res.json()
  return data?.parse?.wikitext?.['*'] || ''
}

async function fetchWikiPage(page: string): Promise<string> {
  try {
    const text = await fetchWikiViaProxy(page)
    if (text.length > 100) return text
  } catch (e1) {
    try {
      const text = await fetchWikiFallback(page)
      if (text.length > 100) return text
    } catch (e2) {}
  }
  return ''
}

function parseNumber(text: string, pattern: RegExp): number {
  const match = text.match(pattern)
  return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0
}

// ── Upsert dans game_mechanics_misc ─────────────────────────
async function upsertMisc(category: string, key: string, value: any): Promise<void> {
  await supabase.from('game_mechanics_misc').upsert({
    category,
    key,
    value,
    updated_at: new Date().toISOString()
  }, { onConflict: 'category, key' })
}

// ============================================================
// PAGES À SCRAPPER
// ============================================================
const WIKI_PAGES = [
  // Money Making
  { category: 'wiki_guide', key: 'fishing',          page: 'Fishing'                },
  { category: 'wiki_guide', key: 'trophy_fishing',   page: 'Trophy_Fishing'         },
  { category: 'wiki_guide', key: 'garden',           page: 'Garden'                 },
  { category: 'wiki_guide', key: 'pest_farming',     page: 'Pests'                  },
  { category: 'wiki_guide', key: 'crystal_hollows',  page: 'Crystal_Hollows'        },
  { category: 'wiki_guide', key: 'hotm',             page: 'Heart_of_the_Mountain'  },
  { category: 'wiki_guide', key: 'crimson_isle',     page: 'Crimson_Isle'           },
  { category: 'wiki_guide', key: 'kuudra',           page: 'Kuudra'                 },
  { category: 'wiki_guide', key: 'dungeons',         page: 'Dungeons'               },
  { category: 'wiki_guide', key: 'slayer',           page: 'Slayer'                 },
  { category: 'wiki_guide', key: 'bazaar',           page: 'Bazaar'                 },
  { category: 'wiki_guide', key: 'auction_house',    page: 'Auction_House'          },
  { category: 'wiki_guide', key: 'foraging',         page: 'Foraging'               },
  { category: 'wiki_guide', key: 'mining',           page: 'Mining'                 },
  { category: 'wiki_guide', key: 'rift',             page: 'The_Rift'               },
  // Armures et sets
  { category: 'armor_set',  key: 'necron',           page: 'Necron\'s_Armor'        },
  { category: 'armor_set',  key: 'crimson',          page: 'Crimson_Armor'          },
  { category: 'armor_set',  key: 'superior_dragon',  page: 'Superior_Dragon_Armor'  },
  { category: 'armor_set',  key: 'storm',            page: 'Storm\'s_Armor'         },
  { category: 'armor_set',  key: 'blaze',            page: 'Blaze_Armor'            },
  // Armes
  { category: 'weapon',     key: 'hyperion',         page: 'Hyperion'               },
  { category: 'weapon',     key: 'midas_staff',      page: 'Midas_Staff'            },
  { category: 'weapon',     key: 'terminator',       page: 'Terminator'             },
  // Pets
  { category: 'pet_guide',  key: 'enderman_pet',     page: 'Enderman_(Pet)'         },
  { category: 'pet_guide',  key: 'griffin_pet',      page: 'Griffin_(Pet)'          },
  { category: 'pet_guide',  key: 'golden_dragon',    page: 'Golden_Dragon_(Pet)'    },
]

// ============================================================
// SYNC SLAYERS depuis le Wiki
// ============================================================
async function syncSlayersFromWiki(): Promise<number> {
  let synced = 0

  const slayers = [
    { page: 'Revenant_Horror',       type: 'zombie',   costs: [500, 1000, 2000, 8000, 40000] },
    { page: 'Tarantula_Broodfather', type: 'spider',   costs: [500, 1000, 2500, 10000, 50000] },
    { page: 'Sven_Packmaster',       type: 'wolf',     costs: [500, 1000, 2500, 10000, 50000] },
    { page: 'Voidgloom_Seraph',      type: 'enderman', costs: [500, 1500, 3000, 12000, 60000] },
    { page: 'Inferno_Demonlord',     type: 'blaze',    costs: [500, 1000, 2500, 10000, 50000] },
    { page: 'Riftstalker_Bloodfiend', type: 'vampire', costs: [500, 1000, 2500, 10000, 50000] }
  ]

  for (const slayer of slayers) {
    try {
      const text = await fetchWikiPage(slayer.page)

      for (let tier = 1; tier <= 5; tier++) {
        // Essaie d'extraire le coût depuis le wiki
        const costFromWiki = text
          ? parseNumber(text, new RegExp('tier\\s*' + tier + '.*?(\\d[\\d,]*)\\s*coin', 'i'))
          : 0

        const finalCost = costFromWiki || slayer.costs[tier - 1]

        await supabase.from('slayer_data').upsert({
          slayer_type:           slayer.type,
          tier,
          coin_cost:             finalCost,
          avg_kill_time_seconds: tier * 55 + 5,
          wiki_content:          text ? text.slice(0, 500) : ''
        }, { onConflict: 'slayer_type, tier' })

        synced++
      }

      // Stocke aussi dans game_mechanics_misc pour le contexte Claude
      if (text) {
        await upsertMisc('slayer_wiki', slayer.type, {
          content: text.slice(0, 3000),
          page:    slayer.page
        })
      }

    } catch (err: any) {
      console.error('Slayer wiki error ' + slayer.page + ':', err.message)

      // Fallback données connues
      for (let tier = 1; tier <= 5; tier++) {
        await supabase.from('slayer_data').upsert({
          slayer_type:           slayer.type,
          tier,
          coin_cost:             slayer.costs[tier - 1],
          avg_kill_time_seconds: tier * 55 + 5
        }, { onConflict: 'slayer_type, tier' })
        synced++
      }
    }
  }

  return synced
}

// ============================================================
// SYNC KUUDRA depuis le Wiki
// ============================================================
async function syncKuudraFromWiki(): Promise<number> {
  const fallback = [
    { tier: 1, name: 'Basic',    avg_coins: 50000,   avg_time: 180 },
    { tier: 2, name: 'Hot',      avg_coins: 100000,  avg_time: 240 },
    { tier: 3, name: 'Burning',  avg_coins: 200000,  avg_time: 300 },
    { tier: 4, name: 'Fiery',    avg_coins: 400000,  avg_time: 360 },
    { tier: 5, name: 'Infernal', avg_coins: 1000000, avg_time: 480 }
  ]

  try {
    const text = await fetchWikiPage('Kuudra')

    if (text) {
      await upsertMisc('wiki_guide', 'kuudra', { content: text.slice(0, 3000) })
    }

    for (const t of fallback) {
      const coinsFromWiki = text
        ? parseNumber(text, new RegExp(t.name + '.*?(\\d[\\d,]*)\\s*coin', 'i'))
        : 0

      await supabase.from('kuudra_data').upsert({
        tier:              t.tier,
        avg_coins_per_run: coinsFromWiki || t.avg_coins,
        avg_run_time_seconds: t.avg_time
      }, { onConflict: 'tier' })
    }

    return fallback.length

  } catch (err: any) {
    console.error('Kuudra wiki error:', err.message)
    for (const t of fallback) {
      await supabase.from('kuudra_data').upsert({
        tier:              t.tier,
        avg_coins_per_run: t.avg_coins,
        avg_run_time_seconds: t.avg_time
      }, { onConflict: 'tier' })
    }
    return fallback.length
  }
}

// ============================================================
// SYNC DUNGEON DATA
// ============================================================
async function syncDungeonData(): Promise<number> {
  const floors = [
    { floor: 'F1', mode: 'normal', boss: 'Bonzo',            avg_time: 120,  min_coins: 50000,   max_coins: 200000  },
    { floor: 'F2', mode: 'normal', boss: 'Scarf',            avg_time: 180,  min_coins: 100000,  max_coins: 400000  },
    { floor: 'F3', mode: 'normal', boss: 'The Professor',    avg_time: 240,  min_coins: 200000,  max_coins: 600000  },
    { floor: 'F4', mode: 'normal', boss: 'Thorn',            avg_time: 300,  min_coins: 300000,  max_coins: 800000  },
    { floor: 'F5', mode: 'normal', boss: 'Livid',            avg_time: 360,  min_coins: 400000,  max_coins: 1000000 },
    { floor: 'F6', mode: 'normal', boss: 'Sadan',            avg_time: 420,  min_coins: 500000,  max_coins: 2000000 },
    { floor: 'F7', mode: 'normal', boss: 'Necron',           avg_time: 540,  min_coins: 1000000, max_coins: 5000000 },
    { floor: 'M1', mode: 'master', boss: 'Bonzo Master',     avg_time: 240,  min_coins: 2000000, max_coins: 8000000 },
    { floor: 'M2', mode: 'master', boss: 'Scarf Master',     avg_time: 300,  min_coins: 3000000, max_coins: 10000000 },
    { floor: 'M3', mode: 'master', boss: 'Professor Master', avg_time: 360,  min_coins: 5000000, max_coins: 15000000 },
    { floor: 'M4', mode: 'master', boss: 'Thorn Master',     avg_time: 420,  min_coins: 8000000, max_coins: 20000000 },
    { floor: 'M5', mode: 'master', boss: 'Livid Master',     avg_time: 480,  min_coins: 10000000, max_coins: 25000000 },
    { floor: 'M6', mode: 'master', boss: 'Sadan Master',     avg_time: 600,  min_coins: 20000000, max_coins: 35000000 },
    { floor: 'M7', mode: 'master', boss: 'Necron Master',    avg_time: 900,  min_coins: 30000000, max_coins: 60000000 },
  ]

  let synced = 0
  for (const f of floors) {
    // Essaie de fetch le wiki pour enrichir
    let wikiContent = ''
    try {
      const pageName = f.mode === 'master'
        ? 'Catacombs/Master_Mode/' + f.floor
        : 'Catacombs/' + f.floor
      wikiContent = await fetchWikiPage(pageName)
    } catch {}

    await upsertMisc('dungeon', f.floor, {
      ...f,
      wiki_content: wikiContent.slice(0, 2000)
    })
    synced++
  }
  return synced
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, any> = {}

  // 1. Pages Wiki générales
  let wikiPagesSuccess = 0
  let wikiPagesFailed  = 0
  for (const p of WIKI_PAGES) {
    try {
      const text = await fetchWikiPage(p.page)
      if (text.length > 100) {
        await upsertMisc(p.category, p.key, {
          page:    p.page,
          content: text.slice(0, 4000)
        })
        wikiPagesSuccess++
      } else {
        wikiPagesFailed++
      }
    } catch (err: any) {
      console.error('Wiki page error ' + p.page + ':', err.message)
      wikiPagesFailed++
    }
  }

  results.wiki_pages = { success: wikiPagesSuccess, failed: wikiPagesFailed }

  // 2. Slayers
  try {
    results.slayers = { rows: await syncSlayersFromWiki() }
  } catch (err: any) {
    results.slayers = { error: err.message }
  }

  // 3. Kuudra
  try {
    results.kuudra = { rows: await syncKuudraFromWiki() }
  } catch (err: any) {
    results.kuudra = { error: err.message }
  }

  // 4. Dungeons
  try {
    results.dungeons = { rows: await syncDungeonData() }
  } catch (err: any) {
    results.dungeons = { error: err.message }
  }

  return NextResponse.json({ success: true, ...results })
}