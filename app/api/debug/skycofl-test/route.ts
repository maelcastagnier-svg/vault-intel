// app/api/debug/skycofl-test/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const token   = process.env.SKYCOFL_ACCOUNT_TOKEN!
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  const endpoints = [
    'https://sky.coflnet.com/api/auctions/tag/HYPERION/history',
    'https://sky.coflnet.com/api/auctions/tag/HYPERION/price/history',
    'https://sky.coflnet.com/api/auctions/tag/HYPERION/active/overview',
    'https://sky.coflnet.com/api/item/price/tag/HYPERION/history',
    'https://sky.coflnet.com/api/auctions/tag/HYPERION/sold/overview',
    'https://sky.coflnet.com/api/auctions/HYPERION/history',
  ]

  const results = await Promise.all(
    endpoints.map(async url => {
      try {
        const res  = await fetch(url, { headers })
        const text = await res.text()
        return { url, status: res.status, preview: text.slice(0, 300), len: text.length }
      } catch (e: any) {
        return { url, status: 0, preview: e.message, len: 0 }
      }
    })
  )

  return NextResponse.json(results)
}