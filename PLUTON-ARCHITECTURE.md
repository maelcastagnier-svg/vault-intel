# PLUTON — Architecture V1 (document de référence avant construction)

> Document de synthèse produit à l'issue de l'audit de complétude (4-5 août) et de la
> discussion d'architecture qui a suivi. Sert de référence commune avant le feu vert
> final — à relire ensemble avant de lancer la construction. Rien de ce qui est décrit
> ici n'est construit à la date de rédaction, sauf ce qui est explicitement marqué
> "existant".

## Contexte — pourquoi ce document

Le chantier de fondation (cartographie wiki + NEU-REPO + SkyHanni-REPO + collecte
totale) est clos (voir CLAUDE.md, section "CLÔTURE FINALE"). Avant de reprendre Pluton
(Bloc 8), une série de questions a fait remonter un vrai problème de méthode : les
tables construites jusqu'ici capturent ce qui semblait pertinent au moment de leur
construction, pas nécessairement toute la richesse structurable de leur source — et
Mining, tenu pour le système le plus complet, a lui-même un vrai trou (la décomposition
"quelle source donne combien" n'a jamais été extraite, seulement le stat de base).
Ce document répond à la question posée à la fin de cette discussion : quelle
architecture complète pour que Pluton calcule sans jamais exclure à tort un candidat
pertinent, compare les activités entre elles de façon honnête, et se maintienne à jour
tout seul — avec une estimation réaliste de l'ampleur du chantier.

---

## 1. Architecture complète

### 1.1 Les deux piliers (rappel)

- **Pricing** — solide. 6 ans d'historique (`price_history`/`price_history_ah`/
  `price_history_ah_variants`/`price_history_ah_variant_base`), collecte live continue
  (`ah-collect` chaque minute, `bazaar-collect` toutes les 5 min), méthodologie
  vérifiée cohérente avec l'import SkyCofl (import historique confirmé propre,
  abonnement SkyCofl résilié). La partie la plus proche de "en marbre" du projet.
- **Connaissance du jeu** — large (189 tables) mais inégalement profonde. Mining a des
  tables curées prêtes pour un calculateur (construites pendant le premier passage
  Bloc 8, avant le chantier de cartographie). Combat/Farming/Foraging/Fishing/Dungeons
  ont la matière première (souvent déjà en cache brut) mais pas encore structurée au
  même niveau. Ce n'est pas un pilier fini, c'est un pilier avec une méthode qui marche,
  appliquée inégalement jusqu'ici.

### 1.2 Vue d'ensemble — 4 couches

```
[SOURCES BRUTES]  →  [EXTRACTION STRUCTURÉE]  →  [MOTEUR DE CALCUL]  →  [CONSOMMATION]
        ▲___________________automatisation (détection de changement)___________________|
```

### 1.3 Tables — existantes réutilisées telles quelles

| Table | Rôle | Statut |
|---|---|---|
| `price_history`, `price_history_ah`, `price_history_ah_variants`, `price_history_ah_variant_base` | Pricing (coût setup, revenu méthode) | ✅ existant, fiable |
| `items_catalog`, `item_stats` | Registre d'items, stats plates (creux sur l'endgame, limite connue) | ✅ existant, limite documentée |
| `milestone_tier_totals` | Référentiel 7 tiers (bandes networth) | ✅ existant |
| `TIER_CONFIG` (constante code, pas une table) | Référentiel 4 tiers Money Making (budget/capital) | ✅ existant |
| `pluton_target_blocks` | Catalogue de cibles Mining (bloc, résistance, breaking power requis, item de vente) | ✅ existant — sert de patron pour les 5 autres activités |
| `pluton_mining_tool_stats`, `pluton_mining_armor_stats` | Stats de base curées à la main pour Mining | ✅ existant — reste, n'est pas remplacé |
| `pluton_setups`, `pluton_rankings` | Sorties calculées (setup optimal, classement coins/h) | ✅ existant, déjà générique par `activity_key`, seulement peuplé pour Mining aujourd'hui |
| `game_mechanics_misc` | Cache brut wikitext | ✅ existant — à étendre (voir 1.5) |
| `sync_log`, `discovery_queue` | Observabilité, file d'ambiguïtés | ✅ existant, réutilisés tels quels |
| `activity_gear_categories` | Mapping catégorie ↔ slot d'équipement | ✅ existant — **rôle recadré** : sert uniquement à la contrainte mécanique dure (quel type d'objet va dans quel slot), plus jamais comme filtre de pertinence par activité |

### 1.4 Tables nouvelles à construire

**`stat_bonus_sources`** — agnostique de l'activité, une ligne = une source contribue à une stat :
```sql
stat_bonus_sources (
  id, source_id text, source_type text,   -- 'pet'|'weapon'|'armor'|'accessory'|'enchant'|'reforge'|'hotm_perk'|'permanent'|'gemstone'
  equip_slot text,                        -- contrainte mécanique dure, pas une étiquette d'activité
  stat_name text, rarity text,
  bonus_raw text, bonus_numeric numeric,  -- numeric seulement si non-ambigu, jamais deviné
  condition_note text,
  confidence text,                        -- VERIFIED | SINGLE_SOURCE | DERIVED | UNKNOWN
  source_page text, raw_row text
)
```
Alimentée par **un seul parseur générique** (`parseStatSourceTabber`) réutilisé sur les
~16 pages "Stat" du wiki (même format `<tabber>`+wikitable récurrent confirmé sur
Mining Speed, Mining Fortune, Strength, Farming Fortune, Foraging Fortune, Sea Creature
Chance, Damage...).

**`activity_stat_weights`** — quelles stats comptent pour quelle activité, et combien :
```sql
activity_stat_weights (
  activity text, stat_name text, weight numeric,
  weight_basis text,   -- 'direct_yield_formula' | 'survival_proxy' | 'manual_estimate_pending_calibration'
  notes text
)
```
C'est cette table, pas une catégorie pré-assignée, qui décide si un pet de Combat
compte pour Foraging (parce que sa Vitesse a un poids non-nul pour Foraging), résolvant
directement le problème soulevé.

**`equip_slot_capacity`** — combien de slots de chaque type existent (1 arme, 1 outil,
4 pièces d'armure, 1 pet, N accessoires) — la pièce manquante identifiée entre "avoir un
classement" et "construire un setup équipable réel" :
```sql
equip_slot_capacity (equip_slot text, max_count integer, notes text)
```

**Catalogues de cibles par activité** (pattern de `pluton_target_blocks`, un par
activité — pas une méga-table unique, les colonnes d'entrée sont trop différentes d'une
activité à l'autre) :
- `pluton_target_blocks` (Mining) — existant.
- `pluton_slayer_targets` — boss, tier, HP réel par tier (trou identifié : source
  candidate `Skytils-Data/slayerhealth.json`, jamais importée), formule de temps de kill.
- `pluton_farming_targets` — culture, temps de pousse, rendement de base.
- `pluton_foraging_targets` — arbre/zone, temps de coupe, rendement de base.
- `pluton_fishing_targets` — zone, cycle d'appât, modificateur SCC, table de loot.
- `pluton_dungeon_targets` — donjon/étage/classe, temps de clear, espérance de loot.

**Contrat commun obligatoire**, quelle que soit la forme d'entrée propre à chaque
activité : chaque table de cibles doit résoudre vers `(cycle_time_seconds,
output_item_id, output_quantity_per_cycle)` — c'est ce triplet, pas la table
elle-même, qui est le format standard consommé par le moteur de calcul.

**`extraction_registry`** — quelle page source alimente quelle table/fonction
d'extraction (n'existe pas aujourd'hui, le lien est aujourd'hui implicite) :
```sql
extraction_registry (source_page text, table_name text, sync_function_name text)
```

**Colonnes ajoutées à l'existant** : `game_mechanics_misc.content_hash` +
`content_changed_at` (détection de changement réel, pas juste "re-fetché" — `updated_at`
bouge aujourd'hui toutes les 30 min même sans changement, donc inutilisable seul comme
signal).

**Convention transversale** : toute nouvelle table (`stat_bonus_sources`, catalogues de
cibles) porte une colonne `confidence` (`VERIFIED`/`SINGLE_SOURCE`/`DERIVED`/`UNKNOWN`).
Pas rétrofité sur les 189 tables existantes — standard sur tout ce qui se construit à
partir de maintenant.

### 1.5 Pipeline complet, texte structuré

```
[SOURCES BRUTES]
  wiki (hypixelskyblock.minecraft.wiki) ────┐
  NEU-REPO (épuisé)                         ├──→ game_mechanics_misc / neu_constants_raw
  SkyHanni-REPO (épuisé)                    │      (+ content_hash / content_changed_at)
  SkyblockRepo/Repo (nouveau, non fiable    │
    à 100% -- "not production ready" assumé)┘
  API Hypixel (items, prix) ────────────────→ item_stats / items_catalog / price_history*

         │  extraction_registry (page → table → fonction)
         ▼
[EXTRACTION STRUCTURÉE]
  stat_bonus_sources          (source × stat → contribution, confidence taggée)
  activity_stat_weights       (activité × stat → poids)
  pluton_<activité>_targets   (cible × cycle × output, contrat commun)
  pluton_mining_tool/armor_stats (Mining, existant)
  equip_slot_capacity

         │
         ▼
[MOTEUR DE CALCUL]
  Sélection de setup :
    par equip_slot, meilleur (Σ bonus_numeric × weight) / coût, sous budget du tier
    → pluton_setups
  Rendement de méthode :
    jointure setup × cible éligible, formule C propre à l'activité
    (Mining: résistance÷vitesse, fortune=% bonus ; Slayer: HP÷DPS + loot ; ...)
    → pluton_rankings (activity_key, tier, coins_per_hour, confidence, hypothèses)

         │
         ▼
         │
         ▼
[MÉMOIRE VERSIONNÉE]  ← nouvelle couche (5 août, 4e passe Farming -- voir 1.6)
  Chaque recalcul est un run horodaté, jamais un remplacement destructif.
  pluton_setups/pluton_rankings gagnent run_id (append-only) ; une vue
  "current" sert le dashboard, l'historique sert la comparaison.

         │
         ▼
[CONSOMMATION]
  Money Making  ← classement INTER-activités = pluton_rankings_current SANS filtre activity_key
  Evolve Skills ← meilleur setup par activité/tier = pluton_setups_current
  Milestones    ← pont déjà existant et vérifié : milestone_tier_totals.money_making_tier_key
                   (7 tiers Milestones → 4 tiers Money Making, many-to-one, pas un miroir parfait)

         ▲
         │ déclenché par changement détecté
[AUTOMATISATION]
  wiki-auto-sync : hash de contenu avant upsert → content_changed_at si vraiment différent
  extraction-refresh (nouveau cron) : compare content_changed_at au dernier run réussi
    de la fonction concernée (extraction_registry) → rappelle le parseur si nécessaire
  → recalcul CIBLÉ de pluton_rankings (uniquement l'activity_key affecté), nouveau run_id
  → test de ranking flip (Hyperion/Astraea) : compare l'ordre avant/après, loggé si
    changé — visible et audité, jamais silencieux
```

### 1.6 Couche 5 — Mémoire versionnée (ajoutée le 5 août, demande explicite)

**Pourquoi cette couche manquait** : le chantier Mining puis Farming (5 août) a montré
en pratique le vrai problème que ce document anticipait en théorie section 3
("pas d'auto-extraction universelle par magie") -- à chaque nouvelle question de
l'utilisateur ("as-tu tout maxé ?", "pourquoi le pest farming est si bas ?"), une
vraie source manquante a été trouvée (Fly Shard, Bonus Pest Chance...) via des
fetchs wiki live, alors qu'une partie de ce contenu était **déjà caché en base**
(`game_mechanics_misc`, catégorie `farming_wiki`, 92 pages) mais jamais consulté --
la Couche 2 (Extraction) décrite ci-dessus n'a jamais été construite, Mining et
Farming ont été codés avec des **constantes en dur** (`FARMING_FORTUNE_MAX_PERMANENT
= 2012.7 + 25`) au lieu de lire une vraie table. Pire : en vérifiant le cache pour
la 1ère fois, le contenu trouvé datait de 5 jours et divergeait déjà de la version
live du même jour -- preuve concrète que la fraîcheur (Couche 1) n'est pas non plus
garantie aujourd'hui.

**Ce que l'utilisateur a demandé, reformulé en 3 couches** :
1. **Auto-alimentation des sources** (Couche 1, déjà conçue ci-dessus, jamais
   vraiment mise en œuvre avec des garanties de fraîcheur) -- la cartographie se
   met à jour toute seule, sans dérive silencieuse.
2. **Auto-alimentation de l'extraction** (Couche 2, idem) -- chaque page/sous-page
   est vidée de tout son contenu structurable dans des tables choisies pour
   l'usage, jusqu'à épuisement, jamais cherry-pické à la main comme cette session.
3. **Mémoire versionnée du calcul** (nouveau, absent du document d'origine) --
   Pluton ne doit pas juste calculer et écraser son résultat précédent : chaque
   recalcul doit être un point dans le temps comparable au précédent, pour que le
   système puisse littéralement dire "hier c'était bien, aujourd'hui c'est mieux".

**Schéma proposé** :
```sql
pluton_computation_runs (
  id bigint primary key generated always as identity,
  activity_key text not null,
  tier text,                         -- null si le run couvre tous les tiers
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',   -- running | success | partial | failed
  trigger_reason text not null,             -- manual | source_changed | scheduled
  source_content_hashes jsonb,       -- {page_key: content_hash} des sources lues à ce run -- traçabilité complète
  error_note text
)
```
`pluton_setups`/`pluton_rankings` gagnent une colonne `run_id` (FK) et deviennent
**append-only** -- plus jamais de `DELETE` avant insert (élimine au passage la
classe de bug rencontrée deux fois cette session : runs qui se chevauchent à cause
d'un déclenchement en double, aujourd'hui dangereux car le DELETE d'un run
concurrent efface le travail d'un autre en cours).

**Vue "current"** (ce que consomme le dashboard, jamais l'historique brut) :
```sql
create view pluton_rankings_current as
select distinct on (activity_key, tier, target_block_id) r.*
from pluton_rankings r
join pluton_computation_runs run on run.id = r.run_id
where run.status = 'success'
order by activity_key, tier, target_block_id, run.completed_at desc;
```

**Comparaison automatique** (le "hier vs aujourd'hui" demandé) -- une vue/fonction
`pluton_ranking_deltas(activity_key)` qui prend les deux runs `success` les plus
récents et calcule, par `(tier, target_block_id)` : `Δcoins_per_hour`,
`Δcoins_per_hour_pct`, et un flag `rank_changed` (le meilleur candidat a changé --
c'est le test "flip Hyperion/Astraea" déjà prévu section 1.5, généralisé). Ce delta
est ce qui permettrait à terme un message auto-généré du type "Jasper Gemstone
+4.2% depuis hier (nouvelle source : Fly Shard corrigé)" plutôt qu'un utilisateur
qui doit re-challenger chaque chiffre pour qu'une correction sorte.

**Rétention** : garder tous les runs `success` des 90 derniers jours (purge au-delà,
pas de croissance non bornée), jamais purger le run `current` même s'il a plus de
90 jours (toujours au moins un point de comparaison disponible).

### 1.7 Rétrofit Mining + Farming (dette reconnue, pas de nouveau chantier séparé)

Mining et Farming existent déjà et fonctionnent (chiffres vérifiés, persistés),
mais **aucun des deux ne suit ce pipeline** -- toutes leurs constantes
(`HOTM_MAX`, `FARMING_FORTUNE_MAX_PERMANENT`, la liste `PESTS[]`...) sont câblées
en dur dans `lib/pluton-mining.ts`/`lib/pluton-farming.ts`, jamais lues depuis
`stat_bonus_sources`. Deux options, à trancher avec l'utilisateur avant de
construire une 3e activité :
- **(A) Rétrofit avant d'avancer** -- réextraire Mining Speed/Mining Fortune et
  Farming Fortune/Crop Fortune/Bonus Pest Chance en vraies lignes
  `stat_bonus_sources` (le parseur générique `parseTheoreticalMaximumList` décrit
  ci-dessous couvre déjà leur format), remplacer les constantes par des requêtes,
  brancher la Couche 5. Bénéfice : les 2 activités déjà livrées deviennent aussi
  auto-maintenues que les futures, plus de dérive à chasser à la main.
- **(B) Nouvelles activités sur le nouveau pipeline, rétrofit plus tard** -- accepte
  la dette sur Mining/Farming (déjà vérifiés manuellement, donc pas faux
  aujourd'hui, juste pas auto-actualisables), avance plus vite sur
  Foraging/Fishing/Slayer/Dungeons directement avec la bonne architecture.

**Parseur générique proposé pour la Couche 2** -- format confirmé identique sur
TOUTES les pages "Achieving Maximum X"/"Theoretical Maximum" rencontrées cette
session (Mining Speed, Mining Fortune, Farming Fortune, Bonus Pest Chance) :
```
* {{Description/Item}} ({{stat|xx|+N}})
** {{Sous-condition}} ({{stat|xx|+N}})     -- niveau 2 = condition_note du parent
```
`parseTheoreticalMaximumList(wikitext, sectionHeading)` -- isole la section par son
`==` heading, découpe par ligne `*`/`**`, extrait le dernier `{{stat|...|+N}}` (ou
`(+N )`) de chaque ligne comme `bonus_numeric`, le texte restant nettoyé comme
`source_id`, la profondeur `*` vs `**` comme signal de `condition_note` (une
sous-puce qualifie toujours la puce parente juste au-dessus). Couvre directement
les 2 gaps trouvés cette session (Fly Shard aurait été capturé s'il avait été dans
la section listée -- **limite honnête** : ce parseur trouve tout ce qu'une page
liste dans SA PROPRE section Theoretical Maximum, il ne trouve pas les sources
qu'une page a oublié de lister elle-même, comme Fly Shard ci-dessus. La couverture
inter-pages -- croiser Attribute Shards contre le build de référence -- reste un
audit périodique, pas automatisable par ce seul parseur).

---

## 2. Ce que Pluton V1 sera capable de faire, concrètement

- **Proposer un setup complet optimal pour une activité/tier donné** — oui, mais
  uniquement pour les activités dont le catalogue de cibles + `stat_bonus_sources`
  sont construits. Pas toutes les 6 en même temps au lancement (voir section 4).
- **Comparer plusieurs activités entre elles pour dire laquelle rapporte le plus à un
  tier donné** — oui, nativement, dès que 2+ activités ont une formule C qui termine en
  coins/h dans `pluton_rankings` : un tri sans filtre d'activité EST la comparaison
  inter-activités, ce n'est pas une brique séparée à construire.
- **Se mettre à jour tout seul si un patch change une stat (test Hyperion/Astraea)** —
  oui, pour tout changement visible dans une source déjà branchée (API/wiki/NEU-REPO/
  SkyHanni-REPO/SkyblockRepo). Latence quasi temps réel pour l'API Hypixel, jusqu'à une
  semaine pour les sources à cron hebdomadaire (resserrable, coût de requêtes à peser).
- **Détecter un candidat non anticipé (pet de Combat pertinent pour Foraging)** — oui,
  c'est exactement ce que résout le découplage `stat_bonus_sources`/
  `activity_stat_weights` : aucune pré-catégorisation n'exclut un candidat, seule sa
  contribution réelle compte.
- **S'articuler avec Milestones** — le pont existe déjà et est vérifié cohérent
  (`milestone_tier_totals.money_making_tier_key`), mais résout à une granularité plus
  large côté Money Making (4 tiers) que Milestones (7 tiers) — les deux se répondent,
  pas au même niveau de détail. Rien à construire ici, juste à savoir.
- **Branchement dashboard** — Money Making lirait `pluton_rankings` (calcul
  déterministe) au lieu de/en complément de la génération Claude actuelle
  (`money-making-agent`) ; Evolve Skills lirait `pluton_setups` au lieu de/en
  complément de `setup-generate-agent`. **À dire clairement : c'est un changement de
  paradigme pour ces deux fonctionnalités déjà en prod** (de génération en langage
  libre par Claude à calcul déterministe en base), pas un simple branchement — mérite
  sa propre décision de migration (coexistence temporaire ? remplacement direct ?),
  hors scope de ce document.

---

## 3. Ce que Pluton V1 ne sera PAS capable de faire — limites honnêtes

- **Pas de vraies "voies" multi-étapes chiffrées en temps.** Bloqué sur deux données
  qui n'existent nulle part (temps estimé par objectif, graphe de dépendances
  structuré) — les champs `access`/`forbidden` de `TIER_CONFIG` sont aujourd'hui du
  texte libre, pas un graphe exploitable. V1 propose "la meilleure activité maintenant",
  pas une route complète chiffrée sur plusieurs mois.
- **Pas de découverte combinatoire de synergies non anticipées.** Recherche
  combinatoire coûteuse (espace des accessoires seul = potentiellement des millions de
  combinaisons sans élagage) — explicitement mis de côté, piste de recherche à long
  terme, pas un livrable V1.
- **Pas d'auto-extraction universelle par magie.** L'auto-refresh ne maintient à jour
  QUE les parseurs déjà écrits. Un type de contenu jamais vu avant nécessite toujours
  une construction initiale manuelle/en session — l'automatisation entretient, elle ne
  découvre pas toute seule.
- **Pas garanti à 100% de couverture, et ce n'est pas un objectif.** Doctrine déjà
  posée : certaines combinaisons resteront `UNKNOWN`/`DERIVED` plutôt que forcées à une
  valeur devinée. Le signal de santé du système est "le backlog de gaps connus est
  petit et visible", pas "zéro gap".
- **Pas de modélisation du risque, de l'attention requise, ou de l'AFK-ability.**
  Coins/h est un axe objectif utile, pas la totalité de "meilleur" — un joueur qui ne
  peut jouer qu'AFK a des contraintes que le classement pur ne capture pas.
- **Ne couvrira, au lancement, que les activités dont le travail (catalogue de cibles +
  formule C + stat_bonus_sources) est fini** — probablement Mining d'abord, puis les
  autres dans l'ordre choisi. Pas les 6 activités le même jour.
- **Le classement suppose un jeu parfait** (100% uptime, zéro mort, exécution
  parfaite) — c'est un plafond théorique, à étiqueter comme tel dans la sortie, pas un
  rendement garanti.
- **SkyblockRepo/Repo (source la plus prometteuse trouvée pour combler le trou
  item_stats) porte son propre avertissement ("not production ready, subject to
  change")** — à utiliser avec la même discipline de triangulation que tout le reste,
  pas une confiance aveugle simplement parce que le contenu a l'air riche.

---

## 4. Ordre de construction et estimation honnête

**Principe** : même rythme et même rigueur que tout le chantier de cartographie déjà
mené (vérification réelle à chaque étape, jamais une estimation théorique optimiste).
Ce projet a montré à plusieurs reprises que des bugs réels apparaissent en creusant
(Slayer T4/T5, formule HOTM, gemstone quality mal indexée) — les estimations
ci-dessous supposent qu'on en trouvera encore, pas qu'on n'en trouvera plus.

**Phase 0 — Fondations partagées** (avant toute activité) :
`stat_bonus_sources` + parseur générique, `activity_stat_weights` (curation initiale),
`equip_slot_capacity`, `content_hash`/`extraction_registry`/cron `extraction-refresh`,
convention `confidence`.
**Estimation : ~2-3 semaines.**

**Phase 1 — Mining** (déjà le plus avancé, à aligner sur la nouvelle architecture, pas
à reconstruire) :
Combler le trou `stat_bonus_sources` pour Mining Speed/Fortune (même parseur
générique, donc rapide), rebrancher `pluton_setups`/`pluton_rankings` sur la sélection
par slot au lieu du mécanisme actuel isolé.
**Estimation : ~1 semaine.**

**Phases 2-6 — Les 5 autres activités, une par une.** Chacune nécessite : sa table de
cibles (nouvelle construction propre à l'activité), sa formule de rendement C (vraie
mécanique de jeu à modéliser, pas générique), `stat_bonus_sources` qui se remplit au
fur et à mesure sur les nouvelles pages. Ordre recommandé (pas imposé) : Farming et
Foraging d'abord (mécanique de cycle continu proche de Mining, donc plus simple),
Fishing ensuite (cycle + modificateur + table de loot, complexité intermédiaire),
Slayer et Dungeons en dernier (formule de combat + espérance de table de loot,
réellement plus complexes).
**Estimation : ~1-2 semaines par activité selon sa complexité réelle, soit ~6-10
semaines pour les 5.**

**Phase 7 — Branchement dashboard** (migration Money Making/Evolve Skills de la
génération Claude vers la lecture calculée) — chantier de migration à part entière,
pas chiffré ici, mérite sa propre discussion (coexistence vs remplacement).

**Total V1 complet (6 activités + fondations, hors migration dashboard) : environ
2 à 3 mois de chantier actif.** C'est une estimation de risque moyen, pas un
engagement ferme — chaque phase peut révéler du travail non anticipé, comme
systématiquement observé jusqu'ici sur ce projet.

---

## 2. Mining — validé de bout en bout, setup 100% maxé (5 août)

Chantier "Phase 1 — Mining" ci-dessus effectivement mené en parallèle de la rédaction
de ce document (pas séquentiel comme prévu) : `stat_bonus_sources`/
`activity_stat_weights`/`equip_slot_capacity` construits et branchés sur Mining
en premier pour valider l'architecture avant généralisation, sur demande explicite de
l'utilisateur ("on valide MINING SEUL en premier"). Résultat final vérifié contre un
repère en jeu réel fourni par l'utilisateur (setup Divan's maxé + DRX655 + Bal pet +
Titanium accessoires + HOTM gemstone) : **Ruby 15-20M/h, Topaz 30M/h, Jasper 60M/h**.

**Résultat final (late/end, setup 100% maxé, 5 août, après fermeture du gap Topaz/
Pristine sur le slot combo du foret -- voir plus bas)** : Ruby 54.4M/h, Topaz 45.5M/h,
Jasper 67.3M/h -- **toutes les 3 au-dessus** du repère utilisateur (15-20M/30M/60M),
Jasper le plus proche (+12%). C'est le bon sens d'écart pour un plafond théorique : un
"setup 100% maxé, route parfaite, zéro temps mort" doit dépasser une performance réelle
en jeu (qui perd du rendement au déplacement, à l'exécution imparfaite, au RNG des
gemmes rencontrées) -- confirmé explicitement par l'utilisateur après l'ajout du fix
Topaz ("mon repère ne sera jamais aussi précis que Pluton"). L'écart Ruby, le plus
large des 3, reste cohérent avec une explication simple non modélisée : Pluton calcule
un plafond "route dédiée à ce gemme précis" alors qu'en jeu personne ne dédie une
route à la Ruby (le gemme le moins cher des 12) -- le repère utilisateur de 15-20M/h
reflète probablement une collecte mixte incidente, pas un run Ruby optimisé.

*(Chiffres avant le fix Topaz, pour mémoire : Ruby 46.2M/Topaz 38.6M/Jasper 57.2M --
tous +17.8% plus bas, le slot combo du foret n'utilisant alors que 2 des 3 options
réelles.)*

### Setup final (late/end, JASPER_GEMSTONE, cible du meilleur coins/h)

- **Armure** : Armor of Divan (recombobulée, Jaded, 2 Perfect Jade + 2 Perfect Amber +
  1 Perfect Topaz par pièce)
- **Foret** : Divan's Drill (base 1800 vitesse / 150 fortune, Recombobulator 3000,
  Fortune IV, Efficiency X, Amber-Polished Drill Engine, Divan's Powder Coating,
  reforge Ambered vs Glacial arbitré par impact réel — Ambered gagne à ce niveau de
  fortune déjà élevé)
- **Pet** : Scatha RARE (choisi par impact réel coins/h parmi tous les pets ayant un
  bonus mining, pas présupposé) + Hephaestus Relic (x1.5 sur les stats du pet)
- **Accessoires** (10 slots Equipment + Accessory Bag, tous non-compétitifs) : Divan's
  Pendant, Sapphire Cloak, Jade Belt, Dwarven Handwarmers, Titanium Relic, Jungle
  Amulet, Dwarven Gemstone Grahams, Bal Shard, Haste Artifact, Relic of Power
- **HOTM** : Mining Speed + Speedy Mineman + Mining Fortune + Fortunate Mineman +
  Gem Lover + Mining Master + Professional, tous au niveau max (formules réelles
  `hotm_perks`, vérifiées le 5 août contre le schema Lisp en base)
- **Pickaxe Ability** : Mining Speed Boost niveau 3 (+300%/20s, cooldown 120s → 108s
  avec Perfectly-Cut Fuel Tank), modélisé en **multiplicateur moyen pondéré par
  temps d'activité réel** (×1.556), pas "actif en continu" comme dans une itération
  précédente de ce chantier (l'hypothèse "always-on" surestimait de 2-3x, confirmé
  par l'utilisateur avant correction)
- **Totaux** : 14 257 Mining Speed, 2 196 Mining Fortune, 10 Breaking Power (max),
  ~10 Pristine (×8.9 sur les drops Rough→Flawed)
- **Coût du combo de base** (armure+outil, avant reforges/gemmes/upgrades non
  re-pricées individuellement) : ~2.15Md de coins, prix AH réel par variante/palier
  le plus proche disponible

### 3 vrais bugs trouvés et corrigés en persistant ce run (pas seulement en calculant)

1. **`computeAndPersistAllMiningRankings()` n'a jamais fait de DELETE avant insert**,
   malgré son propre commentaire d'en-tête affirmant "clears and rebuilds" — chaque
   exécution de route de debug (v2 à v11, plusieurs sessions) s'accumulait en base sans
   jamais remplacer (126 lignes trouvées pour 72 combos maximum possibles). Corrigé :
   DELETE explicite sur `pluton_rankings` puis `pluton_setups` en tête de fonction,
   table entièrement vidée et rechargée proprement avant de considérer tout run fiable.
2. **Colonnes entières, moyenne pondérée fractionnaire** : `total_mining_speed`/
   `total_mining_fortune` sont des colonnes `integer` en base — le multiplicateur
   Mining Speed Boost désormais fractionnaire (1.556 au lieu de l'ancien x4 entier)
   produisait des valeurs comme `12934.444...`, rejetées par Postgres à l'insert
   (crash `end`/`late`, tier `mid`/`early` non affectés car pas de couche max
   investissement). Corrigé par arrondi au point d'insert uniquement, jamais dans le
   calcul lui-même.
3. **Reforge foret non arbitré** (Ambered vs Glacial) : remplacé un choix par défaut
   documenté-mais-non-vérifié par une vraie comparaison coins/h (même méthode que la
   sélection de pet et du slot combo Amber/Jade du foret).

### Sources fermées cette passe (toutes vérifiées contre le wiki officiel, jamais
recopiées de mémoire)

- **Instamine** : seuil réel 30x (non-minerai)/60x (minerai, suffixe `_ORE`) block
  strength — jamais atteint sur les 12 gemmes même avec Mining Speed Boost actif
  (seuils réels 69 000-156 000, speed max ~22 000 avec le boost actif).
- **Mining Speed Boost** : page wiki dédiée "Heart of the Mountain/List/HotM 2
  Perks/Mining Speed Boost" — 3 niveaux réels (200%/10s, 250%/15s, 300%/20s,
  cooldown 120s fixe aux 3 niveaux) ; Perfectly-Cut Fuel Tank -10% cooldown
  (Changelog 2024/08/20 + page wiki dédiée), foret uniquement.
- **3 sources Mining Fortune permanentes/consommable** trouvées sur la liste
  officielle "Mining Fortune#Achieving Maximum Mining Fortune" : Collection bonuses
  Glacite+Tungsten+Umber max (+8, permanent), Ultimate DNA niveau 10 de Galaxy Fish
  Shard (+10, permanent), 5x Refined Dark Cacao Truffle (+5, consommable — inclus
  sous l'hypothèse documentée "joueur qui maintient le buff", même traitement que le
  reforge Glacial/Cold -99).
- **Validation croisée réussie** : le pet Scatha LEGENDARY + Hephaestus Relic donne
  125×1.5=187.5 Mining Fortune dans notre modèle générique (`stat_bonus_sources` +
  x1.5 Hephaestus) — exactement la valeur listée par le wiki dans son propre
  "setup maximal" de référence, sans avoir jamais copié ce chiffre en dur.

### Gaps honnêtes restants, documentés mais pas fermés

- **Les 4 forets spécialisés `GEMSTONE_DRILL_1-4`** (`gemstone_speed_override`/
  `gemstone_fortune`) ont leurs colonnes dédiées vides depuis leur insertion (jamais
  backfillées malgré une correction d'item_id faite plus tôt dans ce chantier) —
  sans impact sur le résultat actuel car Divan's Drill (vitesse de base 1800) domine
  largement leur vitesse de base (150-600), mais ces 4 lignes sont aujourd'hui
  fonctionnellement mortes dans le classement.
- **`DRILL_UPGRADES`** (Recombobulator/Efficiency/Amber-Polished Engine/Powder
  Coating) sont des upgrades propres à Divan's Drill dans leur sourcing wiki, mais
  le code les applique à tout `tool_category==='DRILL'` sans vérifier que c'est bien
  Divan's Drill qui a gagné la recherche de combo — sans conséquence aujourd'hui
  (Divan's Drill gagne systématiquement grâce à sa vitesse de base), mais latent si
  un futur foret à vitesse de base plus haute était ajouté sans review.
- **Reforge Blazing** (armure) jamais isolé (chiffre wiki toujours groupé avec
  d'autres bonus, pas de valeur unitaire fiable trouvée) — non modélisé.
- **Gemstone Spread** (Steady Hand HOTM, +10 max) exclue car conditionnée aux Glacite
  Mineshafts spécifiquement, pas au Crystal Hollows général modélisé ici.
- **`end` et `late` produisent des résultats identiques** — la couche
  "investissement maximal" ne distingue pas encore les deux tiers (même plafond
  "100% du jeu" appliqué aux deux), cohérent avec la demande de cette passe mais à
  revisiter si une distinction end/late a un sens pour Mining spécifiquement.
- ~~Pristine sur le foret non modélisé~~ **fermé (5 août, 2e passe)** : confirmé wiki
  "Divan's Drill" (section Tips) — le 5e slot du foret est un "universal mining slot"
  acceptant Topaz, Jade OU Amber, pas seulement Amber/Jade comme codé initialement.
  `computeGemSocketBonus` et l'arbitrage de `applyMaxInvestmentLayer` comparent
  maintenant les 3 options par impact réel sur le rendement (incluant le
  multiplicateur Pristine, omis par erreur dans la comparaison précédente) — Topaz
  gagne sur ce setup, +17.8% sur les 3 gemmes revérifiées (Ruby/Topaz/Jasper).

**Décision suivante** : chantier Mining jugé suffisamment validé par l'utilisateur
(les 3 résultats dépassent maintenant le repère réel, dans le bon sens pour un plafond
théorique) pour généraliser aux 5 autres activités (Combat/Slayer, Farming, Foraging,
Fishing, Dungeons), avec la même exigence explicite de rigueur totale ("n'omet rien,
n'invente rien, utilise toutes les sources extraites") — voir section 3 ci-dessous
pour le début de ce chantier.

---

## 3. Farming — construit et validé (5 août, même session)

Généralisation demandée explicitement après validation de Mining. Mécanique
fondamentalement différente, découverte en cours de route via la page wiki
"Farming" elle-même : **aucune stat de gear ne détermine la vitesse de cassage**
en Farming (contrairement à Mining) — le vrai débit dépend soit d'une vitesse de
déplacement plafonnée par culture (Rancher's Boots/Sundial), soit d'une ferme
automatisée (redstone/dispenser), et **aucune des deux n'a de valeur chiffrée
sourcée** (ni wiki officiel, ni SkyHanni-REPO — recherche faite avant de coder,
pas supposée). Un fork a été soumis explicitement à l'utilisateur (3 options :
farm AFK, vitesse manuelle optimale, ou les deux comparées) — réponse : "les
deux, comparées" — puis un second fork après avoir confirmé qu'aucune des deux
n'a de source chiffrée propre : l'utilisateur a donné le vrai plafond physique
**"on ne peut casser que 20 blocs/seconde maximum dans Minecraft"** (mécanique
de tick vanilla 20 TPS, un fait de moteur de jeu vérifiable, pas une estimation)
— retenu comme débit universel pour un setup parfaitement optimisé, quelle que
soit la méthode réelle (les deux sont plafonnées par ce même moteur).

**Formule finale** : `actionsPerHour = 20 × 3600 = 72 000` (fixe, ne dépend
d'aucun stat) ; `yield = actionsPerHour × 1 (baseDropCount, vanilla confirmé)
× (1 + (FarmingFortune + CropFortune)/100)` (formule réelle, page wiki "Crop
Fortune", identique au système Mining Fortune sous-jacent).

**Source du plafond END/LATE** : contrairement à Mining (aucune synthèse
officielle n'existait, reconstruite pièce par pièce), la page wiki "Farming
Fortune" a sa PROPRE section "Theoretical Maximum" déjà calculée et
vérifiée par la communauté — réutilisée telle quelle plutôt que reconstruite
composant par composant (risque de diverger d'un total déjà consensuel) :
**+2012.7 Farming Fortune** (permanent, générique à toute culture) + Crop
Fortune spécifique par catégorie : **+472** (5 cultures hors liste Carrolyn :
Potato/Melon Slice/Sugar Cane/Sunflower/Moonflower), **+484** (7 cultures sur
la liste Carrolyn : Wheat/Carrot/Pumpkin/Cactus/Mushroom/Nether Wart/Wild
Rose), **+509** (Cocoa Beans, Carrolyn + Chocolate Fortune perk en plus).
Setup implicite : Farming LX + Helianthus recombobulé/reforgé/gemmé +
Blossom Set @2500 visiteurs + Specialized Tool niveau 50 + Rose Dragon
Lv200 (vérifié meilleur pet sur les 13 cultures : +336.7 générique bat même
les pets crop-spécifiques Mosquito/Bee/Pig sur LEUR propre culture) + tous
les talismans/attributs/chips listés. Sources temporaires (Hypercharge,
Jacob's Contest only, saison-conditionnelles) explicitement exclues du
plafond continu — documenté, pas oublié (jusqu'à +976.5 FF existent en jeu
mais nécessitent un contexte ponctuel non modélisé ici).

**Tier MID** : contrairement à Mining, les 13 outils spécialisés ne sont PAS
achetables à l'AH (confirmé : aucun prix trouvé dans `price_history_ah`) —
sourcé wikitext : "Purchased from the SkyMart... leveled up by farming crops
and upgraded using... Jacob's Tickets", un investissement de temps, pas de
coins. Niveau d'outil assumé = objectif de Farming skill du tier
(`TIER_CONFIG.mid.target = 25` → +100 Crop Fortune, formule réelle +4/niveau).
Armure : les 8 tiers réels (Farmhand→Helianthus, wikitext "Farming
Fortune#Armor") sont eux bien vendus à l'AH — le meilleur tier affordable
sous le budget du tier (`max_gear_cost`) est choisi automatiquement (Squash,
~68.2M, sous le budget mid de 100M — Fermento à ~158.8M ne rentre pas).

**Tier EARLY — honnêtement non éligible** : `TIER_CONFIG.early.forbidden`
liste explicitement "Garden" (règle déjà existante dans ce projet, pas ajoutée
pour l'occasion), et la page wiki "Farming Fortune" confirme elle-même
qu'elle "has no effect while on one's Private Island" — sans Garden, pas de
Farming Fortune, donc pas d'optimisation possible. `top_setup:null` pour les
13 cultures à ce tier, même traitement honnête que les combos Mining
structurellement impossibles à un tier donné.

**Résultat final (late, triés par coins/h, après Fly Shard + Pest Farming +
Bonus Pest Chance, 4e passe)** : Mushroom 21.65M/h, Pumpkin 21.50M/h, Wheat
17.94M/h, Sugar Cane 14.83M/h, Carrot 15.30M/h, Nether Wart 14.15M/h, Potato
13.87M/h, Cactus 14.44M/h, Cocoa Beans 13.23M/h, Sunflower 13.18M/h, Melon
Slice 13.07M/h, Moonflower 13.02M/h, Wild Rose 12.94M/h. Toujours sous le
repère "40M+/h" cité par l'utilisateur pour du Pest Farming (voir raisons
possibles dans la section dédiée) mais un ordre de grandeur cohérent avec
Mining cette fois (dizaines de millions, plus le resserrement quasi total
de l'écart entre cultures — le Pest Farming domine largement le revenu total
à ce stade, ~12-13M/h identiques sur les 13 cultures contre 480K-9.5M/h de
variation côté cultures seules). **Aucun repère en jeu fourni par
l'utilisateur pour Farming** (contrairement à Mining) — ces chiffres sont
sourcés et vérifiés mathématiquement contre la formule/le plafond wiki, mais
pas encore confrontés à une performance réelle en jeu.

### Pest Farming — méthode manquante trouvée, signalée explicitement par l'utilisateur (5 août, 3e passe)

Après le 2e livrable, l'utilisateur a directement demandé : "tu omés des
méthodes, le pest farm par exemple". Vérification faite : les Pests ne sont
**pas une méthode concurrente** (on ne choisit pas "farmer des cultures" OU
"farmer des pests") — un Pest a une chance de spawn à chaque culture cassée
en Garden (dès Garden V), donc c'est un revenu **additif** qui accompagne
n'importe quelle culture déjà en train d'être farmée. Le vrai facteur
limitant n'est PAS le taux de casse de culture mais un **cooldown de spawn**
(sourcé page wiki "Pest#Spawn Cooldown") : 5 min par défaut, réductions
réelles listées (gear Pesthunter, reforge Squeaky, Moth Shard, perk Mayor
Finnegan "Pest Eradicator") jusqu'à un plancher de 2min10s SANS Finnegan
(mayor-conditionnel, exclu par cohérence avec le reste du projet) ou 1min10s
avec.

**Bug de données trouvé en vérifiant** : la table `garden_pest_rare_drops`
(déjà en base, chargée lors d'une session antérieure) donnait des taux de
drop rare erronés (ex : 33% pour le Slug) — les 13 pages wiki individuelles
de chaque Pest (Fly/Cricket/Locust/Rat/Mosquito/Earthworm/Mite/Moth/Slug/
Beetle/Dragonfly/Firefly/Praying Mantis, toutes fetchées et lues le 5 août)
donnent le vrai chiffre uniforme : **0.75%** pour le drop rare, sur une vraie
"Mob Drops Table" bien plus riche que ce qui avait été capturé : 1 000 coins
fixes par kill + un drop GARANTI (100%) d'un item Enchanted de la culture
associée dont la quantité scale avec la vraie Farming Fortune du joueur
(`base + floor(FarmingFortune / diviseur)`) + le drop rare à 0.75%. Cette
ancienne table n'a pas été corrigée en base (hors scope immédiat) mais n'est
plus utilisée par `lib/pluton-farming.ts` -- valeurs recalculées directement
depuis les pages sources, à corriger dans `garden_pest_rare_drops` dans une
passe dédiée si besoin.

**Meilleur Pest confirmé par calcul réel, pas deviné** : les 13 pests
comparés par valeur espérée par kill (prix Bazaar réels du 5 août) — Beetle
(associé à Nether Wart) gagne avec ~76 800 coins/kill (dominé par son drop
garanti, Enchanted Nether Wart, à un prix Bazaar élevé ×116 exemplaires à
Farming Fortune max). Confirmé sourcé wiki : "The Pest spawned is not
affected by the crop broken" — le meilleur Pest (Beetle) peut être ciblé
via Sprayonator + vinyle dédiée quelle que soit la culture activement
farmée, donc ce revenu s'applique identiquement aux 13 cultures.

**Bonus secondaire trouvé au passage** : Pesthunter Phillip donne +5 Farming
Fortune par pest reçu au vacuum, buff 30 min, plafond +200 à 40 pests
(sourcé page wiki dédiée) — modélisé en régime permanent (masse moyenne de
buff actif = taux d'arrivée × durée du buff, même famille de calcul que le
multiplicateur moyen pondéré de Mining Speed Boost) plutôt qu'ignoré comme
"non modélisable" dans la 2e passe — ~69 FF en continu au taux de spawn
retenu, jamais au plafond de 200 (le taux d'arrivée réel est trop faible).

**Appliqué uniquement END/LATE** (même logique que le reste de la couche
investissement maximal) — MID n'a pas Sprayonator/vinyle modélisé, cohérent
avec l'omission déjà documentée d'équipement/pet à ce tier.

### Bonus Pest Chance — 2e trou trouvé sur le même sujet (5 août, 4e passe)

Le premier chiffre livré (Pest Farming ~2.1-2.4M/h additif) a été directement
challengé par l'utilisateur : "le pest farming peut rapporter 40M+/h en vrai,
pourquoi ton calcul est si bas ?". Vérification faite plutôt que de défendre
le chiffre : la page "Pest#Spawning" dit explicitement **"By default, only
one Pest will spawn at a time. This can be increased via Bonus Pest Chance"**
— le modèle précédent supposait 1 seul Pest par cycle de spawn (130s), alors
qu'un vrai stat dédié ("Bonus Pest Chance", page wiki propre avec sa propre
section "Theoretical Maximum", même format que Mining/Farming Fortune)
permet jusqu'à 8 Pests simultanés par cycle.

**Plafond officiel réutilisé tel quel** (même méthodologie que pour Farming
Fortune) : 551.5 Bonus Pest Chance max → 6 Pests garantis + 51.5% de chance
d'un 7e = 6.515 Pests attendus par cycle de spawn (au lieu de 1). Un 2e
mécanisme trouvé au passage : les **Pièges** (Pest Trap/Mouse Trap/Vermin
Trap, page wiki dédiée) fonctionnent en parallèle du cycle organique,
indépendamment, même hors-ligne — max 3 pièges posés simultanément, ~15 min
par Pest et par piège, +12 Pests/h supplémentaires.

**Coût réel identifié et accepté, pas caché** : atteindre 551.5 BPC suppose
l'Équipement Pesthunter's Set (Necklace/Cloak/Belt/Gloves — vérifié via leurs
4 pages wiki individuelles : 0 Farming Fortune, seulement BPC + réduction de
cooldown) à la place du Blossom Set utilisé dans le plafond Farming Fortune
(perte de 330 FF). Comparaison faite avant de trancher : la perte de rendement
sur les cultures (~15% du multiplicateur de fortune) est très largement
compensée par le gain de revenu Pest Farming (le swap est donc retenu).
**Limite honnête, pas cachée** : l'arbitrage précis pièce-par-pièce (quel
Pesthunter exact remplace quelle pièce Blossom) n'a pas été refait au niveau
de détail du reforge Ambered/Glacial de Mining — approximation par
comparaison de totaux, pas un vrai calcul combinatoire pièce par pièce.

**Résultat après ce 2e fix** : Mushroom late 11.88M/h → 21.65M/h (le Pest
Farming total passe de ~2.1M/h à ~12.9-13.7M/h selon la culture, dominant
maintenant largement le revenu). **Toujours en dessous du repère "40M+/h"**
cité par l'utilisateur — écart non résolu, raisons possibles non vérifiées
plus loin faute de source chiffrée supplémentaire trouvée à ce stade :
arbitrage pièce-par-pièce Pesthunter plus favorable qu'estimé, mécanisme
Vermin Vaporizer Chip (mentionné dans le plafond BPC mais pas creusé en
détail — pourrait avoir un effet multiplicatif propre non capturé), ou le
repère "40M+" décrit un pic/une fenêtre courte plutôt qu'une moyenne
soutenue sur l'heure. Documenté comme écart honnête restant, pas résolu par
une supposition.

**3 bugs de bonne hygiène évités dès la construction** (leçons directement
appliquées depuis le chantier Mining, pas redécouvertes) : DELETE explicite
avant rebuild dans `computeAndPersistAllFarmingRankings()` (le bug trouvé a
posteriori sur Mining), route de debug avec try/catch retournant l'erreur
réelle dès la première version (le bug qui avait coûté un aller-retour sur
Mining), déclenchement unique vérifié par polling DB plutôt que retry sur la
route elle-même.

**Gaps honnêtes documentés, pas cachés** :
- Vitesse manuelle optimale par culture (Rancher's Boots/Sundial) : aucune
  source chiffrée trouvée, non modélisée — le plafond moteur 20/s remplace
  les deux méthodes réelles (manuelle ET automatisée) sans trancher laquelle.
- Tier MID : équipement (Peony/Blossom) et pet non inclus, faute d'un budget
  cohérent une fois l'armure choisie (Squash consomme déjà 68.2M des 100M) —
  plutôt que d'inventer une répartition budgétaire arbitraire entre
  catégories, ces sources sont omises à ce tier (chiffre mid sous-estimé,
  jamais sur-estimé).
- Mushroom : Red Mushroom et Brown Mushroom partagent le même Mushroom
  Fortune (un seul outil, Fungi Cutter) mais ont des prix Bazaar différents
  (Brown 5.03 vs Red 4.67 le 5 août) — Brown retenu (le plus rentable),
  cohérent avec le principe "choisir la meilleure option réelle" déjà
  appliqué à Mining (Ambered/Glacial, socket Amber/Jade/Topaz).
- Sources temporaires Farming Fortune (jusqu'à +976.5 FF) explicitement
  exclues du plafond continu — voir détail dans la section END/LATE
  ci-dessus.
- **Mutations (Greenhouse)** : système entier vérifié (page wiki dédiée,
  wikitext complet lu) — chaque Mutation (Dustgrain, Choconut, Gloomgourd,
  Lonelily, etc.) est récoltée en GROS lots d'une des 13 cultures déjà
  modélisées (ex : Dustgrain donne 100x Wheat, Choconut 200x Cocoa Beans),
  pas un nouvel item vendable distinct. Le mécanisme de spawn/croissance est
  probabiliste et conditionné à un agencement spécifique de cultures dans le
  Greenhouse (pas un simple "casser en continu") — traité comme hors du
  scope "raw crop only" de ce calculateur, même principe que Powder/coffres
  de trésor exclus du ceiling Mining. Un vrai bonus Greenhouse trouvé au
  passage (+3% Yield/+2.5% Growth Speed par culture unique plantée, jusqu'à
  12 fois) n'est PAS inclus — mécanique de jardin passive distincte de la
  formule de rendement actuelle, pas modélisée.
- **Audit "as-tu vraiment tout maxé" (5 août, 2e passe)** : demandé
  explicitement par l'utilisateur après le premier livrable. A fait remonter
  1 vrai trou fermé (Fly Shard, attribut "Fortunate Farmer", +25 Farming
  Fortune inconditionnel, absent du build de référence de la page wiki
  elle-même — qui s'annonce elle-même partiellement obsolète depuis la mise
  à jour Greenhouse) via un audit croisé de tous les Attribute Shards taggés
  Farming (5 pages de rareté). Golden Dragon Pet vérifié et écarté (pet
  Combat, pas Farming). Nouveau plafond : **+2037.7 FF** (au lieu de
  +2012.7).
- **Mooshroom Cow Pet — dépendance cross-activité réelle, non fermée** :
  sourcé dans la même page wiki, ce pet donne +0.7 Farming Fortune par
  tranche de 20 Strength du joueur (perk "Farming Strength"), en plus de son
  propre +100 fixe. La page elle-même donne le point de comparaison : à
  6 762.86 Strength, il égale exactement Rose Dragon (+336.7) ; au-delà, il
  le dépasse. Un personnage Combat 100% maxé (le même standard "fin de jeu"
  que le reste de ce chantier) peut réellement dépasser ce seuil de Strength
  en jeu — mais vérifier un vrai plafond de Strength demanderait de
  construire le calculateur Combat/Slayer (pas encore commencé, table
  `item_stats` par ailleurs connue incomplète sur les stats des items
  endgame, voir CLAUDE.md). Rose Dragon reste le choix retenu ici
  (autonome, ne dépend d'aucune autre activité) — dépendance documentée
  explicitement plutôt que devinée, à réévaluer une fois Combat/Slayer
  construit.

**Prochaine étape** : Foraging, Fishing, Slayer/Combat, Dungeons restent à
construire — pas commencé.
