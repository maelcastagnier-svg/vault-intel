// lib/pluton-money-making-bridge.ts
// Pont Pluton -> Money Making (27 aout, apres-midi) -- ferme le trou le
// plus grave identifie par l'audit general du meme jour : Money Making
// tourne encore integralement sur un agent Claude qui INVENTE ses coins/h
// par raisonnement LLM (app/api/cron/money-making-agent/route.ts), sans
// jamais consulter pluton_rankings -- des semaines de calcul reel (10
// activites, ~4700 combos, formules sourcees wiki/Supabase) totalement
// invisibles pour le produit.
//
// Fonction 100% DETERMINISTE -- AUCUN appel LLM. Pluton a deja calcule les
// vrais coins/h ; il n'y a rien a "raisonner" de plus, juste a lire et
// formater (coherent avec la memoire feedback_budget_api_claude : jamais
// d'appel API pour un travail que Claude Code peut faire directement).
//
// **Securite produit, decision explicite requise avant fusion** (memoire
// feedback_approval_avant_modification -- "jamais modifier un systeme sans
// accord explicite") : cette fonction ecrit dans une section SEPAREE
// (`claude_analysis` section `pluton_money_making_<tier>`), PAS dans
// `money_making_<tier>` (le flux LIVE lu par app/api/market-data/route.ts
// et servi aux utilisateurs payants Pro+). Fusionner les deux (remplacer
// ou augmenter le flux live) reste une decision produit a valider
// explicitement avec l'utilisateur, pas prise ici.
//
// Format de sortie IDENTIQUE au schema deja produit par money-making-agent
// (voir buildPrompt() dans money-making-agent/route.ts, section "OUTPUT")
// -- { tier, comparison_summary, active: [...], vault: [] } -- pour que le
// merge (le jour ou il sera valide) soit un simple changement de section
// lue, aucun changement de contrat frontend necessaire.
//
// `vault` (Vault Exclusive, opportunites non-evidentes) reste
// volontairement vide : Pluton calcule des methodes reelles, il n'a pas de
// couche de "creativite" pour reperer des angles morts -- ce n'est pas un
// gap Pluton, c'est une nature de contenu differente (raisonnement humain/
// LLM), documente comme tel plutot que force.
import { createClient } from '@supabase/supabase-js'
import { SEVEN_TIER_KEYS, type SevenTier } from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TOP_N_PER_TIER = 10

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

    const active = topMethods.map(r => {
      const block = blockMap.get(r.target_block_id)!
      const setup = setupMap.get(r.setup_id)
      const coins = r.coins_per_hour_raw_block_only
      const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : n.toFixed(0)
      return {
        id: `pluton_${block.activity_key}_${r.target_block_id}`,
        method: block.block_name,
        skill: block.activity_key,
        coins_min: Math.round(coins * 0.9),
        coins_max: Math.round(coins * 1.1),
        coins_display: `~${fmt(coins)}/h`,
        calculation: `${r.actions_per_hour.toFixed(2)} actions/h x prix Bazaar/AH reel (source pluton_rankings, calcul deterministe, aucun raisonnement LLM)`,
        key_drops: block.sell_item_id !== 'NONE' ? block.sell_item_id : '(loot multiple, voir setup)',
        why_best: setup?.armor_set_prefix
          ? `Setup optimal Pluton : ${setup.armor_set_prefix}${setup.tool_item_id ? ' + ' + setup.tool_item_id : ''}, cout ${setup.real_cost ? fmt(Number(setup.real_cost)) : '0'}`
          : 'Setup optimal calcule par Pluton (recherche reelle sur gear/reforges/enchants/gemmes)',
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

    const { data: old } = await supabase.from('claude_analysis').select('content').eq('section', `pluton_money_making_${tier}`).single()
    if (old) await supabase.from('claude_memory').insert({ section: `pluton_money_making_${tier}`, content: old.content, archived_at: new Date().toISOString() })
    await supabase.from('claude_analysis').upsert(
      { section: `pluton_money_making_${tier}`, content: JSON.stringify(sectionContent), updated_at: new Date().toISOString() },
      { onConflict: 'section' }
    )

    results.push({ tier, methods: active.length })
  }

  return results
}
