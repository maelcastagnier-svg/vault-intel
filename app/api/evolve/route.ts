import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST — enregistrement leger : sauvegarde juste le username + un profil minimal
// Le n8n Schedule (1h) prendra le relais pour faire l'analyse complete (Hypixel + Claude)
export async function POST(req: Request) {
  try {
    const { userId, username, plan } = await req.json()

    if (!['pro', 'elite'].includes(plan)) {
      return NextResponse.json({ error: 'Evolve requires Pro or Elite plan' }, { status: 403 })
    }
    if (!username || !userId) {
      return NextResponse.json({ error: 'Missing username or userId' }, { status: 400 })
    }

    // Verifie si un profil existe deja pour ce user
    const { data: existing } = await supabase
      .from('player_data')
      .select('user_id, hypixel_username, updated_at')
      .eq('user_id', userId)
      .single()

    if (existing) {
      // Met juste a jour le username si change, ne relance pas l'analyse ici
      if (existing.hypixel_username !== username) {
        await supabase
          .from('player_data')
          .update({ hypixel_username: username })
          .eq('user_id', userId)
      }
      return NextResponse.json({
        status: 'registered',
        message: 'Username saved. Full analysis runs automatically within the hour.',
        profile: existing
      })
    }

    // Premiere connexion — cree une ligne minimale, le scheduler n8n la remplira
    const { data: created, error } = await supabase
      .from('player_data')
      .insert({
        user_id: userId,
        hypixel_username: username,
        game_stage: 'early',
        evolve_summary: 'Your profile is being analyzed — check back in a few minutes, or wait for the next automatic sync.',
        priority_actions: [],
        next_tier_route: [],
        raw_profile: {},
        last_synced: null,
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Supabase error: ' + error.message }, { status: 500 })
    }

    // Declenche immediatement un premier sync via le webhook n8n (fire-and-forget, ne bloque pas la reponse)
    const N8N_WEBHOOK_URL = process.env.N8N_EVOLVE_WEBHOOK_URL
    if (N8N_WEBHOOK_URL) {
      fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username })
      }).catch(() => {}) // silencieux — le scheduler 1h prendra le relais de toute facon
    }

    return NextResponse.json({
      status: 'registered',
      message: 'Account connected. Your first analysis will appear within a few minutes.',
      profile: created
    })

  } catch (e: any) {
    console.error('Evolve register crashed:', e.message)
    return NextResponse.json({ error: 'Server error: ' + (e.message || 'unknown') }, { status: 500 })
  }
}

// GET — inchange, lit simplement le profil depuis Supabase
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const { data } = await supabase
      .from('player_data')
      .select('*')
      .eq('user_id', userId)
      .single()

    return NextResponse.json({ profile: data || null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}