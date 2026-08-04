// Route de debug temporaire -- supprimée après vérification.
import { NextResponse } from 'next/server'

export async function GET() {
  const profileId = 'b077f27a-60f7-46d9-be13-c4689a01dc3b' // Cucumber
  const res = await fetch(`https://api.hypixel.net/v2/skyblock/garden?profile=${profileId}`, {
    headers: { 'API-Key': process.env.HYPIXEL_API_KEY! },
  })
  const data = await res.json()
  return NextResponse.json({ status: res.status, keys: Object.keys(data || {}), data })
}
