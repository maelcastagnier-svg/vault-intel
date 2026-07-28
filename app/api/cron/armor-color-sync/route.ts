// app/api/cron/armor-color-sync/route.ts
// Sync hebdomadaire : récupère le vrai default_color (NBT `display.color` sur
// les items LEATHER_*) depuis NotEnoughUpdates-REPO/items/{internal_id}.json,
// pour les items armure déjà connus dans item_stats -- scope volontairement
// limité à ceux-là (quelques centaines), jamais les ~5000+ fichiers items/
// du repo entier, qu'on n'a aucune raison de tous vouloir.
//
// Contexte : Money Making tintait toutes les pièces d'armure recommandées
// avec une seule couleur cuir vanilla générique (#A06540), documentée comme
// placeholder en attendant un vrai pack de texture. Vérifié avant de coder
// (voir CLAUDE.md) : NEU-REPO expose déjà, pour chaque pièce LEATHER_*, la
// vraie couleur par défaut assignée par Hypixel (nbttag -> display.color, un
// entier RGB décimal) -- confirmé contre une valeur déjà documentée
// manuellement (Necron's Chestplate: 15155516 = #E7413C, match exact).
// Sur les 649 pièces d'armure du repo : ~62% sont dans ce cas (LEATHER_*
// avec couleur), ~19% sont une tête de joueur reskinnée (SKULL_ITEM, aucune
// couleur possible), ~17% sont un autre matériau de base (diamond/iron/
// golden/chainmail -- ex: Revenant Armor, `minecraft:diamond_chestplate`,
// zéro donnée couleur server-side, look 100% resource-pack). Le fallback
// vanilla reste la seule option honnête pour ces deux derniers groupes --
// ce n'est pas une régression, juste l'absence réelle de donnée.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ARMOR_CATEGORIES = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS']
const NEU_ITEMS_RAW = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items'

// nbttag est une string SNBT (pas du JSON pur) -- le seul champ qui nous
// intéresse vit dans display:{...color:NNNNN} (entier décimal RGB), jamais
// ailleurs -- vérifié contre plusieurs vrais fichiers (Necron's Chestplate,
// Superior Dragon Chestplate, Shadow Assassin Chestplate) avant d'écrire ce
// regex.
export function extractColor(nbttag: string | undefined): string | null {
  if (!nbttag) return null
  const m = nbttag.match(/color:(\d+)/)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n < 0 || n > 0xFFFFFF) return null
  return '#' + n.toString(16).padStart(6, '0').toUpperCase()
}

export async function runArmorColorSync() {
  const { data: items, error } = await supabase
    .from('item_stats')
    .select('item_id, category')
    .in('category', ARMOR_CATEGORIES)

  if (error) throw new Error('item_stats select: ' + error.message)

  let updated = 0, checkedNoColor = 0, failed = 0

  // Concurrence bornée -- fetch raw.githubusercontent.com, pas d'auth ni de
  // rate-limit strict comme l'API GitHub elle-même (contrairement au
  // listing de neu-sync qui passe par l'API REST).
  const CONCURRENCY = 12
  for (let i = 0; i < (items || []).length; i += CONCURRENCY) {
    const batch = items!.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(async (item) => {
      try {
        const res = await fetch(`${NEU_ITEMS_RAW}/${item.item_id}.json`)
        if (!res.ok) { failed++; return }
        const data = await res.json()
        const color = extractColor(data.nbttag)
        if (color) {
          const { error: updErr } = await supabase
            .from('item_stats')
            .update({ default_color: color })
            .eq('item_id', item.item_id)
          if (updErr) { failed++; return }
          updated++
        } else {
          checkedNoColor++
        }
      } catch {
        failed++
      }
    }))
  }

  return {
    total_armor_items: (items || []).length,
    updated,
    checked_no_color: checkedNoColor,
    failed,
  }
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const logId = await startSync('armor-color-sync')
  try {
    const result = await runArmorColorSync()
    await finishSync(logId, result.failed === result.total_armor_items && result.total_armor_items > 0 ? 'error' : 'success', result.updated, result)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
