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
[CONSOMMATION]
  Money Making  ← classement INTER-activités = pluton_rankings SANS filtre activity_key
  Evolve Skills ← meilleur setup par activité/tier = pluton_setups
  Milestones    ← pont déjà existant et vérifié : milestone_tier_totals.money_making_tier_key
                   (7 tiers Milestones → 4 tiers Money Making, many-to-one, pas un miroir parfait)

         ▲
         │ déclenché par changement détecté
[AUTOMATISATION]
  wiki-auto-sync : hash de contenu avant upsert → content_changed_at si vraiment différent
  extraction-refresh (nouveau cron) : compare content_changed_at au dernier run réussi
    de la fonction concernée (extraction_registry) → rappelle le parseur si nécessaire
  → recalcul CIBLÉ de pluton_rankings (uniquement l'activity_key affecté)
  → test de ranking flip (Hyperion/Astraea) : compare l'ordre avant/après, loggé si
    changé — visible et audité, jamais silencieux
```

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
