// TEMPORAIRE — verifie l'etat actuel de HYPIXEL_API_KEY apres rechargement manuel.
// Supprime juste apres verification.
import { NextResponse } from 'next/server'

export async function GET() {
  const res = await fetch('https://api.hypixel.net/v2/skyblock/profiles?uuid=74a06395-3a99-4796-95d0-9e392ba3da7e', {
    headers: { 'API-Key': process.env.HYPIXEL_API_KEY! },
  })
  const data = await res.json()
  return NextResponse.json({ http_status: res.status, success: data.success, cause: data.cause || null, profiles_count: (data.profiles || []).length })
}
