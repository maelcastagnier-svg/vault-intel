// app/api/test-skycofl/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const token = process.env.SKYCOFL_ACCOUNT_TOKEN
  
  const res = await fetch(
    'https://sky.coflnet.com/api/item/price/ABIPHONE_X_PLUS/history/full',
    { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
  )
  
  const text = await res.text()
  
  return NextResponse.json({
    status:       res.status,
    token_length: token?.length || 0,
    token_start:  token?.slice(0, 10) || 'MISSING',
    response:     text.slice(0, 200),
  })
}