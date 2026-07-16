// app/api/debug/skycofl-test/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const token = process.env.SKYCOFL_ACCOUNT_TOKEN!
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  
  const res  = await fetch(
    'https://sky.coflnet.com/api/bazaar/ENCHANTED_FLINT/history',
    { headers }
  )
  const data: any[] = await res.json()

  return NextResponse.json({
    total_points: data.length,
    oldest:       data[0]?.timestamp,
    newest:       data[data.length - 1]?.timestamp,
    first_3:      data.slice(0, 3),
    last_3:       data.slice(-3)
  })
}