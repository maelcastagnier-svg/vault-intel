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

// tableBody = le texte entre le premier "|-" (fin d'en-tête) et le "|}" final exclus.
// numCols = nombre de colonnes logiques de la table (Icon/Name/... par ex).
// Retourne un tableau de lignes résolues (chaque colonne a toujours une valeur, héritée
// d'un rowspan actif si elle n'était pas déclarée sur cette ligne).
export function parseRowspanTable(tableBody: string, numCols: number): string[][] {
  const rowBlocks = tableBody.split(/\n\|-\n?/).filter(b => b.trim().length > 0)
  const rows: string[][] = []
  const active: Array<{ value: string; remaining: number } | null> = new Array(numCols).fill(null)

  for (const block of rowBlocks) {
    const lines = block.split('\n').filter(l => l.trim().startsWith('|') && !l.trim().startsWith('|}'))
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
  const tableEnd = text.lastIndexOf('|}')
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
