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

interface ForgeRow { item_name: string; duration_seconds: number; duration_text: string; hotm_requirement: string | null }

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
  return insertRows.length
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
