// lib/pluton-money-making-bridge.ts
// Pont Pluton -> Money Making (27 aout, apres-midi ; FUSIONNE avec le flux
// live le 1er sept sous autorisation explicite de l'utilisateur -- "full
// autonomie, tu as tous les droits, aucune manutention de ma part") --
// ferme le trou le plus grave identifie par l'audit general du 27 aout :
// Money Making tournait integralement sur un agent Claude qui INVENTE ses
// coins/h par raisonnement LLM (app/api/cron/money-making-agent/route.ts),
// sans jamais consulter pluton_rankings -- des semaines de calcul reel (10
// activites, ~5000 combos, formules sourcees wiki/Supabase) totalement
// invisibles pour le produit.
//
// Fonction 100% DETERMINISTE -- AUCUN appel LLM. Pluton a deja calcule les
// vrais coins/h ; il n'y a rien a "raisonner" de plus, juste a lire et
// formater (coherent avec la memoire feedback_budget_api_claude : jamais
// d'appel API pour un travail que Claude Code peut faire directement).
//
// **1er septembre -- fusion reelle avec le flux live** : ecrit desormais
// directement dans `claude_analysis` section `money_making_<tier>` (la
// section reellement lue par app/api/market-data/route.ts et servie aux
// utilisateurs Pro+/Elite), plus dans une section separee de secours.
// L'ancien contenu LLM est archive dans `claude_memory` avant chaque
// ecrasement (aucune perte). Les crons `money-making-agent`/`setup-
// generate-agent` sont desactives dans vercel.json (route conservee,
// reactivable) pour qu'ils n'ecrasent plus ce resultat le lundi suivant.
//
// **Bug reel decouvert en verifiant AVANT la fusion** : `claude_analysis.
// section` etait varchar(20) -- `money_making_intermediate` et `money_
// making_professional` (26 caracteres chacun) depassaient cette limite et
// echouaient silencieusement depuis la migration au systeme 7-tiers (meme
// classe de bug que pmm_<tier> corrige le 27 aout). Confirme empiriquement
// (aucune ligne pour ces 2 tiers, seuls starter/master/l'ancien systeme
// 4-tiers avaient une ligne) -- corrige par migration
// `widen_claude_analysis_section_column` (varchar(20) -> varchar(40))
// AVANT toute ecriture ici. Les utilisateurs intermediate/professional
// recevaient 0 methode Money Making depuis des semaines, independamment
// de Pluton -- corrige au passage, pas invente.
//
// Format de sortie IDENTIQUE au schema deja produit par money-making-agent
// (voir buildPrompt() dans money-making-agent/route.ts, section "OUTPUT")
// -- { tier, comparison_summary, active: [...], vault: [] } -- verifie
// champ par champ contre components/MoneyMakingSection.tsx (id/method/
// skill/coins_display/why_best/confidence) avant la fusion.
//
// `vault` (Vault Exclusive, opportunites non-evidentes) reste
// volontairement vide : Pluton calcule des methodes reelles, il n'a pas de
// couche de "creativite" pour reperer des angles morts -- ce n'est pas un
// gap Pluton, c'est une nature de contenu differente (raisonnement humain/
// LLM), documente comme tel plutot que force.
//
// **Ecriture `method_setups` ajoutee dans la meme fonction** : sans ca,
// components/SetupOverlay.tsx (l'ecran "Equip this setup") aurait affiche
// "Setup not yet generated" sur 100% des methodes Pluton -- method_setups
// n'etait peuplee que par l'agent LLM hebdomadaire setup-generate-agent,
// avec des cles (method_key sur d'anciens noms invente, tier sur l'ancien
// systeme 4-tiers) qui ne correspondent a aucune methode Pluton. Chaque
// setup ecrit ici vient UNIQUEMENT de donnees Pluton deja calculees
// (pluton_setups.armor_set_prefix/tool_item_id/real_cost) -- jamais une
// valeur inventee, les champs sans donnee reelle sont omis (le composant
// gere deja "No armor/weapon for this method" proprement).
import { createClient } from '@supabase/supabase-js'
import { SEVEN_TIER_KEYS, type SevenTier } from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TOP_N_PER_TIER = 10

// Placeholders geres par nom -- ces identifiants n'existent pas en jeu,
// ce sont des marqueurs internes ecrits par les fichiers lib/pluton-*.ts
// de cette nuit pour les activites gear-independantes (craft pur). Jamais
// affiches comme un vrai outil/arme.
const TOOL_PLACEHOLDER_SUFFIXES = ['_NO_TOOL']
const ARMOR_PLACEHOLDER_PREFIX = 'Aucune'

function isRealTool(toolItemId: string | null): boolean {
  if (!toolItemId) return false
  return !TOOL_PLACEHOLDER_SUFFIXES.some(suf => toolItemId.endsWith(suf))
}
function isRealArmor(armorSetPrefix: string | null): boolean {
  if (!armorSetPrefix) return false
  return !armorSetPrefix.startsWith(ARMOR_PLACEHOLDER_PREFIX)
}
// Meme transformation EXACTE que components/MoneyMakingSection.tsx et
// app/api/setup/generate/route.ts -- doit matcher au caractere pres pour
// que la cle ecrite ici soit retrouvee par le frontend.
function methodKey(idOrMethod: string): string {
  return idOrMethod.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 80)
}

type RankingRow = {
  tier: string
  coins_per_hour_raw_block_only: number
  actions_per_hour: number
  target_block_id: number
  setup_id: number
}

export async function computeAndPersistPlutonMoneyMakingSections(): Promise<{ tier: string; methods: number }[]> {
  // Charge tout en 3 requetes batchees (pas de boucle par-tier avec un
  // aller-retour DB chacune -- meme discipline "batch" que le reste du
  // projet ce week-end).
  const { data: rankings } = await supabase
    .from('pluton_rankings')
    .select('tier, activity_key, coins_per_hour_raw_block_only, actions_per_hour, target_block_id, setup_id')
    .gt('coins_per_hour_raw_block_only', 0) // methodes economiquement negatives (deja documentees, ex Zombie Slayer) exclues d'une liste "money making"
    .is('bridge_exclude_reason', null) // artefacts TTK sous 1 tick moteur + cadence Kuudra boss-phase-only (1er sept) -- voir migration add_pluton_rankings_bridge_exclude_reason, colonne documentee, jamais invente
  if (!rankings || rankings.length === 0) throw new Error('pluton_rankings vide')

  const blockIds = Array.from(new Set(rankings.map(r => r.target_block_id)))
  const setupIds = Array.from(new Set(rankings.map(r => r.setup_id)))

  const chunks = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }

  const blockMap = new Map<number, { block_name: string; sell_item_id: string; activity_key: string }>()
  for (const batch of chunks(blockIds, 500)) {
    const { data } = await supabase.from('pluton_target_blocks').select('id, block_name, sell_item_id, activity_key').in('id', batch)
    for (const b of (data || [])) blockMap.set(b.id, b)
  }

  const setupMap = new Map<number, { armor_set_prefix: string | null; tool_item_id: string | null; real_cost: number }>()
  for (const batch of chunks(setupIds, 500)) {
    const { data } = await supabase.from('pluton_setups').select('id, armor_set_prefix, tool_item_id, real_cost').in('id', batch)
    for (const s of (data || [])) setupMap.set(s.id, s)
  }

  const results: { tier: string; methods: number }[] = []
  const methodSetupRows: { method_key: string; tier: string; setup: string; generated_at: string }[] = []

  for (const tier of SEVEN_TIER_KEYS) {
    const tierRows = (rankings as RankingRow[]).filter(r => r.tier === tier)

    // Meilleure methode par activite (evite qu'une seule activite a tres
    // grand volume de combos -- ex Hunting 320 shards, Enchanting ~300
    // paires -- monopolise tout le top N.
    const bestPerActivity = new Map<string, RankingRow>()
    for (const r of tierRows) {
      const block = blockMap.get(r.target_block_id)
      if (!block) continue
      const key = block.activity_key
      const current = bestPerActivity.get(key)
      if (!current || r.coins_per_hour_raw_block_only > current.coins_per_hour_raw_block_only) {
        bestPerActivity.set(key, r)
      }
    }

    const topMethods = Array.from(bestPerActivity.values())
      .sort((a, b) => b.coins_per_hour_raw_block_only - a.coins_per_hour_raw_block_only)
      .slice(0, TOP_N_PER_TIER)

    const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : n.toFixed(0)

    const active = topMethods.map(r => {
      const block = blockMap.get(r.target_block_id)!
      const setup = setupMap.get(r.setup_id)
      const coins = r.coins_per_hour_raw_block_only
      const id = `pluton_${block.activity_key}_${r.target_block_id}`
      const why_best = setup?.armor_set_prefix
        ? `Setup optimal Pluton : ${setup.armor_set_prefix}${setup.tool_item_id ? ' + ' + setup.tool_item_id : ''}, cout ${setup.real_cost ? fmt(Number(setup.real_cost)) : '0'}`
        : 'Setup optimal calcule par Pluton (recherche reelle sur gear/reforges/enchants/gemmes)'
      const calculation = `${r.actions_per_hour.toFixed(2)} actions/h x prix Bazaar/AH reel (source pluton_rankings, calcul deterministe, aucun raisonnement LLM)`

      // Ecrit dans method_setups (cle EXACTE attendue par components/
      // MoneyMakingSection.tsx + app/api/setup/generate/route.ts) --
      // uniquement des champs reels, jamais une valeur inventee pour
      // remplir le schema riche attendu par SetupOverlay.tsx.
      const setupObj: Record<string, any> = { how_to: calculation, gear_justification: why_best }
      if (setup && isRealArmor(setup.armor_set_prefix)) setupObj.armor_set = setup.armor_set_prefix
      if (setup && isRealTool(setup.tool_item_id)) setupObj.weapon_name = setup.tool_item_id
      if (setup?.real_cost) setupObj.cost_optimal = fmt(Number(setup.real_cost)) + ' coins'
      methodSetupRows.push({
        method_key: methodKey(id),
        tier,
        setup: JSON.stringify(setupObj),
        generated_at: new Date().toISOString(),
      })

      return {
        id,
        method: block.block_name,
        skill: block.activity_key,
        coins_min: Math.round(coins * 0.9),
        coins_max: Math.round(coins * 1.1),
        coins_display: `~${fmt(coins)}/h`,
        calculation,
        key_drops: block.sell_item_id !== 'NONE' ? block.sell_item_id : '(loot multiple, voir setup)',
        why_best,
        confidence: 'HIGH',
        library_action: 'new',
      }
    })

    const sectionContent = {
      tier,
      comparison_summary: `${active.length} methodes reelles calculees par Pluton (donnees deterministes, pas de raisonnement LLM) -- meilleure methode par activite, triees par coins/h.`,
      active,
      vault: [], // Pluton n'a pas de couche "opportunites non-evidentes" -- gap documente, pas un manque a combler ici (nature de contenu differente)
    }

    // FUSION 1er sept : ecrit directement dans la section LIVE lue par
    // app/api/market-data/route.ts. claude_analysis.section elargi a
    // varchar(40) avant cette ecriture (migration widen_claude_analysis_
    // section_column) -- money_making_intermediate/professional (26 car.)
    // depassaient l'ancienne limite de 20, voir doc en-tete de fichier.
    const liveSection = `money_making_${tier}`
    const { data: oldLive } = await supabase.from('claude_analysis').select('content').eq('section', liveSection).single()
    if (oldLive) await supabase.from('claude_memory').insert({ section: liveSection, content: oldLive.content, archived_at: new Date().toISOString() })
    const { error: liveErr } = await supabase.from('claude_analysis').upsert(
      { section: liveSection, content: JSON.stringify(sectionContent), updated_at: new Date().toISOString() },
      { onConflict: 'section' }
    )
    if (liveErr) throw new Error(`claude_analysis upsert failed for ${liveSection}: ${liveErr.message}`)

    // Miroir de secours (pmm_<tier>, deja construit le 27 aout) -- garde
    // une trace independante de la section live, utile pour comparer/
    // debugger sans jamais dependre de l'etat de la section live.
    const mirrorSection = `pmm_${tier}`
    const { error: mirrorErr } = await supabase.from('claude_analysis').upsert(
      { section: mirrorSection, content: JSON.stringify(sectionContent), updated_at: new Date().toISOString() },
      { onConflict: 'section' }
    )
    if (mirrorErr) throw new Error(`claude_analysis upsert failed for ${mirrorSection}: ${mirrorErr.message}`)

    results.push({ tier, methods: active.length })
  }

  for (const batch of chunks(methodSetupRows, 200)) {
    const { error } = await supabase.from('method_setups').upsert(batch, { onConflict: 'method_key,tier' })
    if (error) throw new Error(`method_setups upsert failed: ${error.message}`)
  }

  return results
}
