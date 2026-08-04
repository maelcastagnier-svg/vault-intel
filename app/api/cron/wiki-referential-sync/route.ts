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
// 🔴 Extension réelle (4 août, criblage continué) : requête directe sur le contenu
// caché a trouvé 49 pages utilisant `{{Infobox/Stat` au total, pas seulement les 16
// déjà connues -- 33 stats jamais capturées (Wisdom par skill, Fortune par ressource,
// stats Rift, stats Fishing/Hunting...). Vérifié une par une avant d'étendre (pas
// juste la liste des noms) : `stats` et `damage_calculation` exclus car ce sont des
// pages de synthèse (infobox vide, sans `base_value`/`max_value` réels, pas un stat
// individuel) -- les 31 restantes confirmées avoir un vrai `base_value`/`max_value`/
// `uses`/`ways_to_increase` comme les 16 d'origine, même format exact, même parseur
// réutilisé sans modification. `title=` seulement présent sur les pages de synthèse
// exclues, jamais sur les vraies pages de stat -- display_name dérivé du nom de page
// est fiable pour toutes les 31.
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
  { key: 'fear', display_name: 'Fear' },
  { key: 'runecrafting_wisdom', display_name: 'Runecrafting Wisdom' },
  { key: 'social_wisdom', display_name: 'Social Wisdom' },
  { key: 'hunting_wisdom', display_name: 'Hunting Wisdom' },
  { key: 'alchemy_wisdom', display_name: 'Alchemy Wisdom' },
  { key: 'cold', display_name: 'Cold' },
  { key: 'swing_range', display_name: 'Swing Range' },
  { key: 'fig_fortune', display_name: 'Fig Fortune' },
  { key: 'crux_fortune', display_name: 'Crux Fortune' },
  { key: 'combat_wisdom', display_name: 'Combat Wisdom' },
  { key: 'cold_resistance', display_name: 'Cold Resistance' },
  { key: 'double_hook_chance', display_name: 'Double Hook Chance' },
  { key: 'overbloom', display_name: 'Overbloom' },
  { key: 'taming_wisdom', display_name: 'Taming Wisdom' },
  { key: 'mana', display_name: 'Mana' },
  { key: 'block_fortune', display_name: 'Block Fortune' },
  { key: 'mangrove_fortune', display_name: 'Mangrove Fortune' },
  { key: 'pressure_resistance', display_name: 'Pressure Resistance' },
  { key: 'pristine', display_name: 'Pristine' },
  { key: 'rift_time', display_name: 'Rift Time' },
  { key: 'rift_damage', display_name: 'Rift Damage' },
  { key: 'pull', display_name: 'Pull' },
  { key: 'treasure_chance', display_name: 'Treasure Chance' },
  { key: 'sweep', display_name: 'Sweep' },
  { key: 'ore_fortune', display_name: 'Ore Fortune' },
  { key: 'foraging_fortune', display_name: 'Foraging Fortune' },
  { key: 'foraging_wisdom', display_name: 'Foraging Wisdom' },
  { key: 'carpentry_wisdom', display_name: 'Carpentry Wisdom' },
  { key: 'hearts', display_name: 'Hearts' },
  { key: 'hunter_fortune', display_name: 'Hunter Fortune' },
  { key: 'trophy_chance', display_name: 'Trophy Chance' },
  { key: 'true_damage', display_name: 'True Damage' },
  { key: 'breaking_power', display_name: 'Breaking Power' },
  { key: 'respiration', display_name: 'Respiration' },
]

// Capture jusqu'à fin de ligne (pas jusqu'au prochain "|") -- les valeurs réelles
// contiennent souvent un template {{Skill|Enchanting}} avec un "|" interne, qui
// tronquait le match à tort avec une version antérieure de cette regex (bug trouvé
// en testant : ways_to_increase revenait null sur 7/16 pages où ce cas se produit).
// 🔴 3e bug trouvé en étendant player_stats à 31 stats supplémentaires (4 août) :
// `\s*` juste après le "=" traversait la fin de ligne pour un champ VRAIMENT vide
// (ex `|max_value=\n|symbol= ...`) et capturait le DÉBUT DU CHAMP SUIVANT à la place
// (`treasure_chance.max_value` récupérait littéralement "|symbol= ..."). `\s` matche
// `\n` par défaut en JS -- corrigé en `[ \t]*` (espace horizontal seulement) entre le
// "=" et la capture, pour ne jamais franchir la vraie limite de ligne. N'affecte pas
// les 49 autres stats (elles ont toutes une vraie valeur sur la même ligne).
function extractInfoboxField(infobox: string, field: string): string | null {
  const re = new RegExp(`\\|\\s*${field}\\s*=[ \\t]*([^\\n]*)`, 'i')
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
// museum_milestones -- Museum/Milestones (référencée directement par skyblock_level_
// xp_tasks, catégorie Core "Museum Progression" -> "See Museum/Milestones"). Même format
// menu en jeu que attribute_milestones (blocs {{UI|...}} qui se chevauchent, chaque palier
// visible 2-3 fois dans des fenêtres de défilement successives) -- dédupliqué par numéro
// de palier. Piège trouvé en testant : le nombre "Required XP" utilise un backslash
// d'échappement wiki pour la virgule des milliers (ex "1\,500", pas "1,500") -- une
// première regex ([\d,]+) ratait tout palier >= 10 (tous en 4 chiffres), corrigée
// ([\d,\\]+) avant tout déploiement. Vérifié en local (parse_museum.js) : 40/40 paliers
// (I-40, confirmé par le texte du menu "Milestone: 0/40"), 0 XP invalide, 0 reward vide,
// 0 code couleur résiduel. Palier 40 (4 000 XP requis) dépasse le max réellement
// obtenable actuellement (3 571, cf. skyblock_level_xp_tasks) -- capturé tel quel, pas
// ajusté (règle 7, jamais de donnée inventée pour "corriger" un écart réel du jeu).
// ============================================================
function stripMcColorCodes(s: string): string {
  return s.replace(/&[0-9a-fk-or]/gi, '')
}
async function syncMuseumMilestones(): Promise<number> {
  const content = await getWikiContent(supabase, 'museum_milestones_ui')
  const re = /&aMuseum Milestone (\d+), &7Required XP: &e([\d,\\]+)\/&5\/&7Rewards:\/([^\n]*)\n/g
  const byTier = new Map<number, any>()
  let m
  while ((m = re.exec(content)) !== null) {
    const tier = parseInt(m[1], 10)
    if (byTier.has(tier)) continue
    const requiredXp = parseInt(m[2].replace(/[\\,]/g, ''), 10)
    const rewards = m[3].split('/')
      .filter(s => s.startsWith('&8+'))
      .map(s => stripMcColorCodes(s.replace(/^&8\+/, '')).trim())
      .filter(Boolean)
    byTier.set(tier, { tier_number: tier, required_xp: requiredXp, rewards })
  }
  const rows = [...byTier.values()]
  if (rows.length === 0) throw new Error('museum_milestones: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('museum_milestones').upsert(rows, { onConflict: 'tier_number' })
  if (error) throw new Error('museum_milestones upsert: ' + error.message)
  return rows.length
}

// ============================================================
// crop_fortune_sources -- Crop Fortune/Tabber (13 tabs, un par crop du Garden : Wheat/
// Carrot/Potato/Pumpkin/Melon Slice/Mushroom/Cactus/Sugar Cane/Nether Wart/Cocoa Beans/
// Sunflower/Moonflower/Wild Rose). Complète la formule déjà documentée (1 point de Crop
// Fortune = 1% chance de +100% drops, garanti tous les 100 points) avec le détail réel de
// CHAQUE source de Crop Fortune par crop -- jamais capturé avant. 5 types de sous-section
// par crop (Tools/Accessories/Enchantments/Miscellaneous/Pets), chacun avec un schéma de
// colonnes différent (3 à 5 colonnes selon le type, confirmé en lisant les 57 occurrences
// réelles de section sur les 13 crops) -- colonnes mappées par LABEL d'en-tête réel
// (Name/Source/Bonus/Notes/Rarity), pas par position fixe, pour rester correct même si un
// crop a un sous-ensemble différent de sections. Page confirmée 100% wikitables simples
// (aucun rowspan/colspan sur toute la page, vérifié avant de coder) -- pas besoin du
// parseur rowspan générique ici. Vérifié en local (parse_cropfortune.js) : 149 lignes,
// 0 nom/bonus vide, 0 markup wiki résiduel.
// ============================================================
function cleanCropFortuneCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{Slot\|[^}]*\}\}/g, '')
  s = s.replace(/\[\[File:[^\]]*\]\]/g, '')
  s = s.replace(/\{\{[Ss]tat\|([^|}]*)\|([^{}|]*)\}\}/g, '$1 $2')
  s = s.replace(/\{\{[Ss]tat\|([^{}|]*)\}\}/g, '$1')
  s = s.replace(/\{\{[Ii][Dd]\|([^{}|]*)\}\}/g, '$1')
  s = s.replace(/\{\{[Ee]nch\|([^{}|]*)\}\}/g, '$1')
  s = s.replace(/\{\{NPCSprite\|([^{}|;]*)[^{}]*\}\}/g, '$1')
  s = s.replace(/\{\{[Zz]one\|([^{}|]*)\}\}/g, '$1')
  s = s.replace(/\{\{[Rr][Dd]\|([^{}|]*)\}\}/g, '$1')
  s = s.replace(/\{\{bc\}\}/gi, '')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/'''/g, '')
  s = s.replace(/<br\s*\/?>/gi, '; ')
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}
function parseCropFortuneCell(line: string): string {
  let s = line.replace(/^\|/, '')
  const firstPipe = s.indexOf('|')
  if (firstPipe !== -1 && /rowspan\s*=|class\s*=|colspan\s*=|style\s*=|data-sort/.test(s.slice(0, firstPipe))) {
    s = s.slice(firstPipe + 1)
  }
  return s.trim()
}
async function syncCropFortuneSources(): Promise<number> {
  const content = await getWikiContent(supabase, 'crop_fortune_tabber')
  const tabRe = /\|-\|([^=]+)=/g
  const tabMatches = [...content.matchAll(tabRe)]
  if (tabMatches.length === 0) throw new Error('crop_fortune_sources: aucun tab (crop) trouvé')
  const bounds = tabMatches.map((m, i) => ({
    name: m[1].trim(),
    start: m.index!,
    end: i + 1 < tabMatches.length ? tabMatches[i + 1].index! : content.length,
  }))

  const rows: any[] = []
  for (const b of bounds) {
    const tabText = content.slice(b.start, b.end)
    const sectionRe = /=== ([^=]+) ===\n/g
    const secMatches = [...tabText.matchAll(sectionRe)]
    const secBounds = secMatches.map((m, i) => ({
      name: m[1].trim(),
      start: m.index! + m[0].length,
      end: i + 1 < secMatches.length ? secMatches[i + 1].index! : tabText.length,
    }))
    for (const sec of secBounds) {
      const secText = tabText.slice(sec.start, sec.end)
      const tableStart = secText.indexOf('{|')
      if (tableStart === -1) continue
      const tableEnd = secText.indexOf('|}', tableStart)
      const table = secText.slice(tableStart, tableEnd)
      const headerEnd = table.indexOf('\n|-\n')
      if (headerEnd === -1) continue
      const headerBlock = table.slice(0, headerEnd)
      const headers = headerBlock.split('\n').filter(l => l.trim().startsWith('!')).map(l => l.replace(/^!/, '').trim())
      const body = table.slice(headerEnd + 4)
      const rowBlocks = body.split(/\n\|-\n?/).filter(bl => bl.trim().length > 0)

      const nameIdx = headers.findIndex(h => /^Name$/i.test(h) || /^Source$/i.test(h))
      const bonusIdx = headers.findIndex(h => /Bonus/i.test(h) || /crop fortune/i.test(h))
      const notesIdx = headers.findIndex(h => /Notes/i.test(h))
      const rarityIdx = headers.findIndex(h => /Rarity/i.test(h))

      for (const block of rowBlocks) {
        const lines = block.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('|}'))
        const cells = headers.map((_, i) => lines[i] !== undefined ? parseCropFortuneCell(lines[i]) : '')
        const name = nameIdx >= 0 ? cleanCropFortuneCell(cells[nameIdx]) : ''
        if (!name) continue
        rows.push({
          crop: b.name,
          section: sec.name,
          name,
          bonus: bonusIdx >= 0 ? cleanCropFortuneCell(cells[bonusIdx]) || null : null,
          notes: notesIdx >= 0 ? cleanCropFortuneCell(cells[notesIdx]) || null : null,
          rarity: rarityIdx >= 0 ? cleanCropFortuneCell(cells[rarityIdx]) || null : null,
        })
      }
    }
  }

  if (rows.length === 0) throw new Error('crop_fortune_sources: 0 lignes extraites, parsing probablement cassé')
  const { error: delErr } = await supabase.from('crop_fortune_sources').delete().gte('id', 0)
  if (delErr) throw new Error('crop_fortune_sources delete: ' + delErr.message)
  const { error } = await supabase.from('crop_fortune_sources').insert(rows)
  if (error) throw new Error('crop_fortune_sources insert: ' + error.message)
  return rows.length
}

// ============================================================
// skyblock_achievements -- SkyBlock Achievements/UI (menu jeu, 3 sous-catégories
// distinctes : Challenge/Seasonal/Tiered, chacune paginée sur plusieurs blocs {{UI|...}}
// avec chevauchement de scroll comme attribute_milestones/museum_milestones -- dédupliqué
// par (catégorie, nom). Deux formats de ligne différents selon la catégorie : Challenge/
// Seasonal ont "Unlocked by X% of (SkyBlock) players!" (stat globale réelle, pas une
// valeur par joueur) ; Tiered a "Progress: X/Y" (cible du palier) + un chiffre romain
// final dans le nom à séparer (ex "Angler V" -> nom="Angler", tier_label="V"). Vérifié en
// local (parse_achievements.js) : 216 lignes (128 challenge + 8 seasonal + 80 tiered),
// 0 nom vide, 0 code couleur résiduel. Note honnête : le header du menu annonce 222
// Challenge Achievements au total mais seuls 128 noms uniques apparaissent réellement
// dans le contenu wiki mis en cache (7 pages de scroll, aucune perte par dédoublonnage
// vérifiée : 140 lignes brutes -> 128 noms uniques, l'écart vient de la source elle-même,
// pas du parsing) -- capturé tel quel, pas complété par une supposition (règle 7).
// ============================================================
function stripMcColor(s: string): string {
  return s.replace(/&[0-9a-fk-or]/gi, '').trim()
}
async function syncSkyblockAchievements(): Promise<number> {
  const content = await getWikiContent(supabase, 'achievements_ui')
  const blockRe = /\{\{UI\|([^|]+)\|?[\s\S]*?\n\}\}/g
  const blocks: { title: string; text: string }[] = []
  let bm
  while ((bm = blockRe.exec(content)) !== null) {
    blocks.push({ title: bm[1].trim(), text: bm[0] })
  }

  const lineRe = /^\|\d+, \d+=[^,]*,\s*(?:[a-z0-9-]+|none),\s*&c([^,]+),\s*(.*)$/gm
  const byKey = new Map<string, any>()
  for (const block of blocks) {
    let category: string
    if (/Tiered/i.test(block.title)) category = 'tiered'
    else if (/Seasonal/i.test(block.title)) category = 'seasonal'
    else if (/Challenge/i.test(block.title)) category = 'challenge'
    else continue

    let m
    lineRe.lastIndex = 0
    while ((m = lineRe.exec(block.text)) !== null) {
      const rawName = m[1].trim()
      const body = m[2]
      const segments = body.split('/')

      const descParts: string[] = []
      for (const seg of segments) {
        if (/Reward:/.test(seg) || /Progress:/.test(seg)) break
        const cleaned = stripMcColor(seg)
        if (cleaned) descParts.push(cleaned)
      }
      const description = descParts.join(' ').trim()

      const pointsMatch = body.match(/&8\+&e(\d+) &7Achievement Points/)
      const points = pointsMatch ? parseInt(pointsMatch[1], 10) : null

      const progressMatch = body.match(/&7Progress: &a\d+&7\\\/&a(\d+)/)
      const progressTarget = progressMatch ? parseInt(progressMatch[1], 10) : null

      const unlockedMatch = body.match(/Unlocked by ([\d.]+)% of (?:SkyBlock )?players!/)
      const unlockedPct = unlockedMatch ? parseFloat(unlockedMatch[1]) : null

      const achCategoryMatch = body.match(/&[0-9a-f]([A-Za-z][A-Za-z ]* Achievement)\//)
      const achievementCategory = achCategoryMatch ? achCategoryMatch[1].trim() : null

      let name = rawName, tierLabel: string | null = null
      if (category === 'tiered') {
        const tm = rawName.match(/^(.+?)\s+([IVXLCDM]+)$/)
        if (tm) { name = tm[1].trim(); tierLabel = tm[2] }
      }

      const key = category + '::' + rawName
      if (byKey.has(key)) continue
      byKey.set(key, {
        category, name, tier_label: tierLabel, description: description || null,
        points, progress_target: progressTarget, unlocked_pct: unlockedPct,
        achievement_category: achievementCategory,
      })
    }
  }

  const rows = [...byKey.values()]
  if (rows.length === 0) throw new Error('skyblock_achievements: 0 lignes extraites, parsing probablement cassé')
  const { error: delErr } = await supabase.from('skyblock_achievements').delete().gte('id', 0)
  if (delErr) throw new Error('skyblock_achievements delete: ' + delErr.message)
  const { error } = await supabase.from('skyblock_achievements').insert(rows)
  if (error) throw new Error('skyblock_achievements insert: ' + error.message)
  return rows.length
}

// ============================================================
// garden_mutations -- Mutations (crops spéciaux créés en arrangeant des crops autour
// d'une case vide dans le Greenhouse, système entier jamais mappé). Table wiki à cellules
// MULTI-LIGNES réelles (convention MediaWiki `----` = règle horizontale À L'INTÉRIEUR
// d'une même cellule, pas un séparateur de ligne -- contrairement à toutes les autres
// tables de ce chantier qui n'avaient qu'une valeur par ligne). extractFirstWikitableBody/
// parseRowspanTable (une valeur = une ligne) auraient tronqué le Weight/Chance et les
// Drops à leur première sous-ligne seulement -- parseur dédié qui accumule les lignes de
// continuation (ne commençant pas par "|") dans la cellule précédente jusqu'au prochain
// marqueur "|". Vérifié en local (parse_mutations.js) : 40 mutations réelles, 0 nom vide,
// 0 markup wiki résiduel (dont Plainlist -> liste "; "-jointe, {{Chance|X|1|Y}} -> X).
// ============================================================
function cleanMutationCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/<ref[^>]*\/>/g, '')
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
  s = s.replace(/\{\{Slot\|[^}]*\}\}/g, '')
  s = s.replace(/class="ct"\s*\|?\s*/g, '')
  s = s.replace(/\{\{Chance\|([^|}]*)\|[^}]*\}\}/g, '$1')
  s = s.replace(/\{\{RL\|([^}]*)\}\}/g, '$1')
  s = s.replace(/\{\{RD\|([^}]*)\}\}/g, '$1')
  s = s.replace(/\{\{ID\|([^}]*)\}\}/g, '$1')
  s = s.replace(/\{\{Skill XP\|([^}]*)\}\}/g, '$1 XP')
  s = s.replace(/\{\{Title\|([^|}]*)\|[^}]*\}\}/g, '$1')
  s = s.replace(/\{\{Plainlist\|/g, '')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/'''/g, '')
  s = s.replace(/----/g, ' | ')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/\n\*/g, '; ')
  s = s.replace(/\s+/g, ' ')
  s = s.replace(/\}\}\s*$/, '')
  s = s.replace(/^;\s*/, '')
  return s.trim()
}
async function syncGardenMutations(): Promise<number> {
  const content = await getWikiContent(supabase, 'mutations')
  const tableStart = content.indexOf('{|')
  const tableEnd = content.indexOf('|}', tableStart)
  if (tableStart === -1 || tableEnd === -1) throw new Error('garden_mutations: wikitable introuvable')
  const table = content.slice(tableStart, tableEnd)
  const allBlocks = table.split(/\n\|-\n?/)
  const dataStart = allBlocks.findIndex(b => b.trim().startsWith('|') && !b.trim().startsWith('!'))
  if (dataStart === -1) throw new Error('garden_mutations: aucune ligne de donnée trouvée')
  const headerBlocks = allBlocks.slice(0, dataStart)
  const headers = headerBlocks.join('\n').split('\n').filter(l => l.trim().startsWith('!')).map(l => l.replace(/^!/, '').trim())
  const rowBlocks = allBlocks.slice(dataStart).filter(b => b.trim().length > 0)

  const nameIdx = headers.findIndex(h => /^Name$/i.test(h))
  const rarityIdx = headers.findIndex(h => /Rarity/i.test(h))
  const weightIdx = headers.findIndex(h => /Weight/i.test(h))
  const growthIdx = headers.findIndex(h => /Growth Stages/i.test(h))
  const descIdx = headers.findIndex(h => /Description/i.test(h))
  const analysisIdx = headers.findIndex(h => /Analysis/i.test(h))
  const dropsIdx = headers.findIndex(h => /Drops/i.test(h))

  const rows: any[] = []
  for (const block of rowBlocks) {
    const lines = block.split('\n')
    const cells: string[] = []
    let current: string | null = null
    for (const line of lines) {
      if (/^\|\}/.test(line)) continue
      if (/^\|(?!-)/.test(line)) {
        if (current !== null) cells.push(current)
        current = line.replace(/^\|/, '')
      } else if (current !== null) {
        current += '\n' + line
      }
    }
    if (current !== null) cells.push(current)

    const name = nameIdx >= 0 ? cleanMutationCell(cells[nameIdx]) : ''
    if (!name) continue
    rows.push({
      name,
      rarity: rarityIdx >= 0 ? cleanMutationCell(cells[rarityIdx]) || null : null,
      weight_chance: weightIdx >= 0 ? cleanMutationCell(cells[weightIdx]) || null : null,
      growth_stages: growthIdx >= 0 ? cleanMutationCell(cells[growthIdx]) || null : null,
      description: descIdx >= 0 ? cleanMutationCell(cells[descIdx]) || null : null,
      analysis: analysisIdx >= 0 ? cleanMutationCell(cells[analysisIdx]) || null : null,
      drops: dropsIdx >= 0 ? cleanMutationCell(cells[dropsIdx]) || null : null,
    })
  }

  if (rows.length === 0) throw new Error('garden_mutations: 0 lignes extraites, parsing probablement cassé')
  const { error: delErr } = await supabase.from('garden_mutations').delete().gte('id', 0)
  if (delErr) throw new Error('garden_mutations delete: ' + delErr.message)
  const { error } = await supabase.from('garden_mutations').insert(rows)
  if (error) throw new Error('garden_mutations insert: ' + error.message)
  return rows.length
}

// ============================================================
// skyblock_quests -- Quests (36 quêtes réelles, système entier jamais mappé). Chaque
// quête a un {{Infobox/Quest}} (requirements/start_location/start_npc/reward/x/y/z) suivi
// d'un texte de walkthrough en prose. Bug réel trouvé et corrigé en local avant tout
// déploiement : la valeur du champ `reward` contient souvent un template imbriqué avec
// ses propres pipes internes (ex `{{Coins|1000}}<br/>{{Skill XP|Fishing|10}}`) -- un split
// naïf par "|" tronquait `reward` au premier pipe interne (même classe de bug que
// player_stats/ways_to_increase, corrigé le même jour). `splitInfoboxFieldsAtDepth`
// ne coupe un champ qu'aux "|" de profondeur 0 (hors template imbriqué), jamais à
// l'intérieur d'un {{...}}. Vérifié en local (parse_quests.js) : 36/36 quêtes, 0 nom vide,
// reward/requirements/start_npc correctement isolés même avec templates imbriqués.
// ============================================================
function findQuestTplEnd(content: string, start: number): number {
  let depth = 0
  for (let i = start; i < content.length - 1; i++) {
    if (content[i] === '{' && content[i + 1] === '{') { depth++; i++; continue }
    if (content[i] === '}' && content[i + 1] === '}') {
      depth--
      if (depth === 0) return i
      i++
    }
  }
  return -1
}
function splitInfoboxFieldsAtDepth(inner: string): Record<string, string> {
  const fields: Record<string, string> = {}
  let depth = 0, cur = ''
  const parts: string[] = []
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === '{' && inner[i + 1] === '{') { depth++; cur += ch; continue }
    if (ch === '}' && inner[i + 1] === '}') { depth--; cur += ch; continue }
    if (ch === '|' && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  parts.push(cur)
  for (const part of parts) {
    const m = part.match(/^\s*(\w+)\s*=\s*([\s\S]*)$/)
    if (m) fields[m[1]] = m[2].trim()
  }
  return fields
}
function cleanQuestText(s: string): string {
  s = (s || '').trim()
  s = s.replace(/={2,4}[^=\n]+={2,4}/g, ' ')
  s = s.replace(/\{\{Item Display\|([^}|]*)[^}]*\}\}/g, '$1')
  s = s.replace(/\{\{Coins\|([^}]*)\}\}/g, '$1 coins')
  s = s.replace(/\{\{Skill ?XP\|([^|}]*)\|([^}]*)\}\}/g, '$2 $1 XP')
  s = s.replace(/<br\s*\/?>/gi, '; ')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/''+/g, '')
  s = s.replace(/\[\[File:[^\]]*\]\]/g, '')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/'''/g, '')
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}
async function syncSkyblockQuests(): Promise<number> {
  const content = await getWikiContent(supabase, 'quests')
  const questRe = /={2,3} Quest: ([^=]+) ={2,3}\n/g
  const matches = [...content.matchAll(questRe)]
  if (matches.length === 0) throw new Error('skyblock_quests: aucune quête trouvée')
  const bounds = matches.map((m, i) => ({
    name: m[1].trim(),
    start: m.index! + m[0].length,
    end: i + 1 < matches.length ? matches[i + 1].index! : content.length,
  }))

  const rows: any[] = []
  for (const b of bounds) {
    const chunk = content.slice(b.start, b.end)
    const infoboxStart = chunk.indexOf('{{Infobox/Quest')
    let fields: Record<string, string> = {}, infoboxFull = ''
    if (infoboxStart !== -1) {
      const infoboxEnd = findQuestTplEnd(chunk, infoboxStart)
      infoboxFull = chunk.slice(infoboxStart, infoboxEnd + 2)
      const inner = infoboxFull.slice('{{Infobox/Quest'.length, -2)
      fields = splitInfoboxFieldsAtDepth(inner)
    }
    const afterInfobox = infoboxStart !== -1 ? chunk.slice(infoboxStart + infoboxFull.length) : chunk
    const walkthrough = cleanQuestText(afterInfobox)

    rows.push({
      name: cleanQuestText(b.name),
      requirements: fields.requirements && fields.requirements !== 'None' ? cleanQuestText(fields.requirements) : null,
      start_location: fields.start_location ? cleanQuestText(fields.start_location) : null,
      start_npc: fields.start_npc ? cleanQuestText(fields.start_npc) : null,
      reward: fields.reward && fields.reward !== 'None' ? cleanQuestText(fields.reward) : null,
      x: fields.x ? parseFloat(fields.x) : null,
      y: fields.y ? parseFloat(fields.y) : null,
      z: fields.z ? parseFloat(fields.z) : null,
      walkthrough: walkthrough || null,
    })
  }

  if (rows.length === 0) throw new Error('skyblock_quests: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('skyblock_quests').upsert(rows, { onConflict: 'name' })
  if (error) throw new Error('skyblock_quests upsert: ' + error.message)
  return rows.length
}

// ============================================================
// location_details -- Locations (271 lignes, 19 zones top-level, jusqu'à 3 niveaux
// d'imbrication réels, ex Hub > Combat Settlement > Archery Range). Enrichit `game_zones`
// (NEU-REPO, liste plate zone->sub_zones sans détail) avec Resources Found/NPCs Found/
// Special Requirements par sous-lieu, jamais capturé -- vérifié avant construction que ce
// n'est pas un doublon (contenu de `game_zones` inspecté : aucune de ces 3 colonnes).
// Le header groupe "Location (and sub locations)" déclare colspan="3" -- la portion
// chemin fait TOUJOURS exactement 3 colonnes logiques (1 segment réel -> colspan3, 2
// segments -> colspan2 sur le 2e, 3 segments -> aucun colspan), suivie des 3 colonnes
// fixes Resources/NPCs/Requirements -- numCols=6 fixe avec extraction par POSITION,
// pas par "dernière colonne non-vide" (contrairement à skyblock_level_xp_tasks) : ici
// les 3 champs traînants sont chacun fréquemment vides indépendamment, une extraction
// par la droite décale tout dès qu'un seul d'entre eux est vide. Bug réel trouvé et
// corrigé en local avant déploiement (Hub > Canvas Room : le NPC "Marco" atterrissait
// dans special_requirements car Requirements était vide sur cette ligne précise).
// Vérifié : 271/271 lignes, 0 zone vide, 0 markup résiduel.
// ============================================================
function cleanLocationCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{bc\}\}/gi, '')
  s = s.replace(/\{\{Zone\|([^{}|]*)\}\}/gi, '$1')
  s = s.replace(/\{\{NPC List\|([^{}]*)\}\}/gi, (_m, inner) => inner.split('|').join('; '))
  s = s.replace(/\{\{NPCSprite\|([^{}|;]*)[^{}]*\}\}/g, '$1')
  s = s.replace(/\{\{RL\|([^{}]*)\}\}/g, (_m, inner) => inner.split('|').join('; '))
  s = s.replace(/\{\{ID\|([^{}|]*)\}\}/g, '$1')
  s = s.replace(/\{\{SkyBlock Level\|([^{}]*)\}\}/g, 'SkyBlock Level $1')
  s = s.replace(/\{\{c\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/'''/g, '')
  s = s.replace(/<br\s*\/?>/gi, '; ')
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}
function parseLocationCell(line: string): { value: string; rowspan: number; colspan: number } {
  let s = line.replace(/^\|/, '')
  let rowspan = 1, colspan = 1
  const firstPipe = s.indexOf('|')
  if (firstPipe !== -1 && /rowspan\s*=|class\s*=|colspan\s*=|style\s*=|data-sort|scope\s*=/.test(s.slice(0, firstPipe))) {
    const attrs = s.slice(0, firstPipe)
    s = s.slice(firstPipe + 1)
    const rs = attrs.match(/rowspan\s*=\s*"?(\d+)"?/)
    if (rs) rowspan = parseInt(rs[1], 10)
    const cs = attrs.match(/colspan\s*=\s*"?(\d+)"?/)
    if (cs) colspan = parseInt(cs[1], 10)
  }
  return { value: s.trim(), rowspan, colspan }
}
function parseLocationTable(tableBody: string, numCols: number): string[][] {
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
      const { value, rowspan, colspan } = parseLocationCell(raw)
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
async function syncLocationDetails(): Promise<number> {
  const content = await getWikiContent(supabase, 'locations')
  const sectionIdx = content.indexOf('== Locations ==')
  if (sectionIdx === -1) throw new Error('location_details: section "Locations" introuvable')
  const tableStart = content.indexOf('{|', sectionIdx)
  const tableEnd = content.indexOf('|}', tableStart)
  if (tableStart === -1 || tableEnd === -1) throw new Error('location_details: wikitable introuvable')
  const table = content.slice(tableStart, tableEnd)
  const allBlocks = table.split(/\n\|-\n?/)
  const dataStart = allBlocks.findIndex(b => b.trim().startsWith('|') && !b.trim().startsWith('!'))
  if (dataStart === -1) throw new Error('location_details: aucune ligne de donnée trouvée')
  const body = allBlocks.slice(dataStart).join('\n|-\n')

  const parsedRows = parseLocationTable(body, 6)
  const rows: any[] = []
  for (const r of parsedRows) {
    const pathParts = r.slice(0, 3).map(cleanLocationCell).filter(Boolean)
    if (pathParts.length === 0) continue
    rows.push({
      zone: pathParts[0],
      sub_location: pathParts.slice(1).join(' > ') || null,
      resources: cleanLocationCell(r[3]) || null,
      npcs: cleanLocationCell(r[4]) || null,
      special_requirements: cleanLocationCell(r[5]) || null,
    })
  }

  if (rows.length === 0) throw new Error('location_details: 0 lignes extraites, parsing probablement cassé')
  const { error: delErr } = await supabase.from('location_details').delete().gte('id', 0)
  if (delErr) throw new Error('location_details delete: ' + delErr.message)
  const { error } = await supabase.from('location_details').insert(rows)
  if (error) throw new Error('location_details insert: ' + error.message)
  return rows.length
}

// ============================================================
// chocolate_rabbits -- Chocolate Rabbits/List (517 lapins réels, roster complet jamais
// capturé -- `hoppity_prestige` couvre déjà les paliers de prestige mais pas le roster
// des lapins eux-mêmes). Wikitable standard sans rowspan/colspan (vérifié avant de coder)
// -- réutilise directement les helpers partagés `extractFirstWikitableBody`/
// `parseRowspanTable` déjà importés en haut de ce fichier, aucun parseur dédié
// nécessaire. Vérifié en local : 517/517 lignes, 0 nom vide, distribution de rareté
// cohérente (224 Common → 5 Divine), 0 markup résiduel.
// ============================================================
function cleanRabbitCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{Slot\|[^}]*\}\}/g, '')
  s = s.replace(/\{\{bc\}\}/gi, '')
  s = s.replace(/\{\{[Zz]one\|([^{}|]*)\}\}/g, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/'''/g, '')
  return s.trim()
}
async function syncChocolateRabbits(): Promise<number> {
  const content = await getWikiContent(supabase, 'chocolate_rabbits_list')
  const body = extractFirstWikitableBody(content)
  if (!body) throw new Error('chocolate_rabbits: wikitable introuvable')
  const parsedRows = parseRowspanTable(body, 5)
  const rows = parsedRows
    .map(r => ({
      name: cleanRabbitCell(r[1]),
      rarity: cleanRabbitCell(r[2]) || null,
      resident_island: cleanRabbitCell(r[3]) || null,
      requirement: cleanRabbitCell(r[4]) || null,
    }))
    .filter(r => r.name)

  if (rows.length === 0) throw new Error('chocolate_rabbits: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('chocolate_rabbits').upsert(rows, { onConflict: 'name' })
  if (error) throw new Error('chocolate_rabbits upsert: ' + error.message)
  return rows.length
}

// ============================================================
// sea_creature_pools -- Sea Creatures/UI/Guide est un shell de menu jeu (navigation),
// les vraies listes vivent sous des sous-pages séparées par pool (List/Basic, List/
// Crimson Isle, List/Hotspot, List/Moonglade Marsh, List/Special) -- confirmé en lisant
// le contenu réel de chacune avant de coder, pas deviné par nom. `List/Lava` exclue :
// son contenu caché est un fragment brut sans structure de wikitable propre (contenu
// probablement transclus d'ailleurs), pas une vraie page indépendante -- pas de donnée
// inventée pour la compléter (règle 7). Complète directement la formule Sea Creature
// Chance déjà documentée (WIKI-MAPPING.md) avec la distribution réelle pondérée par pool.
// Bug de cellule multi-ligne trouvé et corrigé dans le helper PARTAGÉ `parseRowspanTable`
// (lib/wiki-table-parse.ts) en construisant cette table -- voir son commentaire pour le
// détail. Vérifié en local : 56 lignes (5 pools), 0 nom vide, 0 markup résiduel.
// ============================================================
function cleanSeaCreatureCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{bc\}\}/gi, '')
  s = s.replace(/\{\{mt\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{ID\|([^{}|]*)\}\}/g, '$1')
  s = s.replace(/\{\{[Zz]one\|([^{}|]*)\}\}/g, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/^\*/gm, '')
  s = s.replace(/\n/g, '; ')
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}
const SEA_CREATURE_POOL_KEYS: Record<string, string> = {
  basic: 'sea_creatures_list_basic',
  crimson_isle: 'sea_creatures_list_crimson_isle',
  hotspot: 'sea_creatures_list_hotspot',
  moonglade_marsh: 'sea_creatures_list_moonglade_marsh',
  special: 'sea_creatures_list_special',
}
async function syncSeaCreaturePools(): Promise<number> {
  const rows: any[] = []
  for (const [pool, key] of Object.entries(SEA_CREATURE_POOL_KEYS)) {
    const content = await getWikiContent(supabase, key)
    const body = extractFirstWikitableBody(content)
    if (!body) throw new Error(`sea_creature_pools: wikitable introuvable pour ${pool}`)
    for (const r of parseRowspanTable(body, 8)) {
      const nameRaw = cleanSeaCreatureCell(r[1])
      if (!nameRaw) continue
      const m = nameRaw.match(/^(.+?)\s*\(([^)]+)\)$/)
      const baseWeightText = cleanSeaCreatureCell(r[4])
      rows.push({
        pool,
        name: m ? m[1].trim() : nameRaw,
        rarity: m ? m[2].trim() : null,
        mob_type: cleanSeaCreatureCell(r[2]) || null,
        fishing_skill: r[3] ? parseInt(cleanSeaCreatureCell(r[3]), 10) || null : null,
        base_weight: baseWeightText ? parseFloat(baseWeightText) || null : null,
        base_chance: cleanSeaCreatureCell(r[5]) || null,
        categories: cleanSeaCreatureCell(r[6]) || null,
        special_requirements: cleanSeaCreatureCell(r[7]) || null,
      })
    }
  }

  if (rows.length === 0) throw new Error('sea_creature_pools: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('sea_creature_pools').upsert(rows, { onConflict: 'pool,name' })
  if (error) throw new Error('sea_creature_pools upsert: ' + error.message)
  return rows.length
}

// ============================================================
// skyblock_level_rewards -- SkyBlock Levels (page racine, distincte de "SkyBlock Levels/
// Tasks" déjà mappée dans skyblock_level_xp_tasks). Cette page couvre les RÉCOMPENSES par
// palier (Features/Prefix Color/Prefix Emblem/Stat/Bonus) -- complète directement les
// XP SOURCES déjà mappées, jamais capturé avant. Section "Stat" n'a pas de wikitable
// (juste 2 lignes de prose, un bonus récurrent "par niveau" et non un palier unique) --
// capturée telle quelle en 2 lignes texte plutôt que forcée dans le même moule que les
// autres sections. Vérifié en local (parse_sblevel_rewards.js) : 52 lignes (5 catégories),
// 0 reward vide, 0 markup wiki résiduel.
// ============================================================
function cleanLevelRewardCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\[\[File:[^\]]*\]\]/g, '')
  s = s.replace(/\{\{SBL\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{DG\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{stat\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/'''/g, '')
  s = s.replace(/<br\s*\/?>/gi, '; ')
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}
async function syncSkyblockLevelRewards(): Promise<number> {
  const content = await getWikiContent(supabase, 'skyblock_levels')
  const sectionRe = /=== ([^=]+) ===\n/g
  const matches = [...content.matchAll(sectionRe)]
  if (matches.length === 0) throw new Error('skyblock_level_rewards: aucune section trouvée')
  const bounds = matches.map((m, i) => ({
    name: m[1].trim(),
    start: m.index! + m[0].length,
    end: i + 1 < matches.length ? matches[i + 1].index! : content.length,
  }))

  const rows: any[] = []
  for (const b of bounds) {
    const chunk = content.slice(b.start, b.end)
    if (b.name === 'Stat') {
      const lines = chunk.split('\n').map(l => l.trim()).filter(l => l.startsWith('For every'))
      for (const l of lines) rows.push({ category: 'Stat', reward: cleanLevelRewardCell(l), preview: null, description: null, level: null })
      continue
    }
    const tableStart = chunk.indexOf('{|')
    const tableEnd = chunk.indexOf('|}', tableStart)
    if (tableStart === -1 || tableEnd === -1) continue
    const table = chunk.slice(tableStart, tableEnd)
    const allBlocks = table.split(/\n\|-\n?/)
    const dataStart = allBlocks.findIndex(bl => bl.trim().startsWith('|') && !bl.trim().startsWith('!'))
    if (dataStart === -1) continue
    const headerBlocks = allBlocks.slice(0, dataStart)
    const headers = headerBlocks.join('\n').split('\n').filter(l => l.trim().startsWith('!')).map(l => l.replace(/^!/, '').replace(/^colspan=\d+\|/, '').trim())
    const rowBlocks = allBlocks.slice(dataStart).filter(bl => bl.trim().length > 0)

    const previewIdx = headers.findIndex(h => /Preview/i.test(h))
    const descIdx = headers.findIndex(h => /Description/i.test(h))

    for (const block of rowBlocks) {
      const lines = block.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('|}'))
      const cells = lines.map(l => l.replace(/^\|/, '').replace(/^colspan=\d+\|/, '').trim())
      const nonImageCells = cells.filter(cell => !cell.startsWith('[[File:'))
      const reward = cleanLevelRewardCell(nonImageCells[0])
      if (!reward) continue
      const rest = nonImageCells.slice(1)
      const levelText = cleanLevelRewardCell(rest[rest.length - 1])
      rows.push({
        category: b.name,
        reward,
        preview: previewIdx >= 0 && rest[0] ? cleanLevelRewardCell(rest[0]) : null,
        description: descIdx >= 0 && rest[0] ? cleanLevelRewardCell(rest[0]) : null,
        level: levelText ? parseInt(levelText, 10) || null : null,
      })
    }
  }

  if (rows.length === 0) throw new Error('skyblock_level_rewards: 0 lignes extraites, parsing probablement cassé')
  const { error: delErr } = await supabase.from('skyblock_level_rewards').delete().gte('id', 0)
  if (delErr) throw new Error('skyblock_level_rewards delete: ' + delErr.message)
  const { error } = await supabase.from('skyblock_level_rewards').insert(rows)
  if (error) throw new Error('skyblock_level_rewards insert: ' + error.message)
  return rows.length
}

// ============================================================
// bingo_goals_archive -- Bingo Events/<Year> (2021-2026, 6 pages), archive historique
// des goals Bingo par mois -- `skyblock_bingo_goals` (API live, chantier Tier 1) ne
// couvre que l'événement courant (25 lignes), jamais l'historique. Format menu jeu
// {{UI|Bingo Card...}}, un seul bloc par mois (pas de chevauchement de scroll comme
// attribute_milestones/museum_milestones -- vérifié : exactement 1 occurrence "{{UI|
// Bingo Card" par tab mois). 2 types de goals réels : Personal (récompense fixe) et
// Community (récompense par palier de percentile de contribution, capturée en texte
// brut plutôt que décomposée en colonnes séparées -- disproportionné pour la valeur).
// Les entrées "Row #N" (bonus de ligne, méta-UI) sont exclues -- seuls Personal Goal/
// Community Goal sont retenus. Vérifié en local (parse_bingo.js) contre l'année 2021
// complète : 24 lignes, 0 nom vide, 0 code couleur résiduel.
// ============================================================
function stripBingoColor(s: string): string {
  return s.replace(/&[0-9a-fk-or]/gi, '').trim()
}
const BINGO_ARCHIVE_KEYS: Record<number, string> = {
  2021: 'bingo_events_2021',
  2022: 'bingo_events_2022',
  2023: 'bingo_events_2023',
  2024: 'bingo_events_2024',
  2025: 'bingo_events_2025',
  2026: 'bingo_events_2026',
}
async function syncBingoGoalsArchive(): Promise<number> {
  const rows: any[] = []
  const lineRe = /^\|\d+, \d+=[^,]*,\s*(?:[a-z0-9-]+|none),\s*&[0-9a-f]([^,]+),\s*&8(Personal Goal|Community Goal)(.*)$/gm

  for (const [yearStr, key] of Object.entries(BINGO_ARCHIVE_KEYS)) {
    const year = parseInt(yearStr, 10)
    const content = await getWikiContent(supabase, key)
    const tabRe = /\|-\|([A-Za-z]+)=/g
    const tabMatches = [...content.matchAll(tabRe)]
    const tabBounds = tabMatches.map((m, i) => ({
      month: m[1],
      start: m.index!,
      end: i + 1 < tabMatches.length ? tabMatches[i + 1].index! : content.length,
    }))

    for (const b of tabBounds) {
      const chunk = content.slice(b.start, b.end)
      let m
      lineRe.lastIndex = 0
      while ((m = lineRe.exec(chunk)) !== null) {
        const name = m[1].trim()
        const goalType = m[2]
        const segments = m[3].split('/')

        const descParts: string[] = []
        let i = 0
        for (; i < segments.length; i++) {
          const seg = segments[i]
          if (/Reward/.test(seg) || /Progress to/.test(seg) || /Contribution Rewards/.test(seg)) break
          const cleaned = stripBingoColor(seg)
          if (cleaned) descParts.push(cleaned)
        }
        const description = descParts.join(' ').replace(/\\,/g, ',').trim()
        while (i < segments.length && !/^Reward$/.test(stripBingoColor(segments[i])) && !/^Contribution Rewards/.test(stripBingoColor(segments[i]))) i++
        const rewardParts: string[] = []
        for (; i < segments.length; i++) {
          const seg = segments[i]
          if (/You have not|&8&o/.test(seg)) break
          const cleaned = stripBingoColor(seg)
          if (cleaned) rewardParts.push(cleaned)
        }
        const reward = rewardParts.join(' | ').replace(/\\,/g, ',').trim()

        rows.push({ year, month: b.month, name, goal_type: goalType, description: description || null, reward: reward || null })
      }
    }
  }

  if (rows.length === 0) throw new Error('bingo_goals_archive: 0 lignes extraites, parsing probablement cassé')
  const { error: delErr } = await supabase.from('bingo_goals_archive').delete().gte('id', 0)
  if (delErr) throw new Error('bingo_goals_archive delete: ' + delErr.message)
  const { error } = await supabase.from('bingo_goals_archive').insert(rows)
  if (error) throw new Error('bingo_goals_archive insert: ' + error.message)
  return rows.length
}

// ============================================================
// chocolate_factory_levels -- Chocolate Factory (page prose+tables, 23 sections réelles
// confirmées : Level/Employees/Employee Upgrade Cost/Discount/6 Upgrades nommés/Chocolate
// Shop/2 jeux de Milestones/Max CpS). Seule la table "Chocolate Factory Level" (6 lignes,
// seuils de prestige + multiplicateur de production + rareté max de lapin + cap de
// chocolat + niveau d'employé max) est construite dans cette passe -- wikitable simple,
// 0 rowspan/colspan, haute confiance. Le reste de la page (coûts d'employés avec formules
// mathématiques réelles, 6 upgrades nommés avec coûts par niveau, 2 systèmes de
// Milestones) est confirmé réel et substantiel mais nécessiterait une session dédiée
// (tables larges à "fondre" en format long, formules à capturer séparément) -- même
// diagnostic que npc_locations en son temps, différé plutôt que bâclé. Vérifié en local :
// 6/6 lignes, 0 markup résiduel.
// ============================================================
function cleanChocFactoryCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{Blank cell\}\}/gi, '')
  s = s.replace(/\{\{choc\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{rmt\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/&[0-9a-fk-or]/gi, '')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  return s.trim()
}
async function syncChocolateFactoryLevels(): Promise<number> {
  const content = await getWikiContent(supabase, 'chocolate_factory')
  const start = content.indexOf('== Chocolate Factory Level ==')
  const end = content.indexOf('== Employees ==')
  if (start === -1 || end === -1) throw new Error('chocolate_factory_levels: section introuvable')
  const chunk = content.slice(start, end)
  const body = extractFirstWikitableBody(chunk)
  if (!body) throw new Error('chocolate_factory_levels: wikitable introuvable')
  const rows = parseRowspanTable(body, 6)
    .map(r => ({
      level: parseInt(cleanChocFactoryCell(r[0]), 10),
      required_prestige_chocolate: cleanChocFactoryCell(r[1]) || null,
      production_multiplier: cleanChocFactoryCell(r[2]) || null,
      max_rabbit_rarity: cleanChocFactoryCell(r[3]) || null,
      max_chocolate: cleanChocFactoryCell(r[4]) || null,
      max_employee_level: cleanChocFactoryCell(r[5]) || null,
    }))
    .filter(r => !isNaN(r.level))

  if (rows.length === 0) throw new Error('chocolate_factory_levels: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('chocolate_factory_levels').upsert(rows, { onConflict: 'level' })
  if (error) throw new Error('chocolate_factory_levels upsert: ' + error.message)
  return rows.length
}

// ============================================================
// dungeon_chest_combo_chances -- 7 items (Hot Potato Book/Combo/No Pain No Gain/
// Ultimate Wise/Ultimate Jerry/Bank Enchantment/Wisdom Enchantment "chances"), chacun la
// vraie chance moyenne d'obtenir cet item précis par Coffre de Récompense de Donjon
// (Floor × type de coffre), avec/sans bonus de qualité max -- jamais capturé. Distinct de
// `dungeon_rng_scores` (NEU-REPO, poids RNG brut par item) déjà réel : celui-ci donne le
// POIDS, ces pages donnent la PROBABILITÉ DÉRIVÉE déjà calculée par floor/coffre, pas
// reconstructible facilement depuis le poids seul (dépend du poids total du pool, non
// capturé ailleurs).
// 🔴 Bug réel trouvé et corrigé après la 1ère construction (vérifiée en prod le même
// jour) : plusieurs pages sont paginées côté wiki (`combo_chances_2`, `ultimate_jerry_
// chances_2`/`_3`, `last_stand_chances_2`, `no_pain_no_gain_chances_2`, `ultimate_wise_
// chances_2` -- suffixes jamais criblés lors de la 1ère passe) -- la 1ère version de ce
// sync ne lisait que la page de base, perdant les lignes des étages supérieurs
// silencieusement présentes uniquement sur la page de continuation (vérifié : `combo_
// chances_2` contient bien Floor V/VI/VII, absentes de `combo_chances`). Corrigé en
// listant chaque page de continuation par type et en concaténant leurs LIGNES (jamais le
// texte brut avant extraction -- `extractFirstWikitableBody` ne prend que la 1ère table,
// concaténer le texte brut aurait tronqué la continuation à la 1ère page quand même).
// 2 items en plus trouvés dans le même criblage : `last_stand_chances`
// (2 items manqués initialement : Last Stand n'avait pas été repéré au premier passage)
// et 2 vrais nouveaux types (Bank/Wisdom Enchantment, même mécanique de coffre).
// `bank__enchantment__chances` est un `<tabber>` à paliers (Bank I/II/III, l'enchant a
// plusieurs niveaux) -- seul type de cette famille avec cette structure, capturé dans la
// nouvelle colonne `variant` (NULL pour tous les autres types). Vérifié en local
// (parse_dungeonchances.js) contre hot_potato_book_chances : 58/58 lignes, 0 floor vide,
// 0 markup résiduel -- le reste des types réutilise la même logique de parsing prouvée.
// ============================================================
function cleanDungeonChanceCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\[\[File:[^\]]*\]\]/g, '')
  s = s.replace(/style="[^"]*"\s*\|\s*/g, '')
  s = s.replace(/\{\{Coins\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/'''/g, '')
  s = s.replace(/<br\s*\/?>/gi, ' ')
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}
function parseDungeonChanceTable(body: string): any[] {
  const out: any[] = []
  for (const r of parseRowspanTable(body, 7)) {
    const floor = cleanDungeonChanceCell(r[0])
    if (!floor) continue
    out.push({
      floor,
      chest: cleanDungeonChanceCell(r[1]),
      cost: cleanDungeonChanceCell(r[2]) || null,
      chance_no_bonus: cleanDungeonChanceCell(r[3]) || null,
      chance_max_bonus: cleanDungeonChanceCell(r[4]) || null,
      quality: cleanDungeonChanceCell(r[5]) || null,
      weight: cleanDungeonChanceCell(r[6]) || null,
    })
  }
  return out
}
const DUNGEON_COMBO_CHANCE_KEYS: Record<string, string[]> = {
  hot_potato_book: ['hot_potato_book_chances'],
  combo: ['combo_chances', 'combo_chances_2'],
  no_pain_no_gain: ['no_pain_no_gain_chances', 'no_pain_no_gain_chances_2'],
  ultimate_wise: ['ultimate_wise_chances', 'ultimate_wise_chances_2'],
  ultimate_jerry: ['ultimate_jerry_chances', 'ultimate_jerry_chances_2', 'ultimate_jerry_chances_3'],
  last_stand: ['last_stand_chances', 'last_stand_chances_2'],
  wisdom_enchantment: ['wisdom__enchantment__chances', 'wisdom__enchantment__chances_2'],
}
async function syncDungeonChestComboChances(): Promise<number> {
  const rows: any[] = []
  for (const [comboType, keys] of Object.entries(DUNGEON_COMBO_CHANCE_KEYS)) {
    for (const key of keys) {
      const content = await getWikiContent(supabase, key)
      const body = extractFirstWikitableBody(content)
      if (!body) throw new Error(`dungeon_chest_combo_chances: wikitable introuvable pour ${comboType} (${key})`)
      for (const row of parseDungeonChanceTable(body)) {
        rows.push({ combo_type: comboType, variant: null, ...row })
      }
    }
  }

  // bank_enchantment -- seul type tabbé (paliers Bank I/II/III), pas de page de
  // continuation observée pour celui-ci.
  {
    const content = await getWikiContent(supabase, 'bank__enchantment__chances')
    const tabRe = /\|-\|([A-Za-z0-9 ]+)=/g
    const tabMatches = [...content.matchAll(tabRe)]
    if (tabMatches.length === 0) throw new Error('dungeon_chest_combo_chances: aucun palier trouvé pour bank_enchantment')
    const tabBounds = tabMatches.map((m, i) => ({
      variant: m[1].trim(),
      start: m.index! + m[0].length,
      end: i + 1 < tabMatches.length ? tabMatches[i + 1].index! : content.length,
    }))
    for (const tb of tabBounds) {
      const chunk = content.slice(tb.start, tb.end)
      const body = extractFirstWikitableBody(chunk)
      if (!body) continue
      for (const row of parseDungeonChanceTable(body)) {
        rows.push({ combo_type: 'bank_enchantment', variant: tb.variant, ...row })
      }
    }
  }

  if (rows.length === 0) throw new Error('dungeon_chest_combo_chances: 0 lignes extraites, parsing probablement cassé')
  const { error: delErr } = await supabase.from('dungeon_chest_combo_chances').delete().gte('id', 0)
  if (delErr) throw new Error('dungeon_chest_combo_chances delete: ' + delErr.message)
  const { error } = await supabase.from('dungeon_chest_combo_chances').insert(rows)
  if (error) throw new Error('dungeon_chest_combo_chances insert: ' + error.message)
  return rows.length
}

// ============================================================
// dungeon_class_milestones -- Class Milestones (630 lignes : 2 modes Normal/Master ×
// 5 classes Berserk/Mage/Archer/Tank/Healer × 7 étages × 9 paliers). Système entier
// jamais mappé -- distinct de `dungeon_classes` (contenu par NIVEAU de classe, sans
// source connue) : celui-ci couvre les SEUILS de dégâts/heal par ÉTAGE pour ouvrir le
// Post-Boss Chest et éviter la pénalité d'XP dungeon, vérifié sans recouvrement avant de
// construire. Table wide (Floor + 9 colonnes de palier) "fondue" en format long.
// Bug réel trouvé et corrigé en local avant tout déploiement : le premier tab de chaque
// mode (`Berserk`) a un double marqueur de ligne `|-\n|-\n` consécutif dans le wikitext
// source (probablement une erreur d'édition wiki jamais corrigée) -- le split par regex
// `/\n\|-\n?/` ne peut pas matcher 2 séparateurs adjacents (non-chevauchant, la 2e
// occurrence perd son `\n` de tête consommé par la 1ère) et laissait un fragment `|-`
// résiduel traité à tort comme une cellule réelle (décalait Floor I entièrement) --
// corrigé en excluant explicitement toute ligne valant exactement `|-` du filtre de
// cellules. Vérifié en local (parse_classmilestones.js) : 630/630 lignes (63 par
// mode/classe, cohérent), 0 seuil vide.
// ============================================================
function cleanClassMilestoneCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  return s.trim()
}
async function syncDungeonClassMilestones(): Promise<number> {
  const content = await getWikiContent(supabase, 'class_milestones')
  const modeRe = /== The Catacombs(?: - Master Mode)? ==\n/g
  const modeMatches = [...content.matchAll(modeRe)]
  if (modeMatches.length === 0) throw new Error('dungeon_class_milestones: aucun mode trouvé')
  const modeBounds = modeMatches.map((m, i) => ({
    mode: /Master Mode/.test(m[0]) ? 'master' : 'normal',
    start: m.index! + m[0].length,
    end: i + 1 < modeMatches.length ? modeMatches[i + 1].index! : content.length,
  }))

  const rows: any[] = []
  for (const mb of modeBounds) {
    const modeChunk = content.slice(mb.start, mb.end)
    const tabRe = /\n\s*(?:\|-\|\s*)?([A-Za-z]+)\s*=\s*\n/g
    const tabMatches = [...modeChunk.matchAll(tabRe)]
    const tabBounds = tabMatches.map((m, i) => ({
      className: m[1],
      start: m.index! + m[0].length,
      end: i + 1 < tabMatches.length ? tabMatches[i + 1].index! : modeChunk.length,
    }))
    for (const tb of tabBounds) {
      const chunk = modeChunk.slice(tb.start, tb.end)
      const body = extractFirstWikitableBody(chunk)
      if (!body) continue
      const rowBlocks = body.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
      for (const block of rowBlocks) {
        const lines = block.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('|}') && l.trim() !== '|-')
        if (lines.length === 0) continue
        const cells: string[] = []
        for (let i = 0; i < 10; i++) cells.push(lines[i] ? lines[i].replace(/^\|/, '').trim() : '')
        const floor = cleanClassMilestoneCell(cells[0])
        if (!floor) continue
        for (let m = 1; m <= 9; m++) {
          rows.push({ mode: mb.mode, class: tb.className, floor, milestone: m, threshold: cleanClassMilestoneCell(cells[m]) || null })
        }
      }
    }
  }

  if (rows.length === 0) throw new Error('dungeon_class_milestones: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('dungeon_class_milestones').upsert(rows, { onConflict: 'mode,class,floor,milestone' })
  if (error) throw new Error('dungeon_class_milestones upsert: ' + error.message)
  return rows.length
}

// ============================================================
// crystal_hollows_loot -- 7 pages Crystal Hollows/<Zone>/Loot (Crystal Hollows général/
// Fairy Grotto/Goblin Holdout/Jungle/Magma Fields/Mithril Deposits/Precursor Remnants),
// chacune 2 tables de rareté (Common ~95%/Rare ~5%) avec poids/chance par roll/chance par
// coffre -- jamais capturé, économiquement significatif (gemmes, Electron Transmitter,
// items Precursor). Format wikitext single-ligne `cell1 || cell2 || ...` (MediaWiki
// shorthand "cellules multiples sur une ligne"), différent de tous les formats déjà
// rencontrés dans ce chantier (une cellule par ligne `|`) -- parseur dédié par regex de
// bloc de table (capture légende `|+ ... Rarity Loot X%` + corps) plutôt que les helpers
// partagés `parseRowspanTable`/`extractFirstWikitableBody`, qui supposent le format
// une-cellule-par-ligne. Vérifié en local (parse_chloot.js) contre Precursor Remnants :
// 67/67 lignes, 0 item vide, 0 markup résiduel.
// ============================================================
function cleanCrystalLootCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/^\|/, '').trim()
  s = s.replace(/\{\{Slot\|[^}]*\}\}/g, '')
  s = s.replace(/\{\{RD\|([^{}|]*)\|?[^{}]*\}\}/g, '$1')
  s = s.replace(/\{\{aqua\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Chance\|([^|}]*)\|[^}]*\}\}/g, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  return s.trim()
}
const CRYSTAL_HOLLOWS_LOOT_KEYS: Record<string, string> = {
  'Crystal Hollows': 'crystal_hollows_crystal_hollows_loot',
  'Fairy Grotto': 'crystal_hollows_fairy_grotto_loot',
  'Goblin Holdout': 'crystal_hollows_goblin_holdout_loot',
  'Jungle': 'crystal_hollows_jungle_loot',
  'Magma Fields': 'crystal_hollows_magma_fields_loot',
  'Mithril Deposits': 'crystal_hollows_mithril_deposits_loot',
  'Precursor Remnants': 'crystal_hollows_precursor_remnants_loot',
}
async function syncCrystalHollowsLoot(): Promise<number> {
  const rows: any[] = []
  const tableRe = /\{\|[^\n]*\n\|\+ ?\[\[File:[^\]]*\]\] ?([A-Za-z ]+) \{\{[A-Za-z]+\|([\d.]+%)\}\}([\s\S]*?)\n\|\}/g

  for (const [zone, key] of Object.entries(CRYSTAL_HOLLOWS_LOOT_KEYS)) {
    const content = await getWikiContent(supabase, key)
    let m
    tableRe.lastIndex = 0
    while ((m = tableRe.exec(content)) !== null) {
      const rarity = m[1].trim()
      const rarityPoolChance = m[2]
      const body = m[3]
      const rowLines = body.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('!') && l.trim() !== '|-')
      for (const line of rowLines) {
        const cells = line.split('||').map(cleanCrystalLootCell)
        if (cells.length < 5) continue
        const item = cells[1]
        if (!item) continue
        rows.push({
          zone, rarity, rarity_pool_chance: rarityPoolChance,
          item,
          weight: cells[2] || null,
          chance_per_roll: cells[3] || null,
          chance_per_chest: cells[4] || null,
        })
      }
    }
  }

  if (rows.length === 0) throw new Error('crystal_hollows_loot: 0 lignes extraites, parsing probablement cassé')
  const { error: delErr } = await supabase.from('crystal_hollows_loot').delete().gte('id', 0)
  if (delErr) throw new Error('crystal_hollows_loot delete: ' + delErr.message)
  const { error } = await supabase.from('crystal_hollows_loot').insert(rows)
  if (error) throw new Error('crystal_hollows_loot insert: ' + error.message)
  return rows.length
}

// ============================================================
// treasure_fishing_loot -- 4 pages Treasure Loot/<Zone> (Crimson Isle/Fairy Pond/Winter/
// Water), items obtenables en Treasure Fishing par zone -- poids, chance totale, et
// chance à 2 paliers du stat Treasure Chance (5/20) -- jamais capturé. Même format
// wikitext single-ligne `cell1 || cell2 || ...` que `crystal_hollows_loot`, réutilise le
// même style de parseur. Au moins une ligne par page a un `colspan="4" | Unknown` (valeur
// non documentée côté wiki pour cet item précis, ex Flake the Fish sur Winter) -- capturé
// avec les champs numériques à NULL plutôt que sauté, pas de valeur inventée pour
// combler. Vérifié en local (parse_treasureloot.js) contre Crimson Isle : 64/64 lignes,
// 0 item vide, 0 markup résiduel.
// ============================================================
function cleanTreasureLootCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/^\|/, '').trim()
  s = s.replace(/\{\{Slot\|[^}]*\}\}/g, '')
  s = s.replace(/\{\{RD\|([^{}|]*)\|?[^{}]*\}\}/g, '$1')
  s = s.replace(/\{\{c\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{aqua\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Chance\|([^|}]*)\|[^}]*\}\}/g, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  return s.trim()
}
const TREASURE_LOOT_KEYS: Record<string, string> = {
  'Crimson Isle': 'treasure_loot_crimson_isle',
  'Fairy Pond': 'treasure_loot_fairy_pond',
  'Winter': 'treasure_loot_winter',
  'Water': 'treasure_loot_water',
  'Lotus Atoll': 'treasure_loot_lotus_atoll',
  'Junk': 'treasure_loot_junk',
  'Lava': 'treasure_loot_lava',
  'Moonglade Marsh': 'treasure_loot_moonglade_marsh',
}
async function syncTreasureFishingLoot(): Promise<number> {
  const rows: any[] = []
  for (const [zone, key] of Object.entries(TREASURE_LOOT_KEYS)) {
    const content = await getWikiContent(supabase, key)
    const tableStart = content.indexOf('{|')
    const tableEnd = content.indexOf('|}', tableStart)
    if (tableStart === -1 || tableEnd === -1) throw new Error(`treasure_fishing_loot: wikitable introuvable pour ${zone}`)
    const table = content.slice(tableStart, tableEnd)
    const allBlocks = table.split(/\n\|-\n?/)
    const dataStart = allBlocks.findIndex(b => b.trim().startsWith('|') && !b.trim().startsWith('!'))
    if (dataStart === -1) continue
    const rowBlocks = allBlocks.slice(dataStart).filter(b => b.trim().length > 0)
    for (const block of rowBlocks) {
      const lines = block.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('!'))
      if (lines.length === 0) continue
      const cells = lines[0].split('||').map(cleanTreasureLootCell)
      const item = cells[1]
      if (!item) continue
      rows.push({
        zone, item,
        pool: cells[2] || null,
        weight: cells[3] || null,
        total_chance: cells[4] || null,
        chance_treasure5: cells[5] || null,
        chance_treasure20: cells[6] || null,
      })
    }
  }

  if (rows.length === 0) throw new Error('treasure_fishing_loot: 0 lignes extraites, parsing probablement cassé')
  const { error: delErr } = await supabase.from('treasure_fishing_loot').delete().gte('id', 0)
  if (delErr) throw new Error('treasure_fishing_loot delete: ' + delErr.message)
  const { error } = await supabase.from('treasure_fishing_loot').insert(rows)
  if (error) throw new Error('treasure_fishing_loot insert: ' + error.message)
  return rows.length
}

// ============================================================
// zone_mob_stats -- 10 pages Mob List/<Zone> (Barn/Caverns/Crimson/Crystal/Dwarven/End/
// Hub/Mining/Park/Spider), stats de combat réelles par mob (Level/Location/HP/Damage/
// Combat XP/Behavior/Drops) -- jamais capturé dans ce projet. Distinct de `bestiary_mobs`
// (NEU-REPO, uniquement cap/bracket de progression Bestiary, vérifié avant de construire
// : aucune colonne HP/Damage/Behavior/Drops côté bestiary_mobs). Wikitable standard à
// rowspan (mobs groupés par niveau/HP/dégâts partagés), réutilise directement les
// helpers partagés déjà en place. Vérifié en local (parse_moblist.js) contre Mob List/
// Crystal : 24/24 lignes, 0 markup résiduel.
// ============================================================
function cleanZoneMobCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\[\[File:[^\]]*\]\]/g, '')
  s = s.replace(/\{\{Lv\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{[Zz]one\|([^{}|]*)\}\}/g, '$1')
  s = s.replace(/\{\{Stat\|[a-z]+\|icononly=yes\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{RL\|([^{}]*)\}\}/g, (_m, inner) => inner.split('|').join('; '))
  s = s.replace(/\{\{bc\}\}/gi, '')
  s = s.replace(/\{\{confirm\}\}/gi, '')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/<br\s*\/?>/gi, '; ')
  return s.trim()
}
const ZONE_MOB_LIST_KEYS: Record<string, string> = {
  'Barn': 'mob_list_barn',
  'Caverns': 'mob_list_caverns',
  'Crimson Isle': 'mob_list_crimson',
  'Crystal Hollows': 'mob_list_crystal',
  'Dwarven Mines': 'mob_list_dwarven',
  'The End': 'mob_list_end',
  'Hub': 'mob_list_hub',
  'Mining': 'mob_list_mining',
  'The Park': 'mob_list_park',
  "Spider's Den": 'mob_list_spider',
}
async function syncZoneMobStats(): Promise<number> {
  const rows: any[] = []
  for (const [zonePage, key] of Object.entries(ZONE_MOB_LIST_KEYS)) {
    const content = await getWikiContent(supabase, key)
    const body = extractFirstWikitableBody(content)
    if (!body) continue
    for (const r of parseRowspanTable(body, 9)) {
      const name = cleanZoneMobCell(r[1])
      if (!name) continue
      rows.push({
        zone_page: zonePage,
        name,
        level: cleanZoneMobCell(r[2]) || null,
        location: cleanZoneMobCell(r[3]) || null,
        hp: cleanZoneMobCell(r[4]) || null,
        damage: cleanZoneMobCell(r[5]) || null,
        combat_xp: cleanZoneMobCell(r[6]) || null,
        behavior: cleanZoneMobCell(r[7]) || null,
        drops: cleanZoneMobCell(r[8]) || null,
      })
    }
  }

  if (rows.length === 0) throw new Error('zone_mob_stats: 0 lignes extraites, parsing probablement cassé')
  const { error: delErr } = await supabase.from('zone_mob_stats').delete().gte('id', 0)
  if (delErr) throw new Error('zone_mob_stats delete: ' + delErr.message)
  const { error } = await supabase.from('zone_mob_stats').insert(rows)
  if (error) throw new Error('zone_mob_stats insert: ' + error.message)
  return rows.length
}

// ============================================================
// bits_shop_items -- Bits Shop (Elizabeth, Community Center), monnaie Bits jamais
// mappée dans ce projet. "Item Worth" volontairement PAS capturé : la colonne contient
// des templates live ({{AuctionHousePrice|...}}/{{BazaarData|...}}) rendus dynamiquement
// par le wiki au moment de la consultation, pas une valeur statique présente dans le
// wikitext -- extraire ce texte littéralement aurait donné un placeholder trompeur, pas
// un prix (règle 7 : jamais de donnée inventée/simulée).
// 🔴 Bug réel trouvé en vérifiant le vrai résultat en prod après le 1er déploiement
// (12 lignes au lieu des 56 attendues) : la page a 8 wikitables séparées (le tableau
// "Items" principal + 7 sous-catégories : Kat Items/Upgrade Components/Sacks/Abiphone/
// Dyes/Stacking Enchants/Enrichments) -- `extractFirstWikitableBody` ne prend que la
// PREMIÈRE table, perdant silencieusement les 7 autres. Corrigé en itérant TOUTES les
// wikitables de la page, chacune taguée par sa section `=== X ===` précédente (ou
// "General" pour le tableau principal sans sous-titre). Vérifié en local
// (parse_bitsshop2.js) après correction : 56/56 lignes réparties sur 8 catégories,
// 0 markup résiduel.
// ============================================================
function cleanBitsShopCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{Slot\|[^}]*\}\}/g, '')
  s = s.replace(/\{\{Aqua\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  return s.trim()
}
async function syncBitsShopItems(): Promise<number> {
  const content = await getWikiContent(supabase, 'bits_shop')
  const tableRe = /\{\| class="wikitable"[\s\S]*?\n\|\}/g
  const sectionRe = /=== ?([^=\n]+?) ?===\n/g
  const sections = [...content.matchAll(sectionRe)].map(m => ({ name: m[1], pos: m.index! }))
  const sectionFor = (pos: number) => {
    let cat = 'General'
    for (const s of sections) { if (s.pos < pos) cat = s.name; else break }
    return cat
  }

  const rows: any[] = []
  let m
  while ((m = tableRe.exec(content)) !== null) {
    const category = sectionFor(m.index)
    const tableText = m[0]
    const allBlocks = tableText.split(/\n\|-\n?/)
    const dataStart = allBlocks.findIndex(b => b.trim().startsWith('|') && !b.trim().startsWith('!'))
    if (dataStart === -1) continue
    const body = allBlocks.slice(dataStart).join('\n|-\n')
    for (const r of parseRowspanTable(body, 4)) {
      const itemName = cleanBitsShopCell(r[1])
      if (!itemName) continue
      rows.push({ category, item_name: itemName, bits_cost: cleanBitsShopCell(r[2]) || null })
    }
  }

  if (rows.length === 0) throw new Error('bits_shop_items: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('bits_shop_items').upsert(rows, { onConflict: 'category,item_name' })
  if (error) throw new Error('bits_shop_items upsert: ' + error.message)
  return rows.length
}

// ============================================================
// power_scroll_recipes -- Power Scrolls (6 gemmes : Ruby/Sapphire/Jasper/Amethyst/Amber/
// Opal), recette de craft jamais capturée. Format Infobox/Item à onglets numérotés
// (`|tab=`/`|tab2=`/.../`|raw_materialsN=`/`|mat_cost_bazaarN=`), pas une wikitable --
// extraction par regex de champ nommé plutôt que les helpers de table partagés (aucune
// table concernée ici). Opal (6e onglet) a `item_id`/`raw_materials`/`mat_cost_bazaar`
// vides côté wiki source lui-même (confirmé en lisant le wikitext brut, pas un bug de
// parsing) -- capturé à NULL, pas de valeur inventée pour compléter (règle 7). Vérifié
// en local (parse_powerscrolls.js) : 6/6 items, 5/6 avec recette complète.
// ============================================================
function getPowerScrollField(inner: string, idx: string, field: string): string | null {
  const re = new RegExp('\\|' + field + idx + '\\s*=([\\s\\S]*?)(?=\\n\\s*\\|[a-zA-Z]|\\n\\}\\})')
  const m = inner.match(re)
  if (!m) return null
  const val = (m[1] || '').trim()
  if (!val) return null
  return val.split('\n').map(l => l.replace(/^\*/, '').trim()).filter(Boolean).join('; ')
}
async function syncPowerScrollRecipes(): Promise<number> {
  const content = await getWikiContent(supabase, 'power_scrolls')
  const infoboxStart = content.indexOf('{{Infobox/Item')
  const infoboxEnd = content.indexOf('\n}}\n', infoboxStart)
  if (infoboxStart === -1 || infoboxEnd === -1) throw new Error('power_scroll_recipes: Infobox introuvable')
  const inner = content.slice(infoboxStart, infoboxEnd)

  const tabRe = /\|tab(\d*)\s*=\s*([^\n]+)/g
  const tabs = [...inner.matchAll(tabRe)].map(m => ({ idx: m[1] || '', name: m[2].trim() }))
  const rows = tabs
    .map(t => ({
      item_name: t.name,
      item_id: getPowerScrollField(inner, t.idx, 'id'),
      raw_materials: getPowerScrollField(inner, t.idx, 'raw_materials'),
      mat_cost_bazaar: getPowerScrollField(inner, t.idx, 'mat_cost_bazaar'),
    }))
    .filter(r => r.item_name)

  if (rows.length === 0) throw new Error('power_scroll_recipes: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('power_scroll_recipes').upsert(rows, { onConflict: 'item_name' })
  if (error) throw new Error('power_scroll_recipes upsert: ' + error.message)
  return rows.length
}

// ============================================================
// fame_ranks -- Fame Ranks (24 paliers), système économique jamais mappé (Bits
// Multiplier, votes d'élection, coût en Gems du palier suivant). "Coins per Bit to
// break even" volontairement PAS capturé : formule live ({{#expr:...}}/{{BazaarData|...}})
// calculée au rendu, pas une valeur statique (même raison que bits_shop_items/Item
// Worth). Wikitable simple, 10 colonnes, 0 rowspan. Vérifié en local
// (parse_famerank.js) : 24/24 lignes, 0 markup résiduel.
// ============================================================
function cleanFameRankCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{bc\}\}/gi, '')
  s = s.replace(/\{\{Blank cell\}\}/gi, '')
  s = s.replace(/\{\{Bits\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Gems\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{aqua\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  return s.trim()
}
async function syncFameRanks(): Promise<number> {
  const content = await getWikiContent(supabase, 'fame_ranks_table')
  const body = extractFirstWikitableBody(content)
  if (!body) throw new Error('fame_ranks: wikitable introuvable')
  const rowBlocks = body.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
  const rows: any[] = []
  for (const block of rowBlocks) {
    const lines = block.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('|}'))
    if (lines.length < 10) continue
    const cells = lines.map(l => cleanFameRankCell(l.replace(/^\|/, '')))
    const fameRank = cells[0]
    if (!fameRank) continue
    rows.push({
      fame_rank: fameRank,
      fame_required: cells[1] || null,
      bits_multiplier: cells[2] || null,
      election_votes: cells[3] || null,
      bits_per_cookie: cells[4] || null,
      cookies_4800: cells[6] || null,
      cookies_multiplied: cells[7] || null,
      gems_required: cells[8] || null,
      usd_for_next_rank: cells[9] || null,
    })
  }

  if (rows.length === 0) throw new Error('fame_ranks: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('fame_ranks').upsert(rows, { onConflict: 'fame_rank' })
  if (error) throw new Error('fame_ranks upsert: ' + error.message)
  return rows.length
}

// ============================================================
// rod_parts -- Rod Parts/List (18 pièces : Hooks/Lines/Sinkers), catalogue de pièces de
// canne à pêche jamais capturé. Cellules multi-lignes (source/recipe étendu via "----")
// -- réutilise `parseRowspanTable` déjà rendu multiline-aware plus tôt dans ce chantier
// (sea_creature_pools). Vérifié en local (parse_rodparts.js) : 18/18 lignes, 0 markup
// résiduel.
// ============================================================
function cleanRodPartCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/class="ct"\s*\|?\s*/g, '')
  s = s.replace(/\{\{Slot\|[^}]*\}\}/g, '')
  s = s.replace(/\{\{Rarity\|ordered=true\|([a-z])\}\}/gi, (_m, r) => (
    { c: 'Common', u: 'Uncommon', r: 'Rare', e: 'Epic', l: 'Legendary' } as Record<string, string>
  )[r.toLowerCase()] || r)
  s = s.replace(/\{\{Skl\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Crafting Table\|([^{}]*)\}\}/gi, 'Craft ($1)')
  s = s.replace(/\{\{RL\|([^{}]*)\}\}/g, (_m, inner) => inner.split('|').join('; '))
  s = s.replace(/\{\{Collection\|([^{}]*)\}\}/gi, 'Collection: $1')
  s = s.replace(/\{\{MobSprite\|([^{}|;]*)[^{}]*\}\}/g, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/^----$/gm, '')
  s = s.replace(/\n/g, '; ')
  s = s.replace(/;\s*;+/g, ';').replace(/^;\s*/, '').trim()
  return s.trim()
}
async function syncRodParts(): Promise<number> {
  const content = await getWikiContent(supabase, 'rod_parts_list')
  const tabRe = /\|-\|([A-Za-z]+)=/g
  const tabMatches = [...content.matchAll(tabRe)]
  if (tabMatches.length === 0) throw new Error('rod_parts: aucun onglet trouvé')
  const tabBounds = tabMatches.map((m, i) => ({
    name: m[1],
    start: m.index!,
    end: i + 1 < tabMatches.length ? tabMatches[i + 1].index! : content.length,
  }))

  const rows: any[] = []
  for (const tb of tabBounds) {
    const chunk = content.slice(tb.start, tb.end)
    const body = extractFirstWikitableBody(chunk)
    if (!body) continue
    for (const r of parseRowspanTable(body, 6)) {
      const name = cleanRodPartCell(r[1])
      if (!name) continue
      rows.push({
        part_type: tb.name,
        name,
        rarity: cleanRodPartCell(r[2]) || null,
        stats: cleanRodPartCell(r[3]) || null,
        requirements: cleanRodPartCell(r[4]) || null,
        source: cleanRodPartCell(r[5]) || null,
      })
    }
  }

  if (rows.length === 0) throw new Error('rod_parts: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('rod_parts').upsert(rows, { onConflict: 'part_type,name' })
  if (error) throw new Error('rod_parts upsert: ' + error.message)
  return rows.length
}

// ============================================================
// composter_organic_matter -- Composter/Organic Matter Table (51 items), conversion
// Item -> Organic Matter jamais capturée. "Bazaar Cost" volontairement pas capturé
// (template live {{BZC|...}}, même raison que bits_shop_items/fame_ranks). Format
// wikitext single-ligne `cell1 || cell2 || ...`. Vérifié en local (parse_compost.js) :
// 51/51 lignes, 0 markup résiduel.
// ============================================================
function cleanCompostCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/^\|/, '').trim()
  s = s.replace(/\{\{ID\|([^{}|]*)\}\}/g, '$1')
  s = s.replace(/\{\{RD\|([^{}|]*)\|?[^{}]*\}\}/g, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  return s.trim()
}
async function syncComposterOrganicMatter(): Promise<number> {
  const content = await getWikiContent(supabase, 'compost_organic_matter_table')
  const tableStart = content.indexOf('{|')
  const tableEnd = content.indexOf('|}', tableStart)
  if (tableStart === -1 || tableEnd === -1) throw new Error('composter_organic_matter: wikitable introuvable')
  const table = content.slice(tableStart, tableEnd)
  const allBlocks = table.split(/\n\|-\n?/)
  const dataStart = allBlocks.findIndex(b => b.trim().startsWith('|') && !b.trim().startsWith('!'))
  if (dataStart === -1) throw new Error('composter_organic_matter: aucune ligne de donnée trouvée')
  const rowBlocks = allBlocks.slice(dataStart).filter(b => b.trim().length > 0)

  const rows: any[] = []
  for (const block of rowBlocks) {
    const lines = block.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('!'))
    if (lines.length === 0) continue
    const cells = lines[0].split('||').map(cleanCompostCell)
    if (cells.length < 3) continue
    const item = cells[0]
    if (!item) continue
    rows.push({ item, organic_matter: cells[1] || null, amount_per_4000: cells[2] || null })
  }

  if (rows.length === 0) throw new Error('composter_organic_matter: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('composter_organic_matter').upsert(rows, { onConflict: 'item' })
  if (error) throw new Error('composter_organic_matter upsert: ' + error.message)
  return rows.length
}

// ============================================================
// skyblock_gems_pricing -- SkyBlock Gems (5 paliers), monnaie premium jamais mappée.
// Prix USD réels (base + code créateur), wikitable simple, 0 rowspan. Vérifié en local :
// 5/5 lignes.
// ============================================================
function cleanGemsPricingCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{Green\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Red\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  return s.trim()
}
async function syncSkyblockGemsPricing(): Promise<number> {
  const content = await getWikiContent(supabase, 'skyblock_gems')
  const body = extractFirstWikitableBody(content)
  if (!body) throw new Error('skyblock_gems_pricing: wikitable introuvable')
  const rows = parseRowspanTable(body, 3)
    .map(r => ({
      quantity: cleanGemsPricingCell(r[0]),
      base_price_usd: cleanGemsPricingCell(r[1]),
      creator_code_price_usd: cleanGemsPricingCell(r[2]),
    }))
    .filter(r => r.quantity)

  if (rows.length === 0) throw new Error('skyblock_gems_pricing: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('skyblock_gems_pricing').upsert(rows, { onConflict: 'quantity' })
  if (error) throw new Error('skyblock_gems_pricing upsert: ' + error.message)
  return rows.length
}

// ============================================================
// rift_timecharms -- Rift Timecharms (8 items), système Rift Time jamais mappé.
// Wikitable simple (Slot/Name/Access/Obtaining), cellules multi-lignes via "----"
// (marqueur de continuation intra-cellule, pas un séparateur de ligne). Un nom
// "mrahcemiT esrevrorriM" (Mirrorverse Timecharm à l'envers) est un vrai nom en jeu,
// pas un artefact de parsing. Vérifié en local (parse_timecharms.js) : 8/8 lignes,
// 0 markup résiduel.
// ============================================================
function cleanTimecharmCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/style="[^"]*"\s*\|\s*/g, '')
  s = s.replace(/\{\{slot\|[^}]*\}\}/gi, '')
  s = s.replace(/\{\{[Zz]one\|([^{}|]*)\}\}/g, '$1')
  s = s.replace(/\{\{Crafting Table\|([^{}]*)\}\}/gi, 'Craft ($1)')
  s = s.replace(/\{\{RL\|([^{}]*)\}\}/g, (_m, inner) => inner.split('|').join('; '))
  s = s.replace(/\{\{NPCSprite\|([^{}|;]*)[^{}]*\}\}/g, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/^----$/gm, '')
  s = s.replace(/\n/g, '; ')
  s = s.replace(/<br\s*\/?>/gi, '; ')
  s = s.replace(/;\s*;+/g, ';').replace(/^;\s*/, '').trim()
  return s.trim()
}
async function syncRiftTimecharms(): Promise<number> {
  const content = await getWikiContent(supabase, 'rift_timecharms')
  const idx = content.indexOf('== Rift Timecharms ==')
  const idx2 = content.indexOf('== Trivia ==')
  if (idx === -1) throw new Error('rift_timecharms: section introuvable')
  const chunk = idx2 === -1 ? content.slice(idx) : content.slice(idx, idx2)
  const body = extractFirstWikitableBody(chunk)
  if (!body) throw new Error('rift_timecharms: wikitable introuvable')
  const rows = parseRowspanTable(body, 4)
    .map(r => ({
      name: cleanTimecharmCell(r[1]),
      access: cleanTimecharmCell(r[2]) || null,
      obtaining: cleanTimecharmCell(r[3]) || null,
    }))
    .filter(r => r.name)

  if (rows.length === 0) throw new Error('rift_timecharms: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('rift_timecharms').upsert(rows, { onConflict: 'name' })
  if (error) throw new Error('rift_timecharms upsert: ' + error.message)
  return rows.length
}

// ============================================================
// drop_chance_tiers -- glossaire des 2 systèmes de tags "Odds" utilisés partout dans
// le wiki (template {{Odds|...}}) mais jamais reliés à leur vraie plage numérique --
// Bestiary Loot (Common/Uncommon/Rare/Legendary/RNGesus, mobs bestiary) et RNG
// Meter/Slayer (Guaranteed/Occasional/Rare/Extraordinary/Pray RNGesus/RNGesus
// Incarnate, drops slayer/RNG meter) : deux vocabulaires distincts, pas doublon de
// bestiary_brackets (paliers de kills pour débloquer un niveau bestiary, système
// sans rapport). Page en grande partie prose (formule Looting/Luck/Magic Find/Pet
// Luck + variante Overbloom pour les Pests), seules les 2 tables de tiers sont
// tabulaires -- 11 lignes transcrites directement depuis le wikitext vérifié
// (source_page='Drop Chance'), même pattern que POWDER_COST_LINES ci-dessus plutôt
// qu'un parseur pour 2 petites tables figées.
// ============================================================
const DROP_CHANCE_TIERS: { system: string; tier_name: string; chance_range: string; examples: string | null }[] = [
  { system: 'bestiary', tier_name: 'Common Loot', chance_range: '30.01%-100%', examples: null },
  { system: 'bestiary', tier_name: 'Uncommon Loot', chance_range: '1.01%-30%', examples: null },
  { system: 'bestiary', tier_name: 'Rare Loot', chance_range: '0.11%-1%', examples: null },
  { system: 'bestiary', tier_name: 'Legendary Loot', chance_range: '0.02%-0.1%', examples: null },
  { system: 'bestiary', tier_name: 'RNGesus Loot', chance_range: '<=0.01%', examples: null },
  { system: 'rng_meter', tier_name: 'Guaranteed', chance_range: '100%', examples: 'Revenant Flesh; Tarantula Webs; Wolf Teeth; most Mob drops' },
  { system: 'rng_meter', tier_name: 'Occasional', chance_range: '20%', examples: 'Foul Flesh; Toxic Arrow Poison; Hamster Wheels' },
  { system: 'rng_meter', tier_name: 'Rare', chance_range: '5%', examples: 'Pestilence Rune; Null Atom' },
  { system: 'rng_meter', tier_name: 'Extraordinary', chance_range: '1%', examples: 'Hazmat Enderman; Revenant Catalysts' },
  { system: 'rng_meter', tier_name: 'Pray RNGesus', chance_range: '<1%', examples: 'Overflux Capacitor; Sinful Dice' },
  { system: 'rng_meter', tier_name: 'RNGesus Incarnate', chance_range: '<<1%', examples: 'Warden Heart; Primordial Eye; Exceedingly Rare Ender Artifact Upgrade' },
]
async function syncDropChanceTiers(): Promise<number> {
  const content = await getWikiContent(supabase, 'drop_chance')
  if (!content || !content.includes('RNGesus Incarnate')) {
    throw new Error('drop_chance_tiers: page source introuvable ou changée (vérifier avant de continuer à upsert des valeurs figées)')
  }
  const { error } = await supabase.from('drop_chance_tiers').upsert(DROP_CHANCE_TIERS, { onConflict: 'system,tier_name' })
  if (error) throw new Error('drop_chance_tiers upsert: ' + error.message)
  return DROP_CHANCE_TIERS.length
}

// ============================================================
// milestone_reward_tiers -- 2 systèmes de paliers jamais capturés, trouvés sur la
// page overview "Milestones" : déblocage de rareté du Dolphin Pet (kills de Sea
// Creature) et du Rock Pet (Ores minés), plus les 10 niveaux de l'enchant Expertise
// (Sea Creatures tués avec la canne enchantée -- compteur distinct du total kills
// Dolphin). La 3e table de cette page ("Dungeon Milestones -- Actions par classe",
// Archer/Tank/Healer/Berserk/Mage) est un résumé générique déjà largement dépassé
// par dungeon_class_milestones (630 lignes, détail réel par floor/classe/palier) --
// volontairement pas reconstruite ici, pure redite. Vérifié : aucune table
// existante ne couvrait Dolphin/Rock Pet ni Expertise (grep WIKI-MAPPING.md +
// information_schema, 0 résultat). 20 lignes transcrites directement depuis le
// wikitext vérifié, même pattern que DROP_CHANCE_TIERS ci-dessus.
// ============================================================
const MILESTONE_REWARD_TIERS: { system: string; tier_label: string; threshold: string | null; unit: string }[] = [
  { system: 'dolphin_pet', tier_label: 'Common', threshold: '250', unit: 'sea_creature_kills' },
  { system: 'dolphin_pet', tier_label: 'Uncommon', threshold: '1000', unit: 'sea_creature_kills' },
  { system: 'dolphin_pet', tier_label: 'Rare', threshold: '2500', unit: 'sea_creature_kills' },
  { system: 'dolphin_pet', tier_label: 'Epic', threshold: '5000', unit: 'sea_creature_kills' },
  { system: 'dolphin_pet', tier_label: 'Legendary', threshold: '10000', unit: 'sea_creature_kills' },
  { system: 'rock_pet', tier_label: 'Common', threshold: '2500', unit: 'ores_mined' },
  { system: 'rock_pet', tier_label: 'Uncommon', threshold: '7500', unit: 'ores_mined' },
  { system: 'rock_pet', tier_label: 'Rare', threshold: '20000', unit: 'ores_mined' },
  { system: 'rock_pet', tier_label: 'Epic', threshold: '100000', unit: 'ores_mined' },
  { system: 'rock_pet', tier_label: 'Legendary', threshold: '250000', unit: 'ores_mined' },
  { system: 'expertise_enchant', tier_label: 'I', threshold: null, unit: 'sea_creatures_killed_with_expertise_rod' },
  { system: 'expertise_enchant', tier_label: 'II', threshold: '50', unit: 'sea_creatures_killed_with_expertise_rod' },
  { system: 'expertise_enchant', tier_label: 'III', threshold: '100', unit: 'sea_creatures_killed_with_expertise_rod' },
  { system: 'expertise_enchant', tier_label: 'IV', threshold: '250', unit: 'sea_creatures_killed_with_expertise_rod' },
  { system: 'expertise_enchant', tier_label: 'V', threshold: '500', unit: 'sea_creatures_killed_with_expertise_rod' },
  { system: 'expertise_enchant', tier_label: 'VI', threshold: '1000', unit: 'sea_creatures_killed_with_expertise_rod' },
  { system: 'expertise_enchant', tier_label: 'VII', threshold: '2500', unit: 'sea_creatures_killed_with_expertise_rod' },
  { system: 'expertise_enchant', tier_label: 'VIII', threshold: '5500', unit: 'sea_creatures_killed_with_expertise_rod' },
  { system: 'expertise_enchant', tier_label: 'IX', threshold: '10000', unit: 'sea_creatures_killed_with_expertise_rod' },
  { system: 'expertise_enchant', tier_label: 'X', threshold: '15000', unit: 'sea_creatures_killed_with_expertise_rod' },
]
async function syncMilestoneRewardTiers(): Promise<number> {
  const content = await getWikiContent(supabase, 'milestones')
  if (!content || !content.includes('Rock Pet') || !content.includes('Expertise')) {
    throw new Error('milestone_reward_tiers: page source introuvable ou changée (vérifier avant de continuer à upsert des valeurs figées)')
  }
  const { error } = await supabase.from('milestone_reward_tiers').upsert(MILESTONE_REWARD_TIERS, { onConflict: 'system,tier_label' })
  if (error) throw new Error('milestone_reward_tiers upsert: ' + error.message)
  return MILESTONE_REWARD_TIERS.length
}

// ============================================================
// tree_gift_drops -- table de drop des Tree Gifts (Foraging, HotF), jamais capturée.
// 3 pages réelles (`tree_gifts_fig`/`tree_gifts_mangrove`/`tree_gifts_helix`, source
// hypixelskyblock_wiki) -- une 4e page trouvée en screening, `tree_gifts_list`
// (source fandom_wiki, 2 arbres seulement Fig/Mangrove, pas Helix), confirmée
// périmée/incomplète face aux 3 pages actuelles, volontairement ignorée (même
// discipline que le reste du projet : source abandonnée le 22 juillet). Wikitable
// simple 5 colonnes (Drop/Drop Rarity/Chance/Notes/Bazaar-AH worth), cellules
// commentées HTML (`<!--{{BZC|...}}-->`) sur la page Helix pour les items pas
// encore pricés par les éditeurs wiki -- laissées vides plutôt que devinées.
// Vérifié en local (parse_treegift3.js) : 57/57 lignes (19 Fig + 19 Mangrove +
// 19 Helix), 0 markup résiduel.
// ============================================================
const TREE_GIFT_PAGES: { tree: string; wikiKey: string }[] = [
  { tree: 'Fig', wikiKey: 'tree_gifts_fig' },
  { tree: 'Mangrove', wikiKey: 'tree_gifts_mangrove' },
  { tree: 'Helix', wikiKey: 'tree_gifts_helix' },
]
function cleanTreeGiftCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/\{\{[Bb]c\}\}/gi, '')
  s = s.replace(/\{\{RD\|([^{}]*)\}\}/gi, (_m, inner) => {
    const parts = inner.split('!')
    return parts[parts.length - 1]
  })
  s = s.replace(/\{\{Skill XP\|([^{}]*)\}\}/gi, '$1 XP')
  s = s.replace(/\{\{Chance\|([^|{}]*)\|[^{}]*\}\}/gi, '$1')
  s = s.replace(/\{\{Odds\|([^|{}]*)\|nameonly=yes\}\}/gi, '$1')
  s = s.replace(/\{\{Green\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{MobSprite\|([^{}|;]*)[^{}]*\}\}/g, '$1')
  s = s.replace(/\{\{Attr\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{BZC\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{AH\|([^{}|]*)\|?[^{}]*\}\}/gi, '$1')
  s = s.replace(/\{\{ID\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Forest Whispers\|([^{}]*)\}\}/gi, '$1 Forest Whispers')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/&([^&]+)&/g, '$1')
  s = s.replace(/\$([a-zA-Z]+)\$/g, '$1')
  s = s.replace(/'''/g, '')
  s = s.replace(/\n/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s.trim()
}
async function syncTreeGiftDrops(): Promise<number> {
  const rows: any[] = []
  for (const { tree, wikiKey } of TREE_GIFT_PAGES) {
    const content = await getWikiContent(supabase, wikiKey)
    const body = extractFirstWikitableBody(content)
    if (!body) continue
    for (const r of parseRowspanTable(body, 5)) {
      const drop = cleanTreeGiftCell(r[0])
      if (!drop) continue
      rows.push({
        tree,
        drop,
        rarity_code: cleanTreeGiftCell(r[1]) || null,
        chance: cleanTreeGiftCell(r[2]) || null,
        notes: cleanTreeGiftCell(r[3]) || null,
        market_value: cleanTreeGiftCell(r[4]) || null,
      })
    }
  }
  if (rows.length === 0) throw new Error('tree_gift_drops: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('tree_gift_drops').upsert(rows, { onConflict: 'tree,drop' })
  if (error) throw new Error('tree_gift_drops upsert: ' + error.message)
  return rows.length
}

// ============================================================
// trophy_frogs -- système de pêche à la grenouille (Lotus Atoll/Rift), jamais mappé,
// distinct de trophy_fish_thresholds (autre système, Bronze->Diamond par poisson pas
// par frog). 12 grenouilles réelles, Slot/Name/Rarity/Requirement/Catch Chance/Pity
// Gold/Pity Diamond -- header à 2 lignes (rowspan sur les 5 premières colonnes,
// colspan sur "Pity" qui se déplie en 2 sous-colonnes GOLD/DIAMOND). Vérifié en
// local (parse_trophyfrogs.js) : 12/12 lignes, 0 markup résiduel.
// ============================================================
function cleanTrophyFrogCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/style="[^"]*"\s*\|\s*/g, '')
  s = s.replace(/\{\{Slot\|[^}]*\}\}/gi, '')
  s = s.replace(/\{\{TA\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Rarity\|([^{}|]*)\|?[^{}]*\}\}/gi, '$1')
  s = s.replace(/\{\{Chance\|([^|{}]*)\|[^{}]*\}\}/gi, '$1')
  s = s.replace(/\{\{Green\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Aqua\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Pink\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Red\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Gold\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Zone\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{MobSprite\|([^{}|;]*)[^{}]*\}\}/g, '$1')
  s = s.replace(/\{\{ID\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/'''/g, '')
  s = s.replace(/\n/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s.trim()
}
async function syncTrophyFrogs(): Promise<number> {
  const content = await getWikiContent(supabase, 'trophy_frogs_list')
  const body = extractFirstWikitableBody(content)
  if (!body) throw new Error('trophy_frogs: wikitable introuvable')
  const rows = parseRowspanTable(body, 7)
    .map(r => ({
      name: cleanTrophyFrogCell(r[1]),
      rarity: cleanTrophyFrogCell(r[2]) || null,
      requirement: cleanTrophyFrogCell(r[3]) || null,
      catch_chance: cleanTrophyFrogCell(r[4]) || null,
      pity_gold: cleanTrophyFrogCell(r[5]) || null,
      pity_diamond: cleanTrophyFrogCell(r[6]) || null,
    }))
    .filter(r => r.name)

  if (rows.length === 0) throw new Error('trophy_frogs: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('trophy_frogs').upsert(rows, { onConflict: 'name' })
  if (error) throw new Error('trophy_frogs upsert: ' + error.message)
  return rows.length
}

// ============================================================
// wormhole_locations -- 21 coordonnées de wormholes réels (Rift, Lotus Atoll/Tewtil
// Tunnel), jamais mappées -- connecté à trophy_frogs (Reality Hopper "Caught in
// Wormholes on the Lotus Atoll"). Wikitable avec caption (`|+`) avant les en-têtes,
// gérée en filtrant les lignes `+`. Coordonnées négatives (`z=-19` etc) confirmées
// parser correctement en `parseInt`. Vérifié en local (parse_wormhole2.js) :
// 21/21 lignes, 0 markup résiduel, 0 NaN.
// ============================================================
function cleanWormholeCell(s: string): string {
  s = (s || '').replace(/^\|/, '').trim()
  s = s.replace(/\{\{NPCSprite\|([^{}|;]*)[^{}]*\}\}/g, '$1')
  s = s.replace(/\{\{Zone\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  return s.trim()
}
function extractWormholeLocation(minimapCell: string): string | null {
  const m = minimapCell.match(/location=([^|}]*)/)
  return m ? m[1].trim() : null
}
async function syncWormholeLocations(): Promise<number> {
  const content = await getWikiContent(supabase, 'wormhole_locations')
  const tableStart = content.indexOf('{|')
  const tableEnd = content.indexOf('|}', tableStart)
  if (tableStart === -1 || tableEnd === -1) throw new Error('wormhole_locations: wikitable introuvable')
  const table = content.slice(tableStart, tableEnd)
  const blocks = table.split(/\n\|-\n?/)
  const dataStart = blocks.findIndex(b => {
    const t = b.trim()
    return t.startsWith('|') && !t.startsWith('!') && !t.startsWith('+')
  })
  if (dataStart === -1) throw new Error('wormhole_locations: aucune ligne de donnée trouvée')
  const body = blocks.slice(dataStart).join('\n|-\n')
  const rowBlocks = body.split(/\n\|-\n?/).filter(b => b.trim().length > 0)

  const rows: any[] = []
  for (const block of rowBlocks) {
    const lines = block.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('|}'))
    if (lines.length < 6) continue
    const wormholeNo = cleanWormholeCell(lines[0])
    if (!wormholeNo) continue
    rows.push({
      wormhole_no: wormholeNo,
      location: extractWormholeLocation(lines[1]),
      x: parseInt(cleanWormholeCell(lines[2]), 10) || null,
      y: parseInt(cleanWormholeCell(lines[3]), 10) || null,
      z: parseInt(cleanWormholeCell(lines[4]), 10) || null,
      description: cleanWormholeCell(lines[5]) || null,
    })
  }
  if (rows.length === 0) throw new Error('wormhole_locations: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('wormhole_locations').upsert(rows, { onConflict: 'wormhole_no' })
  if (error) throw new Error('wormhole_locations upsert: ' + error.message)
  return rows.length
}

// ============================================================
// mob_type_categories -- ferme un vrai gap documenté : les 5 tâches milestone
// `mobtype` (catégories Bestiary larges type "Arthropod"/"Undead") étaient non
// calculables faute d'une table de référence mob -> catégorie (notée explicitement
// dans CLAUDE.md, jamais construite faute de source). 24 pages réelles
// `Mob Types/List/<Catégorie>` trouvées en screening, chacune une wikitable
// Name/Mob Types où la colonne Mob Types liste déjà TOUTES les catégories du mob
// (via `{{mt|X}}<br>{{mt|Y}}`, pas seulement la catégorie de la page courante) --
// les 24 pages se recoupent donc largement, upsert sur (mob_name, category) dédoublonne
// naturellement sans jamais avoir besoin de faire confiance à une seule page.
// **Bug de parsing réel trouvé et corrigé avant tout déploiement** (testé en local,
// parse_mobtypes2.js, contre `mob_types_list_animal` -- la plus grosse page, 6277
// caractères) : des lignes entières sont désactivées via commentaire HTML
// (`<!-- |-\n| {{MobSprite|Night Squid}}\n| ... -->`) qui englobe un `|-` de
// séparation de ligne à l'intérieur du commentaire -- un split naïf sur `\n|-\n?`
// AVANT d'avoir retiré les commentaires aurait cassé la cellule précédente
// (Squid) et fabriqué une fausse ligne "Night Squid" à partir du texte commenté.
// Corrigé en retirant tous les commentaires HTML sur le texte brut ENTIER avant
// toute extraction de table, pas seulement par cellule. Quelques entrées sont des
// groupes placeholder plutôt que des mobs individuels (`[[Trevor|Trapper Mobs]]`
// -> "Trapper Mobs") -- capturées telles quelles, fidèles à la source.
// ============================================================
const MOB_TYPE_CATEGORY_KEYS: string[] = [
  'mob_types_list_airborne', 'mob_types_list_animal', 'mob_types_list_aquatic',
  'mob_types_list_arcane', 'mob_types_list_arthropod', 'mob_types_list_construct',
  'mob_types_list_critter', 'mob_types_list_cubic', 'mob_types_list_elusive',
  'mob_types_list_ender', 'mob_types_list_frozen', 'mob_types_list_glacial',
  'mob_types_list_humanoid', 'mob_types_list_infernal', 'mob_types_list_magmatic',
  'mob_types_list_mythological', 'mob_types_list_pest', 'mob_types_list_shielded',
  'mob_types_list_skeletal', 'mob_types_list_spooky', 'mob_types_list_subterranean',
  'mob_types_list_undead', 'mob_types_list_wither', 'mob_types_list_woodland',
]
function cleanMobTypeName(s: string): string {
  s = (s || '').replace(/^\|/, '').trim()
  s = s.replace(/\{\{MobSprite\|([^{}|;]*)[^{}]*\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  return s.trim()
}
function extractMobTypeCategories(cell: string): string[] {
  const mts = [...cell.matchAll(/\{\{mt\|([^{}]*)\}\}/gi)]
  return mts.map(m => m[1].trim())
}
async function syncMobTypeCategories(): Promise<number> {
  const seen = new Map<string, { mob_name: string; category: string }>()
  for (const key of MOB_TYPE_CATEGORY_KEYS) {
    const raw = await getWikiContent(supabase, key)
    if (!raw) continue
    const content = raw.replace(/<!--[\s\S]*?-->/g, '')
    const body = extractFirstWikitableBody(content)
    if (!body) continue
    const rowBlocks = body.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
    for (const block of rowBlocks) {
      const lines = block.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('|}'))
      if (lines.length < 2) continue
      const name = cleanMobTypeName(lines[0])
      if (!name) continue
      const cats = extractMobTypeCategories(lines.slice(1).join('\n'))
      for (const cat of cats) {
        seen.set(`${name}|${cat}`, { mob_name: name, category: cat })
      }
    }
  }
  const rows = [...seen.values()]
  if (rows.length === 0) throw new Error('mob_type_categories: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('mob_type_categories').upsert(rows, { onConflict: 'mob_name,category' })
  if (error) throw new Error('mob_type_categories upsert: ' + error.message)
  return rows.length
}

// ============================================================
// trial_of_blue_flames -- système Rift jamais mappé (Soul Campfire, 30 trials
// I-XXX, DPS/dégâts totaux requis + récompense badge par rareté avec bonus Fire/
// Permanent). Table à rowspan ET colspan combinés (la ligne "I" a une seule cellule
// `colspan=4` vide pour tout le groupe Reward, les autres lignes ont des rowspan
// variables sur Name/Rarity/Fire boost/Permanent boost groupés par badge) --
// **parseur dédié, pas le `parseRowspanTable` partagé** : plusieurs séparateurs de
// ligne sont `|- class="oddrow"` (pas un `|-` nu), que le split partagé
// (`\n\|-\n?`, wiki-table-parse.ts) ne reconnaît pas comme séparateur -- aurait fusionné
// ces lignes avec la précédente. Vérifié en local (parse_blueflames.js) : 30/30
// lignes, 0 markup résiduel.
// ============================================================
function extractBlueFlamesTableBody(text: string): string | null {
  const tableStart = text.indexOf('{|')
  const tableEnd = text.indexOf('|}', tableStart)
  if (tableStart === -1 || tableEnd === -1) return null
  const table = text.slice(tableStart, tableEnd)
  const blocks = table.split(/\n\|-[^\n]*\n?/)
  const dataStart = blocks.findIndex(b => b.trim().startsWith('|') && !b.trim().startsWith('!'))
  if (dataStart === -1) return null
  return blocks.slice(dataStart).join('\n|-\n')
}
function splitBlueFlamesCellLines(block: string): string[] {
  const lines = block.split('\n')
  const cells: string[] = []
  let current: string | null = null
  for (const line of lines) {
    if (/^\|\}/.test(line)) continue
    if (/^\|(?!-)/.test(line)) { if (current !== null) cells.push(current); current = line }
    else if (current !== null) current += '\n' + line
  }
  if (current !== null) cells.push(current)
  return cells
}
function parseBlueFlamesCellAttrs(line: string): { value: string; rowspan: number; colspan: number } {
  let s = line.replace(/^\|/, '')
  let rowspan = 1, colspan = 1
  const firstPipe = s.indexOf('|')
  if (firstPipe !== -1 && /rowspan\s*=|class\s*=|colspan\s*=|style\s*=|data-sort/.test(s.slice(0, firstPipe))) {
    const attrs = s.slice(0, firstPipe)
    s = s.slice(firstPipe + 1)
    const rs = attrs.match(/rowspan\s*=\s*"?(\d+)"?/)
    const cs = attrs.match(/colspan\s*=\s*"?(\d+)"?/)
    if (rs) rowspan = parseInt(rs[1], 10)
    if (cs) colspan = parseInt(cs[1], 10)
  }
  return { value: s.trim(), rowspan, colspan }
}
function cleanBlueFlamesCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{bc\}\}/gi, '')
  s = s.replace(/\{\{Slot\|[^}]*\}\}/gi, '')
  s = s.replace(/\{\{def\|([^{}]*)\}\}/gi, 'DEF +$1')
  s = s.replace(/\{\{stat\|mending\|([^{}]*)\}\}/gi, 'Mending +$1')
  s = s.replace(/\{\{stat\|damage\}\}/gi, 'Damage')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/<br\s*\/?>/gi, ' ')
  s = s.replace(/\n/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s.trim()
}
async function syncTrialOfBlueFlames(): Promise<number> {
  const content = await getWikiContent(supabase, 'trial_of_blue_flames_list')
  const body = extractBlueFlamesTableBody(content)
  if (!body) throw new Error('trial_of_blue_flames: wikitable introuvable')
  const numCols = 7
  const rowBlocks = body.split(/\n\|-[^\n]*\n?/).filter(b => b.trim().length > 0)
  const active: ({ value: string; remaining: number } | null)[] = new Array(numCols).fill(null)
  const rows: any[] = []
  for (const block of rowBlocks) {
    const lines = splitBlueFlamesCellLines(block)
    let cellIdx = 0
    const resolved = new Array(numCols).fill('')
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
      const raw = lines[cellIdx]; cellIdx += 1
      if (raw === undefined) { col += 1; continue }
      const { value, rowspan, colspan } = parseBlueFlamesCellAttrs(raw)
      for (let k = 0; k < colspan; k++) {
        if (col + k >= numCols) break
        resolved[col + k] = value
        if (rowspan > 1) active[col + k] = { value, remaining: rowspan - 1 }
      }
      col += colspan
    }
    const trial = cleanBlueFlamesCell(resolved[0])
    if (!trial) continue
    rows.push({
      trial,
      dps: cleanBlueFlamesCell(resolved[1]) || null,
      total_damage: cleanBlueFlamesCell(resolved[2]) || null,
      reward_name: cleanBlueFlamesCell(resolved[3]) || null,
      reward_rarity: cleanBlueFlamesCell(resolved[4]) || null,
      fire_boost: cleanBlueFlamesCell(resolved[5]) || null,
      permanent_boost: cleanBlueFlamesCell(resolved[6]) || null,
    })
  }
  if (rows.length === 0) throw new Error('trial_of_blue_flames: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('trial_of_blue_flames').upsert(rows, { onConflict: 'trial' })
  if (error) throw new Error('trial_of_blue_flames upsert: ' + error.message)
  return rows.length
}

// ============================================================
// trials_of_fire -- système Rift "Campfire Badge" (distinct de trial_of_blue_flames
// / "Soul Campfire Badge" -- badges, stats et courbes de dégâts différents, deux
// vraies pages séparées, pas un doublon). 30 trials (I-XXX), DPS/dégâts totaux
// requis + récompense badge par rareté (bonus Health Regen fire/permanent).
// **Parseur dédié distinct de trial_of_blue_flames** : les cellules de données de
// la colonne Trial utilisent `!` (style en-tête) au lieu de `|` sur CETTE page
// précise (`!I`, `!II`... contre `|I`, `|II` chez blue_flames) -- une vraie
// différence de style wikitext entre deux pages structurellement similaires, pas
// une erreur de copie. Le split de cellules accepte donc `!` ET `|` comme
// marqueurs de début de cellule ; la limite de l'en-tête est déterminée en sautant
// exactement les 2 premiers blocs (groupe de colonnes + sous-en-têtes) plutôt que
// par une heuristique "commence par |" qui échouerait puisque TOUTES les lignes de
// données commencent par `!`. Vérifié en local (parse_trialsfire.js) : 30/30
// lignes, 0 markup résiduel, y compris la ligne transitionnelle XXI où
// permanent_boost casse le rowspan du groupe Scion un cran plus tôt que les autres
// colonnes (rowspan="7" sur 8 lignes) -- donnée réelle, pas un bug.
// ============================================================
function extractTrialsOfFireBody(text: string): string | null {
  const tableStart = text.indexOf('{|')
  const tableEnd = text.indexOf('|}', tableStart)
  if (tableStart === -1 || tableEnd === -1) return null
  const table = text.slice(tableStart, tableEnd)
  const blocks = table.split(/\n\|-[^\n]*\n?/)
  if (blocks.length < 3) return null
  return blocks.slice(2).join('\n|-\n')
}
function splitTrialsOfFireCellLines(block: string): string[] {
  const lines = block.split('\n')
  const cells: string[] = []
  let current: string | null = null
  for (const line of lines) {
    if (/^\|\}/.test(line)) continue
    if (/^[!|](?!-)/.test(line)) { if (current !== null) cells.push(current); current = line }
    else if (current !== null) current += '\n' + line
  }
  if (current !== null) cells.push(current)
  return cells
}
function parseTrialsOfFireCellAttrs(line: string): { value: string; rowspan: number; colspan: number } {
  let s = line.replace(/^[!|]/, '')
  let rowspan = 1, colspan = 1
  const firstPipe = s.indexOf('|')
  if (firstPipe !== -1 && /rowspan\s*=|class\s*=|colspan\s*=|style\s*=|data-sort/.test(s.slice(0, firstPipe))) {
    const attrs = s.slice(0, firstPipe)
    s = s.slice(firstPipe + 1)
    const rs = attrs.match(/rowspan\s*=\s*"?(\d+)"?/)
    const cs = attrs.match(/colspan\s*=\s*"?(\d+)"?/)
    if (rs) rowspan = parseInt(rs[1], 10)
    if (cs) colspan = parseInt(cs[1], 10)
  }
  return { value: s.trim(), rowspan, colspan }
}
function cleanTrialsOfFireCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{bc\}\}/gi, '')
  s = s.replace(/\{\{Slot\|[^}]*\}\}/gi, '')
  s = s.replace(/\{\{Stat\|hr\|([^{}]*)\}\}/gi, 'Health Regen $1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/'''/g, '')
  s = s.replace(/\n/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s.trim()
}
async function syncTrialsOfFire(): Promise<number> {
  const content = await getWikiContent(supabase, 'trials_of_fire_list')
  const body = extractTrialsOfFireBody(content)
  if (!body) throw new Error('trials_of_fire: wikitable introuvable')
  const numCols = 7
  const rowBlocks = body.split(/\n\|-[^\n]*\n?/).filter(b => b.trim().length > 0)
  const active: ({ value: string; remaining: number } | null)[] = new Array(numCols).fill(null)
  const rows: any[] = []
  for (const block of rowBlocks) {
    const lines = splitTrialsOfFireCellLines(block)
    let cellIdx = 0
    const resolved = new Array(numCols).fill('')
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
      const raw = lines[cellIdx]; cellIdx += 1
      if (raw === undefined) { col += 1; continue }
      const { value, rowspan, colspan } = parseTrialsOfFireCellAttrs(raw)
      for (let k = 0; k < colspan; k++) {
        if (col + k >= numCols) break
        resolved[col + k] = value
        if (rowspan > 1) active[col + k] = { value, remaining: rowspan - 1 }
      }
      col += colspan
    }
    const trial = cleanTrialsOfFireCell(resolved[0])
    if (!trial) continue
    rows.push({
      trial,
      dps: cleanTrialsOfFireCell(resolved[1]) || null,
      total_damage: cleanTrialsOfFireCell(resolved[2]) || null,
      reward_name: cleanTrialsOfFireCell(resolved[3]) || null,
      reward_rarity: cleanTrialsOfFireCell(resolved[4]) || null,
      fire_boost: cleanTrialsOfFireCell(resolved[5]) || null,
      permanent_boost: cleanTrialsOfFireCell(resolved[6]) || null,
    })
  }
  if (rows.length === 0) throw new Error('trials_of_fire: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('trials_of_fire').upsert(rows, { onConflict: 'trial' })
  if (error) throw new Error('trials_of_fire upsert: ' + error.message)
  return rows.length
}

// ============================================================
// fossil_chisels -- système Fossil Excavator (Fossil Research Center), jamais
// mappé. 2 wikitables réelles sur la même page fusionnées en une table : charges
// par rareté (4 paliers Common->Legendary) + recette d'upgrade/palier HotM requis
// (3 recettes, Chisel de base exclu car obtenu autrement, pas craft). Recette
// `{{DRL|...}}` (liste à puces `*`/`**`) aplatie en liste `;` des ingrédients
// (le `*` racine redondant avec le nom déjà en 1re colonne, ignoré). Vérifié en
// local (parse_chisels.js) : 4+3 lignes, 0 markup résiduel.
// ============================================================
function cleanFossilChiselCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{Slot\|[^}]*\}\}/gi, '')
  s = s.replace(/\{\{Yellow\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{ID\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{DRL\|([\s\S]*?)\}\}/gi, (_m, inner) => {
    const lines = inner.split('\n').map((l: string) => l.trim()).filter((l: string) => l.startsWith('**'))
    return lines.map((l: string) => l.replace(/^\*\*/, '').trim()).join('; ')
  })
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/\n/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s.trim()
}
async function syncFossilChisels(): Promise<number> {
  const content = await getWikiContent(supabase, 'chisels')
  const firstTableStart = content.indexOf('{|')
  const firstTableEnd = content.indexOf('|}', firstTableStart)
  if (firstTableStart === -1 || firstTableEnd === -1) throw new Error('fossil_chisels: 1re wikitable introuvable')
  const body1 = extractFirstWikitableBody(content)
  if (!body1) throw new Error('fossil_chisels: parsing de la 1re wikitable échoué')

  const body2 = extractFirstWikitableBody(content.slice(firstTableEnd + 2))
  if (!body2) throw new Error('fossil_chisels: 2e wikitable introuvable')

  const byName = new Map<string, any>()
  for (const r of parseRowspanTable(body1, 4)) {
    const name = cleanFossilChiselCell(r[1])
    if (!name) continue
    byName.set(name, {
      name,
      rarity: cleanFossilChiselCell(r[2]) || null,
      charges: cleanFossilChiselCell(r[3]) || null,
      recipe: null,
      hotm_requirement: null,
      obtaining: null,
    })
  }
  for (const r of parseRowspanTable(body2, 3)) {
    const name = cleanFossilChiselCell(r[0])
    if (!name || !byName.has(name)) continue
    const entry = byName.get(name)
    entry.recipe = cleanFossilChiselCell(r[1]) || null
    entry.hotm_requirement = cleanFossilChiselCell(r[2]) || null
  }
  if (byName.has('Chisel')) {
    byName.get('Chisel').obtaining = "Given by Dr. Stone on first talk, or purchased from Researcher Beryl (Fossil Research Center) for 5 Fossil Essence"
  }

  const rows = [...byName.values()]
  if (rows.length === 0) throw new Error('fossil_chisels: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('fossil_chisels').upsert(rows, { onConflict: 'name' })
  if (error) throw new Error('fossil_chisels upsert: ' + error.message)
  return rows.length
}

// ============================================================
// mob_modifiers -- glossaire des modificateurs de mob (Corrupted/Runic génériques,
// + 6 modificateurs Dungeon Mobs + 6 modificateurs Watcher Undeads sur Catacombs
// F5+), jamais mappé. Page 100% prose/liste à puces, aucune wikitable -- extraction
// par section `== X ==` + regex sur les puces `* {{color|'''Nom'''}}: description`
// (2 styles de nesting template rencontrés, `Healing` inverse l'ordre
// `'''{{color|Nom}}'''` -- les deux gérés). **Piège de source confirmé une 2e fois
// le même jour** : cette clé existe sous DEUX sources (`hypixelskyblock_wiki` ET
// `fandom_wiki` périmée) -- `getWikiContent` filtre déjà sur la bonne source,
// vérifié explicitement avant de coder cette fois (leçon du revert `ship_parts`
// appliquée). "Stormy"/"Speedy"/"Healthy" apparaissent dans les deux groupes
// Dungeon/Watcher avec des effets différents -- gardés comme entrées séparées
// (clé unique name+category, pas juste name). Vérifié en local
// (parse_mobmodifiers2.js) : 14/14 lignes, 0 markup résiduel.
// ============================================================
function cleanMobModifierText(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{Stat\|([a-zA-Z ]+)\|([^{}]*)\}\}/gi, '$1 $2')
  s = s.replace(/\{\{id\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{zone\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{PotionName\|([^{}]*)\}\}/gi, '$1 Potion')
  s = s.replace(/\{\{PotN\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{LI\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/'''/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s.trim()
}
function extractMobModifierBullets(content: string, sectionRegex: RegExp, category: string): { name: string; category: string; description: string }[] {
  const m = content.match(sectionRegex)
  if (!m) return []
  const lines = m[1].split('\n').filter(l => l.trim().startsWith('*'))
  const rows: { name: string; category: string; description: string }[] = []
  for (const line of lines) {
    let bm = line.match(/^\*\s*\{\{[A-Za-z]+\|'''([^']+)'''\}\}\s*:\s*(.+)$/)
    if (!bm) bm = line.match(/^\*'''\{\{[A-Za-z]+\|([^}]+)\}\}'''\s*:\s*(.+)$/)
    if (!bm) continue
    rows.push({ name: bm[1].trim(), category, description: cleanMobModifierText(bm[2]) })
  }
  return rows
}
async function syncMobModifiers(): Promise<number> {
  const content = await getWikiContent(supabase, 'mob_modifiers')
  const rows: any[] = []
  const corruptedM = content.match(/== Corrupted Modifier ==\n([\s\S]*?)(?=\n== )/)
  const runicM = content.match(/== Runic Modifier ==\n([\s\S]*?)(?=\n== )/)
  if (corruptedM) rows.push({ name: 'Corrupted', category: 'general', description: cleanMobModifierText(corruptedM[1]) })
  if (runicM) rows.push({ name: 'Runic', category: 'general', description: cleanMobModifierText(runicM[1]) })
  rows.push(...extractMobModifierBullets(content, /== Dungeon Mobs Modifiers ==\n([\s\S]*?)(?=\n== )/, 'dungeon'))
  rows.push(...extractMobModifierBullets(content, /== The Watcher Undeads Modifiers ==\n([\s\S]*?)(?=\n== )/, 'watcher_undead'))

  if (rows.length === 0) throw new Error('mob_modifiers: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('mob_modifiers').upsert(rows, { onConflict: 'name,category' })
  if (error) throw new Error('mob_modifiers upsert: ' + error.message)
  return rows.length
}

// ============================================================
// griffin_burrows_loot -- treasure loot du minigame Griffin Burrows par palier de
// spade (Ancestral/Archaic/Deific), jamais mappé. 3 pages réelles distinctes
// (`Griffin Burrows/Item Loot/<Tier>`), structure standard rowspan (réutilise le
// parseur partagé, pas de parseur dédié nécessaire ici) -- 6/9/11 lignes selon le
// tier, total_weight extrait du `<span title="Total Weight: N">` d'en-tête. Vérifié
// en local (parse_griffin.js) : 6/6 sur Ancestral (échantillon testé), 0 markup
// résiduel, robuste à une ligne vide parasite avant un `|-` rencontrée dans le
// wikitext source (n'affecte pas le split, juste du whitespace trim).
// ============================================================
const GRIFFIN_SPADE_TIERS: { tier: string; wikiKey: string }[] = [
  { tier: 'Ancestral', wikiKey: 'griffin_burrows_item_loot_ancestral_spade' },
  { tier: 'Archaic', wikiKey: 'griffin_burrows_item_loot_archaic_spade' },
  { tier: 'Deific', wikiKey: 'griffin_burrows_item_loot_deific_spade' },
]
function cleanGriffinBurrowCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{bc\}\}/gi, '')
  s = s.replace(/\{\{Slot\|[^}]*\}\}/gi, '')
  s = s.replace(/\{\{c\|([^{}]*)\}\}/gi, '$1 coins')
  s = s.replace(/\{\{Chance\|([^|{}]*)\|[^{}]*\}\}/gi, '$1')
  s = s.replace(/\{\{Reforge\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/<span[^>]*>([^<]*)<\/span>/gi, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/\n/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s.trim()
}
async function syncGriffinBurrowsLoot(): Promise<number> {
  const rows: any[] = []
  for (const { tier, wikiKey } of GRIFFIN_SPADE_TIERS) {
    const content = await getWikiContent(supabase, wikiKey)
    const totalWeightM = content.match(/Total Weight:\s*([\d,]+)/)
    const totalWeight = totalWeightM ? totalWeightM[1] : null
    const body = extractFirstWikitableBody(content)
    if (!body) continue
    for (const r of parseRowspanTable(body, 6)) {
      const item = cleanGriffinBurrowCell(r[1])
      if (!item) continue
      rows.push({
        spade_tier: tier,
        item,
        weight: cleanGriffinBurrowCell(r[2]) || null,
        total_weight: totalWeight,
        chance_per_treasure: cleanGriffinBurrowCell(r[3]) || null,
        chance_per_burrow_no_reforge: cleanGriffinBurrowCell(r[4]) || null,
        chance_per_burrow_erudite: cleanGriffinBurrowCell(r[5]) || null,
      })
    }
  }
  if (rows.length === 0) throw new Error('griffin_burrows_loot: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('griffin_burrows_loot').upsert(rows, { onConflict: 'spade_tier,item' })
  if (error) throw new Error('griffin_burrows_loot upsert: ' + error.message)
  return rows.length
}

// ============================================================
// mythological_creatures -- roster complet des mobs Mythological (Griffin Burrows,
// Mythological Ritual de Diana), jamais mappé. 6 onglets réels par rareté du
// Griffin Pet du joueur (Common->Mythic, roster qui double quasi à chaque palier :
// 2/4/6/8/10/12 mobs), chacun avec niveau/types/HP/dégâts/drop unique/shard/poids/
// chance. Connecté à `griffin_burrows_loot` (même minigame) et `mob_type_categories`
// (ces mobs portent tous le tag Mythological + d'autres catégories déjà mappées).
// **Bug de parsing réel trouvé et corrigé avant tout déploiement** (testé en local,
// parse_mythological2.js) : le `extractFirstWikitableBody` partagé (indexOf('|}')
// naïf) tombe dans un piège sur cette page précise -- la cellule Stats/Mob Types
// contient `{{List|...|}}` (template MediaWiki se terminant par un paramètre vide
// `|}}`), qui contient littéralement la sous-chaîne "|}" AVANT la vraie fermeture
// de la wikitable -- coupait le corps de table en plein milieu de la 1re ligne,
// perdant silencieusement la 2e ligne et toutes les colonnes après Mob Types.
// Corrigé par une extraction dédiée ligne-par-ligne (le `|}` de fermeture doit être
// SEUL sur sa ligne, convention MediaWiki réelle, jamais un substring nu) --
// **pas appliqué au parseur partagé** (risque de régression sur les tables déjà
// vérifiées qui n'ont jamais rencontré ce piège), gardé local à cette fonction.
// Alt-noms `{{MobSprite|Espèce;NomAffiché}}` : le nom affiché spécifique au palier
// (2e partie) préféré à l'espèce de base (1re partie) quand présent. Vérifié en
// local : 6/6 lignes sur l'échantillon 3-onglets testé (Common/Rare/Mythic), 0
// markup résiduel.
// ============================================================
function extractMythologicalTableBody(text: string): string | null {
  const lines = text.split('\n')
  let tableStartLine = -1, tableEndLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (tableStartLine === -1 && lines[i].trim().startsWith('{|')) { tableStartLine = i; continue }
    if (tableStartLine !== -1 && lines[i].trim() === '|}') { tableEndLine = i; break }
  }
  if (tableStartLine === -1 || tableEndLine === -1) return null
  const tableLines = lines.slice(tableStartLine, tableEndLine + 1)
  const blocks = tableLines.join('\n').split(/\n\|-\n?/)
  const dataStart = blocks.findIndex(b => b.trim().startsWith('|') && !b.trim().startsWith('!'))
  if (dataStart === -1) return null
  return blocks.slice(dataStart).join('\n|-\n')
}
function extractMythologicalMobCell(cell: string): { level: string | null; name: string | null } {
  cell = cell.replace(/^style="[^"]*"\s*\|\s*/, '')
  const lvM = cell.match(/\{\{Lv\|([^{}]*)\}\}/i)
  const level = lvM ? lvM[1].replace(/,/g, '') : null
  const spriteM = cell.match(/\{\{MobSprite\|([^{}]*)\}\}/i)
  let name: string | null = null
  if (spriteM) {
    const parts = spriteM[1].split(';')
    name = (parts.length > 1 ? parts[1] : parts[0]).trim()
  }
  return { level, name }
}
function extractMythologicalMobTypes(cell: string): string {
  const mts = [...cell.matchAll(/\{\{mt\|([^{}]*)\}\}/gi)]
  return mts.map(m => m[1].trim()).join('; ')
}
function extractMythologicalStats(cell: string): { health: string | null; damage: string | null } {
  const hp = cell.match(/\{\{Stat\|Health\|([^{}]*)\}\}/i)
  const dmg = cell.match(/\{\{Stat\|Damage\|([^{}]*)\}\}/i)
  return { health: hp ? hp[1].trim() : null, damage: dmg ? dmg[1].trim() : null }
}
function cleanMythologicalSimple(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{ID\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{RL\|([^{}]*)\}\}/gi, (_m, inner) => inner.split('|').join('; '))
  s = s.replace(/\{\{Chance\|([^|{}]*)\|[^{}]*\}\}/gi, '$1')
  s = s.replace(/\s+/g, ' ').trim()
  return s.trim()
}
function extractMythologicalShard(cell: string): string | null {
  const linkM = cell.match(/\[\[([^\]|]+)\|\{\{Yes/i)
  if (linkM) return linkM[1].trim()
  if (/\{\{Yes/i.test(cell)) return 'Yes'
  return null
}
async function syncMythologicalCreatures(): Promise<number> {
  const content = await getWikiContent(supabase, 'mythological_list')
  const tabRe = /\|-\|([A-Za-z]+)=/g
  const tabMatches = [...content.matchAll(tabRe)]
  if (tabMatches.length === 0) throw new Error('mythological_creatures: aucun onglet trouvé')
  const tabBounds = tabMatches.map((m, i) => ({
    tier: m[1],
    start: m.index!,
    end: i + 1 < tabMatches.length ? tabMatches[i + 1].index! : content.length,
  }))
  const rows: any[] = []
  for (const tb of tabBounds) {
    const chunk = content.slice(tb.start, tb.end)
    const totalWeightM = chunk.match(/Total ?Weight:\s*([\d,]+)/)
    const totalWeight = totalWeightM ? totalWeightM[1] : null
    const body = extractMythologicalTableBody(chunk)
    if (!body) continue
    for (const r of parseRowspanTable(body, 7)) {
      const { level, name } = extractMythologicalMobCell(r[0])
      if (!name) continue
      const { health, damage } = extractMythologicalStats(r[2])
      rows.push({
        pet_rarity_tier: tb.tier,
        level,
        mob_name: name,
        mob_types: extractMythologicalMobTypes(r[1]),
        health,
        damage,
        unique_drops: cleanMythologicalSimple(r[3]) || null,
        shard: extractMythologicalShard(r[4]),
        weight: cleanMythologicalSimple(r[5]) || null,
        total_weight: totalWeight,
        chance: cleanMythologicalSimple(r[6]) || null,
      })
    }
  }
  if (rows.length === 0) throw new Error('mythological_creatures: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('mythological_creatures').upsert(rows, { onConflict: 'pet_rarity_tier,mob_name' })
  if (error) throw new Error('mythological_creatures upsert: ' + error.message)
  return rows.length
}

// ============================================================
// wormhole_fishing_items -- bonus des 4 items Froggles (Silver/Golden/Diamond +
// Geometric Oddity) en pêchant dans un Wormhole (Lotus Atoll), jamais mappé.
// Connecté à trophy_frogs/wormhole_locations déjà réels (même minigame). Vérifié
// en local (parse_froggles.js) : 4/4 lignes, 0 markup résiduel.
// ============================================================
function cleanWormholeFishingCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{Slot\|[^}]*\}\}/gi, '')
  s = s.replace(/\{\{Stat\|tfc\|([^{}]*)\}\}/gi, 'Treasure Fishing Chance $1')
  s = s.replace(/\{\{Green\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Gold\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Aqua\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/<br\s*\/?>/gi, '; ')
  s = s.replace(/\n/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s.trim()
}
async function syncWormholeFishingItems(): Promise<number> {
  const content = await getWikiContent(supabase, 'wormhole')
  const body = extractFirstWikitableBody(content)
  if (!body) throw new Error('wormhole_fishing_items: wikitable introuvable')
  const rowBlocks = body.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
  const rows: any[] = []
  for (const block of rowBlocks) {
    const lines = block.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('|}'))
    if (lines.length < 3) continue
    const item = cleanWormholeFishingCell(lines[1].replace(/^\|/, ''))
    if (!item) continue
    rows.push({ item, effect: cleanWormholeFishingCell(lines[2].replace(/^\|/, '')) || null })
  }
  if (rows.length === 0) throw new Error('wormhole_fishing_items: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('wormhole_fishing_items').upsert(rows, { onConflict: 'item' })
  if (error) throw new Error('wormhole_fishing_items upsert: ' + error.message)
  return rows.length
}

// ============================================================
// museum_items -- catalogue complet des items donables au Museum, jamais mappé.
// Distinct de `museum_milestones` (paliers de récompense par XP totale) : ici,
// chaque ITEM individuel avec son XP propre et sa chaîne d'upgrade
// (`upgrade=Next Item`). 8 pages réelles `Museum/Items/<Catégorie>` (Combat/
// Dungeoneering/Farming/Fishing/Foraging/Hunting/Mining/Special), chacune une
// wikitable dont les lignes sont des invocations `{{MuseumItemRow|Name|xp=N|
// upgrade=X|category=Y|notes=Z}}` -- pas des cellules `|` classiques, donc aucun
// des parseurs de table partagés/dédiés déjà écrits cette session ne s'applique.
// **Piège de tokenisation réel identifié et géré avant tout code de production**
// (testé en local, parse_museum2.js, contre des lignes réelles tirées de
// `Museum/Items/Special`, la page la plus complexe) : certains arguments
// contiennent des templates/liens imbriqués avec leurs propres `|` internes
// (`image={{animate|A.png;B.png|40px|link=X}}`, `image=[[File:X.png|40px|
// link=Y]]`) -- un split naïf sur `|` casserait ces arguments en plein milieu.
// Tokenizer dédié qui ne split que les `|` à profondeur 0 (compte `{{`/`[[` et
// `}}`/`]]`). Le nom d'item est parfois donné en positionnel APRÈS des arguments
// nommés `link=`/`image=` (override d'affichage, ex: "Secret Bingo Card") --
// pris comme le DERNIER argument positionnel plutôt que le premier, qui gère
// aussi bien le cas simple à un seul positionnel que ces cas d'override.
// Category "Special" n'a presque jamais de champ `xp` (nombreux items cosmétiques/
// événementiels sans XP Museum) -- laissé `null` plutôt que supposé.
// ============================================================
const MUSEUM_ITEM_CATEGORIES: string[] = [
  'museum_items_combat', 'museum_items_dungeoneering', 'museum_items_farming',
  'museum_items_fishing', 'museum_items_foraging', 'museum_items_hunting',
  'museum_items_mining', 'museum_items_special',
]
function splitMuseumTemplateArgs(inner: string): string[] {
  const args: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2)
    if (two === '{{' || two === '[[') { depth++; current += two; i++; continue }
    if (two === '}}' || two === ']]') { depth--; current += two; i++; continue }
    if (inner[i] === '|' && depth === 0) { args.push(current); current = ''; continue }
    current += inner[i]
  }
  args.push(current)
  return args
}
function cleanMuseumText(s: string | null | undefined): string | null {
  s = (s || '').trim()
  if (!s) return null
  // certains templates ont plusieurs arguments dont un/des `key=value` avant la
  // vraie valeur affichée (ex: {{Rank|br=false|MVP++}} -> "MVP++") -- prendre le
  // DERNIER segment plutôt que tout le contenu après le 1er "|" (trouvé en
  // vérifiant le vrai résultat en prod : 58/982 lignes avaient un résidu
  // "br=false|" dans notes avant ce fix).
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, (_m, inner) => {
    const parts = inner.split('|')
    return parts[parts.length - 1]
  })
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/\s+/g, ' ').trim()
  return s || null
}
function parseMuseumItemRow(line: string): { name: string | null; xp: number | null; upgrade: string | null; category: string | null; notes: string | null } | null {
  const m = line.match(/^\{\{MuseumItemRow\|([\s\S]*)\}\}\s*$/)
  if (!m) return null
  const args = splitMuseumTemplateArgs(m[1])
  const named: Record<string, string> = {}
  const positional: string[] = []
  for (const arg of args) {
    const eq = arg.indexOf('=')
    if (eq !== -1 && /^[a-zA-Z_]+$/.test(arg.slice(0, eq).trim())) {
      named[arg.slice(0, eq).trim()] = arg.slice(eq + 1).trim()
    } else if (arg.trim()) {
      positional.push(arg.trim())
    }
  }
  const rawName = positional.length > 0 ? positional[positional.length - 1] : named.link || null
  return {
    name: cleanMuseumText(rawName),
    xp: named.xp ? parseInt(named.xp, 10) : null,
    upgrade: cleanMuseumText(named.upgrade),
    category: named.category || null,
    notes: cleanMuseumText(named.notes),
  }
}
async function syncMuseumItems(): Promise<number> {
  const rows: any[] = []
  for (const key of MUSEUM_ITEM_CATEGORIES) {
    const content = await getWikiContent(supabase, key)
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim()
      if (!line.startsWith('{{MuseumItemRow')) continue
      const parsed = parseMuseumItemRow(line)
      if (!parsed || !parsed.name || !parsed.category) continue
      rows.push({
        category: parsed.category,
        item_name: parsed.name,
        xp: parsed.xp,
        upgrade: parsed.upgrade,
        notes: parsed.notes,
      })
    }
  }
  if (rows.length === 0) throw new Error('museum_items: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('museum_items').upsert(rows, { onConflict: 'category,item_name' })
  if (error) throw new Error('museum_items upsert: ' + error.message)
  return rows.length
}

// ============================================================
// starlyn_prize_shop -- boutique Agatha (monnaie Starlyn Prize, récompense du
// Starlyn Contest sur Moonglade Marsh, équivalent Foraging de Jacob's Contest --
// confirmé réel mais jamais mappé dès la passe système du 1er août). 5 récompenses
// réelles (Fig/Mangrove Fortune 41-50, 2 paliers de cap Foraging, Shiniest).
// Cellules de la 1re colonne en style `!` (comme trials_of_fire/trial_of_blue_
// flames), même cell-splitter mixte `!`/`|`. Vérifié en local
// (parse_starlyn.js) : 5/5 lignes, 0 markup résiduel.
// ============================================================
function cleanStarlynCell(s: string): string {
  s = (s || '').replace(/^[!|]/, '').trim()
  s = s.replace(/\{\{Statname\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{Green\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{ID\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{RL\|([^{}]*)\}\}/gi, (_m, inner) => inner.split('|').join('; '))
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  s = s.replace(/\s+/g, ' ').trim()
  return s.trim()
}
function splitStarlynCellLines(block: string): string[] {
  const lines = block.split('\n')
  const cells: string[] = []
  let current: string | null = null
  for (const line of lines) {
    if (/^\|\}/.test(line)) continue
    if (/^[!|](?!-)/.test(line)) { if (current !== null) cells.push(current); current = line }
    else if (current !== null) current += '\n' + line
  }
  if (current !== null) cells.push(current)
  return cells
}
async function syncStarlynPrizeShop(): Promise<number> {
  const content = await getWikiContent(supabase, 'starlyn_prize')
  const tableStart = content.indexOf('{|')
  const tableEnd = content.indexOf('|}', tableStart)
  if (tableStart === -1 || tableEnd === -1) throw new Error('starlyn_prize_shop: wikitable introuvable')
  const table = content.slice(tableStart, tableEnd)
  const blocks = table.split(/\n\|-\n?/)
  const body = blocks.slice(1).join('\n|-\n')
  const rowBlocks = body.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
  const rows: any[] = []
  for (const block of rowBlocks) {
    const lines = splitStarlynCellLines(block)
    if (lines.length < 3) continue
    const name = cleanStarlynCell(lines[0])
    if (!name) continue
    rows.push({
      reward_name: name,
      requirement: cleanStarlynCell(lines[1]) || null,
      cost: cleanStarlynCell(lines[2]) || null,
    })
  }
  if (rows.length === 0) throw new Error('starlyn_prize_shop: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('starlyn_prize_shop').upsert(rows, { onConflict: 'reward_name' })
  if (error) throw new Error('starlyn_prize_shop upsert: ' + error.message)
  return rows.length
}

// ============================================================
// upgrade_fragments -- 7 fragments réels de craft d'items Dungeon endgame (drop
// Watcher Undead F7/M7, Arachne, ou achat NPC), jamais mappés. Chaque fragment
// débloque le craft d'un petit groupe d'items spécifiques (ex: Livid Fragment ->
// Shadow Assassin Armor/Cloak/Shadow Fury/Last Breath). Vérifié en local
// (parse_upgradefrag.js) : 7/7 lignes, 0 markup résiduel, gère une ligne `|-`
// finale vide avant le `|}` (filtrée, pas de ligne fantôme).
// ============================================================
function cleanUpgradeFragmentCell(s: string): string {
  s = (s || '').replace(/^\|/, '').trim()
  s = s.replace(/\{\{Slot\|[^}]*\}\}/gi, '')
  s = s.replace(/\{\{ID\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{NPCSprite\|([^{}|;]*)[^{}]*\}\}/g, '$1')
  s = s.replace(/\{\{MobSprite\|([^{}|;]*)[^{}]*\}\}/g, '$1')
  s = s.replace(/\{\{AN\|([^{}]*)\}\}/gi, '$1')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')
  return s.trim()
}
function cleanUpgradeFragmentList(s: string): string {
  s = (s || '').replace(/^\|/, '')
  const items = s.split('\n').map(l => l.trim()).filter(l => l.startsWith('*'))
  return items.map(l => cleanUpgradeFragmentCell(l.replace(/^\*/, ''))).filter(Boolean).join('; ')
}
async function syncUpgradeFragments(): Promise<number> {
  const content = await getWikiContent(supabase, 'upgrade_fragments')
  const body = extractFirstWikitableBody(content)
  if (!body) throw new Error('upgrade_fragments: wikitable introuvable')
  const rowBlocks = body.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
  const rows: any[] = []
  for (const block of rowBlocks) {
    const lines = block.split('\n')
    const cells: string[] = []
    let current: string | null = null
    for (const line of lines) {
      if (/^\|\}/.test(line)) continue
      if (/^\|(?!-)/.test(line)) { if (current !== null) cells.push(current); current = line }
      else if (current !== null) current += '\n' + line
    }
    if (current !== null) cells.push(current)
    if (cells.length < 4) continue
    const name = cleanUpgradeFragmentCell(cells[1])
    if (!name) continue
    rows.push({
      fragment_name: name,
      obtainment: cleanUpgradeFragmentCell(cells[2].split('\n')[0]) || null,
      applicable_items: cleanUpgradeFragmentList(cells[3]) || null,
    })
  }
  if (rows.length === 0) throw new Error('upgrade_fragments: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('upgrade_fragments').upsert(rows, { onConflict: 'fragment_name' })
  if (error) throw new Error('upgrade_fragments upsert: ' + error.message)
  return rows.length
}

// ============================================================
// odger_filleting_rewards -- Magmafish gagné par Trophy Fish filleté chez Odger,
// jamais mappé (17 poissons trophées, 4 paliers qualité Bronze/Silver/Gold/
// Diamond). Structure standard rowspan + caption `|+`, réutilise le parseur
// partagé sans modification (caption absorbée dans le bloc d'en-tête, jamais son
// propre bloc de ligne). Vérifié en local (parse_odger.js) : 3/3 sur l'échantillon
// testé, 0 markup résiduel.
// ============================================================
function cleanOdgerCell(s: string): string {
  s = (s || '').trim()
  s = s.replace(/\{\{Slot\|[^}]*\}\}/gi, '')
  s = s.replace(/\{\{[A-Za-z][A-Za-z ]*\|([^{}]*)\}\}/g, '$1')
  s = s.replace(/\{\{([A-Za-z ]+)\}\}/g, '$1')
  s = s.replace(/\s+/g, ' ').trim()
  return s.trim()
}
async function syncOdgerFilletingRewards(): Promise<number> {
  const content = await getWikiContent(supabase, 'odger_filleting_rewards')
  const body = extractFirstWikitableBody(content)
  if (!body) throw new Error('odger_filleting_rewards: wikitable introuvable')
  const rows = parseRowspanTable(body, 7)
    .map(r => ({
      fish_name: cleanOdgerCell(r[1]),
      rarity: cleanOdgerCell(r[2]) || null,
      magmafish_bronze: cleanOdgerCell(r[3]) || null,
      magmafish_silver: cleanOdgerCell(r[4]) || null,
      magmafish_gold: cleanOdgerCell(r[5]) || null,
      magmafish_diamond: cleanOdgerCell(r[6]) || null,
    }))
    .filter(r => r.fish_name)

  if (rows.length === 0) throw new Error('odger_filleting_rewards: 0 lignes extraites, parsing probablement cassé')
  const { error } = await supabase.from('odger_filleting_rewards').upsert(rows, { onConflict: 'fish_name' })
  if (error) throw new Error('odger_filleting_rewards upsert: ' + error.message)
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
    museum_milestones: syncMuseumMilestones,
    crop_fortune_sources: syncCropFortuneSources,
    skyblock_achievements: syncSkyblockAchievements,
    garden_mutations: syncGardenMutations,
    skyblock_quests: syncSkyblockQuests,
    location_details: syncLocationDetails,
    chocolate_rabbits: syncChocolateRabbits,
    sea_creature_pools: syncSeaCreaturePools,
    skyblock_level_rewards: syncSkyblockLevelRewards,
    bingo_goals_archive: syncBingoGoalsArchive,
    chocolate_factory_levels: syncChocolateFactoryLevels,
    dungeon_chest_combo_chances: syncDungeonChestComboChances,
    dungeon_class_milestones: syncDungeonClassMilestones,
    crystal_hollows_loot: syncCrystalHollowsLoot,
    treasure_fishing_loot: syncTreasureFishingLoot,
    zone_mob_stats: syncZoneMobStats,
    bits_shop_items: syncBitsShopItems,
    power_scroll_recipes: syncPowerScrollRecipes,
    fame_ranks: syncFameRanks,
    rod_parts: syncRodParts,
    composter_organic_matter: syncComposterOrganicMatter,
    skyblock_gems_pricing: syncSkyblockGemsPricing,
    rift_timecharms: syncRiftTimecharms,
    drop_chance_tiers: syncDropChanceTiers,
    milestone_reward_tiers: syncMilestoneRewardTiers,
    tree_gift_drops: syncTreeGiftDrops,
    trophy_frogs: syncTrophyFrogs,
    wormhole_locations: syncWormholeLocations,
    mob_type_categories: syncMobTypeCategories,
    trial_of_blue_flames: syncTrialOfBlueFlames,
    trials_of_fire: syncTrialsOfFire,
    fossil_chisels: syncFossilChisels,
    mob_modifiers: syncMobModifiers,
    griffin_burrows_loot: syncGriffinBurrowsLoot,
    mythological_creatures: syncMythologicalCreatures,
    wormhole_fishing_items: syncWormholeFishingItems,
    museum_items: syncMuseumItems,
    starlyn_prize_shop: syncStarlynPrizeShop,
    upgrade_fragments: syncUpgradeFragments,
    odger_filleting_rewards: syncOdgerFilletingRewards,
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
