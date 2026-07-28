import { NextResponse } from 'next/server'
import { resolveMojangSkinUrl } from '../../player/status/route'

// Compte réel connu (Steve, UUID publique standard) -- pas besoin d'un vrai
// compte lié pour vérifier que la résolution Mojang fonctionne.
const TEST_UUID = '8667ba71b85a4004af54457a9734eed7'

export async function GET() {
  const start = Date.now()
  const url = await resolveMojangSkinUrl(TEST_UUID)
  return NextResponse.json({
    resolved_url: url,
    resolved_ok: !!url,
    duration_ms: Date.now() - start,
    is_https: url?.startsWith('https:') ?? null,
  })
}
