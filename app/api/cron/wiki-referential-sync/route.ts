// app/api/cron/wiki-referential-sync/route.ts
// Consolidation demandée par l'utilisateur (2 août) : les 4 crons hebdomadaires du
// Volet 2 (wiki-mining-forge-sync/wiki-garden-sync/wiki-slot-upgrades-sync/wiki-
// economy-npc-sync) faisaient chacun quelques lectures Supabase déjà en cache +
// quelques upserts sur de petites tables (max 119 lignes pour hotm_forge_durations) --
// aucune raison de garder 4 fonctions Vercel séparées pour un travail de quelques
// secondes au total. Fusionnés en un seul cron, même pattern que network-events-sync
// (7 sous-fonctions, 1 seule entrée sync_log avec le détail par table dans `results`).
// Logique de parsing inchangée -- simple déplacement de fichier, revalidée localement
// (npx tsx) contre le vrai contenu caché avant ce merge, résultats identiques aux 4
// crons séparés déjà vérifiés le même jour (voir WIKI-MAPPING.md, section Volet 2).
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { startSync, finishSync } from '../../../../lib/sync-log'
import { getWikiContent, stripColorTemplate } from '../../../../lib/wiki-cache'
import { parseRowspanTable, cleanWikiText, extractFirstWikitableBody } from '../../../../lib/wiki-table-parse'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================
// hotm_forge_durations (ex wiki-mining-forge-sync)
// ============================================================
function parseDurationSeconds(text: string): number {
  let total = 0
  const day = text.match(/(\d+)\s*Day/i)
  const hour = text.match(/(\d+)\s*Hour/i)
  const min = text.match(/(\d+)\s*Minute/i)
  const sec = text.match(/(\d+)\s*Second/i)
  if (day) total += parseInt(day[1], 10) * 86400
  if (hour) total += parseInt(hour[1], 10) * 3600
  if (min) total += parseInt(min[1], 10) * 60
  if (sec) total += parseInt(sec[1], 10)
  return total
}

interface ForgeRow {
  item_name: string; duration_seconds: number; duration_text: string; hotm_requirement: string | null
  ingredients: { item: string; amount: number }[]
}

// "{{BZC|*2 Enchanted Diamond Block *1 Foo}}" ou "... + {{ID|Prereq Item}}" -- convertit
// chaque nom lisible en ID brut (majuscules, espaces->underscore), convention Hypixel
// standard, cohérente avec les item_id déjà en base (ex: REFINED_DIAMOND, ENCHANTED_
// DIAMOND_BLOCK).
function toItemId(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function parseIngredients(materialCostRaw: string): { item: string; amount: number }[] {
  const ingredients: { item: string; amount: number }[] = []
  const seen = new Set<string>()
  const starRe = /\*(\d+)\s+([^*{}]+?)(?=\s*\*|\s*}}|$)/g
  let m: RegExpExecArray | null
  while ((m = starRe.exec(materialCostRaw))) {
    const item = toItemId(m[2])
    if (item && !seen.has(item)) { seen.add(item); ingredients.push({ item, amount: parseInt(m[1], 10) }) }
  }
  const idRe = /\{\{ID\|([^}|]+)\}\}/g
  while ((m = idRe.exec(materialCostRaw))) {
    const item = toItemId(m[1])
    if (item && !seen.has(item)) { seen.add(item); ingredients.push({ item, amount: 1 }) }
  }
  return ingredients
}

function parseForgeWikitable(tableBody: string): ForgeRow[] {
  const resolvedRows = parseRowspanTable(tableBody, 6)
  const rows: ForgeRow[] = []
  for (const resolved of resolvedRows) {
    const itemName = cleanWikiText(resolved[1])
    const durationText = resolved[3].trim()
    if (!itemName || !durationText) continue
    const reqRaw = resolved[4].split('<br>')[0].trim()
    rows.push({
      item_name: itemName,
      duration_seconds: parseDurationSeconds(durationText),
      duration_text: durationText,
      hotm_requirement: reqRaw || null,
      ingredients: parseIngredients(resolved[5] || ''),
    })
  }
  return rows
}

async function syncHotmForgeDurations(): Promise<number> {
  const content = await getWikiContent(supabase, 'the_forge_table')
  const sectionRe = /====\s*([^=]+?)\s*====/g
  const headers: { title: string; index: number; bodyStart: number }[] = []
  let m: RegExpExecArray | null
  while ((m = sectionRe.exec(content))) {
    headers.push({ title: m[1].trim(), index: m.index, bodyStart: sectionRe.lastIndex })
  }
  if (headers.length === 0) throw new Error('the_forge_table: aucune section ==== trouvée, structure a peut-être changé')

  const allRows: (ForgeRow & { section: string })[] = []
  for (let i = 0; i < headers.length; i++) {
    const sectionEnd = i + 1 < headers.length ? headers[i + 1].index : content.length
    const body = content.slice(headers[i].bodyStart, sectionEnd)
    const tableBody = extractFirstWikitableBody(body)
    if (!tableBody) continue
    const rows = parseForgeWikitable(tableBody)
    for (const r of rows) allRows.push({ ...r, section: headers[i].title })
  }
  if (allRows.length === 0) throw new Error('the_forge_table: 0 lignes extraites, parsing probablement cassé')

  const { error: delErr } = await supabase.from('hotm_forge_durations').delete().gte('id', 0)
  if (delErr) throw new Error('hotm_forge_durations delete: ' + delErr.message)

  const insertRows = allRows.map(r => ({
    item_name: r.item_name,
    duration_seconds: r.duration_seconds,
    duration_text: r.duration_text,
    hotm_requirement: r.hotm_requirement,
    section: r.section,
    updated_at: new Date().toISOString(),
  }))
  for (let i = 0; i < insertRows.length; i += 100) {
    const { error } = await supabase.from('hotm_forge_durations').insert(insertRows.slice(i, i + 100))
    if (error) throw new Error('hotm_forge_durations insert: ' + error.message)
  }

  // forge_recipes -- même page, mêmes lignes déjà parsées ici (item_id/item_name/
  // forge_time_hours/ingredients), demandé explicitement à s'ajouter à cette fonction
  // plutôt qu'un nouveau cron (règle 4, même source déjà fetchée).
  const recipeRows = allRows
    .filter(r => r.ingredients.length > 0)
    .map(r => ({
      item_id: toItemId(r.item_name),
      item_name: r.item_name,
      forge_time_hours: Math.round((r.duration_seconds / 3600) * 100) / 100,
      ingredients: r.ingredients,
    }))
  const { error: delRecErr } = await supabase.from('forge_recipes').delete().gte('id', 0)
  if (delRecErr) throw new Error('forge_recipes delete: ' + delRecErr.message)
  for (let i = 0; i < recipeRows.length; i += 100) {
    const { error } = await supabase.from('forge_recipes').insert(recipeRows.slice(i, i + 100))
    if (error) throw new Error('forge_recipes insert: ' + error.message)
  }

  return insertRows.length + recipeRows.length
}

// ============================================================
// magical_power_by_rarity (wiki "Accessory Power/Mechanics")
// Vérifié le 3 août : Mythic était à tort 20 en base (vraie valeur 22), Divine/
// Special/Very Special/Ultimate manquaient entièrement -- corrigé manuellement par
// SQL ce jour-là, cette fonction automatise le refresh pour que ça ne redivergue
// plus jamais silencieusement.
// ============================================================
async function syncMagicalPowerByRarity(): Promise<number> {
  const content = await getWikiContent(supabase, 'accessory_power_mechanics')
  const tableBody = extractFirstWikitableBody(content)
  if (!tableBody) throw new Error('accessory_power_mechanics: wikitable Rarity/MP introuvable')
  const resolved = parseRowspanTable(tableBody, 2)
  const rows = resolved
    .map(r => {
      const rarityMatch = r[0].match(/\{\{([A-Za-z ]+)\}\}/)
      const rarity = rarityMatch ? rarityMatch[1].trim().toUpperCase().replace(/\s+/g, '_') : ''
      const mp = parseInt(r[1].trim(), 10)
      return { rarity, magical_power: mp }
    })
    .filter(r => r.rarity && !isNaN(r.magical_power))
  if (rows.length === 0) throw new Error('accessory_power_mechanics: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('magical_power_by_rarity').upsert(rows, { onConflict: 'rarity' })
  if (error) throw new Error('magical_power_by_rarity upsert: ' + error.message)
  return rows.length
}

// ============================================================
// hotm_hotf_powders (wiki : Mithril Powder / Gemstone Powder / Glacite Powder /
// Forest Whispers) -- vrai gap identifié dans discovery_queue (#16) : la table
// n'avait que 4 lignes stub (juste le costLine §-codes hérité d'un chargement
// antérieur, aucune mécanique réelle de gain).
//
// Structure hétérogène confirmée en testant contre le vrai contenu des 4 pages :
// Mithril Powder a 2 vraies wikitables (Blocks/Mobs) sous Obtaining ; Forest Whispers
// a 2 tables mais imbriquées différemment (sources de base + sources de boost, toutes
// deux SOUS le même H2 Obtaining) ; Gemstone Powder et Glacite Powder n'ont AUCUNE
// wikitable, seulement des listes à puces en prose -- capturé tel quel (obtaining_notes
// / gain_boost_notes) plutôt que de forcer une structure tabulaire non sourcée sur ces
// deux pages. Section "Increasing X Gain" trouvée APRES "Usage" pour les 3 pages Powder
// (pas avant, hypothèse initiale fausse corrigée en testant).
// ============================================================
const POWDER_COST_LINES: Record<string, string> = {
  GLACITE: '§7Cost: §b{cost} Glacite Powder',
  MITHRIL: '§7Cost: §2{cost} Mithril Powder',
  GEMSTONE: '§7Cost: §d{cost} Gemstone Powder',
  FOREST_WHISPERS: '§7Cost: §b{cost} Forest Whispers',
}

const POWDER_PAGES: { tree: string; powder_key: string; wikiKey: string; currency: string }[] = [
  { tree: 'hotm', powder_key: 'MITHRIL', wikiKey: 'mithril_powder', currency: 'Mithril Powder' },
  { tree: 'hotm', powder_key: 'GEMSTONE', wikiKey: 'gemstone_powder', currency: 'Gemstone Powder' },
  { tree: 'hotm', powder_key: 'GLACITE', wikiKey: 'glacite_powder', currency: 'Glacite Powder' },
  { tree: 'hotf', powder_key: 'FOREST_WHISPERS', wikiKey: 'forest_whispers', currency: 'Forest Whispers' },
]

// Ces 4 tables n'ont ni rowspan ni colspan mais mélangent cellules une-par-ligne
// ("|A\n|B") et cellules jointes en ligne ("|A || B") -- parseRowspanTable (partagé,
// conçu pour le cas rowspan des tables garden/pest) ne gère que le 1er style : bug
// trouvé en testant, 4/5 lignes de la table Forest Whispers disparaissaient. Parseur
// local dédié, plus simple que le partagé puisqu'aucun span à suivre ici.
function parseFlatTable(sectionBody: string, numCols: number): string[][] {
  const tableBody = extractFirstWikitableBody(sectionBody)
  if (!tableBody) return []
  const rowBlocks = tableBody.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
  const rows: string[][] = []
  for (const block of rowBlocks) {
    const cells: string[] = []
    for (const line of block.split('\n')) {
      const t = line.trim()
      if (!t.startsWith('|') || t.startsWith('|}')) continue
      for (const part of t.slice(1).split('||')) cells.push(part.trim())
    }
    if (cells.length > 0) rows.push(cells.slice(0, numCols))
  }
  return rows
}

// {{Slot|X}}{{Slot|Y}} (blocs Mithril), {{Forest Whispers|+10}} (la page se
// cite elle-même pour afficher un montant coloré) et [[Cible|Alias]] (l'alias, pas la
// cible -- cleanWikiText partagé renvoie la cible, backwards pour ce cas) ne sont pas
// gérés par cleanWikiText : 3 bugs trouvés en testant (templates de bloc bruts, lien
// affichant la page cible au lieu du texte lisible, <br> littéral dans une cellule à
// 2 sources).
function cleanPowderCell(s: string, currencyName: string): string {
  const slots = [...s.matchAll(/\{\{Slot\|([^}|]+)\}\}/g)].map(m => m[1].trim())
  if (slots.length > 0) return slots.join(', ')
  const escaped = currencyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return s
    .replace(new RegExp(`\\{\\{${escaped}\\|([^}]+)\\}\\}`, 'g'), '$1')
    .replace(/<br\s*\/?>/gi, '; ')
    .replace(/\[\[File:[^\]]*\]\]/g, '')
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\{\{(?:ID|MobSprite|Zone|Green|Skill)\|([^};|]+)(?:;[^}|]*)?\}\}/gi, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .trim()
}

function parsePowderTable(sectionBody: string, currencyName: string): { label: string; detail: string }[] {
  return parseFlatTable(sectionBody, 2)
    .map(r => ({ label: cleanPowderCell(r[0] || '', currencyName), detail: cleanPowderCell(r[1] || '', currencyName) }))
    .filter(r => r.label && r.detail)
}

function extractPowderBullets(sectionBody: string, currencyName: string): string[] {
  return sectionBody
    .split('\n')
    .filter(l => l.trim().startsWith('*') && !l.trim().startsWith('**'))
    .map(l => cleanPowderCell(l.trim().replace(/^\*+\s*/, ''), currencyName))
    .filter(Boolean)
}

async function syncHotmHotfPowders(): Promise<number> {
  const rows: any[] = []
  for (const page of POWDER_PAGES) {
    const content = await getWikiContent(supabase, page.wikiKey)
    const obtainIdx = content.indexOf('== Obtaining ==')
    const usageIdx = content.indexOf('== Usage ==')
    if (obtainIdx === -1 || usageIdx === -1) {
      throw new Error(`${page.wikiKey}: sections Obtaining/Usage introuvables`)
    }
    const obtainSection = content.slice(obtainIdx, usageIdx)

    let obtainTables: { label: string; detail: string }[] = []
    let boostTables: { label: string; detail: string }[] = []

    if (page.wikiKey === 'mithril_powder') {
      const blocksIdx = content.indexOf('=== Blocks ===')
      const mobsIdx = content.indexOf('=== Mobs ===')
      if (blocksIdx !== -1 && mobsIdx !== -1) {
        obtainTables = [
          ...parsePowderTable(content.slice(blocksIdx, mobsIdx), page.currency),
          ...parsePowderTable(content.slice(mobsIdx, usageIdx), page.currency),
        ]
      }
    } else if (page.wikiKey === 'forest_whispers') {
      const increaseIdx = content.indexOf('can be increased')
      if (increaseIdx !== -1) {
        obtainTables = parsePowderTable(content.slice(obtainIdx, increaseIdx), page.currency)
        boostTables = parsePowderTable(content.slice(increaseIdx, usageIdx), page.currency)
      }
    }

    const obtainingNotes = extractPowderBullets(obtainSection, page.currency)

    // "== Increasing X Gain ==" vient APRES "== Usage ==" pour les 3 pages Powder --
    // Forest Whispers n'a pas cette section séparée (déjà capturée dans boostTables
    // ci-dessus, imbriquée sous Obtaining elle-même).
    let gainBoostNotes: string[] = []
    const increaseHeaderMatch = content.match(/== Increasing [^=]*Gain ==/)
    if (increaseHeaderMatch) {
      const startIdx = content.indexOf(increaseHeaderMatch[0])
      const nextH2 = content.indexOf('\n== ', startIdx + increaseHeaderMatch[0].length)
      const section = nextH2 === -1 ? content.slice(startIdx) : content.slice(startIdx, nextH2)
      gainBoostNotes = extractPowderBullets(section, page.currency)
    }

    const maxMatch = content.match(/maximum amount of.*?is\s*\{\{Green\|([^}]+)\}\}/i)
    const maxAmount = maxMatch ? stripColorTemplate(`{{Green|${maxMatch[1]}}}`) : null

    rows.push({
      tree: page.tree,
      powder_key: page.powder_key,
      data: {
        costLine: POWDER_COST_LINES[page.powder_key] ?? null,
        obtaining_sources: obtainTables,   // [] pour Gemstone/Glacite -- aucune wikitable sur ces pages
        gain_boost_sources: boostTables,   // idem, rempli seulement pour Forest Whispers
        obtaining_notes: obtainingNotes,
        gain_boost_notes: gainBoostNotes,
        max_amount: maxAmount,
      },
    })
  }

  if (rows.length === 0) throw new Error('hotm_hotf_powders: 0 lignes construites')

  const { error: delErr } = await supabase.from('hotm_hotf_powders').delete().gte('id', 0)
  if (delErr) throw new Error('hotm_hotf_powders delete: ' + delErr.message)
  const { error } = await supabase.from('hotm_hotf_powders').insert(rows)
  if (error) throw new Error('hotm_hotf_powders insert: ' + error.message)
  return rows.length
}

// ============================================================
// garden_pests + garden_pest_fortune_penalty (ex wiki-garden-sync)
// ============================================================
function extractPureId(raw: string): string | null {
  const m = raw.trim().match(/^\{\{ID\|([^}|]+)\}\}$/)
  return m ? m[1].trim() : null
}

async function syncGardenPests(): Promise<number> {
  const content = await getWikiContent(supabase, 'pest')

  const elusiveMatch = content.match(/\{\{mt\|Elusive\}\}\s*\(([^)]+)\)/)
  const elusiveNames = elusiveMatch ? elusiveMatch[1].split(',').map(s => s.trim()) : []

  const sectionIdx = content.indexOf('==== Pests ====')
  if (sectionIdx === -1) throw new Error('pest: section "==== Pests ====" introuvable')
  const sectionBody = content.slice(sectionIdx)
  const tableBody = extractFirstWikitableBody(sectionBody)
  if (!tableBody) throw new Error('pest: wikitable "Pests" introuvable sous sa section')

  const resolvedRows = parseRowspanTable(tableBody, 6)
  const rows = resolvedRows
    .map(r => {
      let pestName = cleanWikiText(r[0]).replace(/\s*\(Pest\)\s*$/, '').trim()
      const associatedCrop = cleanWikiText(r[1])
      const levelMatch = r[2].match(/\d+/)
      const gardenLevelRequired = levelMatch ? parseInt(levelMatch[0], 10) : null
      const attractItem = extractPureId(r[3])
      const attractVinyl = extractPureId(r[4])
      return {
        pest_name: pestName,
        associated_crop: associatedCrop || null,
        garden_level_required: gardenLevelRequired,
        attract_item: attractItem,
        attract_vinyl: attractVinyl,
        mob_type: elusiveNames.includes(pestName) ? 'Elusive' : 'Pest',
      }
    })
    .filter(r => r.pest_name && r.garden_level_required !== null)

  if (rows.length === 0) throw new Error('pest: 0 lignes extraites de la table Pests, parsing probablement cassé')

  const { error } = await supabase.from('garden_pests').upsert(rows, { onConflict: 'pest_name' })
  if (error) throw new Error('garden_pests upsert: ' + error.message)
  return rows.length
}

async function syncGardenPestFortunePenalty(): Promise<number> {
  const content = await getWikiContent(supabase, 'pest')

  const sectionIdx = content.indexOf('== Behavior ==')
  if (sectionIdx === -1) throw new Error('pest: section "== Behavior ==" introuvable')
  const sectionBody = content.slice(sectionIdx, sectionIdx + 4000)
  const tableStart = sectionBody.indexOf('{|')
  const tableEnd = sectionBody.indexOf('|}', tableStart)
  if (tableStart === -1 || tableEnd === -1) throw new Error('pest: wikitable "Farming Fortune loss" introuvable')
  const table = sectionBody.slice(tableStart, tableEnd)

  const blocks = table.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
  const dataStart = blocks.findIndex(b => /^!\s*\d+\s*$/.test(b.split('\n')[0].trim()))
  if (dataStart === -1) throw new Error('pest: aucune ligne de données (pest_count) trouvée dans la table FmF loss')
  const dataBlocks = blocks.slice(dataStart)

  const TIERS = ['0-99', '100-199', '200-299', '300-399', '400-499', '500+']
  const active: Array<{ remaining: number } | null> = new Array(TIERS.length).fill(null)
  const rows: Array<{ pest_count: number; bonus_pest_chance_tier: string; fortune_loss_pct: number }> = []

  for (const block of dataBlocks) {
    const lines = block.split('\n').filter(l => l.trim().length > 0)
    const headerMatch = lines[0].trim().match(/^!\s*(\d+)\s*$/)
    if (!headerMatch) continue
    const pestCount = parseInt(headerMatch[1], 10)
    const cellLines = lines.slice(1)
    let cellIdx = 0
    for (let col = 0; col < TIERS.length; col++) {
      const a = active[col]
      if (a && a.remaining > 0) {
        a.remaining -= 1
        if (a.remaining === 0) active[col] = null
        continue
      }
      const raw = cellLines[cellIdx]
      cellIdx += 1
      if (raw === undefined) continue
      const rowspanMatch = raw.match(/rowspan="(\d+)"\s*\|(.*)$/)
      const value = (rowspanMatch ? rowspanMatch[2] : raw.replace(/^\|\s*/, '')).trim()
      if (rowspanMatch) active[col] = { remaining: parseInt(rowspanMatch[1], 10) - 1 }
      const pctMatch = value.match(/(\d+(?:\.\d+)?)%/)
      if (pctMatch) {
        rows.push({ pest_count: pestCount, bonus_pest_chance_tier: TIERS[col], fortune_loss_pct: parseFloat(pctMatch[1]) })
      }
    }
  }

  if (rows.length === 0) throw new Error('pest: 0 lignes extraites de la table FmF loss, parsing probablement cassé')

  const { error } = await supabase
    .from('garden_pest_fortune_penalty')
    .upsert(rows, { onConflict: 'pest_count, bonus_pest_chance_tier' })
  if (error) throw new Error('garden_pest_fortune_penalty upsert: ' + error.message)
  return rows.length
}

// ============================================================
// time_pocket_upgrades + time_pocket_aging_items + minion_upgrade_items
// (ex wiki-slot-upgrades-sync)
// ============================================================
async function syncTimePocket(): Promise<number> {
  const content = await getWikiContent(supabase, 'time_pocket')

  const upgradeRe = /from\s*\{\{Green\|(\d+)\}\}\s*to\s*\{\{Green\|(\d+)\}\}\s*slots\s*for\s*\{\{RD\|([^}]+)\}\}/g
  const upgradeRows: { slots: number; upgrade_cost: string | null }[] = []
  let m: RegExpExecArray | null
  let sawBase = false
  while ((m = upgradeRe.exec(content))) {
    if (!sawBase) {
      upgradeRows.push({ slots: parseInt(m[1], 10), upgrade_cost: null })
      sawBase = true
    }
    upgradeRows.push({ slots: parseInt(m[2], 10), upgrade_cost: m[3].trim() })
  }
  if (upgradeRows.length === 0) throw new Error('time_pocket: aucun palier de slots trouvé (prose "from X to Y slots for" absente/changée)')

  const agingRe = /\*\s*\{\{ID\|([^}]+)\}\}\s*and\s*\{\{ID\|([^}]+)\}\}/g
  const agingRows: { base_item: string; evolved_item: string; base_evolve_hours: null }[] = []
  while ((m = agingRe.exec(content))) {
    agingRows.push({ base_item: m[1].trim(), evolved_item: m[2].trim(), base_evolve_hours: null })
  }
  if (agingRows.length === 0) throw new Error('time_pocket: aucun aging item trouvé (liste "* {{ID|X}} and {{ID|Y}}" absente/changée)')

  const { error: delUpErr } = await supabase.from('time_pocket_upgrades').delete().gte('id', 0)
  if (delUpErr) throw new Error('time_pocket_upgrades delete: ' + delUpErr.message)
  const { error: insUpErr } = await supabase.from('time_pocket_upgrades').insert(upgradeRows)
  if (insUpErr) throw new Error('time_pocket_upgrades insert: ' + insUpErr.message)

  const { error: delAgErr } = await supabase.from('time_pocket_aging_items').delete().gte('id', 0)
  if (delAgErr) throw new Error('time_pocket_aging_items delete: ' + delAgErr.message)
  const { error: insAgErr } = await supabase.from('time_pocket_aging_items').insert(agingRows)
  if (insAgErr) throw new Error('time_pocket_aging_items insert: ' + insAgErr.message)

  return upgradeRows.length + agingRows.length
}

async function syncMinionUpgradeItems(): Promise<number> {
  const content = await getWikiContent(supabase, 'minion_upgrades_table')

  const sectionRe = /\|-\|([^=]+?)=/g
  const sections: { title: string; bodyStart: number }[] = []
  let m: RegExpExecArray | null
  while ((m = sectionRe.exec(content))) {
    sections.push({ title: m[1].trim(), bodyStart: sectionRe.lastIndex })
  }
  if (sections.length === 0) throw new Error('minion_upgrades_table: aucun onglet tabber trouvé, structure a peut-être changé')

  const rows: { item_name: string; upgrade_category: string }[] = []
  const seen = new Set<string>()
  for (let i = 0; i < sections.length; i++) {
    const end = i + 1 < sections.length
      ? content.lastIndexOf('|-|', sections[i + 1].bodyStart)
      : content.indexOf('</tabber>', sections[i].bodyStart)
    const body = content.slice(sections[i].bodyStart, end === -1 ? undefined : end)
    const category = sections[i].title.replace(/\s*upgrades\s*$/i, '').trim()

    const rowBlocks = body.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
    for (const block of rowBlocks) {
      const link = block.match(/\[\[([^\]|]+)/)
      if (!link) continue
      const itemName = link[1].trim()
      if (seen.has(itemName)) continue
      seen.add(itemName)
      rows.push({ item_name: itemName, upgrade_category: category })
    }
  }
  if (rows.length === 0) throw new Error('minion_upgrades_table: 0 items extraits, parsing probablement cassé')

  const { error } = await supabase.from('minion_upgrade_items').upsert(rows, { onConflict: 'item_name' })
  if (error) throw new Error('minion_upgrade_items upsert: ' + error.message)
  return rows.length
}

// ============================================================
// sack_tiers + trapper_pelt_rarities + trapper_pelt_modifiers
// (ex wiki-economy-npc-sync)
// ============================================================
async function syncSackTiers(): Promise<number> {
  const content = await getWikiContent(supabase, 'sacks')
  const sectionIdx = content.indexOf('== Tiers ==')
  if (sectionIdx === -1) throw new Error('sacks: section "== Tiers ==" introuvable')
  const sectionBody = content.slice(sectionIdx, sectionIdx + 1000)
  const tableBody = extractFirstWikitableBody(sectionBody)
  if (!tableBody) throw new Error('sacks: wikitable "Tiers" introuvable')

  const resolved = parseRowspanTable(tableBody, 3)
  const rows = resolved
    .map(r => ({
      tier_name: r[0].trim(),
      amount_per_item: parseInt(r[1].replace(/,/g, '').trim(), 10),
      amount_in_stacks: parseInt(r[2].replace(/,/g, '').trim(), 10),
    }))
    .filter(r => r.tier_name && !isNaN(r.amount_per_item) && !isNaN(r.amount_in_stacks))

  if (rows.length === 0) throw new Error('sacks: 0 tiers extraits, parsing probablement cassé')

  const { error } = await supabase.from('sack_tiers').upsert(rows, { onConflict: 'tier_name' })
  if (error) throw new Error('sack_tiers upsert: ' + error.message)
  return rows.length
}

async function syncTrapperPelts(): Promise<number> {
  const content = await getWikiContent(supabase, 'pelts')

  const modIdx = content.indexOf('|+Modifiers')
  if (modIdx === -1) throw new Error('pelts: table "Modifiers" introuvable')
  const modTableStart = content.lastIndexOf('{|', modIdx)
  const modBody = extractFirstWikitableBody(content.slice(modTableStart, modIdx + 600))
  if (!modBody) throw new Error('pelts: wikitable "Modifiers" introuvable')
  const modRows = parseRowspanTable(modBody, 2)
    .map(r => {
      const nameMatch = r[0].match(/\{\{ID\|([^}]+)\}\}/)
      return { item_name: nameMatch ? nameMatch[1].trim() : '', effect: stripColorTemplate(r[1]) }
    })
    .filter(r => r.item_name && r.effect)
  if (modRows.length === 0) throw new Error('pelts: 0 modificateurs extraits, parsing probablement cassé')

  const rarityIdx = content.indexOf('rowspan="2"|Rarity')
  if (rarityIdx === -1) throw new Error('pelts: table "Rarity/Pelts" introuvable')
  const raritySearchStart = content.lastIndexOf('{|', rarityIdx)
  const rarityBody = extractFirstWikitableBody(content.slice(raritySearchStart, raritySearchStart + 900))
  if (!rarityBody) throw new Error('pelts: wikitable "Rarity/Pelts" introuvable')
  const rarityRows = parseRowspanTable(rarityBody, 3)
    .map(r => {
      const rarityMatch = r[0].match(/\{\{[A-Za-z]+\|([^}]+)\}\}/)
      return {
        rarity: rarityMatch ? rarityMatch[1].trim() : r[0].trim(),
        default_pelts: parseInt(stripColorTemplate(r[1]), 10),
        max_pelts: parseInt(stripColorTemplate(r[2]), 10),
      }
    })
    .filter(r => r.rarity && !isNaN(r.default_pelts) && !isNaN(r.max_pelts))
  if (rarityRows.length === 0) throw new Error('pelts: 0 raretés extraites, parsing probablement cassé')

  const { error: modErr } = await supabase.from('trapper_pelt_modifiers').upsert(modRows, { onConflict: 'item_name' })
  if (modErr) throw new Error('trapper_pelt_modifiers upsert: ' + modErr.message)

  const { error: rarErr } = await supabase.from('trapper_pelt_rarities').upsert(rarityRows, { onConflict: 'rarity' })
  if (rarErr) throw new Error('trapper_pelt_rarities upsert: ' + rarErr.message)

  return modRows.length + rarityRows.length
}

// ============================================================
// player_stats -- 16 pages wiki "Stats" jamais capturées (Health/Strength/Speed/
// Defense/True Defense/Intelligence/Crit Chance/Crit Damage/Attack Speed/Ferocity/
// Ability Damage/Mining Speed/Sea Creature Chance/Magic Find/Pet Luck/Mending),
// chacune un {{Infobox/Stat}} uniforme. Trouvé en lisant le contenu brut du wiki
// (3 août, correction méthodologique -- extraction par contenu réel, jamais par
// correspondance de nom/catégorie).
// ============================================================
const PLAYER_STAT_PAGES: { key: string; display_name: string }[] = [
  { key: 'health', display_name: 'Health' },
  { key: 'strength', display_name: 'Strength' },
  { key: 'speed', display_name: 'Speed' },
  { key: 'defense', display_name: 'Defense' },
  { key: 'true_defense', display_name: 'True Defense' },
  { key: 'intelligence', display_name: 'Intelligence' },
  { key: 'crit_chance', display_name: 'Crit Chance' },
  { key: 'crit_damage', display_name: 'Crit Damage' },
  { key: 'attack_speed', display_name: 'Attack Speed' },
  { key: 'ferocity', display_name: 'Ferocity' },
  { key: 'ability_damage', display_name: 'Ability Damage' },
  { key: 'mining_speed', display_name: 'Mining Speed' },
  { key: 'sea_creature_chance', display_name: 'Sea Creature Chance' },
  { key: 'magic_find', display_name: 'Magic Find' },
  { key: 'pet_luck', display_name: 'Pet Luck' },
  { key: 'mending', display_name: 'Mending' },
]

// Capture jusqu'à fin de ligne (pas jusqu'au prochain "|") -- les valeurs réelles
// contiennent souvent un template {{Skill|Enchanting}} avec un "|" interne, qui
// tronquait le match à tort avec une version antérieure de cette regex (bug trouvé
// en testant : ways_to_increase revenait null sur 7/16 pages où ce cas se produit).
function extractInfoboxField(infobox: string, field: string): string | null {
  const re = new RegExp(`\\|\\s*${field}\\s*=\\s*([^\\n]*)`, 'i')
  const m = infobox.match(re)
  if (!m) return null
  const v = m[1].trim()
  return v.length > 0 ? v : null
}

// content.indexOf('}}', start) s'arrête au premier "}}" rencontré -- qui est presque
// toujours un template imbriqué à l'intérieur de l'infobox lui-même (ex: {{SkyBlock
// Level}} ou {{Skill|Farming}} dans ways_to_increase), pas la vraie fin de
// {{Infobox/Stat}}. Bug réel trouvé en vérifiant le résultat en prod (9/16 pages
// avaient base_value/max_value null) -- corrigé avec un vrai suivi de profondeur
// d'accolades plutôt qu'un indexOf naïf.
function findTemplateEnd(content: string, start: number): number {
  let depth = 0
  for (let i = start; i < content.length - 1; i++) {
    if (content[i] === '{' && content[i + 1] === '{') { depth++; i++; continue }
    if (content[i] === '}' && content[i + 1] === '}') { depth--; i++; if (depth === 0) return i }
  }
  return -1
}

async function syncPlayerStats(): Promise<number> {
  const rows: any[] = []
  for (const page of PLAYER_STAT_PAGES) {
    const content = await getWikiContent(supabase, page.key)
    const start = content.indexOf('{{Infobox/Stat')
    if (start === -1) throw new Error(`${page.key}: {{Infobox/Stat}} introuvable`)
    const end = findTemplateEnd(content, start)
    if (end === -1) throw new Error(`${page.key}: fin de {{Infobox/Stat}} introuvable`)
    const infobox = content.slice(start, end + 2)

    // Attack Speed a un vrai typo côté wiki dans le wikitext source : "atke_value"
    // au lieu de "base_value" (confirmé en lisant le contenu brut, pas une supposition).
    const baseValue = extractInfoboxField(infobox, 'base_value') ?? extractInfoboxField(infobox, 'atke_value')

    rows.push({
      stat_key: page.key,
      display_name: page.display_name,
      base_value: baseValue,
      max_value: extractInfoboxField(infobox, 'max_value'),
      uses: extractInfoboxField(infobox, 'uses'),
      ways_to_increase: extractInfoboxField(infobox, 'ways_to_increase'),
    })
  }
  if (rows.length === 0) throw new Error('player_stats: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('player_stats').upsert(rows, { onConflict: 'stat_key' })
  if (error) throw new Error('player_stats upsert: ' + error.message)
  return rows.length
}

// ============================================================
// attribute_milestones -- 2 pages "David Hunterborough/UI/Attirbute * Milestone"
// (typo "Attirbute" présent dans le vrai titre de page wiki, pas une faute de frappe
// de ma part). Format menu en jeu (raw {{UI|...}} tabber), pas du wikitext standard --
// chaque bloc {{UI|...}} montre une fenêtre de défilement qui SE CHEVAUCHE avec les
// blocs suivants (même palier visible 2-3 fois), dédupliqué par numéro de palier.
// Trouvé en lisant le contenu réel du bucket générique du wiki (3 août, extraction
// brute), complète directement le système attribute_shards (NEU-REPO).
// ============================================================
function parseThreshold(s: string): number {
  s = s.trim()
  if (s.endsWith('k')) return Math.round(parseFloat(s.slice(0, -1)) * 1000)
  return parseInt(s, 10)
}
function romanToInt(roman: string): number {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
  let total = 0
  for (let i = 0; i < roman.length; i++) {
    const cur = map[roman[i]], next = map[roman[i + 1]]
    if (next && cur < next) total -= cur
    else total += cur
  }
  return total
}
function parseAttributeMilestoneTrack(content: string, trackLabel: string, track: string) {
  // "Reward:" (un item) vs "Rewards:" (plusieurs lignes) -- les deux formats
  // apparaissent réellement dans le contenu, trouvé en testant. L'entrée "header"
  // (palier 0, sans chiffre romain) ne matche jamais ce motif -- "Reward:" n'y suit
  // pas directement le titre, donc naturellement exclue sans cas spécial.
  const re = new RegExp(`&[a-z]Attribute ${trackLabel} ([IVXLCDM]+), &7Rewards?:\\n([\\s\\S]*?)\\n\\n&7Progress:[\\s\\S]*?/&e([\\d.]+k?)\\n`, 'g')
  const byTier = new Map<number, any>()
  let m
  while ((m = re.exec(content)) !== null) {
    const tierNum = romanToInt(m[1])
    if (!byTier.has(tierNum)) {
      byTier.set(tierNum, { track, tier_number: tierNum, tier_label: m[1], threshold: parseThreshold(m[3]), reward: m[2].trim() })
    }
  }
  return [...byTier.values()]
}

async function syncAttributeMilestones(): Promise<number> {
  const stacksContent = await getWikiContent(supabase, 'david_hunterborough_ui_attirbute_stacks_milestone')
  const menuContent = await getWikiContent(supabase, 'david_hunterborough_ui_attirbute_menu_milestone')
  const rows = [
    ...parseAttributeMilestoneTrack(stacksContent, 'Stacks', 'stacks'),
    ...parseAttributeMilestoneTrack(menuContent, 'Menu', 'menu'),
  ]
  if (rows.length === 0) throw new Error('attribute_milestones: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('attribute_milestones').upsert(rows, { onConflict: 'track, tier_number' })
  if (error) throw new Error('attribute_milestones upsert: ' + error.message)
  return rows.length
}

// ============================================================
// necromancy_souls -- Necromancy/List of Souls (mécanique de résurrection de mob
// en Dungeon "Soul"). 3 tabs wiki standards (Normal/Catacombs/Kuudra), colonnes
// différentes par tab (Catacombs a une colonne Floor en plus, Kuudra une colonne
// Tier en plus) -- table unique avec floor_label/tier_label nullable selon le tab
// plutôt que 3 tables séparées, même contenu logique (un mob invocable). Des lignes
// entières sont commentées en HTML dans le wikitext source (contenu retiré du jeu,
// ex: "Watchful Eye") -- stripComments() les exclut avant le split par ligne, pas
// traitées comme donnée réelle. Vérifié en local (parse_necromancy.js) : 750 lignes
// totales (211 normal + 513 catacombs + 26 kuudra), 0 valeur manquante/mal alignée,
// 0 markup wiki résiduel dans les champs texte.
// ============================================================
function stripHtmlComments(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, '')
}
function cleanSoulCell(s: string): string {
  s = s.trim()
  s = s.replace(/^data-sort-value="[^"]*"\s*\|\s*/, '')
  s = s.replace(/\{\{Green\|([^}]*)\}\}/g, '$1')
  s = s.replace(/\{\{Red\|'''([^}]*)'''\}\}/g, '$1')
  s = s.replace(/\{\{Lv\|(\d+)\}\}/g, '$1')
  s = s.replace(/'''/g, '')
  s = s.replace(/<br\s*\/?>/gi, '; ')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  return s.trim()
}
function extractSoulSortValue(rawCell: string): string | null {
  const m = rawCell.trim().match(/^data-sort-value="([^"]*)"/)
  return m ? m[1] : null
}
function parseSoulTab(tabText: string, numCols: number): string[][] {
  const tableStart = tabText.indexOf('{|')
  const tableEnd = tabText.lastIndexOf('|}')
  let body = tabText.slice(tableStart, tableEnd)
  body = stripHtmlComments(body)
  const firstRowSep = body.indexOf('\n|-\n')
  body = body.slice(firstRowSep + 4)
  const rowChunks = body.split(/\n\|-\n?/).map(c => c.trim()).filter(c => c.length > 0)
  const rows: string[][] = []
  for (const chunk of rowChunks) {
    const cellLines = chunk.split('\n').filter(l => l.startsWith('|'))
    const rawCells = cellLines.map(l => l.replace(/^\|/, ''))
    while (rawCells.length < numCols) rawCells.push('')
    rows.push(rawCells)
  }
  return rows
}
async function syncNecromancySouls(): Promise<number> {
  const content = await getWikiContent(supabase, 'necromancy_list_of_souls')
  const normStart = content.indexOf('|-|Normal')
  const cataStart = content.indexOf('|-|Catacombs')
  const kuudraStart = content.indexOf('|-|Kuudra')
  if (normStart === -1 || cataStart === -1 || kuudraStart === -1) {
    throw new Error('necromancy_souls: un ou plusieurs tabs (Normal/Catacombs/Kuudra) introuvables')
  }

  const rows: any[] = []
  for (const r of parseSoulTab(content.slice(normStart, cataStart), 7)) {
    rows.push({
      tab: 'normal', mob_name: cleanSoulCell(r[0]), level: parseInt(cleanSoulCell(r[1]), 10),
      floor_label: null, floor_sort: null, tier_label: null, tier_sort: null,
      hp: cleanSoulCell(r[2]).replace(/,/g, ''), damage: cleanSoulCell(r[3]).replace(/,/g, ''),
      mana_cost: cleanSoulCell(r[4]).replace(/,/g, ''), drop_chance: cleanSoulCell(r[5]),
      notes: cleanSoulCell(r[6]) || null,
    })
  }
  for (const r of parseSoulTab(content.slice(cataStart, kuudraStart), 8)) {
    rows.push({
      tab: 'catacombs', mob_name: cleanSoulCell(r[0]), level: parseInt(cleanSoulCell(r[1]), 10),
      floor_label: cleanSoulCell(r[2]), floor_sort: extractSoulSortValue(r[2]), tier_label: null, tier_sort: null,
      hp: cleanSoulCell(r[3]).replace(/,/g, ''), damage: cleanSoulCell(r[4]).replace(/,/g, ''),
      mana_cost: cleanSoulCell(r[5]).replace(/,/g, ''), drop_chance: cleanSoulCell(r[6]),
      notes: cleanSoulCell(r[7]) || null,
    })
  }
  for (const r of parseSoulTab(content.slice(kuudraStart), 8)) {
    rows.push({
      tab: 'kuudra', mob_name: cleanSoulCell(r[0]), level: parseInt(cleanSoulCell(r[1]), 10),
      floor_label: null, floor_sort: null, tier_label: cleanSoulCell(r[2]), tier_sort: extractSoulSortValue(r[2]),
      hp: cleanSoulCell(r[3]).replace(/,/g, ''), damage: cleanSoulCell(r[4]).replace(/,/g, ''),
      mana_cost: cleanSoulCell(r[5]).replace(/,/g, ''), drop_chance: cleanSoulCell(r[6]),
      notes: cleanSoulCell(r[7]) || null,
    })
  }

  if (rows.length === 0) throw new Error('necromancy_souls: 0 lignes extraites, parsing probablement cassé')
  // Pas de clé unique naturelle (un mob peut apparaître plusieurs fois par tab à des
  // niveaux/étages différents) -- replaceAll (delete+insert complet) plutôt qu'un
  // upsert, même pattern que glacite_tunnel_waypoints après le bug d'indexation trouvé
  // plus tôt cette semaine.
  const { error: delErr } = await supabase.from('necromancy_souls').delete().gte('id', 0)
  if (delErr) throw new Error('necromancy_souls delete: ' + delErr.message)
  const { error } = await supabase.from('necromancy_souls').insert(rows)
  if (error) throw new Error('necromancy_souls insert: ' + error.message)
  return rows.length
}

// ============================================================
// skyblock_level_xp_tasks -- SkyBlock Levels/Tasks (répartition complète des sources de
// SkyBlock XP par catégorie : Core/Event/Dungeon/Essence Shop/Slaying/Skill Related/
// Miscellaneous/Story/Consumables). Table wiki réellement irrégulière : colspan variable
// (2 ou 3) sur la colonne Name selon la section, ET profondeur d'imbrication variable (ex
// "Complete Dungeons" a 3 niveaux de sous-libellés avant Description, alors qu'une entrée
// simple comme "Skill Level Up" n'en a qu'un) -- parseRowspanTable/extractFirstWikitableBody
// (numCols fixe, extraction positionnelle) ne suffisent pas ici : deux passes de test
// locales ont montré un vrai décalage de colonnes sur ~260 lignes (Dungeon/Slaying/Skill
// Related/Miscellaneous) avant que ce bug ne soit trouvé et corrigé. Parseur dédié
// (parseWideRowspanColspanTable) avec numCols volontairement généreux (9, plus large que
// la plus profonde imbrication réelle observée, 7) + extraction par les 3 DERNIÈRES
// colonnes non-vides de chaque ligne (Description/XP/MaxXP sont toujours les 3 dernières,
// quel que soit le nombre de sous-libellés Name qui précèdent) plutôt que des index fixes.
// Vérifié en local (parse_sblevel3.js) contre le contenu réel complet : 775 lignes (9
// catégories), 0 nom vide, 0 description vide, 0 markup wiki résiduel.
// ============================================================
function parseWideCell(line: string): { value: string; rowspan: number; colspan: number } {
  let s = line.replace(/^\|/, '')
  let rowspan = 1, colspan = 1
  const firstPipe = s.indexOf('|')
  if (firstPipe !== -1 && /rowspan\s*=|class\s*=|colspan\s*=|style\s*=|data-sort/.test(s.slice(0, firstPipe))) {
    const attrs = s.slice(0, firstPipe)
    s = s.slice(firstPipe + 1)
    const rs = attrs.match(/rowspan\s*=\s*"?(\d+)"?/)
    if (rs) rowspan = parseInt(rs[1], 10)
    const cs = attrs.match(/colspan\s*=\s*"?(\d+)"?/)
    if (cs) colspan = parseInt(cs[1], 10)
  }
  return { value: s.trim(), rowspan, colspan }
}
function parseWideRowspanColspanTable(tableBody: string, numCols: number): string[][] {
  const rowBlocks = tableBody.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
  const rows: string[][] = []
  const active: Array<{ value: string; remaining: number } | null> = new Array(numCols).fill(null)
  for (const block of rowBlocks) {
    const lines = block.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('|}'))
    let cellIdx = 0
    const resolved: string[] = new Array(numCols).fill('')
    let col = 0
    while (col < numCols) {
      const a = active[col]
      if (a && a.remaining > 0) {
        resolved[col] = a.value
        a.remaining -= 1
        if (a.remaining === 0) active[col] = null
        col += 1
        continue
      }
      const raw = lines[cellIdx]
      cellIdx += 1
      if (raw === undefined) { col += 1; continue }
      const { value, rowspan, colspan } = parseWideCell(raw)
      for (let k = 0; k < colspan && col + k < numCols; k++) {
        const v = k === 0 ? value : ''
        resolved[col + k] = v
        if (rowspan > 1) active[col + k] = { value: v, remaining: rowspan - 1 }
      }
      col += colspan
    }
    rows.push(resolved)
  }
  return rows
}
function cleanSbLevelCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\[\[File:[^\]]*\]\]/g, '')
  s = s.replace(/\{\{SkyBlock XP\|([^|}]*)(\|short=y)?\}\}/g, '$1')
  s = s.replace(/\{\{Stat\|(?:short=y\|)?([a-z]+)\}\}/gi, '$1')
  s = s.replace(/class="unsortable"\s*\|?\s*/g, '')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/'''/g, '')
  s = s.replace(/<br\s*\/?>/gi, '; ')
  return s.trim()
}
async function syncSkyblockLevelXpTasks(): Promise<number> {
  const content = await getWikiContent(supabase, 'skyblock_levels_tasks')
  const tabRe = /\|-\|([A-Za-z0-9 ]+)\s*=/g
  const tabMatches = [...content.matchAll(tabRe)]
  if (tabMatches.length === 0) throw new Error('skyblock_level_xp_tasks: aucun tab trouvé')
  const bounds = tabMatches.map((m, i) => ({
    name: m[1].trim(),
    start: m.index!,
    end: i + 1 < tabMatches.length ? tabMatches[i + 1].index! : content.length,
  }))

  const NUMCOLS = 9
  const rows: any[] = []
  for (const b of bounds) {
    const tabText = content.slice(b.start, b.end)
    const body = extractFirstWikitableBody(tabText)
    if (!body) continue
    for (const r of parseWideRowspanColspanTable(body, NUMCOLS)) {
      let lastIdx = -1
      for (let i = r.length - 1; i >= 0; i--) { if (r[i] !== '') { lastIdx = i; break } }
      if (lastIdx < 3) continue
      const maxXp = cleanSbLevelCell(r[lastIdx])
      const xpDetail = cleanSbLevelCell(r[lastIdx - 1])
      const description = cleanSbLevelCell(r[lastIdx - 2])
      const nameParts = r.slice(1, lastIdx - 2).map(cleanSbLevelCell).filter(Boolean)
      rows.push({
        category: b.name,
        task_name: nameParts.join(' - '),
        description: description || null,
        xp_detail: xpDetail || null,
        max_xp: maxXp || null,
      })
    }
  }

  if (rows.length === 0) throw new Error('skyblock_level_xp_tasks: 0 lignes extraites, parsing probablement cassé')
  const { error: delErr } = await supabase.from('skyblock_level_xp_tasks').delete().gte('id', 0)
  if (delErr) throw new Error('skyblock_level_xp_tasks delete: ' + delErr.message)
  const { error } = await supabase.from('skyblock_level_xp_tasks').insert(rows)
  if (error) throw new Error('skyblock_level_xp_tasks insert: ' + error.message)
  return rows.length
}

// ============================================================
export async function runWikiReferentialSync() {
  const logId = await startSync('wiki-referential-sync')
  const results: Record<string, any> = {}
  let totalRows = 0
  let hadError = false

  for (const [name, fn] of Object.entries({
    hotm_forge_durations: syncHotmForgeDurations,
    garden_pests: syncGardenPests,
    garden_pest_fortune_penalty: syncGardenPestFortunePenalty,
    time_pocket: syncTimePocket,
    minion_upgrade_items: syncMinionUpgradeItems,
    sack_tiers: syncSackTiers,
    trapper_pelts: syncTrapperPelts,
    magical_power_by_rarity: syncMagicalPowerByRarity,
    hotm_hotf_powders: syncHotmHotfPowders,
    player_stats: syncPlayerStats,
    attribute_milestones: syncAttributeMilestones,
    necromancy_souls: syncNecromancySouls,
    skyblock_level_xp_tasks: syncSkyblockLevelXpTasks,
  })) {
    try {
      const rows = await fn()
      results[name] = { success: true, rows }
      totalRows += rows
    } catch (err: any) {
      hadError = true
      results[name] = { success: false, error: err.message }
    }
  }

  await finishSync(logId, hadError ? 'partial' : 'success', totalRows, { results })
  return { success: !hadError, total_rows: totalRows, results }
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runWikiReferentialSync()
  return NextResponse.json(result)
}
