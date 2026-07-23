// TEMPORAIRE — inspecte la structure brute pour Kuudra/Arachne/Dragons de l'End sur
// Cucumber avant de coder le mapping (Phase 2, chantier collecte totale). Supprimé
// une fois le mapping validé.
import { NextResponse } from 'next/server'

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!
const UUID = '74a06395-3a99-4796-95d0-9e392ba3da7e' // Voxui09
const PROFILE_ID = 'b077f27a-60f7-46d9-be13-c4689a01dc3b' // Cucumber

function findKeysContaining(obj: any, needle: string, path = '', depth = 0, out: string[] = []): string[] {
  if (!obj || typeof obj !== 'object' || depth > 4) return out
  for (const key of Object.keys(obj)) {
    const p = path ? `${path}.${key}` : key
    if (key.toLowerCase().includes(needle)) out.push(p)
    if (typeof obj[key] === 'object') findKeysContaining(obj[key], needle, p, depth + 1, out)
  }
  return out
}

export async function GET() {
  const res = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${UUID}`, {
    headers: { 'API-Key': HYPIXEL_KEY },
  })
  const data = await res.json()
  const profile = (data.profiles || []).find((p: any) => p.profile_id === PROFILE_ID)
  const member = profile?.members?.[UUID.replace(/-/g, '')]

  return NextResponse.json({
    api_success: data.success,
    api_cause:   data.cause ?? null,
    profiles_count: (data.profiles || []).length,
    profile_found: !!profile,
    member_found:  !!member,
    top_level_keys: member ? Object.keys(member) : [],
    nether_island_player_data: member?.nether_island_player_data ?? null,
    keys_with_dragon:  findKeysContaining(member, 'dragon'),
    keys_with_arachne: findKeysContaining(member, 'arachne'),
    keys_with_kuudra:  findKeysContaining(member, 'kuudra'),
    keys_with_end:     findKeysContaining(member, 'end'),
    bestiary_top_keys: member?.bestiary ? Object.keys(member.bestiary) : null,
  })
}
