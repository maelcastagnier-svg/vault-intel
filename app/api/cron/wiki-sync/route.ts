// app/api/cron/wiki-sync/route.ts
// Sync hebdomadaire depuis le Wiki Hypixel (MediaWiki API)
// Met à jour : dungeon_data, slayer_data, kuudra_data, fishing_data, game_mechanics_misc
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WIKI_API = 'https://wiki.hypixel.net/api.php'

// ── Fetch une page Wiki ──────────────────────────────────────
async function fetchWikiPage(title: string): Promise<string> {
  const url  = `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&origin=*`
  const res  = await fetch(url)
  const data = await res.json()
  return data?.parse?.wikitext?.['*'] || ''
}

function parseNumber(text: string, pattern: RegExp): number {
  const match = text.match(pattern)
  return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0
}

// ============================================================
// DUNGEONS → game_mechanics_misc (category=dungeon)
// ============================================================
async function syncDungeons(): Promise<number> {
  const floors = [
    'F0','F1','F2','F3','F4','F5','F6','F7',
    'M1','M2','M3','M4','M5','M6','M7'
  ]

  let synced = 0
  for (const floor of floors) {
    try {
      const pageName = floor.startsWith('M')
        ? 'Catacombs/Master_Floor_' + floor.slice(1)
        : 'Catacombs/Floor_' + (floor === 'F0' ? 'Entrance' : floor.slice(1))

      const text = await fetchWikiPage(pageName)
      if (!text) continue

      const avgTime = parseNumber(text, /(\d+)\s*(?:min|minute)/i) * 60 || 300

      await supabase.from('game_mechanics_misc').upsert({
        category:   'dungeon',
        key:        floor,
        value:      { floor, mode: floor.startsWith('M') ? 'master' : 'normal', avg_run_seconds: avgTime, wiki: text.slice(0, 2000) },
        updated_at: new Date().toISOString()
      }, { onConflict: 'category, key' })

      synced++
    } catch (err: any) {
      console.error('Dungeon sync error ' + floor + ':', err.message)
    }
  }
  return synced
}

// ============================================================
// SLAYERS → slayer_data (slayer_type, tier)
// ============================================================
async function syncSlayers(): Promise<number> {
  const slayers = [
    { name: 'Revenant_Horror',      type: 'zombie'   },
    { name: 'Tarantula_Broodfather', type: 'spider'   },
    { name: 'Sven_Packmaster',       type: 'wolf'     },
    { name: 'Voidgloom_Seraph',      type: 'enderman' },
    { name: 'Inferno_Demonlord',     type: 'blaze'    },
    { name: 'Riftstalker_Bloodfiend', type: 'vampire' }
  ]

  let synced = 0
  for (const slayer of slayers) {
    try {
      const text = await fetchWikiPage(slayer.name)
      if (!text) continue

      for (let tier = 1; tier <= 5; tier++) {
        const costPattern = new RegExp('tier\\s*' + tier + '.*?(\\d[\\d,]*)\\s*coin', 'i')
        const cost        = parseNumber(text, costPattern) || tier * 10000

        await supabase.from('slayer_data').upsert({
          slayer_type:         slayer.type,
          tier,
          coin_cost:           cost,
          avg_kill_time_seconds: tier * 60
        }, { onConflict: 'slayer_type, tier' })

        synced++
      }
    } catch (err: any) {
      console.error('Slayer sync error ' + slayer.name + ':', err.message)
    }
  }
  return synced
}

// ============================================================
// KUUDRA → kuudra_data (tier)
// ============================================================
async function syncKuudra(): Promise<number> {
  try {
    const text = await fetchWikiPage('Kuudra')
    if (!text) return 0

    const tiers = [
      { tier: 1, name: 'Basic',    base_coins: 50000   },
      { tier: 2, name: 'Hot',      base_coins: 100000  },
      { tier: 3, name: 'Burning',  base_coins: 200000  },
      { tier: 4, name: 'Fiery',    base_coins: 400000  },
      { tier: 5, name: 'Infernal', base_coins: 1000000 }
    ]

    for (const t of tiers) {
      const coinPattern = new RegExp(t.name + '.*?(\\d[\\d,]*)\\s*coin', 'i')
      const avgCoins    = parseNumber(text, coinPattern) || t.base_coins

      await supabase.from('kuudra_data').upsert({
        tier:              t.tier,
        avg_coins_per_run: avgCoins
      }, { onConflict: 'tier' })
    }

    return tiers.length
  } catch (err: any) {
    console.error('Kuudra sync error:', err.message)
    return 0
  }
}

// ============================================================
// GUIDES → game_mechanics_misc
// ============================================================
async function syncGuides(): Promise<number> {
  const pages = [
    { key: 'money_making',   page: 'Money_Making_Guide'       },
    { key: 'farming_profit', page: 'Farming_for_Profit'       },
    { key: 'mining_profit',  page: 'Mining_for_Profit'        },
    { key: 'fishing_guide',  page: 'Fishing'                  },
    { key: 'trophy_fishing', page: 'Trophy_Fishing'           },
    { key: 'crystal_hollows', page: 'Crystal_Hollows'         },
    { key: 'hotm',           page: 'Heart_of_the_Mountain'    },
    { key: 'garden',         page: 'Garden'                   },
    { key: 'pest_farming',   page: 'Garden/Pests'             },
    { key: 'crimson_isle',   page: 'Crimson_Isle'             }
  ]

  let synced = 0
  for (const p of pages) {
    try {
      const text = await fetchWikiPage(p.page)
      if (!text) continue

      await supabase.from('game_mechanics_misc').upsert({
        category:   'wiki_guide',
        key:        p.key,
        value:      { page: p.page, content: text.slice(0, 5000) },
        updated_at: new Date().toISOString()
      }, { onConflict: 'category, key' })

      synced++
    } catch (err: any) {
      console.error('Guide sync error ' + p.page + ':', err.message)
    }
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

  // Séquentiel pour ne pas surcharger le Wiki
  const dungeons = await syncDungeons()
  const slayers  = await syncSlayers()
  const kuudra   = await syncKuudra()
  const guides   = await syncGuides()

  return NextResponse.json({
    success:  true,
    dungeons,
    slayers,
    kuudra,
    guides
  })
}