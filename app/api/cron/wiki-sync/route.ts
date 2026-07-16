// app/api/cron/wiki-sync/route.ts
// Sync hebdomadaire depuis le Wiki Hypixel (MediaWiki API)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WIKI_HEADERS = {
  'User-Agent': 'VaultBot/1.0 (Hypixel Skyblock Intelligence; contact@vault-intel.com)',
  'Accept':     'application/json',
  'Accept-Language': 'en-US,en;q=0.9'
}

// ── Fetch une page Wiki avec fallback ───────────────────────
async function fetchWikiPage(title: string): Promise<string> {
  // Essaie d'abord l'API MediaWiki officielle
  const apiUrl = `https://wiki.hypixel.net/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json`
  
  try {
    const res  = await fetch(apiUrl, { headers: WIKI_HEADERS })
    if (res.ok) {
      const data = await res.json()
      const text = data?.parse?.wikitext?.['*']
      if (text && text.length > 50) return text
    }
  } catch (e) {}

  // Fallback — Wikipedia-style action=query
  try {
    const queryUrl = `https://wiki.hypixel.net/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&format=json`
    const res      = await fetch(queryUrl, { headers: WIKI_HEADERS })
    if (res.ok) {
      const data  = await res.json()
      const pages = data?.query?.pages || {}
      const page  = Object.values(pages)[0] as any
      const text  = page?.revisions?.[0]?.['*']
      if (text && text.length > 50) return text
    }
  } catch (e) {}

  return ''
}

// ── Fetch depuis l'API Hypixel SkyBlock directement ─────────
// Alternative au Wiki pour les données structurées
async function fetchHypixelWikiAlternative(): Promise<boolean> {
  // Utilise le Wiki anglais communautaire comme fallback
  const COMMUNITY_WIKI = 'https://hypixel-skyblock.fandom.com/api.php'
  
  try {
    const res = await fetch(
      `${COMMUNITY_WIKI}?action=parse&page=Money_Making&prop=wikitext&format=json`,
      { headers: WIKI_HEADERS }
    )
    return res.ok
  } catch {
    return false
  }
}

function parseNumber(text: string, pattern: RegExp): number {
  const match = text.match(pattern)
  return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0
}

// ============================================================
// GUIDES HARDCODÉS — données connues enrichies
// Si le Wiki est inaccessible, on enrichit depuis nos données
// ============================================================
async function syncKnownGuides(): Promise<number> {
  const guides = [
    {
      key:     'fishing_thunder',
      category: 'wiki_guide',
      content: {
        method:       'Thunder Fishing',
        coins_min:    25000000,
        coins_max:    45000000,
        requirements: { scc: 400, fishing_level: 40 },
        drops:        ['Thunder Bottle', 'Rod of Lightning', 'Foul Flesh'],
        zone:         'Crimson Isle - Stronghold',
        description:  'Farm Thunder in the Stronghold. Each kill drops Thunder Bottles worth 2-5M+ each. Requires high Sea Creature Chance.'
      }
    },
    {
      key:     'pest_farming_advanced',
      category: 'wiki_guide',
      content: {
        method:       'Pest Farming Advanced',
        coins_min:    30000000,
        coins_max:    50000000,
        requirements: { fortune: 500, farming_level: 50, garden: true },
        drops:        ['Enchanted seeds', 'Pest drops', 'Farming XP'],
        zone:         'Garden',
        description:  'Farm pests in the Garden with high Fortune. Drops enchanted crops + pest drops. Best with full gear setup.'
      }
    },
    {
      key:     'master_mode_m7',
      category: 'wiki_guide',
      content: {
        method:       'Master Mode Floor 7',
        coins_min:    50000000,
        coins_max:    100000000,
        requirements: { catacombs_level: 40, networth: '5B+' },
        drops:        ['Master Stars', 'Necron pieces', 'Wither essence'],
        zone:         'Catacombs M7',
        description:  'Highest tier dungeon. Drops Master Stars for upgrading gear to 5-10 stars. Very high value per run.'
      }
    },
    {
      key:     'crystal_hollows_mining',
      category: 'wiki_guide',
      content: {
        method:       'Crystal Hollows Mining',
        coins_min:    8000000,
        coins_max:    20000000,
        requirements: { hotm: 5, mining_level: 25 },
        drops:        ['Gemstones', 'Jungle Heart', 'Wishing Compass'],
        zone:         'Crystal Hollows',
        description:  'Mine gemstones and rare drops in Crystal Hollows. Jade, Amber, Sapphire, Ruby all valuable on Bazaar.'
      }
    },
    {
      key:     'diana_ritual',
      category: 'wiki_guide',
      content: {
        method:       'Diana Ritual (Mayor)',
        coins_min:    15000000,
        coins_max:    40000000,
        requirements: { pet: 'Griffin L100', mayor: 'Diana active' },
        drops:        ['Mythological drops', 'Trinkets', 'Griffin feathers'],
        zone:         'Hub Island',
        description:  'Only available when Diana is mayor. Use Griffin pet to dig up mythological mobs. Very profitable event.'
      }
    },
    {
      key:     'vampire_slayer',
      category: 'wiki_guide',
      content: {
        method:       'Vampire Slayer T4-T5',
        coins_min:    8000000,
        coins_max:    16000000,
        requirements: { combat_level: 38, vampire_slayer: 4 },
        drops:        ['Rift Prism', 'Vampire Fang', 'Bloody Flesh'],
        zone:         'The Rift',
        description:  'Farm Vampire Slayer in The Rift. Drops Rift-exclusive items with high Bazaar value.'
      }
    },
    {
      key:     'vanquisher_farming',
      category: 'wiki_guide',
      content: {
        method:       'Vanquisher Farming',
        coins_min:    12000000,
        coins_max:    22000000,
        requirements: { combat_level: 35, crimson_isle: true },
        drops:        ['Flaming Fist', 'Vanquished Glory', 'Crimson essence'],
        zone:         'Crimson Isle',
        description:  'Farm Vanquishers on Crimson Isle. Rare drop Flaming Fist worth 100M+. Consistent crimson essence income.'
      }
    },
    {
      key:     'crimson_isle_fishing',
      category: 'wiki_guide',
      content: {
        method:       'Crimson Isle Fishing',
        coins_min:    20000000,
        coins_max:    35000000,
        requirements: { scc: 300, fishing_level: 24 },
        drops:        ['Magma Fish', 'Sulphur', 'Crimson drops'],
        zone:         'Crimson Isle - Lava',
        description:  'Fish in lava on Crimson Isle. High value sea creatures including Thunder. Good alternative to regular fishing.'
      }
    },
    {
      key:     'bazaar_flipping_advanced',
      category: 'wiki_guide',
      content: {
        method:       'Bazaar Flipping Advanced',
        coins_min:    50000000,
        coins_max:    200000000,
        requirements: { capital: 100000000 },
        description:  'Flip high-volume items between buy orders and sell orders. Best items: enchanted materials, farming items, potions. Cycle time 10-30min.'
      }
    },
    {
      key:     'forge_flipping',
      category: 'wiki_guide',
      content: {
        method:       'Forge Item Flipping',
        coins_min:    8000000,
        coins_max:    30000000,
        requirements: { hotm: 3, capital: 50000000 },
        description:  'Buy raw materials on Bazaar, forge items, sell forged items. Best: Refined Mithril, Titanium items. Passive income while offline.'
      }
    }
  ]

  let synced = 0
  for (const guide of guides) {
    const { error } = await supabase
      .from('game_mechanics_misc')
      .upsert({
        category:   guide.category,
        key:        guide.key,
        value:      guide.content,
        updated_at: new Date().toISOString()
      }, { onConflict: 'category, key' })

    if (!error) synced++
  }
  return synced
}

// ============================================================
// DUNGEON DATA — enrichit dungeon_data depuis données connues
// ============================================================
async function syncDungeonData(): Promise<number> {
  const dungeonFloors = [
    { floor: 'F1', mode: 'normal', boss: 'Bonzo',           avg_time: 180,  loot: ['Bonzo Staff', 'Zombie Sword', 'Rotten Flesh'] },
    { floor: 'F2', mode: 'normal', boss: 'Scarf',           avg_time: 240,  loot: ['Scarf Grimoire', 'Adaptive Helm'] },
    { floor: 'F3', mode: 'normal', boss: 'The Professor',   avg_time: 300,  loot: ['Giants Sword', 'Adaptive Chestplate'] },
    { floor: 'F4', mode: 'normal', boss: 'Thorn',           avg_time: 360,  loot: ['Spirit Bow', 'Spirit Leggings'] },
    { floor: 'F5', mode: 'normal', boss: 'Livid',           avg_time: 420,  loot: ['Livid Dagger', 'Adaptive Boots'] },
    { floor: 'F6', mode: 'normal', boss: 'Sadan',           avg_time: 480,  loot: ['Giant Sword', 'Necron pieces (low)'] },
    { floor: 'F7', mode: 'normal', boss: 'Necron',          avg_time: 600,  loot: ['Necron armor', 'Wither Blade', 'Hyperion'] },
    { floor: 'M1', mode: 'master', boss: 'Bonzo Master',    avg_time: 300,  loot: ['Master Star 1', 'Wither essence'] },
    { floor: 'M2', mode: 'master', boss: 'Scarf Master',    avg_time: 360,  loot: ['Master Star 2', 'Wither essence'] },
    { floor: 'M3', mode: 'master', boss: 'Professor Master', avg_time: 420, loot: ['Master Star 3', 'Wither essence'] },
    { floor: 'M4', mode: 'master', boss: 'Thorn Master',    avg_time: 480,  loot: ['Master Star 4', 'Wither essence'] },
    { floor: 'M5', mode: 'master', boss: 'Livid Master',    avg_time: 540,  loot: ['Master Star 5', 'Wither essence'] },
    { floor: 'M6', mode: 'master', boss: 'Sadan Master',    avg_time: 660,  loot: ['Master Star 6', 'Necron (starred)'] },
    { floor: 'M7', mode: 'master', boss: 'Necron Master',   avg_time: 900,  loot: ['Master Star 7+', 'Hyperion starred', 'Wither Blade starred'] },
  ]

  let synced = 0
  for (const f of dungeonFloors) {
    const { error } = await supabase
      .from('game_mechanics_misc')
      .upsert({
        category:   'dungeon',
        key:        f.floor,
        value:      f,
        updated_at: new Date().toISOString()
      }, { onConflict: 'category, key' })

    if (!error) synced++
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

  // Tente le Wiki d'abord
  let wikiAccessible = false
  try {
    const testRes = await fetch(
      'https://wiki.hypixel.net/api.php?action=query&meta=siteinfo&format=json',
      { headers: WIKI_HEADERS }
    )
    wikiAccessible = testRes.ok
  } catch {}

  let dungeons = 0
  let guides   = 0

  if (wikiAccessible) {
    // Wiki accessible — fetch pages réelles
    const wikiPages = [
      { key: 'fishing',       page: 'Fishing'              },
      { key: 'trophy_fishing', page: 'Trophy_Fishing'      },
      { key: 'garden',        page: 'Garden'               },
      { key: 'crystal_hollows', page: 'Crystal_Hollows'    },
      { key: 'hotm',          page: 'Heart_of_the_Mountain' }
    ]

    for (const p of wikiPages) {
      const text = await fetchWikiPage(p.page)
      if (text.length > 100) {
        await supabase.from('game_mechanics_misc').upsert({
          category:   'wiki_guide',
          key:        p.key,
          value:      { page: p.page, content: text.slice(0, 5000) },
          updated_at: new Date().toISOString()
        }, { onConflict: 'category, key' })
        guides++
      }
    }
  }

  // Toujours sync les données structurées connues
  dungeons = await syncDungeonData()
  const knownGuides = await syncKnownGuides()

  return NextResponse.json({
    success:       true,
    wiki_accessible: wikiAccessible,
    dungeons,
    known_guides:  knownGuides,
    wiki_guides:   guides
  })
}