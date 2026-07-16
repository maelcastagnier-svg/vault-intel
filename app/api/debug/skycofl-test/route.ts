// app/api/debug/skycofl-test/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const token   = process.env.SKYCOFL_ACCOUNT_TOKEN!
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  const endpoints = [
    // Patterns prix AH
    'https://sky.coflnet.com/api/auctions/tag/HYPERION/price',
    'https://sky.coflnet.com/api/auctions/tag/HYPERION/price/history',
    'https://sky.coflnet.com/api/auctions/tag/HYPERION/lowest',
    'https://sky.coflnet.com/api/auctions/tag/HYPERION/lowest/history',
    // Patterns item
    'https://sky.coflnet.com/api/item/HYPERION/price',
    'https://sky.coflnet.com/api/item/HYPERION/history',
    // Patterns avec /ah/
    'https://sky.coflnet.com/api/ah/HYPERION/history',
    'https://sky.coflnet.com/api/ah/tag/HYPERION/history',
    // Prix moyen historique
    'https://sky.coflnet.com/api/auctions/tag/HYPERION/avg',
    'https://sky.coflnet.com/api/auctions/tag/HYPERION/avg/history',
    // Lookup depuis la doc SkyCofl
    'https://sky.coflnet.com/api/item/price/HYPERION/current',
    'https://sky.coflnet.com/api/item/price/HYPERION/all',
  ]

  const results = await Promise.all(
    endpoints.map(async url => {
      try {
        const res  = await fetch(url, { headers })
        const text = await res.text()
        return { url, status: res.status, preview: text.slice(0, 200), len: text.length }
      } catch (e: any) {
        return { url, status: 0, preview: e.message, len: 0 }
      }
    })
  )

  // Filtre les 200 pour voir ce qui marche
  const working = results.filter(r => r.status === 200)
  return NextResponse.json({ working, all: results })
}