// app/api/item-search/route.ts
// Recherche d'items — minuscules/majuscules/espaces acceptés
// Retourne : item de base en premier + variantes groupées
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function toLabel(id: string): string {
  return id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q     = searchParams.get('q') || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

  if (q.length < 1) return NextResponse.json([])

  // Normalise : tout en majuscules underscores
  const search = q.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
  if (!search) return NextResponse.json([])

  // Cherche au début de chaque mot (séparé par _)
  // "NE" → NECRON% ou %_NE% — jamais au milieu d'un mot
  // Supprime la recherche par item_name (cause trop de faux matches via "Ancient", "Rune"...)
  const startPattern = `${search}%`       // commence par le terme
  const wordPattern  = `%_${search}%`     // mot après underscore commence par le terme

  const [{ data: bazaarItems }, { data: ahItems }] = await Promise.all([
    supabase
      .from('price_history')
      .select('item_id')
      .or(`item_id.ilike.${startPattern},item_id.ilike.${wordPattern}`)
      .gt('sell_price', 0)
      .order('item_id')
      .limit(limit * 2),

    supabase
      .from('price_history_ah')
      .select('base_item_id, item_name, variant_key')
      .or(`base_item_id.ilike.${startPattern},base_item_id.ilike.${wordPattern}`)
      .not('base_item_id', 'is', null)
      .order('base_item_id')
      .limit(limit * 5),
  ])

  // ── Groupe AH par base_item_id ────────────────────────────
  const ahMap = new Map<string, { item_name: string; variants: Set<string> }>()
  for (const row of ahItems || []) {
    if (!ahMap.has(row.base_item_id)) {
      // Nom propre : préfère item_name sans étoiles/reforge
      const cleanName = (row.item_name || '')
        .replace(/[✪➊➋➌➍➎➏➐➑➒➓✦✿]/g, '')
        .replace(/\b(Ancient|Fabled|Withered|Heroic|Spicy|Itchy|Gentle|Epic|Odd|Fast|Fair|Deadly|Shiny|Keen|Rapid|Unpleasant|Nasty|Stained|Loving|Paranoid|Demonic|Forceful|Hurtful|Strong|Superior|Godly|Zealous|Bizarre|Silky|Bloody|Shaded|Mystical|Perfect|Spiritual|Headstrong|Clean|Fierce|Heavy|Light|Sharp|Wise|Fruitful|Candied|Treacherous|Renowned|Spiked|Renowned|Titanic|Jaded|Lush|Chomp|Stellar|Dirty|Pure|Necrotic|Undead|Noisy|Sandy|Stiff|Lucky)\s/gi, '')
        .replace(/\s+/g, ' ').trim()
      ahMap.set(row.base_item_id, {
        item_name: cleanName || toLabel(row.base_item_id),
        variants:  new Set(),
      })
    }
    if (row.variant_key) ahMap.get(row.base_item_id)!.variants.add(row.variant_key)
  }

  // ── Construit les résultats ───────────────────────────────
  const seen    = new Set<string>()
  const results: any[] = []

  // Bazaar en premier
  for (const row of bazaarItems || []) {
    const key = `bz:${row.item_id}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({
      item_id:       row.item_id,
      item_name:     toLabel(row.item_id),
      source:        'bazaar',
      variant_count: 1,
    })
  }

  // AH — 1 ligne par base_item_id
  for (const [base_item_id, { item_name, variants }] of ahMap) {
    const key = `ah:${base_item_id}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({
      item_id:       base_item_id,
      item_name:     item_name,
      source:        'ah',
      variant_count: variants.size,
    })
  }

  // ── Tri par pertinence ────────────────────────────────────
  // exact match → starts with → contains (dans chaque groupe source)
  results.sort((a, b) => {
    const scoreA = a.item_id === search ? 0
      : a.item_id.startsWith(search)   ? 1
      : 2
    const scoreB = b.item_id === search ? 0
      : b.item_id.startsWith(search)   ? 1
      : 2
    if (scoreA !== scoreB) return scoreA - scoreB
    return a.item_id.localeCompare(b.item_id)
  })

  return NextResponse.json(results.slice(0, limit))
}