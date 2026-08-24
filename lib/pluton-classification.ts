// lib/pluton-classification.ts
// Moteur de classification pluton_elements.activity (24 aout, nuit --
// mandat utilisateur "on reprend tout... trouve une architecture qui
// respecte le plan final... cree un systeme pense pour etre automatise
// avec Haiku plus tard ou sans si tu peux").
//
// Contexte : 69% de pluton_elements (127 160/184 416 lignes) n'avait
// jamais ete classe par skill au-dela des items (Phase 1, 21 aout) --
// seul element_type='item' avait ete tague. Ce fichier ferme ce trou par
// un moteur de regles REJOUABLE (pas un script jete une fois) :
//
// - `pluton_classification_rules` (table) porte le ruleset -- inspectable,
//   extensible, jamais un mapping cache dans du code. 2 rule_type :
//   - 'source_table' : le signal le PLUS fiable (une table dediee comme
//     `gemstone_slot_costs`/`sea_creature_pools` a un skill non-ambigu).
//     Priorite d'application la plus haute.
//   - 'keyword' : `element_name ILIKE pattern` -- soit un prefixe de page
//     wiki ("PageTitle / %", le format dominant de wiki_table_extract),
//     soit un marqueur special `__element_type_X__` (bulk sur tout un
//     element_type apres echantillonnage manuel confirmant l'homogeneite
//     du contenu -- voir les regles cosmetic/event_seasonal/general_
//     mechanic/admin_excluded, toutes echantillonnees a la main le 24 aout
//     avant d'etre bulkees, jamais une supposition).
//
// - Idempotent par construction : chaque UPDATE est `WHERE activity IS
//   NULL`, donc rejouable sans risque sur de la cartographie deja classee
//   -- un futur cron peut appeler `runActivityClassification()` a chaque
//   sync (`wiki-referential-sync`, `pluton-weekly-sync`) sans dedupliquer.
//
// - Zero appel API pendant CETTE construction (mémoire `feedback_budget_
//   api_claude`) -- chaque regle ci-dessus vient d'un echantillonnage reel
//   par Claude Code (lecture SQL directe), jamais devinee. Le chemin
//   "avec Haiku plus tard" mentionne par l'utilisateur reste ouvert pour
//   PROPOSER de nouvelles regles sur la longue traine (des centaines de
//   page_title a faible volume restants) -- pas encore branche, voir
//   `proposeRulesFromUnclassifiedSample()` plus bas (stub, retourne un
//   echantillon pret a etre passe a un futur classificateur, gratuit
//   aujourd'hui car c'est Claude Code qui l'appelle).

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ClassificationRule = {
  id: number
  rule_type: 'source_table' | 'keyword'
  pattern: string
  activity: string
  priority: number
  confidence: 'VERIFIED' | 'DERIVED'
  notes: string | null
  active: boolean
}

export type ClassificationRunReport = {
  rules_applied: number
  rows_classified_source_table: number
  rows_classified_keyword: number
  still_null_before: number
  still_null_after: number
}

// Applique toutes les regles actives, dans l'ordre source_table -> keyword
// (source_table est le signal le plus fiable, appliqué en premier pour
// qu'un keyword générique ne matche jamais une ligne qu'une regle
// source_table plus précise aurait dû traiter). Idempotent -- safe à
// rejouer à chaque sync de cartographie.
export async function runActivityClassification(): Promise<ClassificationRunReport> {
  const { count: beforeCount } = await supabase
    .from('pluton_elements').select('id', { count: 'exact', head: true }).is('activity', null)

  const { data: rules } = await supabase
    .from('pluton_classification_rules')
    .select('*')
    .eq('active', true)
    .order('rule_type', { ascending: true }) // 'keyword' > 'source_table' alphabetiquement -- inverse ci-dessous
  const sourceTableRules = (rules || []).filter(r => r.rule_type === 'source_table')
  const keywordRules = (rules || []).filter(r => r.rule_type === 'keyword')

  let sourceTableClassified = 0
  for (const rule of sourceTableRules) {
    const { data } = await supabase
      .from('pluton_elements')
      .update({ activity: rule.activity })
      .eq('source_table', rule.pattern)
      .is('activity', null)
      .select('id')
    sourceTableClassified += data?.length || 0
  }

  let keywordClassified = 0
  for (const rule of keywordRules) {
    // Marqueurs __element_type_X__ : bulk sur tout l'element_type X, pas un
    // pattern element_name.
    const elementTypeMatch = rule.pattern.match(/^__element_type_(\w+)__$/)
    let query = supabase.from('pluton_elements').update({ activity: rule.activity }).is('activity', null)
    query = elementTypeMatch
      ? query.eq('element_type', elementTypeMatch[1])
      : query.ilike('element_name', rule.pattern)
    const { data } = await query.select('id')
    keywordClassified += data?.length || 0
  }

  const { count: afterCount } = await supabase
    .from('pluton_elements').select('id', { count: 'exact', head: true }).is('activity', null)

  return {
    rules_applied: (rules || []).length,
    rows_classified_source_table: sourceTableClassified,
    rows_classified_keyword: keywordClassified,
    still_null_before: beforeCount || 0,
    still_null_after: afterCount || 0,
  }
}

// Stub pour la voie "avec Haiku plus tard" mentionnee par l'utilisateur --
// pas encore appelee en prod. Retourne un echantillon de page_title
// (prefixe avant " / ", format dominant wiki_table_extract) encore non
// classes, groupes par volume -- exactement le format que Claude Code a
// lu a la main cette nuit pour ecrire les regles ci-dessus. Un futur
// classificateur (Haiku ou Claude Code lui-meme, cf regle budget API :
// ce travail ponctuel doit rester fait par Claude Code, PAS par Haiku,
// sauf automatisation recurrente reelle) peut consommer cette meme forme
// pour proposer nouveau lot de regles -- INSERT dans
// pluton_classification_rules, jamais une ecriture directe sur
// pluton_elements (garde le ruleset comme source de verite unique,
// inspectable/revertable).
export async function sampleUnclassifiedPageTitles(limit = 100): Promise<{ page_title: string; count: number }[]> {
  const { data } = await supabase.rpc('pluton_sample_unclassified_page_titles', { p_limit: limit })
  return data || []
}
