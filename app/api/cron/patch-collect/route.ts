// app/api/cron/patch-collect/route.ts
// Scrape les patch notes Hypixel (live + alpha) → patch_notes
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FEEDS = [
  { url: 'https://hypixel.net/forums/skyblock-patch-notes.158/index.rss',        is_alpha: false },
  { url: 'https://hypixel.net/skyblock-alpha/-/index.rss',                       is_alpha: true  },
]

function parseRSS(xml: string, is_alpha: boolean) {
  const items: any[] = []
  const blocks = xml.split('<item>').slice(1)

  for (const block of blocks.slice(0, 10)) {
    const title = (
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ||
      block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''
    ).trim().slice(0, 300)

    const content = (
      block.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/)?.[1] ||
      block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ||
      block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || ''
    ).replace(/<[^>]*>/g, '').trim().slice(0, 5000)

    const link       = block.match(/<link>(.*?)<\/link>/)?.[1]        || ''
    const pubDate    = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]   || new Date().toISOString()

    if (!title) continue

    // Pour alpha: garde uniquement les threads officiels
    if (is_alpha) {
      const OFFICIAL = [/^\[/, /release candidate/i, /patch notes/i, /skyblock \d+\.\d+/i, /hotfix/i, /\d+\.\d+\.\d+/]
      if (!OFFICIAL.some(p => p.test(title))) continue
    }


    items.push({ title, content, link, published_at: pubDate, is_alpha })
  }

  return items
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let inserted = 0, skipped = 0

    for (const feed of FEEDS) {
      const xml = await fetch(feed.url, { headers: { 'User-Agent': 'VaultBot/1.0' } }).then(r => r.text())
      const items = parseRSS(xml, feed.is_alpha)

      for (const item of items) {
        const { data: existing } = await supabase
          .from('patch_notes')
          .select('id')
          .eq('title', item.title)
          .limit(1)

        if (existing && existing.length > 0) { skipped++; continue }

        const { error } = await supabase.from('patch_notes').insert({
          title:        item.title,
          content:      item.content,
          link:         item.link,
          published_at: item.published_at,
          is_alpha:     item.is_alpha,
        })

        if (!error) inserted++
        else console.error('Insert error:', error.message)
      }
    }

    return NextResponse.json({ success: true, inserted, skipped })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}