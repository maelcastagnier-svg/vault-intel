// app/api/debug/skycofl-test/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const token   = process.env.SKYCOFL_ACCOUNT_TOKEN!
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  const endpoints = [
    'https://sky.coflnet.com/api/item/price/HYPERION/history/full',
    'https://sky.coflnet.com/api/item/price/ENCHANTED_FLINT/history/full',
    'https://sky.coflnet.com/api/item/price/NECRON_BLADE/history/full',
    'https://sky.coflnet.com/api/item/price/TERMINATOR/history/full',
  ]

  const results = await Promise.all(
    endpoints.map(async url => {
      try {
        const res  = await fetch(url, { headers })
        const text = await res.text()
        const data = JSON.parse(text)
        const arr  = Array.isArray(data) ? data : []
        return {
          url,
          status:  res.status,
          points:  arr.length,
          oldest:  arr[arr.length - 1],
          newest:  arr[0],
          len:     text.length
        }
      } catch (e: any) {
        return { url, status: 0, points: 0, oldest: null, newest: null, preview: e.message }
      }
    })
  )

  return NextResponse.json(results)
}