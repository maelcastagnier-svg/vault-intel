import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RETENTION_YEARS = 3
const BATCH_SIZE = 200000

export async function GET(request: Request) {
  // Vérification du secret cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const cutoffDate = new Date()
    cutoffDate.setFullYear(cutoffDate.getFullYear() - RETENTION_YEARS)

    // Compte combien de lignes sont concernées
    const { count: totalToDelete } = await supabase
      .from('price_history')
      .select('*', { count: 'exact', head: true })
      .lt('timestamp', cutoffDate.toISOString())

    if (!totalToDelete || totalToDelete === 0) {
      return NextResponse.json({
        message: 'Nothing to delete — database is clean',
        cutoff: cutoffDate.toISOString(),
        deleted: 0
      })
    }

    // Delete en batch via RPC pour bypasser la limite Supabase client
    const { error } = await supabase.rpc('delete_old_price_history', {
      cutoff_timestamp: cutoffDate.toISOString(),
      batch_limit: BATCH_SIZE
    })

    if (error) throw error

    return NextResponse.json({
      message: 'Retention policy applied',
      cutoff: cutoffDate.toISOString(),
      rows_eligible: totalToDelete,
      batch_size: BATCH_SIZE,
      note: totalToDelete > BATCH_SIZE ? 'More rows remain, next cron will continue' : 'All old rows deleted'
    })

  } catch (error: any) {
    console.error('Data retention error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}