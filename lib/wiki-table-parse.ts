// lib/wiki-table-parse.ts
// Parseur générique de wikitable MediaWiki avec rowspan réel -- partagé par tous les
// crons "wiki-*-sync" du chantier Automatisation (2 août). Une cellule couverte par un
// rowspan actif est simplement absente du wikitext de sa ligne (convention MediaWiki) ;
// ce parseur suit l'état "span actif" par colonne plutôt que de supposer un nombre de
// cellules fixe par ligne -- seule façon fidèle de lire une vraie wikitable sans deviner
// quelle colonne a été omise.

// Une ligne de cellule est soit `|valeur`, soit `|attr1="x" attr2="y" |valeur` (les
// attributs contiennent toujours un signe = ; {{Template|arg}} ne matche jamais ce test
// car le texte avant le premier | dans ce cas est "{{Template" qui ne contient pas de =).
function parseCell(line: string): { value: string; span: number } {
  let s = line.replace(/^\|/, '')
  let span = 1
  const firstPipe = s.indexOf('|')
  if (firstPipe !== -1 && /rowspan\s*=|class\s*=|colspan\s*=|style\s*=|data-sort/.test(s.slice(0, firstPipe))) {
    const attrs = s.slice(0, firstPipe)
    s = s.slice(firstPipe + 1)
    const rs = attrs.match(/rowspan\s*=\s*"?(\d+)"?/)
    if (rs) span = parseInt(rs[1], 10)
  }
  return { value: s.trim(), span }
}

// Une cellule wikitext peut légitimement s'étendre sur plusieurs lignes (ex "Liquid: X\n
// Island: Y" dans une même cellule Categories) -- une ligne de continuation (qui ne
// commence pas par "|") appartient à la cellule "|"-préfixée précédente, pas une nouvelle
// cellule. Bug réel trouvé en construisant sea_creature_pools (4 août) : le découpage
// par ligne d'origine ("chaque ligne '|' = une cellule") ignorait silencieusement toute
// ligne de continuation sans "|" -- perdait la 2e moitié du contenu de la cellule
// (ex "Island: Basic" disparaissait de Categories), jamais détecté avant car les tables
// précédentes de ce chantier n'avaient par coïncidence aucune cellule multi-ligne réelle.
function splitCellLines(block: string): string[] {
  const lines = block.split('\n')
  const cells: string[] = []
  let current: string | null = null
  for (const line of lines) {
    if (/^\|\}/.test(line)) continue
    if (/^\|(?!-)/.test(line)) {
      if (current !== null) cells.push(current)
      current = line
    } else if (current !== null) {
      current += '\n' + line
    }
  }
  if (current !== null) cells.push(current)
  return cells
}

// tableBody = le texte entre le premier "|-" (fin d'en-tête) et le "|}" final exclus.
// numCols = nombre de colonnes logiques de la table (Icon/Name/... par ex).
// Retourne un tableau de lignes résolues (chaque colonne a toujours une valeur, héritée
// d'un rowspan actif si elle n'était pas déclarée sur cette ligne).
export function parseRowspanTable(tableBody: string, numCols: number): string[][] {
  const rowBlocks = tableBody.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
  const rows: string[][] = []
  const active: Array<{ value: string; remaining: number } | null> = new Array(numCols).fill(null)

  for (const block of rowBlocks) {
    const lines = splitCellLines(block)
    let cellIdx = 0
    const resolved: string[] = new Array(numCols).fill('')
    for (let col = 0; col < numCols; col++) {
      const a = active[col]
      if (a && a.remaining > 0) {
        resolved[col] = a.value
        a.remaining -= 1
        if (a.remaining === 0) active[col] = null
        continue
      }
      const raw = lines[cellIdx]
      cellIdx += 1
      if (raw === undefined) continue
      const { value, span } = parseCell(raw)
      resolved[col] = value
      if (span > 1) active[col] = { value, remaining: span - 1 }
    }
    rows.push(resolved)
  }
  return rows
}

// Extrait le contenu d'une wikitable (entre "{|" et "|}") en partant du texte après un
// en-tête de section, et retourne le corps prêt pour parseRowspanTable. Gère un en-tête
// sur plusieurs lignes "|-" (ex: rowspan="2"|Titre puis une 2e ligne de sous-colonnes) en
// sautant tous les blocs de tête dont la première ligne commence par "!" (une ligne de
// donnée réelle commence toujours par "|") -- ne suppose jamais un seul bloc d'en-tête.
export function extractFirstWikitableBody(text: string): string | null {
  const tableStart = text.indexOf('{|')
  // indexOf (pas lastIndexOf) à partir du début de la table : si le texte passé n'est
  // pas strictement borné à cette seule table (ex: reste de la page après elle), un
  // lastIndexOf() sur tout le texte capturerait le "|}" d'une AUTRE wikitable plus loin
  // et ferait fuiter des lignes non pertinentes -- bug réel trouvé en testant
  // wiki-garden-sync en local avant déploiement (2 août). Aucune des tables ciblées par
  // ce chantier n'a de wikitable imbriquée, donc le premier "|}" après "{|" est toujours
  // le bon.
  const tableEnd = text.indexOf('|}', tableStart)
  if (tableStart === -1 || tableEnd === -1) return null
  const table = text.slice(tableStart, tableEnd)
  const blocks = table.split(/\n\|-\n?/)
  const dataStart = blocks.findIndex(b => b.trim().startsWith('|'))
  if (dataStart === -1) return null
  return blocks.slice(dataStart).join('\n|-\n')
}

// Retire les liens/templates wiki les plus courants ([[X]], [[X|Y]], {{ID|X}},
// {{MobSprite|X}}, {{MobSprite|X;Y}}) pour ne garder que le nom lisible.
export function cleanWikiText(s: string): string {
  return s
    .replace(/\[\[File:[^\]]*\]\]/g, '')
    .replace(/\{\{(?:ID|MobSprite)\|([^};|]+)(?:;[^}|]*)?\}\}/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, '$1')
    .replace(/\{\{bc\}\}/gi, '')
    .trim()
}

// ============================================================
// Extraction générique B1 (Pluton, 11 août) -- "extraction brute de toutes les
// wikitables réelles" (0bis, correction Couche 2), distincte des parseurs ci-dessus
// (qui ciblent chacun UNE table connue à l'avance sur une page spécifique). Ici on ne
// sait rien de la page en amont : on trouve toutes les wikitables (y compris dans un
// <tabber>), on extrait leurs en-têtes réels, et on résout chaque ligne -- sans essayer
// de deviner à ce stade ce que chaque colonne représente sémantiquement (stat_name,
// rarity...). Ce mapping sémantique est une décision distincte, prise une fois par
// page/type de contenu (0bis point 1), pas ici. N'importe quelle valeur produite ici
// est nettoyée (templates résolus) mais reste un texte libre -- jamais typée en
// bonus_numeric à ce stade.

// Résout un template MediaWiki inline générique ({{Nom|arg1|...|argN}}) en gardant le
// dernier argument POSITIONNEL (jamais un argument nommé "cle=valeur", qui porte un
// attribut de style/tri, pas la valeur affichée) -- couvre {{Stat|X}}/{{Stat|X|Y}},
// {{Ref|X}}, {{Ench|X}}, {{AN|X}}, {{ID|X}}, {{Coll|X|Y}}, {{Green|X}}, {{zone|X}},
// {{NPCSprite|X}}, {{slot|X}}, {{si|X|Y}}, etc. sans lister chaque template un par un --
// bien plus robuste qu'une liste blanche vouée à toujours manquer un template. Un
// template sans argument positionnel ({{Legendary}}, {{Rare}}...) garde son nom, déjà
// la valeur affichée (badge de rareté). Nesting géré par réapplication jusqu'à
// stabilité : le motif ne contient aucune accolade imbriquée, donc le template le plus
// interne résout toujours en premier, exposant le suivant à l'itération d'après.
function resolveInlineTemplates(s: string): string {
  let out = s
  let prev: string
  do {
    prev = out
    out = out.replace(/\{\{([^{}|]+)((?:\|[^{}]*)?)\}\}/g, (_m, name: string, argsRaw: string) => {
      const args = argsRaw.split('|').slice(1).filter((a: string) => !/^\s*[a-zA-Z_][\w-]*\s*=/.test(a))
      const last = args.length > 0 ? args[args.length - 1].trim() : null
      return last || name.trim()
    })
  } while (out !== prev)
  return out
}

// Nettoyeur de cellule complet (headers ET données) pour l'extraction générique -- plus
// poussé que cleanWikiText ci-dessus (dédié aux parseurs de production existants, non
// modifié pour ne rien casser côté crons déjà en prod).
export function cleanWikiCell(s: string): string {
  let out = s.replace(/\[\[File:[^\]]*\]\]/gi, '')
  out = resolveInlineTemplates(out)
  out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, target: string, label?: string) => (label ?? target).trim())
  out = out.replace(/'''([^']*)'''/g, '$1').replace(/''([^']*)''/g, '$1')
  out = out.replace(/<br\s*\/?>/gi, '; ')
  out = out.replace(/<!--[\s\S]*?-->/g, '')
  out = out.replace(/\s+/g, ' ').trim()
  return out
}

function parseHeaderLine(rawAfterBang: string): string[] {
  const out: string[] = []
  for (const c of rawAfterBang.split('!!')) {
    let s = c
    const firstPipe = s.indexOf('|')
    if (firstPipe !== -1 && /=/.test(s.slice(0, firstPipe))) s = s.slice(firstPipe + 1)
    const cleaned = cleanWikiCell(s)
    if (cleaned.length > 0) out.push(cleaned)
  }
  return out
}

export type LocatedWikitable = {
  headers: string[]
  bodyText: string
  startIndex: number
  endIndex: number
}

// Trouve TOUTES les wikitables top-level ({| ... |}) d'un texte, dans l'ordre
// d'apparition, avec leurs en-têtes réels -- généralise extractFirstWikitableBody
// (qui ne retournait que la 1re table, sans ses en-têtes) pour le besoin de
// l'extraction brute. Même hypothèse déjà documentée sur extractFirstWikitableBody :
// aucune wikitable imbriquée sur les pages de ce wiki.
//
// Frontière en-tête/données décidée LIGNE PAR LIGNE (pas bloc-par-bloc découpé sur
// "|-") -- bug réel trouvé en testant contre "Attributes/List/Legendary" (11 août,
// avant tout déploiement) : cette page a ses lignes de données générées par un appel de
// template répété, concaténées DIRECTEMENT après la ligne d'en-tête, sans aucun "|-"
// entre les deux. Un découpage par bloc "|-" traitait alors tout le bloc (en-têtes +
// templates mélangés) comme un seul "bloc d'en-tête" faute de frontière "|-" repérable,
// laissant bodyText vide et 0 ligne extraite. Scanner ligne par ligne et arrêter la
// zone d'en-tête dès la première ligne qui n'est ni "!...", ni "|-", ni vide (que cette
// ligne commence par "|" ou par "{{...}}") résout ce cas sans casser le cas normal.
export function findAllWikitables(text: string): LocatedWikitable[] {
  const results: LocatedWikitable[] = []
  let searchFrom = 0
  while (true) {
    const tableStart = text.indexOf('{|', searchFrom)
    if (tableStart === -1) break
    const tableEnd = text.indexOf('|}', tableStart)
    if (tableEnd === -1) break
    const table = text.slice(tableStart, tableEnd)
    const lines = table.split('\n')
    const headerLines: string[] = []
    let bodyStartLineIdx = -1
    for (let li = 1; li < lines.length; li++) {
      const trimmed = lines[li].trim()
      // "|-" = séparateur de ligne ; "|+Légende" = légende de table (ex "|+Blocks" sur
      // la page Mining Speed, section Examples) -- ni l'un ni l'autre n'est une donnée
      // réelle ni un en-tête, les deux sont ignorés pour la frontière en-tête/données
      // (bug réel trouvé en testant : "|+Blocks" déclenchait à tort bodyStartLineIdx
      // avant même d'avoir lu les vrais "!Block"/"!Strength"/... qui suivent).
      if (trimmed === '' || trimmed === '|-' || trimmed.startsWith('|-') || trimmed.startsWith('|+')) continue
      if (/^!/.test(trimmed)) { headerLines.push(trimmed); continue }
      bodyStartLineIdx = li
      break
    }
    const headers = headerLines.flatMap(l => parseHeaderLine(l.replace(/^!/, '')))
    const bodyText = bodyStartLineIdx === -1 ? '' : lines.slice(bodyStartLineIdx).join('\n')
    results.push({ headers, bodyText, startIndex: tableStart, endIndex: tableEnd + 2 })
    searchFrom = tableEnd + 2
  }
  return results
}

function splitCellLinesSafe(block: string): string[] {
  const lines = block.split('\n')
  const cells: string[] = []
  let current: string | null = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\|\}/.test(trimmed)) continue
    if (/^!/.test(trimmed)) {
      // Ligne d'en-tête apparue AU MILIEU d'un bloc de données -- bug réel trouvé en
      // testant contre la page wiki "Mining Speed" (onglet Pets, 11 août) : un switch
      // d'en-tête "Pet"->"Pet Item" sans "|-" entre les deux (dernière ligne de donnée
      // du Glacite Golem Pet directement suivie de "!Pet Item\n!Rarity\n...\n!Source"
      // avant le prochain "|-"). Jamais une continuation de la cellule courante (sinon
      // ce texte d'en-tête contamine la dernière cellule réelle de la ligne précédente),
      // jamais non plus une nouvelle cellule de donnée : purement ignorée. Les lignes
      // suivant ce switch gardent les libellés du 1er en-tête (limitation acceptée --
      // rare, et les données elles-mêmes restent correctes, seul le libellé de colonne
      // devient approximatif pour ce sous-groupe de lignes).
      current = null
      continue
    }
    if (/^\|(?!-)/.test(trimmed)) {
      if (current !== null) cells.push(current)
      current = line
    } else if (current !== null) {
      current += '\n' + line
    }
  }
  if (current !== null) cells.push(current)
  return cells
}

function parseDataCell(line: string): { value: string; span: number } {
  let s = line.replace(/^\|/, '')
  let span = 1
  const firstPipe = s.indexOf('|')
  if (firstPipe !== -1 && /rowspan\s*=|class\s*=|colspan\s*=|style\s*=|data-sort/.test(s.slice(0, firstPipe))) {
    const attrs = s.slice(0, firstPipe)
    s = s.slice(firstPipe + 1)
    const rs = attrs.match(/rowspan\s*=\s*"?(\d+)"?/)
    if (rs) span = parseInt(rs[1], 10)
  }
  return { value: cleanWikiCell(s), span }
}

// Variante de parseRowspanTable pour l'extraction générique -- copie locale (ne modifie
// pas la fonction partagée déjà en prod) qui (a) nettoie les valeurs via cleanWikiCell
// et (b) protège contre le bug de switch d'en-tête mi-table décrit dans
// splitCellLinesSafe ci-dessus.
export function parseWikitableRows(bodyText: string, numCols: number): string[][] {
  const rowBlocks = bodyText.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
  const rows: string[][] = []
  const active: Array<{ value: string; remaining: number } | null> = new Array(numCols).fill(null)
  for (const block of rowBlocks) {
    const lines = splitCellLinesSafe(block)
    let cellIdx = 0
    const resolved: string[] = new Array(numCols).fill('')
    for (let col = 0; col < numCols; col++) {
      const a = active[col]
      if (a && a.remaining > 0) {
        resolved[col] = a.value
        a.remaining -= 1
        if (a.remaining === 0) active[col] = null
        continue
      }
      const raw = lines[cellIdx]
      cellIdx += 1
      if (raw === undefined) continue
      const { value, span } = parseDataCell(raw)
      resolved[col] = value
      if (span > 1) active[col] = { value, remaining: span - 1 }
    }
    // Un bloc de ligne composé uniquement de lignes "!..." (switch d'en-tête mi-table,
    // ex Mining Speed/Pets "Pet"->"Pet Item") ne produit aucune cellule "|" réelle --
    // splitCellLinesSafe l'ignore entièrement (voir ce commentaire plus haut), donc
    // `resolved` reste 100% vide pour ce bloc. Bug réel trouvé en testant : sans ce
    // filtre, une ligne fantôme entièrement vide ["","","",""] s'insérait à cet endroit
    // exact dans le résultat final. Une vraie ligne de donnée a toujours au moins une
    // cellule non vide -- filtrer sur ce critère est sûr.
    if (resolved.some(c => c.trim().length > 0)) rows.push(resolved)
  }
  return rows
}

function inferHeaders(bodyText: string): string[] {
  const firstBlock = bodyText.split(/\n\|-\n?/).find(b => b.trim().length > 0)
  if (!firstBlock) return []
  const cellCount = splitCellLinesSafe(firstBlock).length
  return Array.from({ length: cellCount }, (_, i) => `col_${i}`)
}

// 4e format réel trouvé en testant contre "Attributes/List/Legendary" (11 août, avant
// tout déploiement) : une wikitable dont chaque LIGNE est générée par un appel de
// template répété ({{Attribute Table Entry|id=...|shard=...|...}}, un appel par ligne,
// concaténés directement après l'en-tête, JAMAIS séparés par "|-") -- ni
// parseWikitableRows (aucune cellule "|" à trouver, dataStart ne matche jamais, 0 ligne
// silencieusement) ni parseMobDropsTable (nom de template différent, un seul appel par
// page pas un par ligne) ne couvrent ce cas. Générique sur le nom du template (jamais
// vu à l'avance) : chaque {{X|param=valeur|...}} devient une ligne, en-têtes = noms de
// paramètres réels de CET appel (pas ceux de la wikitable englobante, qui peuvent inclure
// des colonnes calculées côté wiki par un module Lua et absentes du wikitext lui-même,
// ex "Slot"/"Category" sur cette même page -- jamais inventées ici).
export function parseGenericTemplateRows(bodyText: string): Array<{ templateName: string; headers: string[]; cells: string[] }> {
  const rows: Array<{ templateName: string; headers: string[]; cells: string[] }> = []
  let i = 0
  while (true) {
    const start = bodyText.indexOf('{{', i)
    if (start === -1) break
    let depth = 0
    let end = -1
    for (let j = start; j < bodyText.length - 1; j++) {
      if (bodyText[j] === '{' && bodyText[j + 1] === '{') { depth++; j++; continue }
      if (bodyText[j] === '}' && bodyText[j + 1] === '}') { depth--; j++; if (depth === 0) { end = j + 1; break } }
    }
    if (end === -1) break
    const raw = bodyText.slice(start + 2, end - 2)
    const pipeIdx = raw.indexOf('|')
    const templateName = (pipeIdx === -1 ? raw : raw.slice(0, pipeIdx)).trim()
    const inner = pipeIdx === -1 ? '' : raw.slice(pipeIdx)
    const paramRe = /\|\s*([a-zA-Z_][\w]*)\s*=/g
    const matches: Array<{ name: string; matchStart: number; valueStart: number }> = []
    let m: RegExpExecArray | null
    while ((m = paramRe.exec(inner)) !== null) matches.push({ name: m[1], matchStart: m.index, valueStart: m.index + m[0].length })
    if (matches.length > 0) {
      const headers: string[] = []
      const cells: string[] = []
      for (let k = 0; k < matches.length; k++) {
        const valueEnd = k + 1 < matches.length ? matches[k + 1].matchStart : inner.length
        headers.push(matches[k].name)
        cells.push(cleanWikiCell(inner.slice(matches[k].valueStart, valueEnd)))
      }
      rows.push({ templateName, headers, cells })
    }
    i = end
  }
  return rows
}

function findHeadingBreakpoints(text: string): Array<{ pos: number; heading: string }> {
  const breakpoints: Array<{ pos: number; heading: string }> = []
  const re = /^={2,4}\s*(.+?)\s*={2,4}\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    breakpoints.push({ pos: m.index, heading: cleanWikiCell(m[1]) })
  }
  return breakpoints
}

function headingAt(breakpoints: Array<{ pos: number; heading: string }>, pos: number): string | null {
  let current: string | null = null
  for (const bp of breakpoints) {
    if (bp.pos > pos) break
    current = bp.heading
  }
  return current
}

export type LocatedTabberBlock = { start: number; end: number; inner: string }

export function findTabberBlocks(text: string): LocatedTabberBlock[] {
  const blocks: LocatedTabberBlock[] = []
  let searchFrom = 0
  while (true) {
    const start = text.indexOf('<tabber>', searchFrom)
    if (start === -1) break
    const end = text.indexOf('</tabber>', start)
    if (end === -1) break
    const inner = text.slice(start + '<tabber>'.length, end)
    blocks.push({ start, end: end + '</tabber>'.length, inner })
    searchFrom = end + '</tabber>'.length
  }
  return blocks
}

// Onglets séparés par une ligne "|-|Nom=" (convention <tabber> de ce wiki -- jamais
// confondue avec un séparateur de ligne de wikitable "|-" seul).
export function splitTabberSections(inner: string): Array<{ tabName: string; body: string }> {
  const parts = inner.split(/\n?\|-\|\s*([^=\n]+?)\s*=\n?/)
  const sections: Array<{ tabName: string; body: string }> = []
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ tabName: parts[i].trim(), body: parts[i + 1] ?? '' })
  }
  return sections
}

export type ExtractedTableRow = {
  sectionHeading: string | null
  tabName: string | null
  tableIndex: number
  rowIndex: number
  headers: string[]
  cells: string[]
  extractionMethod: 'wikitable' | 'tabber_wikitable' | 'templated_row'
}

// Résout les lignes d'UNE wikitable localisée, avec fallback générique quand les
// lignes sont générées par template répété (voir parseGenericTemplateRows ci-dessus).
//
// Signal de bascule : AUCUN vrai séparateur de ligne "|-" dans tout le corps (0 ou 1
// bloc réel) ET ≥2 appels de template trouvés -- pas juste "≥2 appels de template"
// seul. Bug réel trouvé en testant : ce 2e critère à lui seul faisait régresser Mining
// Speed/Pets (11 lignes -> 2, Mole/Bejeweled Collar disparus), parce que des templates
// inline anodins dans une cellule normale (ex {{Stat|Mining Speed|icononly=true|+25}})
// contiennent eux aussi un argument nommé ("icononly=true") et matchaient donc le même
// motif de détection, faisant passer à tort une vraie table à cellules "|" (11 vraies
// lignes réparties par "|-") sur le mauvais chemin. Sur "Attributes/List/Legendary" en
// revanche, le corps entier est UN seul bloc (aucun "|-" nulle part, 48 appels de
// template collés bout à bout) : c'est cette absence de séparateur, pas le simple
// comptage de templates, qui distingue fiablement les deux cas. Un vrai wikitable à
// cellules "|" ne contient jamais 2+ blocs de template multi-lignes utilisés comme
// MÉCANISME de ligne SANS le moindre "|-" du tout entre eux.
function rowsForLocatedTable(t: LocatedWikitable): { headers: string[]; rows: string[][]; method: 'wikitable' | 'templated_row' }[] {
  const realRowBlockCount = t.bodyText.split(/\n\|-\n?/).filter(b => b.trim().length > 0).length
  const templatedFirst = realRowBlockCount <= 1 && t.bodyText.includes('{{') ? parseGenericTemplateRows(t.bodyText) : []
  const headers = t.headers.length > 0 ? t.headers : inferHeaders(t.bodyText)
  if (templatedFirst.length < 2 && headers.length > 0) {
    const rows = parseWikitableRows(t.bodyText, headers.length)
    if (rows.length > 0) return [{ headers, rows, method: 'wikitable' }]
  }
  if (templatedFirst.length > 0) {
    // Regroupe par nom de template (en-têtes potentiellement différents d'un appel à
    // l'autre -- paramètres optionnels -- donc un groupe logique par forme d'en-tête,
    // pas une seule table forcée à une largeur fixe).
    const byShape = new Map<string, { headers: string[]; rows: string[][] }>()
    for (const r of templatedFirst) {
      const key = r.templateName + '::' + r.headers.join(',')
      if (!byShape.has(key)) byShape.set(key, { headers: r.headers, rows: [] })
      byShape.get(key)!.rows.push(r.cells)
    }
    return Array.from(byShape.values()).map(v => ({ headers: v.headers, rows: v.rows, method: 'templated_row' as const }))
  }
  return []
}

// Orchestrateur principal de l'extraction brute B1 : toutes les wikitables d'une page
// (dans un <tabber> ou non), avec leur section/onglet d'origine et leurs en-têtes réels.
export function extractStructuredTables(content: string): ExtractedTableRow[] {
  const out: ExtractedTableRow[] = []
  const breakpoints = findHeadingBreakpoints(content)
  const tabberBlocks = findTabberBlocks(content)
  const isInsideTabber = (pos: number) => tabberBlocks.some(tb => pos >= tb.start && pos < tb.end)

  // 1) Tables à l'intérieur d'un <tabber>, par onglet.
  for (const tb of tabberBlocks) {
    const heading = headingAt(breakpoints, tb.start)
    for (const sec of splitTabberSections(tb.inner)) {
      let tableIndex = 0
      for (const t of findAllWikitables(sec.body)) {
        for (const group of rowsForLocatedTable(t)) {
          group.rows.forEach((cells, rowIndex) => {
            const method = group.method === 'templated_row' ? 'templated_row' : 'tabber_wikitable'
            out.push({ sectionHeading: heading, tabName: sec.tabName, tableIndex, rowIndex, headers: group.headers, cells, extractionMethod: method })
          })
        }
        tableIndex++
      }
    }
  }

  // 2) Tables hors <tabber> -- on rescanne le texte COMPLET (positions non décalées) et
  // on ignore toute table déjà couverte par un <tabber> ci-dessus. Bug évité en écrivant
  // cette fonction : retirer d'abord le texte des <tabber> puis rescanner décale tous
  // les index et casse headingAt() -- rescanner le texte intact et filtrer par position
  // est la seule façon fiable de garder les deux passes cohérentes entre elles.
  let tableIndex = 0
  for (const t of findAllWikitables(content)) {
    if (isInsideTabber(t.startIndex)) continue
    const heading = headingAt(breakpoints, t.startIndex)
    for (const group of rowsForLocatedTable(t)) {
      group.rows.forEach((cells, rowIndex) => {
        out.push({ sectionHeading: heading, tabName: null, tableIndex, rowIndex, headers: group.headers, cells, extractionMethod: group.method })
      })
    }
    tableIndex++
  }

  return out
}

export type MobDropsRow = {
  slotLabel: string
  headers: string[]
  cells: string[]
}

// Parseur dédié du template {{Mob Drops Table|...}} -- syntaxe de paramètres nommés
// MediaWiki, PAS une wikitable {|...|} (confirmé en lisant le wikitext réel de la page
// "Beetle", 11 août) : findAllWikitables/parseWikitableRows ne s'appliquent pas ici,
// d'où un parseur séparé plutôt qu'une variante du même code.
export function parseMobDropsTable(content: string): MobDropsRow[] | null {
  const start = content.indexOf('{{Mob Drops Table')
  if (start === -1) return null
  // Fin du template trouvée en suivant la profondeur d'accolades -- un paramètre peut
  // lui-même contenir un template imbriqué (ex {{si|Farming Fortune|18}} dans "count"),
  // donc on ne peut pas chercher le premier "}}" venu (même piège déjà documenté sur
  // extractFirstWikitableBody plus haut dans ce fichier, pour une raison différente).
  let depth = 0
  let end = -1
  for (let i = start; i < content.length - 1; i++) {
    if (content[i] === '{' && content[i + 1] === '{') { depth++; i++; continue }
    if (content[i] === '}' && content[i + 1] === '}') { depth--; i++; if (depth === 0) { end = i + 1; break } }
  }
  if (end === -1) return null
  const inner = content.slice(start + '{{Mob Drops Table'.length, end - 2)
  // Un paramètre est délimité par "|nom=" en tête -- jamais un split naïf sur tout "|",
  // qui casserait sur les "|" internes aux templates imbriqués (ex {{ID|X}} dans un nom
  // de drop).
  const paramRe = /\|\s*([a-zA-Z_][\w]*)\s*=/g
  const matches: Array<{ name: string; matchStart: number; valueStart: number }> = []
  let m: RegExpExecArray | null
  while ((m = paramRe.exec(inner)) !== null) {
    matches.push({ name: m[1], matchStart: m.index, valueStart: m.index + m[0].length })
  }
  const params: Record<string, string> = {}
  for (let i = 0; i < matches.length; i++) {
    const valueEnd = i + 1 < matches.length ? matches[i + 1].matchStart : inner.length
    params[matches[i].name] = cleanWikiCell(inner.slice(matches[i].valueStart, valueEnd))
  }

  const rows: MobDropsRow[] = []
  const baseHeaders = ['coins', 'exp', 'farming_xp', 'level']
  const baseCells = baseHeaders.map(h => params[h] ?? '')
  if (baseCells.some(v => v.length > 0)) rows.push({ slotLabel: 'base', headers: baseHeaders, cells: baseCells })

  const dropHeaders = ['drop', 'count', 'rarity', 'chance', 'notes']
  for (let n = 1; n <= 30; n++) {
    const suffix = n === 1 ? '' : String(n)
    if (!(`drop${suffix}` in params)) continue
    const cells = dropHeaders.map(h => params[`${h}${suffix}`] ?? '')
    rows.push({ slotLabel: `drop${n}`, headers: dropHeaders, cells })
  }
  return rows
}
