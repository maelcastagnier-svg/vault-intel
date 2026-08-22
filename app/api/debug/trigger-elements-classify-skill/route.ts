// Route de debug TEMPORAIRE -- Phase 1 du plan "reconnexion classification/
// calculateurs" (21 aout). Tague pluton_elements.activity (actuellement 0/
// 49628 lignes element_type='item' renseignees) avec le skill Hypixel
// Skyblock reel auquel l'item appartient -- meme pattern Haiku que les
// routes de classification originales (callHaikuClassify dans
// app/api/cron/pluton-weekly-sync/route.ts), batch=25, cache_control sur le
// system prompt, sortie structuree minimale (pas de champ "reason" long,
// contrairement a la classification element_type/tier -- ici juste
// {index, skill} pour minimiser le cout, deja pres du budget restant).
//
// Resumable par construction : filtre WHERE element_type='item' AND
// activity IS NULL, paginee (pas de .select() sans .range(), meme piege de
// troncature ~1000 lignes deja documente ailleurs sur ce projet) -- chaque
// invocation traite ce qui reste, jamais besoin d'un watermark separe.
// A supprimer apres la classification complete (meme pattern que les 3
// routes -ref/-wte/-whe, supprimees le 17 aout apres usage).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const maxDuration = 280

const SKILLS = ['mining', 'farming', 'foraging', 'fishing', 'combat', 'dungeoneering', 'enchanting', 'alchemy', 'carpentry', 'runecrafting', 'hunting', 'social', 'taming'] as const

const SYSTEM_PROMPT = `Tu classes des items Hypixel Skyblock par SKILL. Pour chaque item (nom + raison de classification + table source), determine a quel skill Hypixel Skyblock il appartient PRINCIPALEMENT :
${SKILLS.join(', ')}.

Regles strictes :
- Si l'item est clairement lie a UN skill (ex: une canne a peche -> fishing, une gemme brute -> mining, une arme Slayer -> combat, une piece d'armure de donjon -> dungeoneering), retourne ce skill.
- Si l'item est generique/cross-skill (accessoire universel, cosmetique, item de menu/UI, materiau vanilla basique sans lien skill specifique, monnaie/devise generale) OU si l'info donnee est trop ambigue/insuffisante pour trancher, retourne "none" -- NE JAMAIS deviner un skill au hasard.
- Attribute Shards (Hunting) -> "hunting". Items Kuudra/Crimson Isle -> "combat". Pieces de donjon (Catacombs) -> "dungeoneering". Petes/mobs de Bestiary -> "combat".
- Reponds pour CHAQUE index fourni, dans l'ordre, sans exception.`

const SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          skill: { type: 'string', enum: [...SKILLS, 'none'] },
        },
        required: ['index', 'skill'],
        additionalProperties: false,
      },
    },
  },
  required: ['classifications'],
  additionalProperties: false,
}

async function callHaiku(items: Array<{ index: number; text: string }>) {
  const userContent = items.map(i => `[${i.index}] ${i.text}`).join('\n---\n')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    }),
  })
  if (!res.ok) throw new Error(`Haiku classify-skill ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const parsed = JSON.parse(data?.content?.[0]?.text ?? '{}')
  return {
    classifications: (parsed.classifications ?? []) as Array<{ index: number; skill: string }>,
    inputTokens: data?.usage?.input_tokens ?? 0,
    outputTokens: data?.usage?.output_tokens ?? 0,
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const rowLimit = Number(url.searchParams.get('limit')) || undefined
  const deadline = Date.now() + 260_000

  try {
    // Pagine explicitement (piege de troncature ~1000 lignes PostgREST deja
    // documente sur ce projet) jusqu'a rowLimit (mode test) ou epuisement.
    const rows: Array<{ id: number; element_name: string; source_table: string | null; classification_reason: string | null }> = []
    for (let offset = 0; ; offset += 1000) {
      let q = supabase.from('pluton_elements')
        .select('id, element_name, source_table, classification_reason')
        .eq('element_type', 'item')
        .is('activity', null)
        .order('id', { ascending: true })
        .range(offset, offset + 999)
      const { data } = await q
      if (!data || data.length === 0) break
      rows.push(...data)
      if (rowLimit && rows.length >= rowLimit) break
      if (data.length < 1000) break
    }
    const targetRows = rowLimit ? rows.slice(0, rowLimit) : rows

    let processed = 0
    let costUsd = 0
    const skillCounts: Record<string, number> = {}

    for (let i = 0; i < targetRows.length && Date.now() < deadline; i += 25) {
      const batch = targetRows.slice(i, i + 25)
      const items = batch.map((r, idx) => ({
        index: idx,
        text: `${r.element_name ?? '?'} -- ${r.classification_reason ?? 'sans raison'} (source: ${r.source_table ?? '?'})`,
      }))
      const { classifications, inputTokens, outputTokens } = await callHaiku(items)
      costUsd += (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0

      const bySkill = new Map<string, number[]>()
      for (const c of classifications) {
        const row = batch[c.index]
        if (!row) continue
        const skill = c.skill === 'none' ? null : c.skill
        skillCounts[c.skill] = (skillCounts[c.skill] || 0) + 1
        if (skill) {
          if (!bySkill.has(skill)) bySkill.set(skill, [])
          bySkill.get(skill)!.push(row.id)
        }
      }
      for (const [skill, ids] of bySkill) {
        await supabase.from('pluton_elements').update({ activity: skill }).in('id', ids)
      }
      // Marque aussi les "none" pour ne jamais les re-scanner (activity
      // reste NULL sinon la requete residuelle les reprend a l'infini) --
      // utilise une valeur sentinelle distincte de NULL.
      const noneIds = classifications.filter(c => c.skill === 'none').map(c => batch[c.index]?.id).filter(Boolean) as number[]
      if (noneIds.length > 0) await supabase.from('pluton_elements').update({ activity: '__none__' }).in('id', noneIds)

      processed += batch.length
    }

    return NextResponse.json({
      success: true,
      processed,
      remaining_estimate: targetRows.length - processed,
      cost_usd: costUsd,
      skill_distribution: skillCounts,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
