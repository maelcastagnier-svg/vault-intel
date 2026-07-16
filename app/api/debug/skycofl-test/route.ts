// app/api/debug/skycofl-test/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const token = process.env.SKYCOFL_ACCOUNT_TOKEN!
  
  const res = await fetch(
    'https://sky.coflnet.com/api/item/price/ENCHANTED_FLINT/history?start=2024-01-01&end=2024-06-01',
    { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
  )
  
  const text = await res.text()
  
  return NextResponse.json({
    status:   res.status,
    preview:  text.slice(0, 500),
    has_data: text.length > 10
  })
}