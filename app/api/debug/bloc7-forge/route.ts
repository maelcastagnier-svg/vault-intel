// Temp debug route -- Bloc 7.5, parses the real HOTM Forge duration table
// already cached from the wiki (game_mechanics_misc.the_forge_table) into
// structured rows. Deleted after validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ROMAN_HOTM = new Set(['I','II','III','IV','V','VI','VII','VIII','IX','X'])

function parseDurationToSeconds(text: string): number | null {
  const dayM = text.match(/(\d+)\s*Days?/)
  const hourM = text.match(/(\d+)\s*Hours?/)
  const minM = text.match(/(\d+)\s*Minutes?/)
  const secM = text.match(/(\d+)\s*Seconds?/)
  if (!dayM && !hourM && !minM && !secM) return null
  let total = 0
  if (dayM) total += parseInt(dayM[1]) * 86400
  if (hourM) total += parseInt(hourM[1]) * 3600
  if (minM) total += parseInt(minM[1]) * 60
  if (secM) total += parseInt(secM[1])
  return total
}

type ForgeRow = { item_name: string; duration_seconds: number; duration_text: string; hotm_requirement: string | null; section: string }

function parseForgeTable(content: string): ForgeRow[] {
  const rows: ForgeRow[] = []
  // Sections separated by ==== Header ====
  const sections = content.split(/====\s*/).slice(1)
  for (const sectionBlock of sections) {
    const sectionName = sectionBlock.split(/\s*====/)[0].trim()
    const rowBlocks = sectionBlock.split('|-')
    let lastDuration: string | null = null
    let lastHotm: string | null = null
    for (const block of rowBlocks) {
      // Vrai nom d'item = premier [[Lien]], toujours identique au {{Slot|X}} juste avant.
      const nameMatch = block.match(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/)
      if (!nameMatch) continue
      const itemName = nameMatch[1].trim()

      const durMatch = block.match(/\|\s*((?:\d+\s*(?:Days?|Hours?|Minutes?|Seconds?)\s*)+)\n/)
      if (durMatch) lastDuration = durMatch[1].trim()
      const durationText = lastDuration
      const seconds = durationText ? parseDurationToSeconds(durationText) : null
      if (!durationText || seconds === null) continue // pas de duree trouvee -- pas invente, ligne ignoree

      // Roman numeral requirement -- cellule "rowspan" isolee sur sa propre ligne
      // (ex: "|rowspan=\"3\" |II\n") ou simple "|II\n".
      const hotmMatch = block.match(/\|\s*(?:rowspan="\d+"\s*\|)?\s*(I{1,3}|IV|V?I{0,3}|VI{1,3}|IX|X)\s*(?:<br|\n)/)
      if (hotmMatch && ROMAN_HOTM.has(hotmMatch[1])) lastHotm = hotmMatch[1]

      rows.push({ item_name: itemName, duration_seconds: seconds, duration_text: durationText, hotm_requirement: lastHotm, section: sectionName })
    }
  }
  return rows
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const doInsert = url.searchParams.get('insert') === '1'

  const { data } = await supabase.from('game_mechanics_misc').select('value').eq('key', 'the_forge_table').single()
  const content = (data?.value as any)?.content as string
  if (!content) return NextResponse.json({ error: 'the_forge_table not found in cache' }, { status: 404 })

  const rows = parseForgeTable(content)

  if (doInsert) {
    await supabase.from('hotm_forge_durations').delete().neq('item_name', '')
    for (let i = 0; i < rows.length; i += 100) {
      await supabase.from('hotm_forge_durations').insert(rows.slice(i, i + 100))
    }
  }

  return NextResponse.json({
    total_parsed: rows.length,
    sections: [...new Set(rows.map(r => r.section))],
    sample: rows.slice(0, 15),
    inserted: doInsert,
  })
}
