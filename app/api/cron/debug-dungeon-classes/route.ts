// TEMPORAIRE — inspecte la structure brute de member.dungeons sur Cucumber avant de
// coder le mapping player_classes dans player/sync (Phase 1 du chantier collecte totale).
// Supprimé une fois le mapping validé.
import { NextResponse } from 'next/server'

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!
const UUID = '74a06395-3a99-4796-95d0-9e392ba3da7e' // Voxui09
const PROFILE_ID = 'b077f27a-60f7-46d9-be13-c4689a01dc3b' // Cucumber

export async function GET() {
  const res = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${UUID}`, {
    headers: { 'API-Key': HYPIXEL_KEY },
  })
  const data = await res.json()
  const profile = (data.profiles || []).find((p: any) => p.profile_id === PROFILE_ID)
  const member = profile?.members?.[UUID.replace(/-/g, '')]

  // Reproduit exactement le mapping ajouté dans player/sync (5c.) pour valider la
  // transformation sur des données réelles avant de la considérer branchée.
  const dungeonClassData = member?.dungeons?.player_classes || {}
  const classes = Object.fromEntries(
    Object.entries(dungeonClassData as Record<string, any>).map(([className, data]: [string, any]) => [
      className,
      { experience: data.experience ?? 0 },
    ])
  )
  const selected_class = member?.dungeons?.selected_dungeon_class ?? null

  return NextResponse.json({
    mapped_result: { classes, selected_class },
  })
}
