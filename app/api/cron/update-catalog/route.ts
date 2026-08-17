// app/api/cron/update-catalog/route.ts
// Tourne chaque nuit à 2h :
// 1. Ajoute les nouveaux items depuis price_history + price_history_ah
// 2. Met à jour les noms depuis l'API Hypixel officielle
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function toLabel(id: string): string {
  return id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
}

export async function runUpdateCatalog() {
  // 1. Fetch noms officiels Hypixel
  const hypixelRes  = await fetch('https://api.hypixel.net/v2/resources/skyblock/items')
  const hypixelData = await hypixelRes.json()
  const hypixelItems: { id: string; name: string }[] = hypixelData.items || []
  const hypixelNames = new Map<string, string>()
  for (const item of hypixelItems) {
    if (item.id && item.name) hypixelNames.set(item.id, item.name)
  }

  // 2. Fetch TOUS les items via fonction SQL (pas de limite Supabase)
  // error jamais verifie ici auparavant -- un vrai echec RPC retombait sur
  // allDbItems=null, la boucle d'upsert tournait 0 fois, et le cron
  // rapportait quand meme status='success' avec 0 ligne ecrite (trouve via
  // l'audit du 17 aout : items_catalog.updated_at figé 18 jours malgre un
  // "success" chaque nuit). Desormais un echec RPC ou un catalogue
  // anormalement vide font explicitement echouer le sync.
  const { data: allDbItems, error: rpcError } = await supabase.rpc('get_all_catalog_items')
  if (rpcError) throw new Error('get_all_catalog_items RPC: ' + rpcError.message)
  if (!allDbItems || allDbItems.length === 0) throw new Error('get_all_catalog_items a renvoyé 0 ligne -- anormal, price_history/price_history_ah ne sont jamais vides')
  const bzIds = (allDbItems || []).filter((r: any) => r.source === 'bazaar').map((r: any) => r.item_id as string)
  const ahIds = (allDbItems || []).filter((r: any) => r.source === 'ah').map((r: any) => r.item_id as string)

  // 4. Construit les rows avec noms Hypixel si disponible
  const allItems = [
    ...bzIds.map((id: string) => ({
      item_id:    id,
      item_name:  hypixelNames.get(id) || toLabel(id),
      source:     'bazaar',
      updated_at: new Date().toISOString(),
    })),
    ...ahIds.map((id: string) => ({
      item_id:    id,
      item_name:  hypixelNames.get(id) || toLabel(id),
      source:     'ah',
      updated_at: new Date().toISOString(),
    })),
  ]

  // 5. Upsert tout le catalog en une fois (met à jour les noms existants aussi)
  let upserted = 0
  const upsertErrors: string[] = []
  for (let i = 0; i < allItems.length; i += 200) {
    const { error } = await supabase
      .from('items_catalog')
      .upsert(allItems.slice(i, i + 200), { onConflict: 'item_id' })
    if (!error) upserted += Math.min(200, allItems.length - i)
    else upsertErrors.push(error.message)
  }
  // Un lot d'upsert en erreur ne doit plus jamais être compté silencieusement
  // comme un succès partiel invisible -- si RIEN n'a été écrit, c'est un vrai échec.
  if (upserted === 0 && upsertErrors.length > 0) throw new Error('items_catalog upsert: ' + upsertErrors[0])

  // Stats
  const hypixelMatched = allItems.filter(i => hypixelNames.has(i.item_id)).length
  const fallback       = allItems.length - hypixelMatched

  return {
    success:          true,
    total:            allItems.length,
    upserted,
    upsert_errors:    upsertErrors.length,
    hypixel_named:    hypixelMatched,
    fallback_named:   fallback,
    sample: allItems
      .filter(i => hypixelNames.has(i.item_id))
      .slice(0, 5)
      .map(i => ({ id: i.item_id, name: i.item_name }))
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('update-catalog')
  try {
    const result = await runUpdateCatalog()
    await finishSync(logId, 'success', result.upserted, result)
    return NextResponse.json(result)
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
