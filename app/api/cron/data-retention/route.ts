import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RETENTION_YEARS = 3
const BATCH_SIZE      = 200000

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const cutoffDate = new Date()
    cutoffDate.setFullYear(cutoffDate.getFullYear() - RETENTION_YEARS)

    // Compte les lignes à supprimer
    const { count: totalToDelete } = await supabase
      .from('price_history')
      .select('*', { count: 'exact', head: true })
      .lt('timestamp', cutoffDate.toISOString())

    let deleted = 0

    if (totalToDelete && totalToDelete > 0) {
      const { data, error } = await supabase.rpc('delete_old_price_history', {
        cutoff_timestamp: cutoffDate.toISOString(),
        batch_limit:      BATCH_SIZE
      })
      if (error) throw error
      deleted = data ?? 0
    }

    // VACUUM après suppression pour libérer l'espace disque
    if (deleted > 0) {
      await supabase.rpc('vacuum_price_history')
    }

    return NextResponse.json({
      success: true,
      cutoff:  cutoffDate.toISOString(),
      deleted,
      note:    totalToDelete && totalToDelete > BATCH_SIZE
                 ? 'More rows remain, next cron will continue'
                 : 'All old rows deleted'
    })

  } catch (error: any) {
    console.error('data-retention error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}