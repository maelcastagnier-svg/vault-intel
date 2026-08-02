@AGENTS.md
# CLAUDE.md — Vault (contexte projet pour Claude Code)

> Basé sur la session la plus récente disponible (22 juillet). En cas de 
> divergence avec une session antérieure sur le même sujet, cette version fait foi.

## Vision

Plateforme SaaS d'intelligence économique gaming par abonnement, démarrage sur 
Hypixel Skyblock. Dashboard web avec analyses générées par agents Claude en cron 
Vercel, basées sur données de marché collectées en continu + mécaniques de jeu réelles.

## Stack

- Next.js sur Vercel (Pro) + Supabase Postgres (Pro, 1GB RAM/2 cores)
- Claude API (Sonnet + Haiku) en appels directs depuis les routes Vercel, prompt caching
- API Hypixel officielle + SkyCofl API Premium+ (Account Token JWT)
- Vercel Cron Jobs natifs — n8n abandonné en production
- three.js + @react-three/fiber pour le rendu 3D du personnage (Money Making SetupOverlay) — 
  remplace le CSS 3D (`transform-style:preserve-3d`), voir section dédiée plus bas

URL prod : https://vault-intel-iota.vercel.app
Repo : github.com/maelcastagnier-svg/vault-intel

## 🚧 CHANTIER FINAL — extraction complète + automatisation résiliente (2 août, en cours)

Nouveau chantier demandé explicitement par l'utilisateur, distinct de la cartographie
ci-dessous : Volet 1 (compléter les données encore partielles) + Volet 2 (automatiser
les tables déjà chargées en one-shot), Volet 2 priorisé en premier ("on ne construit pas
plus de contenu tant que ce qu'on a déjà n'est pas sécurisé"). 6 règles strictes
(zéro donnée inventée, extraction 100% avec sous-catégories, discovery_queue active,
zéro doublon, cron résilient sur chaque table externe avec sync_log, zéro appel Claude).
Détail complet dans WIKI-MAPPING.md, section "CHANTIER FINAL — Volet 2".

**État des lieux initial** : audit de tous les crons vs `list_tables` a trouvé 48 tables
référentielles (NEU-REPO/wiki) chargées une seule fois par migration SQL, jamais reliées
à un cron — `neu-sync` ne couvre en réalité que 4 tables (`reforges`/
`trophy_fish_thresholds`/`essence_shop_upgrades`/`neu_constants_raw`), tout le reste
(gemstones, garden_*, museum_*, accessory_powers, etc.) était un chargement isolé.

**✅ Volet 2 — 9 tables du chantier cartographie de cette semaine automatisées (2 août)** :
1 cron hebdomadaire **`wiki-referential-sync`** (lundi 5h45) qui reparse les pages déjà
cachées par `wiki-auto-sync` — `hotm_forge_durations`, `garden_pests`/`garden_pest_
fortune_penalty`, `time_pocket_upgrades`/`time_pocket_aging_items`/`minion_upgrade_
items`, `sack_tiers`/`trapper_pelt_rarities`/`trapper_pelt_modifiers`. *(Construit
d'abord en 4 crons séparés, fusionnés le même jour sur demande d'optimisation de
l'utilisateur — chaque table ne coûtait qu'une poignée de lectures Supabase déjà en
cache + un petit upsert, aucune raison de garder 4 fonctions Vercel séparées pour un
travail de quelques secondes au total. 7 sous-fonctions toujours isolées par
try/catch individuel sous une seule entrée `sync_log`, même pattern que
`network-events-sync` — une table qui échoue son parsing n'empêche ni ne masque les
autres.)* Plus **`discovery-scan`** (quotidien) : ferme le point explicite de
l'utilisateur ("la boucle de résilience s'arrête dès qu'on arrête d'y travailler
manuellement") — nouvelle colonne `game_mechanics_misc.created_at` détecte les pages
vraiment nouvelles et les logue automatiquement dans `discovery_queue`, zéro Claude.

**Obstacle réel rencontré et contourné** : le pattern habituel de test (route de debug +
requête HTTP directe sur preview) s'est heurté à un mur SSO Vercel jamais vu sur les
branches précédentes (`ssoProtection.enabled: true`) — contourné en rejouant les
parseurs en local (`npx tsx`) contre le vrai contenu déjà en base, comparé ligne à ligne
à l'état actuel des tables. **2 vrais bugs de parsing trouvés et corrigés grâce à cette
méthode avant tout déploiement** (fuite de lignes entre deux wikitables adjacentes,
et une table sautée par erreur d'ancrage) — détail complet dans WIKI-MAPPING.md.

Les 38 tables restantes (sur les 48 de l'audit initial) sont loguées individuellement
dans `discovery_queue` avec leur vraie page source déjà identifiée (recherche dédiée
menée avant de coder, jamais deviné) — prêtes pour une passe future. `weight_formulas`
reste aussi one-shot (source GitHub, pas wiki — nécessite un fetch distinct, pas
construit cette passe par prudence).

**Prochaine étape** : Volet 1 (compléter les données encore partielles/en gap) une fois
Volet 2 jugé suffisamment avancé par l'utilisateur.

## 🚧 Cartographie exhaustive Hypixel Skyblock — 2 vrais bugs fermés en cours de route (31 juillet)

Chantier séparé du Bloc 8/Pluton, déclenché par la rigueur exigée sur les formules HOTM
pendant ce bloc : "on avance trop au coup par coup" — décision de faire un audit
systématique de toute la mécanique du jeu (jeu + joueur). Méthode inversée : cartographier
le jeu depuis ses vraies sources en premier (wiki officiel, NEU-REPO, API Hypixel, projets
communautaires), PUIS comparer notre base à cette cartographie — jamais l'inverse.
**Chantier en cours, pas terminé** — voir état d'avancement en fin de section.

### ✅ Étapes C/D/E Tier 1 terminées — Économie/Événements réseau, 0% → réel (1er août)

Supabase MCP reconnecté le même jour, Tier 1 traité en entier dans la foulée (Election →
News → Fire Sales → Bingo, ordre déjà validé). Détail complet dans WIKI-MAPPING.md,
synthèse ici :

**5 nouvelles tables réelles créées et peuplées** : `discovery_queue` (boucle de
découverte, 6 entrées loguées ce jour), `skyblock_mayor_election`, `skyblock_news`
(9 lignes), `skyblock_fire_sales` (0 ligne — vide en vrai, pas de fabrication),
`skyblock_bingo_events` + `skyblock_bingo_goals` (event août 2026, 25 goals réels dont
`KILL_TRAPPER_MOB`). Toutes avec RLS + policy lecture publique, cohérent avec le reste
du projet.

**Cron réel câblé** : `network-events-sync` (`vercel.json`, `*/15 * * * *`), 4 fonctions
groupées dans un seul cron (même pattern que `skyblock-resources-sync`), zéro clé API
requise pour les 4. Vérifié en conditions réelles avant merge (route de debug temporaire
appelant `runNetworkEventsSync()` directement, supprimée après validation) : les 4
fonctions réussissent via le vrai chemin de code, comptes exacts confirmés contre
Supabase (élection 1, news 9, fire sales 0, bingo 26 = 1 event + 25 goals), aucun doublon
malgré les inserts manuels faits pendant le mapping initial (upserts sur les bonnes clés
de conflit).

**2 corrections trouvées en creusant, pas juste supposées** :
- Table `mayors` (stub pré-existant, 0 ligne) avait des colonnes inventées
  (`economic_impact`/`active_items`/`duration_days`) qui ne correspondent à rien dans la
  vraie réponse API — nouvelle table `skyblock_mayor_election` créée à la place plutôt
  que de réutiliser un schéma non sourcé, `mayors` non touchée, loguée dans
  `discovery_queue` pour décision future (fusionner/supprimer).
- Les marquages 🔴 de l'Étape B pour Sacks et Rift guide étaient trop pessimistes —
  `sack_contents` (677 lignes) et `rift_guide` (73 lignes) existent déjà réellement en
  base avec des colonnes plausibles, pas des stubs. Corrigé en 🟡. Limite honnête de
  l'Étape B assumée dès le départ (pas de vérification Supabase avant reconnexion).

**Reste bloqué** : `/v2/skyblock/bingo` (endpoint live, progression par joueur) exige
`HYPIXEL_API_KEY`, absente de cet environnement local — loguée dans `discovery_queue`,
à débloquer une fois la clé récupérée (même pattern d'expiration récurrent déjà
documenté ailleurs dans ce fichier).

### ✅ Tier 2 + Tier 3 fermés le même jour (2 août) — détail dans WIKI-MAPPING.md

**Tier 2** (Sacks/Bags/Power Stones/Minion Modifiers/Matriarch/Trapper/Races) :
2 vraies découvertes structurées chargées — `sack_tiers` (capacités réelles par
taille, trou trouvé même si `sack_contents` existait déjà) et **Trapper** (système
entièrement nouveau : Trevor le NPC, monnaie Pelts, `trapper_pelt_rarities`/
`trapper_pelt_modifiers`, 0%→réel, confirmé vivant via le goal Bingo
`KILL_TRAPPER_MOB` du Tier 1). **2 corrections d'Étape B** : Power Stones était déjà
100% couvert par `accessory_powers` (23 lignes) — marquage 🔴 corrigé en ✅. Minion
Modifiers (58 items réels confirmés) et Time Pocket/Aging Items (Bags) restent
loggés dans `discovery_queue`, pas construits (risque de deviner une catégorisation
non sourcée). The Matriarch et Races confirmés réels, documentés sans table
(pas de structure tabulaire pour l'un, faible enjeu économique pour l'autre — même
profil que Carpentry/Taming/Social).

**Tier 3** (10 événements saisonniers) : passe légère, tous confirmés réels.
Trouvaille notable : Mining Fiesta est programmée par le Mayor Cole (+bonus Foxy/
Jerry) — connexion directe avec `skyblock_mayor_election` déjà chargé au Tier 1.
Shen's Auction : mécanique d'enchère à gagnants multiples par slot (ex: 80 gagnants
normal/40 Ironman sur un même item), une fois par SkyBlock Year, jamais vue ailleurs
dans le projet — documentée, pas de table (fréquence trop faible pour un cron).

### ✅ Source 3 approfondie + discovery_queue vidée à 1 entrée près (2 août)

Détail complet dans WIKI-MAPPING.md, section "Source 3 + queue vidée". Résumé :
Garden Pests trouvé et chargé (0%→réel, triangulé SkyHanni/Firmament/hypixel-api-
reborn puis recroisé contre le wiki, `garden_pests` 15 lignes + `garden_pest_
fortune_penalty` 15 lignes), plus `minion_upgrade_items`/`time_pocket_aging_items`/
`time_pocket_upgrades` fermés. Les 8 entrées `discovery_queue` restantes traitées
une par une jusqu'à épuisement — **résultat le plus important : #6 a fait remonter
un vrai bug de production**, `radar-agent` interrogeait encore l'ancienne table
`mayors` (0 ligne depuis toujours) et injectait un contexte mayor silencieusement
vide dans le prompt Claude à chaque run depuis le lancement de Radar — corrigé pour
lire `skyblock_mayor_election`, mergé sur master, prod confirmée READY. Seule entrée
non résolue : `/v2/skyblock/bingo` (endpoint live per-joueur), bloqué sur
`HYPIXEL_API_KEY` absente de l'environnement local — rien d'autre à débloquer sans
la clé. `discovery_queue` finale : 12 resolved / 1 pending.

**Point opérationnel noté en marge** : le vrai wiki officiel Hypixel
(`wiki.hypixel.net`) a fermé le 21 juillet 2026 (annonce Hypixel) — sans impact,
ce projet utilise déjà `hypixelskyblock.minecraft.wiki` (wiki communautaire) depuis
le 22 juillet, confirmé toujours actif.

**Décision suivante à prendre avec l'utilisateur** : les 15 systèmes + le bloc
Économie/Événements de l'Étape B sont maintenant tous soit couverts, soit
explicitement loggés comme gap connu (le seul restant, #7, est bloqué sur une clé
API). Pluton (Bloc 8) reste en pause jusqu'à ce que l'utilisateur juge la base
suffisante — pas de nouveau seuil fixé, décision à prendre : reprendre Pluton,
approfondir un système précis, ou autre chantier.

### Contexte — correction méthodologique du 1er août

Après une passe système-par-système sur les 15 systèmes présupposés au départ,
l'utilisateur a posé une question de contrôle qui a révélé un vrai biais — je vérifiais
la liste présupposée au lieu de laisser les sources découvrir leur propre structure.
**Méthode corrigée et imposée pour la suite, en 5 étapes strictes : A (découverte brute,
zéro filtre) → B (regroupement basé sur l'organisation des sources elles-mêmes) → C
(comparaison Supabase) → D (plan de tables) → E (automatisation récurrente).** Détail
complet des étapes A/B (15 159 pages wiki, 112 Nav réels, 32 endpoints API, 3 projets
communautaires) dans `WIKI-MAPPING.md`, section "🔴 CORRECTION MÉTHODOLOGIQUE".

**Boucle de découverte explicite** (remplace une liste B figée) : un système n'est
"couvert" que quand son propre fetch en profondeur ne fait plus apparaître de nouvelle
sous-référence — toute sous-page/champ/mécanique inconnue croisée en cours de fetch va
dans `discovery_queue` et est traitée dans la foulée, jamais reportée. Preuve directe de
la nécessité de cette règle : les 11 sous-systèmes Rift déjà connus cachaient des
sous-minigames (Barry/Cowboy/Murder, CrazyKloon/Glyphs/KatHouse/Mirrorverse) invisibles
au niveau wiki/titre, trouvés seulement en ouvrant hypixel-api-reborn.

**Estimation honnête de couverture au moment de la correction** (demandée
explicitement, pas un chiffre rond) : localisation des sources ~80-90%, identification
des systèmes ~70-75% (basée sur des noms de template, pas leur contenu réel), contenu
réellement lu ~3-5%, validation live ~0%. Chiffre unique honnête à ce moment-là :
15-25%, pas plus — le Tier 1 ci-dessus fait progresser ce chiffre sur un bloc précis,
pas sur l'ensemble.

**Pluton (Bloc 8) reste en pause jusqu'à ce que cette base de données complète soit
construite** — pas avant, décision explicite de l'utilisateur.

**Source 1 (NEU-REPO) épuisée — 40/40 fichiers réellement inspectés**, reconfirmés
exhaustifs en direct via l'API GitHub (pas depuis notre cache, qui aurait pu être
périmé). Deux vrais bugs de production trouvés et corrigés en creusant, pas seulement
des trous de collecte :

### 🔴 Bug corrigé — Slayer max tiers Blaze/Spider inversés

`leveling.json` (NEU-REPO, jamais exploité avant cette passe) a fait remonter
`slayer_highest_tier`/`slayer_to_highest_tier` donnant Blaze=T4/Spider=T5 —
l'inverse exact de `GAME_TRUTHS` (`lib/money-making-constants.ts`, utilisé par
Money Making ET Evolve Skills) qui affirmait Blaze=T5/Spider=T4 depuis le début.
**Vérifié contre le wiki officiel avant de corriger** (jamais tranché sur une seule
source) : page Inferno Demonlord confirme littéralement "Tier IV" comme max, page
Tarantula Broodfather confirme "Tier V" avec mécanique exclusive à ce palier
("Till Death Do Us Part"). Les deux sources indépendantes (NEU-REPO + wiki)
s'accordent — `GAME_TRUTHS` avait bien les deux inversés.

**Corrigé** (`lib/money-making-constants.ts` + duplication en dur trouvée dans
`app/api/cron/setup-generate-agent/route.ts`, qui ne lisait pas `GAME_TRUTHS` mais
avait la même erreur recopiée à la main) — branche `fix/slayer-tier-blaze-spider-swap`,
mergée sur master, prod confirmée `READY`.

**Contamination réelle trouvée avant de corriger, masquée en code — PAS régénérée
(coût API réel, à faire en un seul lot groupé plus tard, décision explicite de
l'utilisateur)** :

- **`claude_analysis`** (3 sections, pas 2 — `spider_t4_slayer` trouvé dans
  `money_making_mid` en recroisant précisément après le masquage, absent du premier
  balayage par phrase) : `money_making_end` contient `blaze_t5_slayer_grind`,
  `money_making_late` contient `blaze_t5_slayer_scorched_books_arbitrage`,
  `money_making_mid` contient `spider_t4_slayer` (étiqueté "MAX" à tort — le vrai
  max Spider est T5, pas T4).
- **`method_setups`** — les mêmes 3 lignes exactement (`method_key`+`tier` :
  `blaze_t5_slayer_grind`/end, `blaze_t5_slayer_scorched_books_arbitrage`/late,
  `spider_t4_slayer`/mid).
- **`player_skill_cards`** — les 2 lignes de Cucumber (seul profil de test réel avec
  du Slayer), générées 2026-07-28 23:16:18 et 2026-07-29 00:08:07. Relecture complète
  du contenu réel : la 1ère (profil quasi-vide, tout en `unlock_access`) ne cite aucun
  max tier erroné littéralement, mais reste générée sous l'ancien `GAME_TRUTHS` fautif.
  La 2ème cite explicitement `"T4 Tarantula (max)"` sur la carte Spider — la preuve
  concrète et vérifiée du bug dans du contenu réellement servi.

**Masquage 100% pur code, zéro appel Claude, mergé sur master** (branche
`fix/mask-slayer-contamination`) :
`SLAYER_BUG_CONTAMINATED_METHOD_IDS` (Set des 3 method_key, `lib/money-making-constants.ts`)
filtré en lecture dans `app/api/market-data/route.ts` (retiré de `active`/`vault` avant
d'être servi au frontend) + vérifié en défense en profondeur dans
`app/api/setup/generate/route.ts` (retourne `not_ready` si un client tente quand même de
récupérer le setup d'une de ces 3 méthodes). Le contenu en base n'est pas touché — seule
la lecture filtre. Pour `player_skill_cards`, masquer une carte entière est disproportionné
(c'est TOUTE la section Slayer du joueur) : `SLAYER_BUG_FIX_DEPLOYED_AT` (timestamp du
commit `a365b4e`) compare `generated_at` de la carte, `app/api/player/skills/route.ts`
renvoie `stale_slayer_data: true` si la carte Slayer existe et a été générée avant le fix
— `SkillsTab.tsx` affiche un bandeau "à resync" au-dessus des 6 sous-cartes boss plutôt que
de les cacher ou d'inventer un contenu corrigé. **À faire avant le lancement** : régénérer
en un lot groupé (1 appel `money-making-agent` end+late, 1 appel `setup-generate-agent`
mid+end+late, re-sync Cucumber) puis retirer `SLAYER_BUG_CONTAMINATED_METHOD_IDS`/le
bandeau une fois confirmé propre.

### ✅ weight_formulas reconstruite — Senither weight (Lily documentée, pas chargée)

`weight.json` (NEU-REPO) a révélé l'existence de 2 formules de weight concurrentes
(Lily et Senither) — aucune des deux en base depuis la suppression du 16 juillet.
**Recherche de popularité faite avant de trancher** (consensus communautaire sur les
forums Hypixel + confirmation directe que SkyCrypt, déjà notre référence de
comparaison cette semaine, utilise Senither) → Senither validé comme référence
principale par l'utilisateur.

Table `weight_formulas` reconstruite (20 lignes) avec la vraie formule Senither,
sourcée du code Python réel et littéral de `timnoot/senitherweight` (port actif de
l'algorithme original) : skills (`(niveau×10)^(0.5+exponent+niveau/100)/1250` + overflow),
slayers (`min(XP,1M)/divider` + overflow par palier), donjons
(`niveau^4.5×percentage_modifier` + overflow). Lily documentée en commentaire de
migration comme alternative connue, non implémentée.

**Trou réel trouvé en chargeant, pas deviné** : cette source ne contient les
constantes slayer que pour zombie/spider/wolf/enderman — Blaze et Vampire absents
(mentionnés dans une docstring d'exemple du même fichier mais jamais définis).
Chargé tel quel, documenté comme manquant plutôt que complété par une valeur inventée.

### ✅ Source 2 (wiki officiel) — détail complet dans WIKI-MAPPING.md (1er août)

**Nouveau fichier `WIKI-MAPPING.md`** — même chantier, même rigueur, mais le détail par
système vit désormais dans ce fichier séparé (CLAUDE.md avait retouché sa limite de 150k
juste avec Combat/Slayer). CLAUDE.md garde uniquement ce résumé court par système + les
vrais bugs/gaps trouvés ; le détail (pages consultées, citations, formules complètes)
est dans WIKI-MAPPING.md.

Taxonomie complète confirmée d'abord : 681 catégories wiki réelles paginées jusqu'à
épuisement (via `curl` brut sur l'API MediaWiki, WebFetch ayant atteint son quota
hebdomadaire en cours de route), ~432 gameplay réelles après filtrage du bruit de
maintenance wiki, mappées aux 15 systèmes demandés + une douzaine non anticipés
initialement (Dark Auction, Bits Shop, Mayor, Museum, Power Orbs, Fairy Souls,
Mythological Ritual, événements saisonniers...).

**Combat/Slayer** (voir WIKI-MAPPING.md pour le détail) : fix Slayer T4/T5 reconfirmé
une 5e fois indépendamment (structure d'onglets des 6 pages boss + trivia explicite de
Revenant Horror). Mécanique réelle jamais mappée trouvée : Healing au kill d'un boss
Slayer, **ajoutée au jeu il y a seulement 13 jours** (2026-07-20) — zéro trace dans le
code/DB. Chaîne de déblocage réelle des 6 Slayers jamais vérifiée avant (Zombie→Spider
via T2 Revenant→Wolf via T2 Tarantula→Enderman via T4 Sven→Blaze via T3 Voidgloom,
Vampire séparément gated par un item de quête) — signal qu'Evolve Skills pourrait ne
vérifier que l'accès zone, pas cette vraie chaîne boss-à-boss (pas corrigé, hors scope
cartographie). Formule de dégâts réelle et bonus Warrior de Combat jamais sourcés dans
ce projet, capturés pour un futur calculateur type Pluton.

**Farming** (voir WIKI-MAPPING.md) : formule réelle Farming/Crop Fortune jamais
sourcée (1 point = 1% chance de +100% drops, garanti tous les 100 points). Crops
Garden récents (Sunflower/Moonflower/Wild Rose Fortune, ajoutés fin 2025) confirmés
réels — probable gap `collections`/`items_catalog`, pas encore vérifié (Étape 3).
Mécanique jamais mappée : le cap Farming peut dépasser 60 via médailles Gold à
Jacob's Contest (+1 par crop doré), contrairement au cap fixe de Combat.

**Foraging** (voir WIKI-MAPPING.md) : **Heart of the Forest cartographié en entier**
— le 2e arbre HOTM-like demandé explicitement, 8 tiers / 36 perks réels, 0% couvert
avant cette passe. **Root cause identifiée pour le bug de formule HOTM du Bloc 8** :
le perk Sweep de HotF utilise `floor((NextLevel+1)^3)` et reproduit exactement le
même total (1 758 267) que celui déjà noté "correct mais non expliqué" pour le nœud
Mining Speed de HOTM — confirme que Pluton utilisait la mauvaise formule/indexation,
correction triviale prête pour la reprise de Pluton. Starlyn Contest (équivalent
Foraging de Jacob's) confirmé réel, jamais mappé.

**Fishing** (voir WIKI-MAPPING.md) : formule réelle Sea Creature Chance jamais
sourcée (base 20%, cap 100%, **÷4 sur Private Island/Garden**) — directement
pertinent pour tout futur calcul de rendement Fishing par zone. Trophy Fishing
confirmé comme système à part (4 tiers Bronze→Diamond, Lotus Atoll + Crimson Isle),
distinct de `trophy_fish_thresholds` déjà chargé. Probabilités Treasure Fishing
jamais sourcées (89% good/10% great/1% outstanding).

**Dungeons** (voir WIKI-MAPPING.md) : **formule complète de Dungeon Score trouvée** —
répond directement au trou d'origine identifié le 22 juillet (`dungeon_rng_scores`,
provenance jamais tracée). Score = Skill+Explore+Speed+Bonus, 6 rangs réels D→S+
(seuils 0/100/160/230/269.5/300). Mécanique "Dungeonizing" jamais sourcée : le niveau
Catacombs donne jusqu'à +485% de stats multiplicatif sur les items dungeonisés.

**Crimson Isle/Kuudra** (voir WIKI-MAPPING.md) : 5 tiers Kuudra confirmés avec leurs
vrais seuils de réputation faction jamais sourcés (1000/3000/7000/12000, n'importe
quelle faction). Boss fight à 5 phases réelles jamais documentées (Crates→Ballista→
Fuel→Stomach→Lair). Dojo : vraie structure à 7 mini-jeux confirmée côté jeu, mais ne
contredit pas le blocage API déjà documenté au Bloc 7 (verified-absent).

**Enchanting/Alchemy** (voir WIKI-MAPPING.md) : formule XP Enchanting jamais sourcée
(`3.5×X^1.5`, plafond 500k XP/jour). Conjurer (passif Enchanting) donne +5% XP/niveau,
contre +4%/niveau pour les autres skills — structurellement différent. **🟡 Alchemy
plafonne à 50, pas 60** contrairement à Combat/Farming/Enchanting (tous confirmés 60
cette passe) — risque réel si un calcul de progression suppose un cap uniforme, à
vérifier en Étape 3.

**Rift** (voir WIKI-MAPPING.md) : reste bloqué en données réelles (aucun profil de
test engagé, voir Bloc 7) — mapping mécanique seul cette passe. 9 zones réelles
confirmées, légèrement différentes des 11 clés API déjà documentées (deux découpages
distincts, pas réconciliés faute de profil réel). Rift Time et le vrai système de
Timecharms (progression jamais mappée) confirmés réels et riches.

**Carpentry/Taming/Social** (voir WIKI-MAPPING.md) : passe légère, confirme les
exclusions déjà actées pour Evolve Skills plutôt que de les remettre en cause.
Carpentry confirmé cosmétique-only (commentaire littéral dans le wikitext) et
**plafonne aussi à 50** (2e skill après Alchemy sur un cap non-uniforme). Taming a le
même pattern "cap extensible par sacrifice d'item" que Farming/Jacob's (pets donnés à
George), plus des paliers Kat réels (10/20/25) utiles si un futur "pet flip"
money-making voit le jour.

### État d'avancement de la cartographie

**Statut réel, post-correction méthodologique (voir encadré 🚨 en haut de section)** :
la passe système-par-système (Combat/Slayer → Farming → Foraging → Fishing → Dungeons →
Crimson/Kuudra → Enchanting/Alchemy → Rift → Carpentry/Taming/Social, résumés courts
plus haut, détail complet dans `WIKI-MAPPING.md`) reste valable comme contenu, mais
n'était pas la bonne méthode — elle vérifiait une liste présupposée plutôt que de
laisser les sources révéler leur propre structure. **Étapes A (découverte brute) et B
(regroupement par les sources) refaites correctement et validées par l'utilisateur** :
voir l'encadré 🚨 en haut de cette section pour la synthèse, `WIKI-MAPPING.md` pour le
détail complet (15 159 pages/2 381 templates/112 Nav réels, 32 endpoints API, 3 projets
communautaires). **Couverture honnête actuelle : 15-25%, pas plus** — on sait où
chercher, on n'a pas encore fetché le contenu réel en profondeur. Étapes C/D/E
(comparaison Supabase → tables → automatisation) bloquées sur la reconnexion Supabase
MCP. Le Bloc 8 (Pluton) reste explicitement en pause jusqu'à ce que cette base
complète soit construite — pas avant.

## ✅ Bloc 7 (plan d'audit 8 blocs) — zones joueur restantes, structure vérifiée avant mapping (31 juillet)

Suite directe du Bloc 6, même méthode que toute la Phase 2 (chantier collecte totale) : 
structure brute vérifiée sur Cucumber avant tout mapping, jamais devinée. La clé 
`HYPIXEL_API_KEY` était de nouveau expirée en entamant ce bloc (même pattern récurrent déjà 
documenté) — rechargée par l'utilisateur, nouveau build déclenché pour la propager à la 
branche preview.

**Réellement débloquées cette passe** :
- **Garden** — `garden_player_data` (`copper`, `discovered_greenhouse_crops`) et 
  `player_data.garden_chips` (inventaire réel de chips, 8 types possédés chez Cucumber) 
  confirmés réels et non-vides. La grosse partie de la progression Garden (cultures/niveau/
  barn) vit sur un endpoint séparé (`/v2/skyblock/garden`), pas mappée cette passe — hors 
  scope du plan (qui ne demandait l'endpoint séparé que pour Museum).
- **AccessoryBag tuning** — `accessory_bag_storage` confirmé riche et non-vide : tuning par 
  slot (stats réparties), `highest_magical_power`, `selected_power`, `unlocked_powers`.
- **AutoPets** — `pets_data.autopet.rules` confirmé comme vraie structure (array de règles, 
  vide chez Cucumber — même limite que `harp_songs` en son temps : forme connue, contenu 
  non-vide jamais vérifié).
- **"Gifts/Winter" — la vraie donnée trouvée n'est pas celle supposée par l'audit d'origine** : 
  aucun champ "Winter gifting" n'existe côté API (recherché explicitement : gift/santa/winter, 
  seul hit hors-sujet `attributes.stacks.winter_serendipity`, un stack d'attribut sans rapport). 
  En revanche, les vrais gifts de Hina (Foraging) — `foraging.tree_gifts`, 
  `foraging_core.daily_gifts` — sont réels, non-vides, et jamais mappés jusqu'ici : capturés à 
  la place, avec la correction documentée plutôt que de forcer le mapping "Winter" deviné.
- **Museum (7.3)** — nouvel appel réseau séparé `/v2/skyblock/museum?profile=X` (absent de 
  `/v2/skyblock/profiles`, confirmé). Structure vérifiée : `{value, appraisal, items: 
  {ITEM_ID: {donated_time, items:{type,data}}}, special}` — chaque item donné est un blob NBT 
  décodable avec le décodeur déjà existant. Mappé cette passe : `museum_value` (109 188 742 
  chez Cucumber) + `museum_donated_item_ids` (40 vrais item_id réels, ex HYPERION/
  ASPECT_OF_THE_VOID/CRIMSON).

**✅ Piste ouverte fermée le même jour — Museum Donations vérifie maintenant le vrai don, 
pas la possession en inventaire** : les 416 tâches Milestones "Museum Donations" 
(`item_owned`, Bloc 6) comparaient le nom cible à l'inventaire réel du joueur — question 
différente de l'intention réelle du wiki (a-t-il DONNÉ cet item au musée, pas "le 
possède-t-il actuellement"). Corrigé en résolvant `requirement.item_name` → vrai `item_id` 
via `item_stats`/`items_catalog` (mesuré avant d'implémenter : 265/416, 63,7%, résolvent), 
puis vérifié contre `museum_donated_item_ids` (Bloc 7) au lieu du scan d'inventaire. Les 151 
noms non résolus restent honnêtement `data_available:false` — jamais de repli sur l'ancien 
scan inventaire, qui répond à une autre question, pas une version dégradée de celle-ci. 
**Vérifié en conditions réelles** : sur Cucumber, `museum_met` passe de 71 (ancien, possession 
inventaire) à **24** (nouveau, vrai don musée) — les 24 items confirmés recoupés un par un 
avec sa vraie liste `museum_donated_item_ids` (Aspect of the End, Basic Fishing Net, Stonk 
Pickaxe, etc., tous réellement donnés). Orange reste à 0 — aucune fabrication. Conséquence 
honnête sur le taux global : `tasks_computable` recule de 60,8% à **51,8%** (873/1685) — 
recul attendu et correct, la précision de la question posée prime sur le taux de couverture 
brut.
- **HOTM Forge (7.5)** — la vraie table de durées existait déjà dans le wiki caché 
  (`game_mechanics_misc.the_forge_table`, jamais exploitée). Parsée en 119 lignes réelles 
  (item, durée en secondes, palier HOTM requis) dans une nouvelle table 
  `hotm_forge_durations` — spot-check contre la source confirmé exact (Refined Diamond 8h/II, 
  Drill Motor 1 jour 6h/II, Perfect Plate 30 min/X). Débloque l'axe comme demandé — aucune 
  fonctionnalité consommatrice câblée cette passe (le process de forge en cours d'un joueur 
  n'a jamais pu être vérifié : `mining_core.forge` absent chez Cucumber, elle n'a jamais 
  forgé). Défaut mineur noté : le champ `section` de chaque ligne contient la phrase de 
  description du sous-tableau wiki plutôt qu'un intitulé court ("Refine your ores into more 
  valuable ores." plutôt que "Refining") — cosmétique, n'affecte ni `item_name` ni 
  `duration_seconds`, pas corrigé (aucune fonctionnalité ne lit encore ce champ).

**Restent honnêtement bloquées, avec la raison réelle vérifiée** :
- **Mythological Ritual (7.1)** — `player_stats.mythos` confirmé présent mais **littéralement 
  vide** (`{}`, zéro clé) chez Cucumber. Contrairement à d'autres zones vides-mais-structurées 
  (harp_songs, autopet_rules), impossible d'inférer ne serait-ce qu'un schéma partiel — pas de 
  colonne ajoutée, rien à mapper tant qu'aucun profil réel n'a de contenu ici.
- **Rift, 11 sous-systèmes (7.2)** — recherche explicite tentée (recherche web d'un joueur 
  public reconnu pour un vrai engagement Rift) sans candidat concret trouvé. Les 11 
  sous-systèmes restent vides chez Cucumber, seul `rift.access.charge_track_timestamp` porte 
  une vraie valeur non-nulle (un timestamp brut, signification incertaine — pas mappé sans 
  interprétation confirmée). Documenté bloqué plutôt que deviné, conformément à la consigne.
- **Mining Crystals / Crystal Hollows (7.4)** — `mining_core` confirmé réel et non-vide 
  (powder mithril/gemstone), mais aucune clé `crystals` présente chez Cucumber (jamais placé 
  de cristal) — même limite que Rift, structure non vérifiable sur ce profil.
- **Dojo réel (7.6)** — reconfirmé : seul le statut de quête d'unlock existe côté API 
  (`nether_island_player_data.quests.quest_data.dojo`), aucune donnée de points par minigame 
  trouvée sous aucune clé contenant "dojo" — verified-absent, pas juste non-trouvé sur ce 
  profil précis.

**Vérifié en conditions réelles avant merge** (route de debug temporaire appelant les 
fonctions d'extraction réelles + écriture partielle ciblée sur `player_data`, sans passer par 
le handler `GET` complet de `player/sync` qui est protégé par une vraie session Vault) : toutes 
les nouvelles valeurs confirmées identiques au dump brut sur Cucumber, et à zéro/vide/null sur 
Orange — même garde-fou early-game que partout ailleurs.

**Build prod confirmé `READY`** (`vault-intel-iota.vercel.app` dans les alias) après merge sur 
master. Branche `feat/bloc7-uncovered-zones` supprimée après merge.

**Suite du plan (8 blocs)** : Bloc 8 (Pluton, moteur d'intelligence comparative) est la 
dernière étape prévue — rappel de la contrainte explicite de l'utilisateur : 100% calcul 
déterministe, zéro appel IA à l'exécution, évaluation de faisabilité (8.1) à rapporter 
honnêtement avant tout code.

## ✅ Bloc 6 (plan d'audit 8 blocs) — requirement_type item_owned, +40,8 points de tasks_computable (31 juillet)

Suite directe du Bloc 5. Les 1302 tâches `item` (81% du total Milestones) restaient 
uncomputable — le plan visait "potentiellement proche de 100%" si le matching item_id 
fonctionnait bien. **Investigation avant tout code (6.1/6.2) a corrigé cette attente à la 
baisse, avec des raisons réelles vérifiées**, avant qu'aucune ligne ne soit écrite.

**6.1 — généralisable, sans réécriture** : chaque item NBT décodé dans `player_data` 
(armure équipée, accessoires, inventaire, enderchest, backpacks, Personal Vault, wardrobe) 
porte déjà un vrai champ `item_id`/`item_name` — confirmé directement en base sur Cucumber. 
`collectOwnedButUnequipped()` (Evolve Skills) scanne déjà ces mêmes sources ; nouvelle 
fonction `lib/owned-items.ts` réutilise les mêmes sources, sortie différente (Set de noms 
normalisés au lieu de texte formaté pour un prompt).

**6.2 — le vrai format a changé le plan** : `requirement.item_name` est un artefact brut du 
scrape wiki, un vrai sac mélangé — vérifié sur 25 échantillons aléatoires : des items 
réellement possédables ("Cat Talisman", "Skeleton Minion", "Bottle of Jyrre") à côté de 
choses qui ne sont structurellement PAS des items sous le même template wiki (classes de 
donjon "Obtain Mage", zones "Obtain Crimson Isle"/"Obtain Dwarven Mines", contacts Abiphone 
"Obtain George"/"Obtain Shifty", features génériques "Obtain Personal Bank"). Mesuré 
directement : seulement 283/1302 (21,7%) matchent exactement `item_stats.display_name`, 
425/1302 (32,6%) `items_catalog.item_name` — les deux catalogues internes ne couvrent que 
les items actifs sur le marché AH/Bazaar, pas un registre complet (pets, pièces de musée 
jamais tradées en sont absents). **Décidé avec l'utilisateur** : matcher directement contre 
l'inventaire RÉEL du joueur plutôt que contre ces catalogues incomplets — plus robuste, et 
honnête sur ce qui n'est structurellement pas un item (reste non-résolu plutôt que forcé).

**Bug réel trouvé en testant sur échantillon avant généralisation** (exactement la 
précaution demandée avant d'appliquer à l'ensemble) : `player_data.pets` est un champ 
SÉPARÉ (roster complet actif+inactifs, `{type,tier,level,active,heldItem}`), absent de 
tous les tableaux NBT scannés au premier passage — Cucumber possède réellement un pet 
`BEE` et un `GRANDMA_WOLF` (confirmés dans son vrai roster), tous deux remontaient pourtant 
"non possédé" avant l'ajout de ce scan. Corrigé, revalidé : 19 pets réels de Cucumber 
matchent correctement après le fix (dont Bee et Grandma Wolf).

**6.3 — `item_owned` implémenté, scope volontairement restreint** : sur les 1302 tâches 
`item`, seules les 687 dont la vraie catégorie wiki (Museum Donations 416, Accessories 196, 
Pets 75) correspond à un vrai objet possédable individuellement ont été retaggées 
`item_owned` (migration `retag_item_owned_museum_accessories_pets`). Les 615 restantes 
gardent `type='item'`, toujours honnêtement uncomputable : beaucoup sont structurellement 
pas des items (classes/zones/NPCs), d'autres sont déjà couvertes par leur vrai 
requirement_type dédié du Bloc 4 (boss/slayer/essence/banque/bestiary/dungeon — redondant 
et faux de les traiter comme un item), et `Minions` (254 tâches) a été délibérément exclue : 
un minion crafté devient un générateur posé sur l'île, jamais un item NBT tenu en 
inventaire — `minion_count` (Bloc 4) reste le bon outil pour cet axe, même limité en 
données.

**Vérifié en conditions réelles avant merge** (route de debug temporaire appelant 
`computeMilestones()` directement) : les 687 tâches `item_owned` toutes `data_available: 
true` sur les deux profils. **Cucumber** : 71 tâches réellement complétées, exactement le 
même compte que l'échantillon de validation initial (talismans/rings réellement possédés, 
pets réellement possédés incluant Bee/Grandma Wolf, dons de musée réellement en 
inventaire). **Orange** (profil vide) : 687/687 computable mais 0 complétée — même 
garde-fou early-game que partout ailleurs, aucune fabrication.

**6.6 — nouveau taux réel de `tasks_computable`** : **60,8%** (1024/1685) au runtime, contre 
20,0% (337/1685) après le Bloc 4 — un bond de +40,8 points, le plus gros gain du plan à 
date. Honnête sur ce qui reste : les 615 tâches `item` non retaggées + les 5 `mobtype` 
(table de référence mob→catégorie pas construite) représentent encore ~36,8% du total 
hors de portée — loin des "potentiellement proche de 100%" espérés au départ du bloc, pour 
des raisons réelles vérifiées avant codage, pas par manque d'effort d'implémentation.

**Build prod confirmé `READY`** (`vault-intel-iota.vercel.app` dans les alias) après merge 
sur master. Branche `feat/bloc6-item-tasks-investigation` supprimée après merge.

**Suite du plan (8 blocs)** : Bloc 7 (zones joueur non couvertes) est la prochaine étape 
prévue dans l'ordre.

## ✅ Bloc 5 (plan d'audit 8 blocs) — Radar multi-timeframe réel, jusqu'à 7+ ans (31 juillet)

Suite directe du Bloc 4. Radar plafonnait à 3 ans côté frontend et à une fenêtre 30 jours 
étiquetée "long" côté `radar-agent`, alors que 7,1 ans de vraie donnée existent déjà en base 
(`price_history_ah`, ligne la plus ancienne confirmée en direct : 2019-06-19 — plus profond 
que les "6,4 ans" supposés dans le plan d'audit d'origine).

**5.1 — vrai bug trouvé en étendant `PERIODS`** : ajouter `'ALL'` seul n'aurait pas suffi. 
`loadSeries()` (`RadarSection.tsx`) plafonnait déjà la requête générale à `.limit(1500)` — 
avec un tri **ascendant** par date, cette limite aurait silencieusement coupé les lignes les 
plus **récentes** dès qu'un item dépasse ~4 ans d'historique (confirmé en base : les items 
les mieux suivis ont jusqu'à 2297 lignes DAILY réelles). Relevé à 3000. Découvert au passage : 
le chemin Bazaar (`price_history`) n'avait **aucune** limite explicite, reposant sur le 
défaut serveur PostgREST — même risque de troncature silencieuse, corrigé en ajoutant 
`.limit(3000)` explicite là aussi. Header du bandeau Radar mis à jour ("up to 3 years" → 
"up to 7+ years").

**5.2 — renommage** : les labels `short|mid|long` du prompt `radar-agent` (1-7j/1-4sem/
1-3mois) collisionnaient sémantiquement avec le vrai pluriannuel introduit en 5.3 — renommés 
`short|mid|extended`, comportement des 3 fenêtres inchangé.

**5.3 — `computeLongTermMovers()`, 100% déterministe, zéro coût Claude** — nouvelle fonction 
SQL RPC `get_longstanding_ah_items(min_rows, limit_n)` (migration additive) trouve les vrais 
items avec ≥1000 lignes DAILY (~3+ ans de profondeur réelle), pour ne jamais comparer 
année N vs N-1 sur un item tracké depuis 2 semaines. Pool de 80 items réels, comparaison 
moyenne 365 derniers jours vs 365 jours précédents (exigeant ≥30 points réels de chaque côté 
avant de calculer une moyenne, jamais sur un échantillon trop mince). Stocké dans le même 
blob JSON `claude_analysis.radar` que le contenu déjà généré par Sonnet (`long_term_movers`), 
sans appel Claude supplémentaire — la fonction elle-même ne produit aucun texte, seulement 
des chiffres.

**5.4 — exposé côté frontend** : nouvelle section "📆 Long-Term Movers" dans 
`IntelligenceVault` (`RadarSection.tsx`), gainers/decliners rendus directement depuis les 
chiffres calculés — aucun texte généré par Claude dans cette section, contrairement aux 
cartes Top Opportunities/Risk Items existantes.

**Vérifié en conditions réelles avant merge** (route de debug temporaire appelant 
`computeLongTermMovers()` seule — jamais `runRadarAgent()` en entier, pour éviter un vrai 
coût Sonnet juste pour vérifier une fonction purement déterministe) : pool de 80 items réels 
confirmé, 7 à 7,1 ans de profondeur chacun. Résultats cohérents, pas du bruit : **ASPECT_OF_
THE_END** (item populaire choisi spécifiquement pour ce test) montre +297% sur l'année (1,29M 
→ 5,12M de moyenne), `DIAMOND_SWORD` +60%, `DIAMOND_PICKAXE` -68% — mouvements réels 
explicables, aucun artefact à un seul point aberrant.

**Build prod confirmé `READY`** (`vault-intel-iota.vercel.app` dans les alias) après merge 
sur master. Branche `feat/bloc5-radar-multitimeframe` supprimée après merge.

**Suite du plan (8 blocs)** : Bloc 6 (faisabilité du type de tâche "item", 1302 tâches 
Milestones hors scope) est la prochaine étape prévue dans l'ordre.

## ✅ Bloc 4 (plan d'audit 8 blocs) — 11 axes Milestones comblés, 69 tâches réelles (31 juillet)

Suite directe du Bloc 3 et de l'extension `computeMilestones()` du 30 juillet : 15 
`requirement_type` supportés côté code, mais seuls 4 avaient une vraie ligne 
`milestone_tasks` (les placeholders flippés ce jour-là). Ce bloc remplit les 11 axes 
restants avec du vrai contenu — 69 tâches insérées, réparties en 4 lots, chaque seuil 
sourcé avant codage (jamais deviné), conformément à la règle 7.

**Recherche de sources réelles avant tout Haiku/insert** — deux ajustements demandés par 
l'utilisateur avant de lancer la génération, tous les deux confirmés utiles :
- **Bank tier** : le wiki interne déjà caché (`game_mechanics_misc.bank`) donne la vraie 
  table complète à 6 tiers réels (Starter→Gold→Deluxe→Super Deluxe→Premier→Luxurious→
  Palatial) — utilisé intégralement (6 tâches, target 1→6) au lieu du plafond arbitraire à 
  2 initialement proposé par prudence.
- **Lot 4 (minions/bestiary/chocolate factory/auctions/fishing)** : recherche supplémentaire 
  a trouvé deux vrais plafonds officiels non détectés au premier passage — la table 
  "Bestiary Milestone Rewards" (checkpoints réels V/X/XV/XX.../C, contrairement à la table 
  "Cumulative Kill Brackets" par famille de mob, différente) et la table "Chocolate Factory 
  Milestones" (chocolat total à vie, checkpoints réels 1k→700b). Les deux utilisées 
  intégralement (vrais nombres Hypixel, zéro invention). À l'inverse, `minion_count` s'est 
  révélé ne PAS avoir de plafond utilisable : `crafted_generators.length` compte chaque 
  palier de minion jamais acheté (pas les types distincts), donc même le total réel de 61 
  minions (compté depuis nos propres pages wiki `*_minion` déjà scrapées) ne mappait pas 
  proprement dessus — laissé à une seule tâche minimale (target=1), `calibration_note` 
  explicite. `auction_activity`/`fishing_activity` n'ont aucun plafond officiel non plus 
  (compteurs d'activité, pas des totaux d'espèces/objets) — calibrés sur les vraies valeurs 
  observées de Cucumber (completed:56, sea_creature_kills:333), `calibration_note` explicite 
  sur chaque tâche pour signaler que c'est provisoire.

**4 lots, sources réelles par axe** :
- **Lot 1 (20 tâches)** — Kuudra 5 tiers réels (`none`/`hot`/`burning`/`fiery`/`infernal`, 
  confirmés via le wiki interne déjà caché, page `kuudra_teeth`) ; Arachne (1 tâche) ; 
  Ender Dragon 7 variantes réelles (Young/Old/Protector/Strong/Superior/Unstable/Wise, 
  confirmées via nos propres lignes `milestone_tasks` scrapées du wiki, catégorie 
  "Slay Dragons") ; Essence 7 types restants (DIAMOND/DRAGON/SPIDER/GOLD/WITHER/UNDEAD/ICE), 
  target=1 — miroir exact de la tâche Crimson déjà existante, zéro nouveau pattern.
- **Lot 2 (14 tâches)** — Slayer claimed_levels, réel et pré-calculé par Hypixel lui-même : 
  limité aux 4 boss avec de vraies clés `claimed_levels` observées sur Cucumber (Zombie/
  Spider/Wolf/Enderman) — Blaze/Vampire volontairement exclus, aucune donnée réelle pour 
  confirmer leurs noms de clé. Jacob's medals bronze/silver/gold, target=1 chacune (mêmes 
  vraies raretés de médaille que le jeu, pas de nombre inventé).
- **Lot 3 (20 tâches)** — Catacombs F1-F7 + Master Catacombs M1-M7 (numérotation réelle du 
  jeu), target=1 ("jouée au moins une fois", comportement par défaut du type) ; Bank tier 
  1→6 (voir ci-dessus).
- **Lot 4 (15 tâches)** — Minions (1 tâche, voir ci-dessus) ; Bestiary milestone 5/15/30/50/
  75/100 (checkpoints réels) ; Chocolate Factory 1M/100M/1B/10B chocolat à vie (checkpoints 
  réels) ; Auctions 5/25 ventes complétées (calibré, `calibration_note`) ; Fishing 25/150 
  sea creatures tuées (calibré, `calibration_note`).

**Vérifié en conditions réelles avant merge** (route de debug temporaire appelant 
`computeMilestones()` directement — un premier passage de vérification avait un bug dans 
sa propre requête de filtrage, pas dans les données insérées : il matchait par texte de 
catégorie et attrapait par erreur des centaines de lignes wiki préexistantes "Craft 
Minions" qui partagent par coïncidence `category:"Minions"` ; corrigé en filtrant par le 
vrai `task_key` inséré) : les 69 nouvelles lignes confirmées `data_available:true` à 100% 
sur les deux profils. **Cucumber** (progression réelle) : 41/69 tâches complétées, cohérent 
avec ses vraies données (Wolf Slayer Level 2 réclamé, Bestiary 71≥5, Bank tier 1 atteint, 
Arachne et minions correctement non complétés puisqu'elle n'a ni l'un ni l'autre). 
**Orange** (profil vide) : 69/69 computable mais 0/69 complété — même garde-fou early-game 
que partout ailleurs, aucune progression fabriquée.

**Nouveau taux réel de `tasks_computable`** (4.5) : 337/1685 tâches computables en direct 
au runtime (20,0%), contre 268/1616 avant ce bloc (16,6% — recalculé en excluant les 69 
nouvelles lignes du total post-merge, puisque aucune ligne préexistante n'a été modifiée). 
Écart honnête à noter : un classement statique par `requirement_type` "computable" donnait 
301 avant / 370 après (301+69, +1685 lignes) — plus élevé que les chiffres runtime 
ci-dessus, parce que certaines tâches `collection` déjà existantes ont un `item_name` qui 
ne matche aucune ligne de la table `collections` interne et retombent donc à 
`data_available:false` en pratique malgré leur type nominalement "computable" — un écart de 
données préexistant, sans rapport avec ce bloc, pas creusé ici. **Toujours pas 100%** : 
les tâches `item` (1302, wiki-scrapées, mécanisme structurellement différent — voir Bloc 6) 
et `mobtype` (5, nécessite une table de référence mob→catégorie pas encore construite) 
restent hors scope, comme prévu dès l'audit du 30 juillet.

**Build prod confirmé `READY`** (`vault-intel-iota.vercel.app` dans les alias) après merge 
sur master. Branche `feat/bloc4-milestones-content` supprimée après merge.

**Suite du plan (8 blocs)** : Bloc 5 (Radar multi-timeframe) est la prochaine étape prévue 
dans l'ordre.

## ✅ Bloc 3 (plan d'audit 8 blocs) — fidélité du scoring AH, 2 écarts fermés (31 juillet)

Suite directe des Blocs 1-2. Deux écarts réels entre le comportement du scoring de flip 
AH (`ah-collect`) et son intention documentée, fermés dans le même bloc car tous les deux 
touchent la même fonction `runAhCollect()`.

**3.1 — Top 25/catégorie réel vs 50/catégorie + 300 global** : la promesse produit 
("Top 25 per AH category", présente dans `app/page.tsx`, `app/features/page.tsx`, 
`FlashAlertsPage.tsx` — libellé UI "🎯 {category} — Top 25", `FreeFlashPreview.tsx`) 
divergeait du code réel, qui cappait chaque catégorie à 50 puis appliquait un cap global 
de 300 sur l'ensemble combiné. **Vérifié en base avant fix** : `weapon`/`armor`/`misc`/
`cosmetic` saturaient chacune leur cap à 50 pendant que `runes`/`dyes` tombaient à 1 ligne 
— le cap global, appliqué APRÈS le cap par catégorie sur le classement combiné toutes 
catégories confondues, laissait les catégories fortes écraser les plus faibles. Tranché en 
faveur de la cible documentée (pas du code) : chaque catégorie plafonnée à 25 
(`catItems.slice(0, 25)`), le cap global renommé `TOP_ITEMS_SAFETY_CEILING` et relevé 
(1000) pour redevenir un pur filet de sécurité plutôt qu'une contrainte fonctionnelle — 
avec ~10 catégories AH réelles, 25×10=250 reste naturellement sous ce seuil, donc plus 
aucune catégorie n'est structurellement affamée par une autre.

**3.2 — Cascade exact→base→blended, corrige une exclusion silencieuse** : un item sans 
historique EXACT suffisant (variante rare — étoiles/reforge/ultimate précis peu scannés, 
ex: une pièce Necron's 5★) était totalement exclu du classement même quand un historique 
BASE solide existait (même étoiles+recomb, reforge/ultimate/hot potato ignorés) — un vrai 
flip exploitable disparaissait sans raison métier. Ajout d'un fetch bulk batché 
(`price_history_ah_variant_base`, même fenêtre 7 jours, même pattern de batching par 200 
que l'exact existant) comme second palier ; palier "blended" 
(`price_history_ah.__all_variants_blended__`) calculé aussi pour transparence 
(`hist_precision` visible sur chaque item scoré) mais **volontairement jamais inclus dans 
`relevant`** — décision explicite avec l'utilisateur avant codage : comparer une variante 
précise contre une moyenne qui mélange 0★ bradés et 5★ rares produit un discount_pct 
trompeur dans les deux sens, l'objectif étant des flips précis entre variantes réellement 
comparables ("pour identifier les flips AH la pertinence maximale, on compare le prix 
actuel d'un item avec son alter ego vendu en historique, jamais un 0★ contre un 5★"), pas 
une couverture maximale au prix de faux signaux.

**Vérifié en conditions réelles avant merge** (route de debug temporaire, supprimée après 
validation, appelant le vrai handler `GET` de `ah-collect` — le `cron_locks` anti-doublon 
partagé avec le cron prod réel a fait échouer le premier essai avec "Already running", 
contourné en revérifiant l'état du lock via SQL puis en retentant dans une fenêtre libre) : 
`scored_precision_breakdown` a montré 560-966 variantes/run tombant sur le palier "base" 
(auparavant `hist_precision:'none'`, exclues silencieusement) ; `relevant_by_precision` a 
montré 52-227 de ces items entrant réellement dans le classement grâce au nouveau 
fallback. Exemples nommés concrets confirmés réels au moment du test : **Necron's Leggings** 
(`POWER_WITHER_LEGGINGS`) et une **Ancient Shadow Assassin Chestplate ✪✪✪✪✪**, tous deux 
sans historique exact mais avec un match base solide — exactement la classe d'item citée 
dans le plan (3.3). `top_items_by_category` confirmé à 25 pour chaque catégorie bien 
peuplée, les catégories plus rares (`runes`, `barn_skins`) légitimement sous 25 par manque 
réel de candidats, plus jamais par troncature du cap global.

**Build prod confirmé `READY`** (`vault-intel-iota.vercel.app` dans les alias) après merge 
sur master. Branche `feat/bloc3-ah-scoring-fidelity` supprimée après merge.

**Suite du plan (8 blocs)** : Bloc 4 (remplir les 11 axes Milestones sans contenu de 
tâches — `boss_kill`/`bank_tier`/`minion_count`/`bestiary_milestone`/etc, capacité déjà 
construite lors de l'extension `computeMilestones()` du 30 juillet mais zéro ligne 
`milestone_tasks` les référençant encore) est la prochaine étape prévue dans l'ordre.

## ✅ Bloc 2 (plan d'audit 8 blocs) — observability, 10 crons instrumentés (30 juillet)

Suite directe du Bloc 1. Avant cette passe, seuls 5/15 crons actifs écrivaient dans 
`sync_log` (`neu-sync`, `wiki-auto-sync`, `skyblock-resources-sync`, `milestones-sync`, 
`armor-color-sync`) — les 10 autres (`ah-collect`, `ah-aggregate`, `bazaar-collect`, 
`data-retention`, `patch-collect`, `money-making-agent`, `setup-generate-agent`, 
`patch-analysis-agent`, `radar-agent`, `update-catalog`) n'avaient aucun historique 
persistant : un job cassé ou muet n'était visible qu'en creusant les logs Vercel a 
posteriori — exactement le pattern qui avait laissé le crash loop `historic-import` et le 
bug `ah-collect TODAY` tourner plusieurs jours sans être détectés (voir plus bas dans ce 
document).

**Instrumenté les 10 crons manquants**, même pattern `startSync`/`finishSync` que les 5 
déjà en place (`lib/sync-log.ts`, inchangé). Deux d'entre eux (`data-retention`, 
`update-catalog`) n'avaient même pas de `try/catch` avant cette passe — une exception non 
gérée tombait sur la page d'erreur par défaut de Next.js plutôt qu'un vrai 500 JSON propre, 
et serait de toute façon restée invisible de `sync_log`. Aucune logique métier touchée dans 
aucun des 10 fichiers — uniquement l'ajout de l'import + wrapping `startSync(...)`/
`await finishSync(...)` autour du corps déjà existant.

**Vérifié en conditions réelles avant merge** (route de debug temporaire important les 
handlers `GET` réels de chaque cron — pas les fonctions plain exportées seules, un premier 
essai s'est trompé sur `ah-collect`/`ah-aggregate` en appelant `runAhCollect()`/
`runAhAggregate()` directement, ce qui contourne le wrapper `GET` où vit l'instrumentation ; 
corrigé en repassant par `GET` avec une vraie `Request` porteuse du header 
`CRON_SECRET`) : les 6 crons sans coût Claude (`ah-collect`, `ah-aggregate`, 
`bazaar-collect`, `data-retention`, `patch-collect`, `update-catalog`) confirmés écrire de 
vraies lignes `sync_log` avec `status`/`rows_written` corrects — y compris le chemin 
`cron_locks` "Already running" de `ah-collect`, qui écrit bien une ligne `success`/0 lignes 
plutôt que de sauter l'instrumentation. Les 4 crons à coût Claude réel (`money-making-agent`, 
`patch-analysis-agent`, `radar-agent`, `setup-generate-agent`) volontairement **pas** 
déclenchés manuellement pour éviter une dépense API inutile juste pour vérifier un wrapper 
identique déjà validé 6 fois sur les autres crons — seront confirmés naturellement par leur 
propre planning réel (`radar-agent`/`patch-analysis-agent` sous 24h, `money-making-agent`/
`setup-generate-agent` au prochain lundi).

**Anomalie `armor-color-sync` de l'audit du 30 juillet résolue** — le cron avait déjà 
l'instrumentation `sync_log` correcte dans son code, mais zéro ligne en base malgré 
`neu-sync` (même jour, même semaine) fonctionnant normalement. Cause réelle trouvée via 
`git log` : la route `armor-color-sync` et son entrée `vercel.json` (`30 5 * * 1`, lundi 
5h30) ont été ajoutées au commit `c28481b` le **28 juillet** (un mardi) — après le passage 
du lundi 27 juillet 5h30, donc après la seule fenêtre de déclenchement possible cette 
semaine-là. Le prochain déclenchement réel est le lundi 3 août, qui n'a pas encore eu lieu 
à la date de cet audit (30 juillet). Zéro ligne `sync_log` est donc le comportement attendu, 
pas un bug — mystère refermé sans code à changer.

**Trouvé au passage, hors scope de ce bloc, pas corrigé** : `get_runtime_errors` a fait 
remonter une vraie erreur récurrente sur `patch-analysis-agent` — 
`"Alpha parse error: SyntaxError: Unexpected non-whitespace character after JSON..."`, 
observée à plusieurs dates (25 → 30 juillet). Le `parseJSON` de la réponse Haiku pour les 
patches alpha échoue occasionnellement (`alphaAnalysis` retombe alors sur `[]`, pas de 
crash du cron dans son ensemble). Noté pour une passe future (candidat naturel : le même 
fallback "découpe premier `{` au dernier `}`" déjà appliqué à `evolve-skills` lors du 
chantier Phase 1).

**Build prod confirmé `READY`** (`vault-intel-iota.vercel.app` dans les alias) après merge 
sur master. Branche `feat/bloc2-observability` supprimée après merge.

**Suite du plan (8 blocs)** : Bloc 3 (AH scoring fidelity fixes) est la prochaine étape 
prévue dans l'ordre.

## ✅ Bloc 1 (plan d'audit 8 blocs) — pipeline prix de vente AH mort depuis toujours, corrigé (30 juillet)

Suite directe de l'audit architectural complet (voir plus bas dans ce document pour le 
détail complet de l'audit) qui avait trouvé `avg_sold_price`/`sold_count` à 0 sur 
70 910/70 910 lignes de `price_history_ah_variants` sur 7 jours glissants — le prix de 
VENTE réel (par opposition au prix de listing/BIN) n'a jamais été collecté depuis que la 
fonctionnalité existe dans le code, silencieusement.

**Diagnostic en 2 passes, la 1ère une fausse piste partielle** :
1. `fetchSoldAuctions()` (`ah-collect/route.ts`) appelait `https://api.hypixel.net/v2/skyblock/auctions/ended` 
   sans header `API-Key` — confirmé cassé par curl direct (`400 Missing API-Key header`). 
   1er fix : header ajouté + logging d'erreur explicite remplaçant l'échec silencieux 
   (`return { auctions: [] }` sans aucune trace). Déployé, mais la vérification en direct 
   montrait toujours un échec.
2. **Vraie cause trouvée en creusant plus loin** : ce chemin d'URL n'existe simplement pas 
   côté Hypixel. Le vrai endpoint est `/v2/skyblock/auctions_ended` (underscore, pas de 
   slash) — confirmé par un vrai test réseau direct (`200 OK`, aucune clé requise, endpoint 
   public comme `/v2/skyblock/auctions`) et recoupé avec la doc à jour du forum Hypixel. 
   Piège qui explique pourquoi la fausse piste semblait plausible : le WAF Hypixel valide 
   la clé API **avant** le routing — une clé absente/invalide sur le mauvais chemin renvoie 
   une erreur trompeuse liée à la clé au lieu du vrai 404 "Unknown endpoint", qui ne 
   ressort qu'une fois une vraie clé valide testée contre le mauvais chemin.

**Propagation à toutes les couches d'agrégation** — jusqu'ici seule Table 1 
(`price_history_ah_variants`, exact) portait déjà les colonnes `avg_sold_price`/
`sold_count` (jamais alimentées à cause du bug) ; ajoutées aussi à Table 3 
(`price_history_ah_variant_base`, palier intermédiaire) et Table 2 (`price_history_ah`, 
blended `__all_variants_blended__` — la table qui assure la continuité avec l'historique 
SkyCofl 6 ans, basé sur le vendu). Migration `add_sold_price_to_ah_blended_and_base` 
(ALTER TABLE additif, appliquée via MCP Supabase) : `avg_sold_price numeric DEFAULT 0`, 
`sold_count integer DEFAULT 0` sur les 2 tables. Pondération par `sold_count` (fiabilité du 
vendu), jamais par `scan_count` (fiabilité du listing — axe différent), cohérent avec le 
pattern déjà en place pour `avg_price`/`scan_count` dans `ah-aggregate`.

**Vérifié en conditions réelles avant merge** (route de debug temporaire, supprimée après 
validation — piège trouvé au passage : la route de debug elle-même avait le mauvais chemin 
d'URL codé en dur séparément dans son propre diagnostic, corrigé avant la vérification 
finale) : `/v2/skyblock/auctions_ended` → 200/success, 162 enchères vendues réelles ; 
`runAhCollect()` → `ah_scan_buffer` avec 114 lignes `sold_count > 0` réelles (ex : 
`THUNDER_BOOTS` nostar/norecomb/fierce, `avg_sold_price: 500000, sold_count: 1`) ; 
`runAhAggregate()` forcé en avance sur la journée → les 3 tables journalières montrent des 
lignes réelles `sold_count > 0` (variants: 18, base: 10, blended: 8). Volumes modestes par 
run isolé, normal et attendu : `/auctions_ended` ne renvoie qu'une fenêtre glissante de 
~60 secondes par appel — la couverture 24h s'accumule naturellement via le cron réel à la 
minute, aucun code supplémentaire nécessaire pour ça (voir Bloc 1.5 du plan, pas une action 
mais une simple attente).

**Build prod confirmé `READY`** (`vault-intel-iota.vercel.app` dans les alias) après merge 
sur master. Branche `fix/ah-sold-price-observability` supprimée après merge.

**Suite du plan (8 blocs, audit du 30 juillet)** : Bloc 2 (observability — instrumenter 
`sync_log` sur les ~10 crons qui ne le font pas encore, investiguer l'anomalie 
`armor-color-sync`) est la prochaine étape prévue dans l'ordre du plan.

## ✅ computeMilestones() étendu — 15 nouveaux requirement_type, zéro coût Claude (30 juillet)

Suite directe de l'unification de taxonomie et de l'audit hypixel-api-reborn : Milestones 
avait déjà l'architecture du "Pilier 1" (connaissance joueur centralisée par les 7 tiers) 
mais `computeMilestones()` ne savait vérifier que `skill`/`collection`/`fairy_souls` — 
tout le reste des zones collectées (boss kills, banque, essence, minions, bestiary, 
slayer, Jacob's, festivals, donjons, chocolate factory, auctions, fishing) dormait dans 
`player_data` sans jamais être exploité par Milestones. Branchement fait en 3 lots, testé 
sur Cucumber et Orange après chacun, toujours du JS pur sur des données déjà en base — 
zéro appel Claude.

**Lot 1** (`boss_kill`, `bank_tier`, `fast_travel_count`, `essence_amount`, `minion_count`, 
`bestiary_milestone`) — les 6 zones d'origine du chantier collecte totale.

**Lot 2** (`slayer_claimed_level`, `slayer_tier_kills`, `jacob_contest_participation`, 
`jacob_medal_count`, `festival_participation`) — les zones de l'audit qui correspondent 
directement à des tâches vault déjà existantes.

**Lot 3** (`dungeon_floor_played`, `chocolate_factory_amount`, `auction_activity`, 
`fishing_activity`) — le reste des zones de l'audit, capacité nette pour du futur contenu 
Vault-authored (aucune tâche existante ne les référence encore).

**4 tâches vault placeholder flippées de `uncollected` vers un vrai type computable**, 
maintenant que la vraie donnée existe :
- "Unlock Fast Travel Zones" → `fast_travel_count` (Cucumber : `current:152`, `target:null` 
  — honnête, aucun total maximum vérifié n'existe pour inventer un seuil de complétion).
- "Crimson Essence Shop" → `essence_amount` (`current:555`, `target:1`, `met:true`).
- "Participate in Spooky Festival" → `festival_participation` (`current:1`, `met:true`).
- "Participate in Jacob's Farming Contest" → `jacob_contest_participation` 
  (`current:25`, `met:true`).

**Vérifié après chaque lot sur Cucumber ET Orange** : `tasks_computable`/`tasks_completed` 
montent exactement du nombre de tâches flippées à chaque lot (ex : Amateur 51→53 
computable, 31→33 completed après le lot 2, exactement les 2 tâches concernées), Orange 
(profil vide) reste à 0 partout sur les 4 tâches flippées — même garde-fou early-game que 
partout ailleurs. Les 3 types du lot 3 (sans tâche existante à flipper) vérifiés via 4 
lignes `milestone_tasks` temporaires insérées puis supprimées après validation (valeurs 
réelles confirmées : floor 6 `times_played:46`, chocolat `561333761`, gold_earned auction 
`314699000`, `sea_creature_kills:333` — tout exact, tout à 0 côté Orange).

**Reste hors scope de cette passe** : les tâches `uncollected` restantes 
(`mining`/`farming`/`fishing` "Activity", `mining_fiesta`, `fishing_festival`, 
`unlocking_relays`, `mythological_kills`, `complete_objectives`) n'ont soit aucune donnée 
correspondante collectée (Mining Fiesta, Fishing Festival, Mythological Ritual — ce 
dernier existe bien côté Hypixel via `player_stats.mythos`, mais n'a jamais été collecté, 
zone 7 potentielle pas encore construite), soit une donnée réelle mais sans seuil cible 
vérifié dans le wiki d'origine (les 3 "Activity") — pas de seuil inventé dans les deux cas. 
Les tâches `mobtype` (5 lignes, catégories Bestiary larges type "Arthropod"/"Undead") 
restent aussi non calculables : nécessiteraient une table de référence mob→catégorie 
qu'on n'a pas encore (existe côté hypixel-api-reborn/SkyCrypt sous forme de constantes 
statiques, jamais reconstruite ici).

## ✅ Unification taxonomie tiers — progression_tiers fusionnée dans milestone_tier_totals (29 juillet)

Suite à l'audit de référence (hypixel-api-reborn + SkyCrypt) qui a fait remonter une masse 
de zones joueur manquantes, la question s'est posée d'unifier ça avec la vision "connaissance 
joueur centralisée par les 7 tiers" — a fait remonter une duplication réelle : `progression_tiers` 
(Phase 1, squelette networth/purse par tier) et les 7 tiers de Milestones 
(`milestone_tasks`/`milestone_tier_totals`, Starter→Master) étaient deux échelles séparées 
risquant de diverger, alors qu'elles utilisaient déjà **exactement les mêmes libellés** 
(`Starter/Amateur/Intermediate/Skilled/Expert/Professional/Master`, vérifié caractère pour 
caractère avant de trancher) — confirmé aussi que `progression_tiers` n'était consommée par 
**aucun code applicatif** (grep sur tout le repo : seules références dans CLAUDE.md et le 
fichier de migration d'origine), donc zéro risque de casser une route existante en la 
supprimant.

**Décision** : `milestone_tier_totals` devient la table unique des 7 tiers. Colonnes 
`tier_order`/`networth_min`/`networth_max`/`purse_reference`/`money_making_tier_key`/
`calibration_note` ajoutées dessus, données migrées depuis `progression_tiers` (jointure sur 
`milestone_tier_totals.tier = progression_tiers.label`), puis `progression_tiers` supprimée. 
`tier_order` est un ajout bonus : `milestone_tier_totals` n'en avait aucun jusque-là (l'ordre 
Starter→Master était implicite côté appli) — refermé en même temps plutôt que laissé traîner. 
Vérifié après migration : les 7 lignes ont leurs valeurs networth identiques à celles de 
l'ancienne table, `tier_order` 1→7 correct, `money_making_tier_key` intact (le pont vers 
`TIER_CONFIG` de Money Making fonctionne toujours, juste depuis la bonne table).

**Conséquence pour le Pilier 1 de la vision unifiée** ("connaissance joueur centralisée par 
les 7 tiers") : `milestone_tasks`/`milestone_tier_totals` + `computeMilestones()` sont déjà 
l'architecture de ce pilier, pas un système à reconstruire. Le vrai travail restant est 
d'étendre le taxonomy `requirement_type` de `computeMilestones()` (aujourd'hui seulement 
`skill`/`collection`) pour couvrir les zones collectées dans le chantier collecte totale 
(boss_kills, essence, minions, bestiary, banque, rift, long tail) et celles en cours de 
collecte ci-dessous — zéro coût Claude, du branchement JS pur sur des données déjà en base.

## ✅ Audit hypixel-api-reborn — 6 nouvelles zones collectées, jamais dans la liste d'origine (29 juillet)

Nouvelle méthode d'audit demandée : au lieu d'inspecter un seul profil de test (limité à 
ce qu'un joueur précis a rempli), trouver une vraie source de référence documentant la 
structure exhaustive d'un profil Skyblock. `hypixel-api-reborn` (lib TS activement 
maintenue, ~150 fichiers de types, un par sous-système du `member` object) a servi de 
référence principale, recoupée avec le code source réel de SkyCrypt sur un point précis 
(minions). Rapport complet livré avant tout code, comparant champ par champ ce qui était 
déjà mappé vs ce que la référence documentait — voir la conversation pour le détail 
complet du rapport (zones fiables/partielles/techniques/hors-scope).

**🔴 Bug confirmé et non corrigé par cette passe** (documenté, pas un ajout de zone) : 
`rift_motes` lit `currencies.motes.current`, alors que le vrai champ Hypixel (confirmé 
par hypixel-api-reborn ET vérifié en direct sur Cucumber) est `currencies.motes_purse` — 
un nombre plat, pas un objet imbriqué. Sur Cucumber les deux chemins renvoient 0 par pure 
coïncidence (elle n'a ni l'un ni l'autre — `member.currencies` n'a que `coin_purse` + 
`essence`), donc jamais détecté par le test à profil unique. Pour tout joueur ayant 
réellement des Motes, le code actuel retournerait silencieusement 0. **Pas encore 
corrigé** — noté ici pour ne pas être oublié, correction triviale (`rift_motes: 
member.currencies?.motes_purse ?? 0`) à faire dès que la Phase 7 (Rift) sera retouchée.

**6 zones réelles trouvées et collectées, aucune n'était dans la liste d'origine du 
chantier collecte totale** (toutes vérifiées en direct sur Cucumber avant codage, testées 
via le pattern debug établi — bypass `runEvolveSkills`, zéro coût Claude) :

- **Donjons — détail par étage** (`dungeon_secrets`, `dungeon_unlocked_journals`, 
  `catacombs_floors`, `master_catacombs_floors`) — l'ancien mapping ne capturait que des 
  agrégats (étage max, XP totale, nombre de runs). Chaque étage (0-7) a maintenant son 
  vrai détail : `times_played`/`best_score`/`mobs_killed`/`most_mobs_killed`/
  `watcher_kills`/`fastest_time_ms`/`fastest_time_s_ms`/`fastest_time_s_plus_ms`. 
  `fastest_time` (sans suffixe) est un 3e champ de temps réel, distinct de 
  `fastest_time_s`/`s_plus` (S/S+ sont les vrais paliers de score du jeu). Volontairement 
  pas mappés : `most_damage_<classe>`/`best_runs` (flavor/leaderboard), `treasures.runs/
  chests` (historique d'activité), `daily_runs` (compteur journalier transitoire), 
  `dungeons_blah_blah` (un nom de champ littéralement placeholder côté Hypixel, contient 
  des flags de quête one-shot), `milestone_completions` (identique à `tier_completions` 
  sur Cucumber, pas dupliqué).
- **Slayer — claimed_levels + détail par tier** (`slayer_detail`, additif — la colonne 
  `slayers` existante et ses consommateurs restent inchangés) — `claimed_levels` ne 
  contient QUE les niveaux réellement réclamés (jamais `false`, absent si non réclamé), 
  déjà calculé par Hypixel, aucun seuil à reconstruire nous-mêmes. `boss_kills_tier_0..4` 
  et `boss_attempts_tier_0..4` détaillent par tier (l'ancien mapping ne stockait que la 
  somme tous tiers confondus).
- **Jacob's Farming Contests** (`jacob_medals`, `jacob_perks`, `jacob_unique_brackets`, 
  `jacob_personal_bests`, `jacob_contests`) — système de progression Farming complet, 
  zéro mapping avant cette passe. Médailles/brackets n'ont que les clés réellement 
  atteintes (Cucumber : bronze/silver, pas de "gold" — absent, pas à zéro, même pattern 
  que partout ailleurs). Historique des 25 concours inclus tel quel (volume raisonnable, 
  contrairement à l'historique de coffres trésor des donjons).
- **Chocolate Factory (événement Easter)** (`chocolate_factory`) — repéré pendant Long 
  tail (`events.easter.rabbits`) mais écarté à tort comme hors-scope : c'est un vrai 
  système de progression complet (chocolat, employees, niveau de grange, lapins trouvés). 
  `chocolate_level`/`chocolate_multiplier_upgrades`/`rabbit_rarity_upgrades`/
  `supreme_chocolate_bars` absents chez Cucumber (jamais prestige) — pas mappés faute de 
  vraie donnée. Un champ `shop` trouvé mais absent de la référence — pas deviné.
- **Auctions** (`auction_stats`) — la zone la plus directement pertinente pour Vault 
  spécifiquement : bids/won/gold dépensé-gagné/complétées + vendu/acheté par rareté, un 
  vrai résumé d'activité AH par joueur.
- **Fishing** (`fishing_stats`) — n'avait jamais eu sa propre zone malgré être un skill à 
  part entière. `sea_creature_kills` + `items_fished` (normal/treasure/large_treasure/
  trophy_fish).

**Un piège de déploiement rencontré, sans rapport avec les données** : un push vers la 
branche `feat/collecte-totale-audit-zones` n'a exceptionnellement déclenché aucun build 
Vercel (webhook GitHub→Vercel manqué, confirmé — le commit était bien sur GitHub, `git 
log origin/...` le confirmait, mais `list_deployments` ne voyait rien même après plus 
d'une minute d'attente). Un commit trivial de relance a suffi à débloquer le build 
suivant normalement — épisode isolé, pas un problème structurel.

## ✅ Chantier collecte totale repris — Phase 2 zone 1 : Boss kills (Kuudra/Arachne/Ender Dragon) (29 juillet)

Reprise du chantier "collecte totale" (Phase 1 — infra + classes de donjon — terminée 
le 23 juillet, Phase 2 jamais commencée jusqu'ici). Même méthode que le chantier NBT : 
structure brute Hypixel vérifiée sur un vrai profil (Cucumber) avant tout codage, jamais 
devinée depuis la mémoire ni depuis les types d'une lib tierce (`hypixel-api-reborn` 
n'est en fait pas une dépendance de ce projet — vérifié, `player/sync` fait des `fetch()` 
directs vers `api.hypixel.net`).

**Zéro coût API Claude sur toute cette zone** — confirmé avant de commencer 
(`player/sync/route.ts` ne contient aucun appel Anthropic) et respecté tout du long : 
`extractBossKills(member)` extraite en fonction pure exportée (même `member` déjà 
récupéré, zéro appel réseau propre) pour être testable directement sans jamais passer 
par le handler `GET` complet, qui chaîne `runEvolveSkills` (un vrai coût Sonnet) après 
chaque sync réussi — piège identifié avant de tester, pas découvert après coup.

**Structure réelle vérifiée en direct sur Cucumber, deux bugs trouvés en testant** :
- `HYPIXEL_API_KEY` à nouveau expirée (même clé de dev à renouvellement périodique déjà 
  documentée) — rechargée par l'utilisateur, mais le déploiement preview existant avait 
  l'ancienne clé figée au build ; a fallu forcer un nouveau build pour la voir passer.
- Bug trouvé dans ma propre route de diagnostic : `profiles[0]` pris à l'aveugle au lieu 
  de matcher le vrai `profile_id` de Cucumber — elle a 2 profils sous le même compte 
  Hypixel (Voxui09, partagé avec Orange). `member` est indexé par l'UUID **sans tirets**, 
  pas la forme avec tirets utilisée partout ailleurs — retrouvé en lisant le code déjà 
  fonctionnel de `player/sync` plutôt qu'en devinant.

**Kuudra** — `member.nether_island_player_data.kuudra_completed_tiers` est un objet PLAT 
mélangeant deux familles de clés pour les tiers réellement tentés : le nom du tier 
lui-même (`"none"`) = nombre de complétions, `"highest_wave_<tier>"` = meilleure vague 
atteinte dans ce tier (stat de progression, pas une complétion). Séparées en 
`completed_tiers`/`highest_wave` pour ne jamais mélanger les deux sens sous une même clé.

**Arachne** — `member.objectives.defeat_arachne_keeper` est un objet quête standard 
`{status, progress, completed_at}` — `status === 'COMPLETE'` avec `completed_at > 0` = 
Arachne vaincue (Cucumber : `status: "ACTIVE"`, pas encore vaincue).

**Ender Dragon** — `member.player_stats.end_island.dragon_fight.fastest_kill` n'a **pas** 
de compteur de kills réel, seulement un meilleur temps par variante (`young`, `strong`, 
etc). La présence d'une entrée pour une variante = au moins un kill de cette variante, 
jamais transformé en total inventé. **Bug réel trouvé en testant** : cet objet contient 
aussi une clé `"best"` (record toutes variantes confondues — sa valeur était identique à 
celle de `"young"`, confirmant que ce n'est pas une variante réelle) — exclue 
explicitement pour ne jamais gonfler `killed_types` d'un faux type de dragon.

**Nouvelle colonne `player_data.boss_kills`** (jsonb, `add_boss_kills_column.sql`, 
migration manuelle exécutée par l'utilisateur). Validé en écriture réelle sur Cucumber 
(`persisted: true`) : `{"kuudra":{"completed_tiers":{"none":1},"highest_wave":{"none":10}},
"arachne":{"defeated":false,"completed_at":0},"ender_dragon":{"killed_types":["young",
"strong"],"fastest_kill_ms":{"young":10850,"strong":23550}}}` — correspond exactement 
aux valeurs brutes Hypixel inspectées en direct.

**Prochaine zone après celle-ci (Boss kills)** : toutes les zones suivantes ont depuis 
été traitées et mergées sur master — voir le récapitulatif complet ci-dessous.

## ✅ Chantier collecte totale — Phase 2 complète : 8 zones mergées sur master (29 juillet)

Récapitulatif de bout en bout des 8 zones nommées de la liste d'origine (Boss kills → 
Banque/Fast Travel → Essence → Minions → Bestiary → Rift → Long tail), chacune 
développée sur sa propre branche, testée en direct sur Cucumber (jamais devinée depuis 
la mémoire), puis fusionnées sur master dans cet ordre : `feat/collecte-totale-boss-kills` 
d'abord (fast-forward, aucun conflit), puis `feat/collecte-totale-bank-fasttravel` 
par-dessus (2 conflits texte dans `app/api/player/sync/route.ts` et `CLAUDE.md` — les 
deux branches ajoutaient leurs fonctions d'extraction au même point d'ancrage, avant 
`const HYPIXEL_KEY` — résolus par concaténation, aucune perte de code, `tsc --noEmit` 
propre après résolution). Build de production Vercel confirmé `READY` après chacun des 
deux merges. Zéro coût API Claude sur l'ensemble de ce chantier — toutes les fonctions 
d'extraction sont du JS pur sur des données déjà récupérées, testées via des routes de 
debug temporaires qui contournent le chaînage `runEvolveSkills` (Sonnet) du handler 
`GET` complet, jamais par un vrai appel `player/sync` de bout en bout.

**Fiable, prêt à être consommé par une feature (Milestones, Evolve, etc.)** :
- **Boss kills** (`player_data.boss_kills`) — Kuudra (`completed_tiers`/`highest_wave` 
  par tier, séparés proprement), Arachne (`defeated`/`completed_at`), Ender Dragon 
  (`killed_types`/`fastest_kill_ms` par variante réelle, le faux type méta `"best"` 
  exclu).
- **Banque + Fast Travel** (`bank_tier`, `fast_travel_zones`) — tier réel du Personal 
  Bank + 152 zones réellement débloquées, alimente directement la tâche Milestones 
  `fast_travel_unlocked` jusque-là sans donnée.
- **Essence** (`essence`) — les 8 vraies boutiques, valeurs réelles par type, lues 
  dynamiquement (pas de liste de types codée en dur).
- **Minions** (`crafted_generators`) — confirmé par-membre (pas partagé coop comme la 
  banque), garde-fou anti-contamination coop validé (Cucumber : array vide, résultat 
  réel et honnête, pas un bug).
- **Bestiary** (`bestiary_kills`, `bestiary_milestone`) — 252 compteurs de kills réels + 
  le vrai palier de progression Bestiary.

**Partiel — mapping minimal ou honnêtement incomplet, à compléter plus tard** :
- **Rift** (`rift_motes`) — seule la monnaie est mappée (0, car le champ est absent chez 
  Cucumber). Les 11 sous-systèmes réels (`village_plaza`, `wyld_woods`, `castle`, 
  `dreadfarm`, etc.) existent mais étaient **tous vides** sur le seul profil de test 
  disponible — leur forme reste non vérifiée contre une vraie donnée non-nulle, donc 
  volontairement pas mappée plutôt que devinée. À reprendre avec un profil réellement 
  engagé dans le Rift.
- **Festivals** (`festival_candy`) — seul Spooky Festival a de la donnée réelle (4 
  instances). Mining Fiesta / Fishing Festival / Jacob's Farming Contest n'apparaissent 
  sous aucun champ contenant "festival" dans la recherche menée — non mappés, à 
  reprendre avec un profil qui y a participé.
- **Dojo** (`dojo_status`) — aucun bloc de stats dédié n'existe sur le profil de test, 
  seul le statut de la quête d'unlock (`ACTIVE`, jamais complétée) est réel et mappé. 
  Un vrai système de temps/scores par salle d'entraînement pourrait exister ailleurs 
  dans l'API mais n'a pas été localisé cette passe.
- **"Community shop"** (`community_upgrades`) — ce terme n'a pas d'équivalent Hypixel 
  littéral ; le vrai système mappé est le Community Center (`profile.community_upgrades`, 
  partagé au niveau du profil coop comme la banque), documenté comme la correspondance 
  la plus proche plutôt qu'un système inventé.
- **Harp** (`harp_songs`) — structure confirmée réelle mais vide chez Cucumber (aucune 
  chanson débloquée) ; forme d'un contenu non-vide jamais vérifiée.

**Non mappé du tout, noté explicitement pour ne pas être redécouvert par erreur plus 
tard** : `bestiary.deaths` (même forme que `kills`, aucune feature ne le consomme 
aujourd'hui), `member.attributes.stacks.*_essence` (mécanisme de fusion d'Attribute 
Shards, confirmé distinct de la vraie monnaie Essence), `member.player_data.
visited_modes` (taxonomie différente de `visited_zones`, pas utilisée), les objectifs 
warp individuels (`objectives.warp_*`/`travel_to_*`, plus granulaires que 
`visited_zones` mais pas nécessaires pour l'instant).

**État des branches à cette date** : `feat/collecte-totale-boss-kills` et 
`feat/collecte-totale-bank-fasttravel` sont toutes les deux mergées sur `master` — 
peuvent être supprimées quand l'utilisateur le souhaite. Les autres branches en attente 
non liées à ce chantier (`feat/milestones-route`, `feat/vault-roadmap-content`, 
`feat/free-tier-real-access`) restent inchangées, décision de fusion séparée à prendre 
au cas par cas.

## ✅ Phase 1 — base de connaissances jeu partagée (activity_gear_categories + progression_tiers) — mergée et testée complètement (29 juillet)

Premier étage d'une architecture proposée pour éliminer la dépendance à la "mémoire" 
du LLM sur la hiérarchie/catégorisation d'équipement et les seuils de progression — 
voir la conversation pour la proposition complète en 4 phases (référentiel structuré, 
mapping NEU brut, calculateur de stats, automatisation par patch).

**Deux nouvelles tables** (`phase1_game_knowledge_base.sql`, exécuté manuellement par 
l'utilisateur comme toute migration de ce projet) :
- **`activity_gear_categories`** — promeut le const `SKILL_GEAR_CATEGORIES` (le fix du 
  bug Ragnarok Axe, jusque-là vivant seul dans `evolve-skills/route.ts`) en vraie table. 
  `lib/activity-gear.ts` (`loadActivityGearCategories`) + nouvelles fonctions partagées 
  dans `lib/gear-pricing.ts` (`buildActivityGearCatalogSection`, 
  `gearCandidatesForActivity`, `verifyActivityGearName`, `armorCatalogText`) remplacent 
  la logique dupliquée par fichier — Evolve Skills ET Money Making 
  (`setup-generate-agent`) lisent maintenant la même table, fermant exactement le risque 
  de divergence qui avait causé le bug initial.
- **`progression_tiers`** *(⚠️ table supprimée le 29 juillet, voir la section "Unification 
  taxonomie tiers" tout en haut de ce document — fusionnée dans `milestone_tier_totals`, 
  ne plus la chercher)* — squelette 7 tiers (Starter→Master) qui relie l'échelle 7 
  tiers de Milestones et le `TIER_CONFIG` 4 tiers déjà existant de Money Making. Bornes 
  networth à 50M/500M/5B réelles (plafonds déjà validés en prod de `TIER_CONFIG`) ; 
  5M/150M/1.5B interpolées (milieu géométrique de chaque bande réelle), explicitement 
  marquées provisoires par ligne (`calibration_note`). `purse_reference` rempli 
  uniquement pour les 2 tiers avec un vrai profil d'ancrage (Starter ← Orange, 
  Expert ← Cucumber), laissé `NULL` ailleurs plutôt que d'inventer 5 chiffres sans base 
  réelle. `money_making_tier_key` déterministe par construction mais marqué 
  "à revalider" tant que peu de profils réels couvrent les 7 bandes.

**Intégration Money Making** — `setup-generate-agent` construit maintenant aussi une 
section catalogue arme/outil par activité (même table, mêmes fonctions partagées), 
ajoutée à son contexte wiki déjà mis en cache par tier ; `buildUserPrompt` indique à 
chaque méthode quelle(s) section(s) d'activité utiliser via son vrai champ 
`skill`/`skills_combined` (confirmé fiablement rempli par un audit réel : 
farming/mining/combat/fishing/foraging, certaines méthodes vault combinent deux 
activités). `applyPreciseCost` filtre les matches weapon_name/tool/rod par catégorie 
avant de les laisser contribuer au coût/rareté — volontairement non-destructif sur le 
texte visible du setup (contrairement à `gear_name` côté Evolve Skills, champ neuf cette 
session) puisque Money Making est une fonctionnalité déjà en prod.

**Trois bugs réels trouvés et corrigés en testant, sans rapport direct avec la feature 
mais bloquants pour la valider** :
1. `parseJSON` (evolve-skills) ne récupérait pas quand Claude préfixait sa réponse de 
   prose ("I'll analyze...") avant le JSON — plus probable avec le prompt Phase 1 
   agrandi. Fallback ajouté : découpe du premier `{` au dernier `}` si le parse direct 
   échoue, plus une instruction explicite "commence par { , aucun préambule".
2. `max_tokens` relevé 16000→24000 — un profil riche en gear (Cucumber) tronquait en 
   plein milieu du JSON une fois les 2 nouveaux champs (`armor_set_used`, `gear_name`) 
   ajoutés sur 9 cartes + 6 boss slayer.
3. `loadActivityGearCategories` loggait silencieusement un échec de requête en carte 
   vide — trouvé en direct (un raté transitoire faisait lire "aucun slot dédié" à 
   chaque activité, `gear_name` retombait à `null` partout sans aucun signal).

**✅ Vérification complétée (29 juillet, après recharge crédit)** — un seul appel groupé, 
budget-conscient (Cucumber seule pour Evolve Skills, Orange déjà validée pas re-testée ; 
3 méthodes Money Making au lieu de 5, une par activité distincte). Orange (profil réel, 
vide) déjà validé plus tôt : 0 violation sur ses 2 items (`Worn Huntaxe - Genesis` → 
`AXE` → foraging, `Basic Fishing Net` → `FISHING_NET` → fishing). Cucumber (le profil le 
plus chargé en gear, le test le plus exigeant pour un bug classe Ragnarok Axe) : run 
complet réussi (`saved:1, errors:[]`), 4 items target.gear_name vérifiés, 0 violation 
(`Advanced Gardening Hoe` → `FARMING_TOOL` → farming, `Mithril Drill SX-R226` → `DRILL` → 
mining, `Magma Rod` → `FISHING_ROD` → fishing, `Shadow Fury` → `SWORD` → slayer/zombie) ; 
`current.armor_set_used` varie bien par carte (Mantid Cropie/farming, Calcified 
Sponge/fishing, Ancient Necron's/slayer). Échantillon Money Making (3/3 générations 
Haiku réussies) : `Hyperion` → `SWORD` → combat (Infernal Kuudra), Divan's Drill (mining, 
chaîne multi-composants, non re-vérifiable par un match exact simple mais générée sans 
erreur), Pest Farming (farming) — 0 violation détectée sur ce qui était vérifiable. 
Chantier Phase 1 considéré clos.

**Prochaines phases, pas commencées** :
- Phase 2 : miner les 36 fichiers NEU déjà cachés bruts mais jamais mappés 
  (`hotmlayout`/`hotflayout` en priorité — directement utile à `hotm_progress` déjà en 
  base).
- Phase 3 : calculateur de stat réel par item (base+reforge+étoiles+enchants+HPB+gemmes+
  HotM) — actuellement rien ne fait ce calcul, `item_stats.health/defense/...` est connu 
  vide pour la plupart des items endgame. Prérequis pour qu'une future table 
  `activity_stat_weights` ait quoi que ce soit de fiable à pondérer.

## ✅ Evolve Skills — SkillBar + SkillProgressOverlay, current = setup optimal possédé (29 juillet)

Remplace les panneaux plats `SkillCard` current/target des 8 skills non-Slayer 
(farming/mining/combat/foraging/fishing/alchemy/enchanting/dungeoneering) par une barre 
XP horizontale par skill (`SkillBar.tsx`, vraie progression depuis `lib/skill-xp.ts`) qui 
ouvre au clic un overlay plein écran 2 colonnes (`SkillProgressOverlay.tsx`) — gauche : le 
vrai setup actuel du joueur via `SkinArmorRender` (réutilisé sans modification, enveloppé 
par le nouveau `SetupCharacterPanel.tsx`) ; droite : le gear cible précis de Claude. 
L'accordéon 6 boss de Slayer reste sur l'ancien composant `SkillCard` pour cette passe, 
sur instruction explicite — sa conversion est un chantier séparé à venir.

**Deux vrais bugs trouvés et corrigés en testant, pas seulement le travail visuel prévu** :
1. `current` affichait toujours l'équipement littéralement porté (ex : le set 
   "Groovy Fig", thème Foraging, apparaissait même sur la carte Farming de Cucumber) — 
   `lib/skill-setup-adapter.ts` réécrit pour que `current` soit le setup OPTIMAL possédé 
   par skill, scanné partout où le joueur a de l'armure (équipé + inventaire + ender 
   chest + backpacks + Personal Vault + wardrobe), choisi par carte par Claude via un 
   nouveau champ `armor_set_used`.
2. `target` pouvait nommer un item réel mais dans la mauvaise catégorie fonctionnelle 
   (une vraie épée de combat recommandée comme outil de Foraging parce que son nom 
   contient "Axe") — catalogue arme/outil filtré par catégorie par skill 
   (`SKILL_GEAR_CATEGORIES`, promu en table partagée dans la Phase 1 ci-dessus) plus une 
   vérification côté serveur (`verifyGearName`) qui annule tout ce qui ne matche pas la 
   bonne catégorie, défense en profondeur en plus de la règle de prompt.

Trouvé au passage : un bug latent où l'ancien code lisait un champ `stars` qui n'existe 
pas sur un item décodé réel (le vrai champ est `total_stars`, mettait silencieusement 
`armor_stars` à 0 sur chaque rendu current), et un glyphe Unicode Private Use Area propre 
à Hypixel dans les noms d'items qui cassait les lookups par nom exact même après trim des 
espaces.

Validé sur plusieurs runs réels Cucumber/Orange : `current` varie maintenant correctement 
par skill (Mantid Cropie en farming, Wise Yog en mining, Groovy Figmail en foraging, 
Calcified Sponge en fishing, Ancient Necron's/Shadow Assassin/Crimson en 
combat/dungeoneering/slayer) au lieu d'un seul set répété partout ; `target.gear_name` ne 
contamine jamais une autre activité (Advanced Gardening Hoe/Mithril Drill/Reinforced 
Huntaxe/Inferno Rod/Shadow Fury, chacun correspondant à la bonne carte). Orange (EARLY, 
profil vide) reste correctement `null` partout.

## 🔴 Régression prod critique post-migration Three.js + résilience — corrigées (28 juillet)

**Signalé par l'utilisateur, priorité absolue** : en prod, cliquer sur un setup Money 
Making faisait planter toute la page ("This page couldn't load"). Diagnostiqué sans accès 
navigateur direct — logs Vercel runtime (0 erreur 5xx serveur, confirmant un crash 
CLIENT, pas serveur) + lecture du code + un vrai test réseau externe :

- **Root cause réelle, pas hypothétique** : `useLoader(THREE.TextureLoader, skinUrl)` 
  lève une exception (promise rejetée) quand la texture échoue à charger — `Suspense` ne 
  capture que l'état "en chargement", jamais un échec. Ce projet n'a **zéro Error 
  Boundary React nulle part** — une erreur non capturée démonte tout l'arbre React, pas 
  juste ce composant. Exactement "This page couldn't load".
- **Déclencheur confirmé en direct** : `crafatar.com` (dont dépendent `DEFAULT_SKIN_URL` 
  et tout skin réel de joueur) retournait un vrai `521` au moment du test (`curl -sI`, 
  répété deux fois). L'ancienne version CSS utilisait `background-image`, qui dégrade 
  silencieusement sur un échec — la migration vers une texture WebGL a supprimé cette 
  dégradation gracieuse gratuite sans rien pour la remplacer.

**Fix immédiat (hotfix)** : `SceneErrorBoundary` (composant classe React, seul moyen de 
capturer une erreur de rendu) enveloppe le `Canvas` — toute panne de la scène 3D dégrade 
maintenant vers un petit placeholder texte au lieu de planter la page. Purement additif 
au chemin d'échec, chemin nominal inchangé. Build Vercel réel confirmé avant merge.

**Résilience complète (suite immédiate, même session)** : le hotfix empêchait le crash 
mais, Crafatar restant en panne, TOUS les utilisateurs voyaient le placeholder au lieu de 
leur vrai personnage. Fermé sans toucher à la question légale encore ouverte sur la 
redistribution d'assets Mojang (une texture fetchée en direct à chaque requête, jamais 
stockée, reste une catégorie différente d'un asset copié dans notre propre repo — 
distinction vérifiée avant d'agir après qu'une première réponse à une question de 
clarification ait affirmé à tort qu'un usage "déjà validé" couvrait ce cas, contredit par 
une relecture réelle de CLAUDE.md) :
1. **Deuxième source live, pas une copie stockée** : `/api/player/status` résout 
   maintenant aussi `mojang_skin_url` côté serveur via le serveur de session Mojang 
   (`sessionserver.mojang.com`, la source que Crafatar lit lui-même) — confirmé joignable 
   et confirmé servir la texture avec CORS permissif (`Access-Control-Allow-Origin: *`, 
   vérifié en direct). `SetupOverlay` construit une liste ordonnée `[crafatar, 
   mojang-direct]`, `SkinArmorRender` essaie chaque URL en séquence via un nouveau hook 
   `useResilientTexture()` (remplace `useLoader()`, qui n'a aucune notion de "réessayer 
   avec l'URL suivante" et causait le crash initial).
2. **Dernier recours garanti** : `public/images/skin-placeholder.svg`, une couleur unie 
   générée par code — pas une copie d'un design de skin Mojang — toujours ajoutée comme 
   candidat final. Asset statique same-origin, ne peut pas échouer pour une raison réseau.
3. Validé avant merge : résolution Mojang testée en direct sur un vrai UUID (retourne une 
   vraie URL `https://textures.minecraft.net/...` valide en ~2.1s), asset placeholder 
   confirmé servi (200, `image/svg+xml`), build Vercel réel confirmé les deux fois.

## ✅ SkinArmorRender migré de CSS 3D vers three.js/@react-three/fiber (28 juillet)

**Pourquoi** : le rendu du personnage (Money Making SetupOverlay) a nécessité 3 corrections 
distinctes cette semaine pour arrêter de s'aplatir — `filter:drop-shadow` sur le panneau 
modal rastérise tout son sous-arbre et aplatit silencieusement n'importe quel descendant 
`transform-style:preserve-3d` ; `backdrop-filter` sur le calque de flou extérieur fait 
exactement la même chose, jamais couvert par le fix précédent ; puis `ArmorLayer` (le 
wrapper interne de chaque pièce d'armure) n'avait lui-même jamais `preserve-3d`, aplatissant 
ses 6 faces en 2D. Trois symptômes du même problème de fond, pas trois bugs isolés : le CSS 
3D est une fonctionnalité de mise en page détournée pour faire du 3D, avec des pièges 
d'aplatissement documentés dans la spec elle-même. Décision : migrer vers un vrai moteur 3D 
(three.js) plutôt que de continuer à chasser des variantes du même problème — élimine cette 
classe de bug structurellement (aucun équivalent "une propriété CSS ancêtre aplatit 
silencieusement toute la scène" n'existe pour un canvas WebGL).

**Toute la donnée métier déjà validée reste inchangée, seule la couche de rendu change** :
- `BODY_PARTS` (`lib/skin-uv-map.ts`) — fichier non touché, position/UV de chaque pièce.
- Valeurs `inflate` (1.0 outer), couleurs réelles par pièce (`item_stats.default_color`), 
  contenu des tooltips (rareté/stats/enchants/reforge) — tous réutilisés tels quels.
- La recette de transform CSS déjà validée en prod contre le vrai modèle Mojang (translate3d/
  rotateX/rotateY par face, angle de caméra `rotateX(-14deg) rotateY(-38deg)`) — portée via 
  une conversion CSS→three.js dérivée puis vérifiée deux fois indépendamment (retrouve la 
  même négation que l'ancien rig CSS sur son propre `translate3d(x, -y, z)` ; la normale 
  sortante calculée à la main pour chacune des 6 faces pointe dans la direction attendue), 
  documentée directement dans `components/SkinArmorRender.tsx` plutôt que redérivée à 
  l'aveugle depuis une convention Minecraft générique.

**Éclairage** : la teinte d'armure n'est plus 6 multiplicateurs `brightness()` réglés à la 
main par face (l'ancienne approche CSS) — un vrai `DirectionalLight` + `MeshStandardMaterial` 
calcule maintenant l'ombrage par face depuis la géométrie réelle, plus robuste (aucune 
valeur à deviner) et appliqué aussi à la couche skin (pas seulement l'armure) pour un modèle 
d'éclairage cohérent sur tout le personnage, au lieu de l'ancien mélange skin non-éclairé + 
armure ombrée manuellement.

**Interaction** : le hover par pièce utilise maintenant le système d'événements pointeur 
natif de `@react-three/fiber` (bubbling `onPointerOver`/`onPointerOut` sur le groupe 
enveloppant les 6 faces de chaque pièce d'armure) au lieu du `mouseenter`/`mouseleave` DOM — 
même comportement de délégation, même contenu/positionnement de tooltip, backé par le 
raycasting de R3F plutôt que le hit-testing natif du navigateur.

**Nouvelles dépendances** : `three`, `@react-three/fiber`, `@types/three` — pas de `drei` 
(pas nécessaire : `useLoader` pour le chargement de texture et le prop `orthographic` de 
`Canvas` sont tous les deux du cœur R3F, aucun `OrbitControls`/`Html` requis puisque le rig 
reste non-interactif comme avant et le tooltip reste un overlay DOM classique).

**Vérifié avant merge, même rigueur que d'habitude** :
- Build Vercel réel confirmé (`READY`) — capture les erreurs de bundling/imports qu'un 
  simple `tsc --noEmit` ne verrait pas. `npm run build` en local échoue à l'étape de 
  collecte des données de page (`SUPABASE_SERVICE_ROLE_KEY` absente de `.env.local`, 
  problème d'environnement local déjà documenté, sans rapport avec cette migration — 
  TypeScript lui-même compile proprement).
- **Preuve visuelle** : un Artifact autonome reproduisant fidèlement toute la même 
  logique (mêmes données `BODY_PARTS`, même dérivation de transform par face, même 
  éclairage `DirectionalLight`+`MeshStandardMaterial`) — vrai WebGL, pas une maquette, 
  three.js minifié inliné directement (le bac à sable de l'Artifact bloque les scripts 
  CDN externes). Un vrai bug trouvé en testant l'Artifact lui-même (pas le composant 
  livré) : `three.module.min.js` n'est pas autonome, il importe `three.core.min.js` via 
  un chemin relatif qui ne peut pas se résoudre contre une URL `blob:` (pas de base 
  hiérarchique) — corrigé en inlinant aussi `three.core.min.js` et en patchant le 
  spécificateur d'import vers sa vraie URL blob avant l'import. Confirmé sans rapport 
  avec le composant réellement livré (qui passe par le bundler Next.js normal, déjà 
  confirmé fonctionnel par le build Vercel réel). Contrôles de la preuve : bascule 
  No armor / Boots only / Full armor (skin coloré synthétique pour lever toute ambiguïté 
  indépendamment de l'apparence d'un vrai skin), glisser pour orbiter (vraie scène 3D, pas 
  un angle de caméra figé), survol pour confirmer l'interaction par raycasting.
- **Confirmé visuellement par l'utilisateur** avant merge.

**Point de repère ouvert avant cette migration** : le rendu manquait de skin visible sur un 
setup Revenant complet (casque+plastron+jambières+bottes) — investigué et confirmé comme 
comportement attendu, pas un bug : `hasArmor` couvre les 6 parties du corps par un seul 
booléen (`!!setup.armor_set`), et un set complet enveloppe géométriquement 100% du skin 
avec des boîtes d'armure plus grandes et opaques à la même position — exactement comme un 
joueur en armure complète en vrai jeu. Aucun concept de couverture partielle n'existe côté 
données (Money Making génère toujours un `armor_set` atomique 4 pièces, jamais un mix par 
emplacement), donc rien à corriger côté logique — confirmé via le même Artifact de preuve 
(bascule "Boots only" montrant le skin réel sur tête/torse/bras pendant que seules les 
jambes sont couvertes).

## ✅ Money Making — SetupOverlay enfin en prod : 3 colonnes, couleurs d'armure réelles, tooltips riches (28 juillet)

Ce travail (construit et testé sur `preview/loadout-layout` lors d'une session précédente) était resté 
coincé sans jamais atteindre master — la branche avait aussi accumulé les correctifs ah_live/Radar/Free 
tier/Patch Analysis du même jour, mergés séparément aujourd'hui via des branches isolées. **Signalé par 
l'utilisateur** : Money Making affichait toujours l'ancienne version en prod. Vérifié par diff avant de 
merger : les fichiers de ce chantier (`SetupOverlay.tsx`, `SkinArmorRender.tsx`, 
`lib/rarity-colors.ts`, `lib/setup-field-helpers.ts`, `armor-color-sync/route.ts`, 
`setup-generate-agent/route.ts`, `vercel.json`) n'avaient **aucun chevauchement** avec les fichiers déjà 
mergés séparément aujourd'hui — isolé sur une branche propre depuis master, vrai build Vercel confirmé 
avant merge.

**Couleur cuir réelle par pièce d'armure (NEU-REPO), remplace le tint vanilla uniforme** — NEU-REPO a un 
dossier `items/` (jamais fetché par `neu-sync`) dont le `nbttag` de chaque `LEATHER_*` contient la vraie 
couleur de teinture assignée par Hypixel (`display:{color:NNNNN}`), indépendante de toute recoloration 
joueur. Confirmé contre une valeur déjà documentée manuellement (Necron's Chestplate : `15155516` = 
`#E7413C`, match exact). Échantillonnage réel des 649 fichiers d'armure du repo : 62% `leather_*` avec 
couleur, 19% tête de joueur reskinnée (aucune couleur possible), 17% autre matériau de base (Revenant 
Armor = `diamond_chestplate`, zéro donnée couleur server-side). Nouveau cron hebdo `armor-color-sync` 
(lundi 5h30, entre `neu-sync` et `setup-generate-agent`), scope limité aux items déjà armure dans 
`item_stats` — nouvelle colonne `item_stats.default_color` (migration manuelle déjà exécutée par 
l'utilisateur, backfill déjà appliqué aux 35 setups existants). `setup-generate-agent` attache la vraie 
couleur par pièce matchée (`armor_helmet_color`/`armor_chestplate_color`/`armor_leggings_color`/
`armor_boots_color`), `SkinArmorRender` teinte chaque partie du corps depuis sa vraie couleur, retombe sur 
le placeholder vanilla (`#A06540`) uniquement quand `default_color` est `null`. Validé sur données réelles 
avant ce merge : Revenant Armor (diamond-based) confirmé `null` (fallback attendu), Necron's Armor casque 
`null` (skull) + plastron/jambières/bottes en dégradé `#E7413C`/`#E75C3C`/`#E76E3C` cohérent thème Wither.

**Layout loadout 3 colonnes + rendu 3D enfin réellement en volume** — refonte : LEFT (stats cible/
stratégie/coût) / CENTER (personnage équipé, skin+armure, barre équipement + accessoires) / reste en bas — 
remplace l'ancien layout 2 colonnes texte/inventaire. Nouveau `GearSlot` (tooltip riche coloré par vraie 
rareté) pour armure/arme/outil/canne/pet. **Bug de rendu plat trouvé et corrigé en 3 couches empilées, 
chaque fix précédent nécessaire mais pas suffisant** : (1) `filter:drop-shadow` sur le panneau modal 
rastérise tout son sous-arbre et aplatit silencieusement tout descendant `preserve-3d` — corrigé par 
`box-shadow` ; (2) `backdrop-filter` sur le calque de flou extérieur fait exactement la même chose, jamais 
touché par le fix précédent — sorti sur un `<div>` frère séparé ; (3) le vrai dernier bug : `ArmorLayer` 
(wrapper interne portant les 6 faces teintées de chaque pièce dans `SkinArmorRender.tsx`) n'avait **jamais** 
`transform-style:preserve-3d` sur lui-même — aplatissait les 6 faces en 2D, invisible tant que le 
personnage est en armure complète. **Leçon retenue** : un artifact de preuve isolé ne valide qu'UNE 
hypothèse précise, jamais toute la chaîne — seule une vérification contre le composant réel intégré (même 
imbrication DOM exacte) a fini par attraper chacun des 3 bugs, les artifacts précédents avaient tous inliné 
les faces un niveau plus superficiel que la vraie structure.

**Tooltips riches par pièce au survol du personnage** — remplace l'ancien tooltip générique unique pour 
tout le set par un tooltip par zone du corps (casque/plastron/bras/jambes/bottes), même format riche que 
`GearSlot` (nom coloré par vraie rareté, étoiles, stats, enchants, reforge — tout tracé depuis le même 
objet setup). État du skin distingué explicitement : `'loading'|'linked'|'unlinked'|'error'` — un vrai 
échec réseau affiche un message rouge ("Couldn't load your skin"), un compte simplement non lié affiche un 
message neutre gris ("Link your Hypixel account..."), ces deux cas n'étaient auparavant pas distingués.

**Explicitement pas inclus** : le chantier "vraie texture Minecraft" (`leather_layer_1/2.png`, la vraie 
apparence bosselée du cuir plutôt qu'un fill de couleur plate) reste différé — question légale sur la 
source de l'asset externe toujours ouverte, pas tranchée avec l'utilisateur. Les couleurs mergées ici sont 
des valeurs RGB déjà calculées depuis les données Hypixel elles-mêmes (aucun asset externe, aucun problème 
légal), donc dissociées de cette question et mergées indépendamment.

## ✅ Audit complet architecture cible + 4 correctifs mergés en prod (28 juillet)

Audit demandé point par point contre l'architecture produit cible (dashboard 4 tiers, 
Flash Alerts, Money Making, Patch Analysis, Radar, Evolve, pipeline de collecte) — chaque 
point vérifié dans le code/DB réel, jamais depuis la mémoire de CLAUDE.md. Deux agents 
Explore dépêchés en parallèle pour Patch Analysis/Radar/Evolve/Money Making (comptes de 
méthodes, bouton Rate) pendant que les points nécessitant un accès DB direct étaient 
vérifiés via des routes de debug temporaires, même méthode que d'habitude.

**🔴 Urgence trouvée en premier et corrigée avant l'audit lui-même — `ah_live` vide à 
chaque run, deux vrais bugs empilés** : le buffer (`ah_scan_buffer`) se remplissait 
normalement chaque minute (cron actif, endpoint Hypixel sain, aucun lock bloqué), mais 
la comparaison "buffer vs historique réel" pour trouver les flips sous-évalués ne trouvait 
jamais rien.
1. La requête ciblait encore `price_history_ah` filtré sur `granularity='DAILY_EXACT'` — 
   or `ah-aggregate` (reconstruit plus tôt cette semaine) n'écrit plus jamais cette 
   combinaison dans cette table (le per-variante exact a migré vers 
   `price_history_ah_variants`, `price_history_ah` ne reçoit plus que `DAILY` blended). 
   Un consommateur de l'ancien schéma oublié lors de la passe de renommage (seuls 
   `item-history/route.ts` et `RadarSection.tsx` avaient été vérifiés à l'époque).
2. Une fois requêté sur la bonne table, toujours 0 résultat : un seul `.in('base_item_id', 
   ...)` avec 2300+ valeurs dépassait silencieusement la limite de longueur d'URL de 
   PostgREST (requête GET), et l'erreur n'était jamais vérifiée — `historical` retombait 
   à vide sans throw ni log. Batché par 200 avec logging d'erreur réel.

Vérifié en direct avant merge (`runAhCollect()` extrait en fonction plain, même pattern 
que `runAhAggregate()`, appelée directement par une route de debug) : `ah_live` passé de 
0 à 300 lignes réelles et cohérentes (Crown of Avarice, variantes Hyperion, Necron's 
Helmet, avec discount/profit réels). Mergé sur master via une branche hotfix dédiée 
(`hotfix/ah-collect-empty-live`), isolée du reste du travail preview en cours.

**🔴 Même famille de bug trouvée indépendamment dans Radar pendant l'audit** — 
`RadarSection.tsx` interrogeait aussi `price_history_ah.variant_key` pour lister/tracer les 
variantes NBT d'un item, alors que cette colonne ne contient plus que le placeholder 
blended (`__all_variants_blended__`) depuis la même refonte. Corrigé (branche 
`fix/evolve-skills-cron-and-radar-variants`, mergée) : la liste de variantes et la série 
par variante précise pointent maintenant vers `price_history_ah_variants` (le général/
blended reste sur `price_history_ah`, toujours correct pour ce cas). Vérifié en direct sur 
HYPERION : 108 vraies variantes distinctes remontent désormais (étoiles/reforge/ultimate 
enchant/gemmes/Art of War réels), contre une seule (le placeholder) avant.

**🟡 `evolve-skills` — audité comme "cron manquant dans vercel.json", en fait un choix 
volontaire de conformité API Hypixel** : proposé dans un premier temps de le rajouter au 
planning cron, mais son propre commentaire d'en-tête documente qu'il a été retiré de 
`vercel.json` le 23 juillet précisément pour respecter l'interdiction Hypixel de polling 
périodique continu des données joueur. Remplacé par un appel synchrone par-profil depuis 
`app/api/player/sync/route.ts` juste après un sync réellement demandé par le joueur — 
confirmé réel et fonctionnel (`runEvolveSkills([profile.profile_id])`, jamais sur 
l'ensemble des profils, jamais sur un timer). **Pas rajouté au cron** — l'aurait 
recassé exactement ce que ce retrait avait corrigé.

**✅ Free — tier réel, plus 5 tabs verrouillés** : Free était annoncé comme un vrai palier 
mais n'avait aucun accès réel — `TABS` (`app/dashboard/page.tsx`) n'avait aucune entrée 
`free` sur les 5 tabs, alors que le backend avait déjà l'infra dégradée prête et jamais 
utilisée (`ah_live_free_preview`/`bazaar_1h_free_preview`, `filterPatchAnalysisContent`/
`filterPatchInsight`, tout ça du chantier gating du 23 juillet). Patch Analysis n'a demandé 
aucun changement de composant : `PatchSection.tsx` protège déjà chaque champ 
défensivement (`a()`/`s()`, longueur vérifiée avant de rendre une section), donc la 
dégradation serveur existante (titre + 1 phrase d'impact, Live seulement) s'affiche 
correctement dès que le tab est atteignable — juste ajouté `'free'` à son entrée `TABS`. 
Flash Alerts a demandé un vrai nouveau chemin : les vues de preview se sont révélées bien 
plus pauvres que prévu (`ah_live_free_preview` n'a que `item_name`/`category`/
`discount_pct` — aucun prix, aucun UUID d'enchère ; `bazaar_1h_free_preview` n'a pas de nom 
d'item) — forcer ça dans les cartes `LiveRankedFeed` existantes aurait demandé des branches 
conditionnelles sur presque chaque champ. Nouveau composant séparé `FreeFlashPreview.tsx` 
à la place : un vrai teaser top-5 honnête avec une incitation à upgrade, pas une version 
appauvrie du feed payant. Vérifié avant de câbler que la clé anon (celle du frontend) peut 
bien lire les deux vues (5 lignes chacune) et que les vraies tables `ah_live`/`bazaar_1h` 
restent bien bloquées pour anon (la frontière RLS de l'audit sécurité du 23 juillet est 
intacte). Confirmé visuellement de bout en bout sur un vrai compte Vault jetable (aucune 
ligne `subscriptions` → résout à `free` par construction, voir `lib/get-plan.ts`), compte 
supprimé après test.

**✅ Radar — count réel, testé sur un vrai compte Elite jetable** : les trois libellés 
codés en dur (`"4781 ITEMS"`, `"2119 Bazaar · 2662 AH · 1429 variants tracked"`) avaient 
dérivé d'un comptage manuel ancien — `items_catalog` est réellement à 5213 lignes 
aujourd'hui. L'hypothèse de l'audit ("pagination manquante") s'est révélée fausse en 
testant : `loadCatalog()` retourne déjà la table anon complète (5213/5213, aucune 
troncature). Comptes total/Bazaar/AH dérivés du catalogue déjà chargé pour la recherche 
(zéro requête supplémentaire), plus un `count:'exact', head:true` sur 
`price_history_ah_variants` pour le stat de variantes, relabellé honnêtement "variant 
price points tracked" (un compte de lignes, pas d'items distincts — aucun chemin de 
comptage distinct bon marché via le client anon sans nouvelle infra serveur). **Piège 
trouvé en testant** : `price_history_ah_variants` fait partie des 5 tables gated par 
`has_plan()` (audit sécurité du 23 juillet) — un client anon SANS session authentifiée 
y voit toujours 0 lignes, peu importe le vrai volume de données. Le premier passage de 
vérification (client anon nu) montrait donc `— variant price points tracked` ; corrigé 
en se connectant réellement comme le compte de test avant de rejouer les mêmes requêtes 
(reproduit fidèlement ce qu'un vrai utilisateur Pro/Elite connecté verrait dans son 
navigateur). Revalidé : `65 168` lignes réelles → `"65.2K variant price points tracked"`, 
`"1475 Bazaar · 3738 AH"`, `"5213 ITEMS"`. Compte test Elite jetable créé (résolution 
`getUserPlan()` confirmée à `elite`, tab Radar bien atteignable), supprimé après test.

**✅ Patch Analysis — impact mécanique/gameplay, testé en prod avec de vrais appels 
Sonnet+Haiku** : le prompt de `patch-analysis-agent` était 100% focalisé économique 
("Focus only on changes that affect item prices or money-making methods"), zéro 
couverture des mécaniques générales (drop rates, XP, comportement des mobs, mécaniques 
donjon/slayer, mouvement, rythme de progression). `LIVE_PROMPT` (Sonnet) et 
`ALPHA_PROMPT` (Haiku) demandent maintenant une seconde dimension séparée 
(`mechanics`/`gameplay`), explicitement instruits de ne jamais forcer un angle gameplay 
sur un patch qui n'en a pas. Deux nouvelles colonnes `insight_patch` : 
`mechanics_impact` (texte, résumé 1 phrase) et `gameplay_changes` (jsonb, tableau 
`{system, change, significance}` — même forme que `items_affected`/`methods_affected` 
existants, pas un nouveau pattern inventé). Migration manuelle exécutée par 
l'utilisateur avant test (`ALTER TABLE insight_patch ADD COLUMN IF NOT EXISTS 
mechanics_impact text, ADD COLUMN IF NOT EXISTS gameplay_changes jsonb DEFAULT 
'[]'::jsonb`). `runPatchAnalysisAgent()` extraite en fonction plain (même pattern que 
`runAhCollect()`/`runAhAggregate()`) pour test direct par route de debug.

Validé en conditions réelles (2 runs, vrais appels API, vraies écritures DB) : 
`"[July 23] Healing Revamp Hotfixes"` → Berserk reverti heal-on-hit + dégâts 
multiplicatifs, dégâts Goldor/Dropship corrigés (tous `MAJOR`) ; `"[July 13]"` → 
Chapitre VII Lotus Atoll verrouillé Expert, 4 slots Stat Tuning ajoutés ; côté alpha, 
`"Torrhus Canyon... Sparkling Critters"` → conditionnel correctement formulé (`"IF 
live: Safari Zone gains new rare encounter mechanic..."`). Garde-fou "ne pas forcer" 
confirmé : `"[July 3]"` et `"0.26.1 Release Candidate"` ont bien `mechanics_impact: 
null`/`gameplay_changes: []`. Gating revérifié sur un vrai compte Alert jetable : 
`filterPatchInsight` transmet les nouveaux champs pour Alert+, les exclut pour Free 
(`free_user_leaks_gameplay_fields: false`) — aucune modification nécessaire à 
`lib/gate-content.ts`, la règle existante (row entière pour non-Free) couvrait déjà ce 
cas. `PatchSection.tsx` : nouvelle section "🎮 Gameplay Impact" dans le Deep Dive modal 
(même layout que Methods Affected) + indicateur discret sur la carte compacte.

**Trouvé en testant, non lié à ce changement, pas touché** : `insight_patch` a déjà une 
colonne `gameplay_impact` orpheline (toujours `null`, zéro référence dans tout le repo) 
— probablement un reliquat d'une tentative antérieure jamais câblée. Ajouté à la liste 
de nettoyage ci-dessous plutôt que fusionné avec `mechanics_impact` maintenant (éviter 
d'ajouter une migration/re-test supplémentaire à un chantier déjà validé).

**Reste à faire** : nettoyage (`debug-boss-kills` mal placé dans `app/api/cron/`, 
`refresh-variant-stats`/`backfill-variant-stats` à évaluer — probablement des reliquats 
d'une architecture legacy jamais nettoyés ; `insight_patch.gameplay_impact`, colonne 
orpheline découverte ci-dessus, à supprimer ou fusionner avec `mechanics_impact`).

## ✅ Gear précis+justifié, pricing par variante exacte, rareté réelle, tooltips arme/outil/canne — testé en prod (28 juillet)

Évolution du chantier grounding `setup-generate-agent` : au lieu de recommander un nom 
de set générique ("Infernal Crimson Armor"), Vault définit maintenant une spec PRÉCISE 
et JUSTIFIÉE (étoiles/reforge/hot potato/ultimate enchant) que le joueur peut littéralement 
recréer, avec un coût calculé sur cette spec exacte plutôt qu'une moyenne toutes-variantes.

**Prompt enrichi** (`buildUserPrompt`) : `armor_reforge`/`weapon_reforge` doivent être 
copiés verbatim depuis la vraie liste REFORGES déjà dans le contexte (jamais inventés) ; 
`armor_ultimate_enchant`/`weapon_ultimate_enchant` doivent être un des vrais IDs 
(`ULTIMATE_ENCHANTS`, exporté du décodeur) ou `null` ; `armor_hot_potato_count` 0/5/10 ; 
nouveau champ `gear_justification` expliquant pourquoi ce choix précis sert la stat 
cible du tier — pas une reformulation générique du nom de l'item.

**Coût calculé par variante réelle, pas par moyenne toutes-variantes** — cascade à 3 
paliers avant le fallback blended déjà existant, tous appuyés sur `buildVariantKeys` 
(exportée de `lib/skyblock-item-decoder.ts`, jamais réimplémentée en parallèle pour ne 
jamais diverger de la logique déjà validée sur les vraies données AH) :
1. `price_history_ah_variants` — match exact sur la clé de variante complète construite 
   depuis la spec de Claude (étoiles+recomb+reforge+ultimate+hot potato).
2. `price_history_ah_variant_base` — match exact sur la clé de groupe (sans le reforge).
3. **Nouveau palier "broad"** — `price_history_ah_variant_base` avec un LIKE sur le 
   préfixe étoiles+recomb uniquement (ignore reforge/ultimate/hot potato), moyenne 
   pondérée par `data_points` sur toutes les lignes qui matchent. Trouvé nécessaire en 
   testant en vrai (Infernal Crimson Helmet) : les vrais exemplaires listés sur l'AH 
   portent quasi toujours un ultimate enchant (`habanero_tactics`, signature du set 
   Wither) même quand la spec hypothétique en laisse volontairement (`ultimate_enchant: 
   null` pour "la plupart des setups") — les paliers 1 et 2 ne matchaient donc jamais 
   rien pour ce type d'item, pas par bug (`buildVariantKeys` confirmée correcte contre 
   les vraies clés stockées) mais parce que ce variant précis n'existe simplement pas 
   en pratique. Validé en isolant le test sur `INFERNAL_CRIMSON_HELMET` : palier 3 
   trouve un vrai prix pondéré de 894 313 653 (`precision: "broad"`), pas un fallback 
   blended déguisé.

**Bug réel trouvé et corrigé pendant le test** : le matcher `armor_set` (règle "au 
moins 2 mots restants" ajoutée lors du chantier grounding précédent pour éviter que 
"Crimson Helmet" matche à tort "Infernal Crimson Armor") rejetait aussi les vrais sets 
à un seul mot distinctif — "Sorrow Armor" (confirmé réel et pricé : `SORROW_HELMET/
CHESTPLATE/LEGGINGS/BOOTS`, LEGENDARY, ~17M chacun) tombait à 0 pièce matchée. Remplacé 
par un concours de spécificité par catégorie de pièce (`bestArmorPiecesForSet`) : parmi 
tous les items dont le préfixe est un sous-ensemble de mots du texte cible, ne garder 
que celui au préfixe le plus long par catégorie — "Infernal Crimson Helmet" (2 mots) 
bat "Crimson Helmet" (1 mot) quand les deux matchent, "Sorrow Helmet" (1 mot) gagne par 
défaut quand c'est le seul candidat réel. Corrige les deux problèmes avec le même 
mécanisme plutôt qu'un seuil arbitraire.

**Rareté réelle** — `item.tier` existe dans `/v2/resources/skyblock/items` (déjà fetché 
par `skyblock-resources-sync`) mais n'était jamais mappé. Nouvelle colonne 
`item_stats.rarity` (migration manuelle, `ALTER TABLE`), mappée dans `syncItemStats`, 
attachée au setup pendant la génération (`armor_rarity`/`weapon_rarity`/`tool_rarity`/
`rod_rarity`). Validé en re-déclenchant un vrai sync sur preview : `DIVAN_DRILL: 
MYTHIC`, `HYPERION: LEGENDARY`, `INFERNAL_CRIMSON_CHESTPLATE: LEGENDARY` — vraies 
valeurs Hypixel, pas approximées.

**Arme/outil/canne en cases cliquables avec tooltip NBT** (`GearSlot` dans 
`SetupOverlay.tsx`) — remplace la ligne de texte brut par le même traitement visuel que 
les slots accessoires déjà en place (case biseautée + libellé), mais avec un hover panel 
riche : nom coloré par la vraie rareté (`RARITY_COLORS`, convention standard Hypixel/
Minecraft §-codes, pas une palette inventée), étoiles, stats, enchants, reforge — tout 
tracé directement depuis le même objet setup, rien d'inventé côté frontend. 
`gear_justification` affiché dans le panneau droit (nouveau bloc "🛡️ GEAR CHOICE").

**Apparence de l'armure — placeholder assumé, chantier texture différé** : discussion 
avec l'utilisateur sur un pack de texture custom par set (Necron's, Storm's, Divan's...) 
a été résolue par une vérification réelle plutôt qu'une estimation — aucune armure 
Skyblock n'a de texture de base unique côté serveur : chaque pièce est soit du cuir 
teinté (`LEATHER_*` + tag `color`, confirmé même pour Necron's Chestplate : `#E7413C` 
en dur) soit une tête de joueur reskinnée (`SKULL_ITEM` + `skin.value`, pour certains 
casques) — le "look custom" que les joueurs associent à ces sets vient entièrement de 
resource packs tiers optionnels, jamais des données Hypixel elles-mêmes. `SkinArmorRender` 
utilise donc la vraie couleur cuir vanilla par défaut (`#A06540`, RGB 160,101,64, 
vérifiée par recherche, pas approximée) pour toute pièce d'armure, en attendant un vrai 
pack de texture Vault (cuir teinté par la vraie couleur RGB retournée par l'API Hypixel 
via multiply/destination-in ; casques via la vraie skin décodée depuis `skin.value` et 
récupérée sur `textures.minecraft.net`) — **chantier futur, pas commencé, pas bloquant**.

**Testé end-to-end sur preview avant merge** (pas juste relecture de code), plusieurs 
passes de correction guidées par de vrais bugs trouvés en testant :
- 1ère passe : `armor_set: "Sorrow Armor"` matchait 0 pièce (bug matcher ci-dessus).
- 2e passe (fix matcher) : 5 items matchés, rareté réelle attachée, mais 
  `cost_optimal` montrait "0 exact variants" à chaque run.
- Diagnostic isolé sur `INFERNAL_CRIMSON_HELMET` : confirmé que les vraies clés de 
  variante stockées portent quasi toutes un ultimate enchant, d'où le palier "broad" 
  ajouté (3e passe) — revalidé : palier "broad" trouve bien un vrai prix (894 313 653) 
  pour ce même item une fois le fallback ajouté.
- Reforges vérifiées réelles à chaque run (`Pure`, `Epic`, `Brilliant`, `Excellent` — 
  tous confirmés présents dans la table `reforges`, jamais inventés par Claude malgré 
  la liberté du prompt).

## ✅ Skin + armure réels dans SetupOverlay (Money Making) — testé en prod (28 juillet)

Remplace la grille d'inventaire à icônes emoji de `SetupOverlay.tsx` par le vrai skin 
Minecraft du joueur rendu en cuboïdes CSS 3D (`components/SkinArmorRender.tsx`, pas de 
WebGL/skinview3d), avec l'armure équipée en couches gonflées par-dessus, hover = tooltip 
avec les vraies stats du setup généré. Nouveau `lib/skin-uv-map.ts` (format UV skin 
Minecraft standard 64×64, format public, pas un asset Mojang copyrighté).

**Proportions et géométrie d'armure vérifiées contre le vrai modèle Mojang**, pas 
approximées — plusieurs passes de correction avec l'utilisateur avant validation :
- Dimensions du modèle (tête 8×8×8, torse 8×12×4, bras/jambes 4×12×4 chacun) correctes 
  dès le départ, confirmées par recherche web.
- Bug de projection trouvé : `perspective` CSS (un vrai point de fuite) faussait les 
  pièces excentrées (bras en parallélogramme) et écrasait les proportions selon la 
  profondeur. Une vraie vue isométrique n'a pas de point de fuite — `perspective` retiré 
  entièrement (garde `preserve-3d`/`rotateX`/`rotateY`/`translateZ`, devient orthographique).
- Géométrie d'armure incomplète : le plastron ne couvrait jamais les bras, les jambes 
  étaient coupées en haut/bas (legging vs boots) sur une proportion inventée. Vérifié 
  contre le vrai split Mojang outer_armor/inner_armor : casque+plastron+bottes partagent 
  le modèle "outer" (inflate 1.0) sur tête/torse+bras/jambes ; le legging utilise "inner" 
  (inflate 0.5) sur les MÊMES parties du corps — comme outer > inner sur la même boîte, 
  la couche legging est toujours entièrement invisible sous un plastron+bottes portés 
  (vrai en jeu aussi). Une seule couche outer (1.0) par partie couverte, jambe entière.
- Item tenu en main (arme/outil visible dans la main) tenté sur 2 passes de positionnement 
  sans jamais retomber juste (aucun outil pour vérifier visuellement le rendu CSS 3D) — 
  abandonné à la demande de l'utilisateur, pas assez de valeur pour continuer à itérer à 
  l'aveugle. weapon_name/tool/rod/stats/ability affichés en texte simple dans SetupOverlay 
  à la place, pour ne pas perdre l'info.
- Vérification visuelle faite via un Artifact autonome répliquant exactement la même 
  logique de transform (CSP de l'Artifact bloque les images distantes — skin inliné en 
  data URI pour un vrai test de texture, crafatar.com étant tombé en 521 au moment du test, 
  contourné via le CDN de textures Mojang directement, même source que Crafatar utilise).

**`app/api/player/status/route.ts`** renvoie maintenant aussi `hypixel_uuid` (déjà 
sélectionné en base mais jamais renvoyé) pour que `SetupOverlay` puisse construire 
l'URL du skin réel du joueur connecté ; fallback sur le skin Steve par défaut si aucun 
compte Hypixel lié. Armure toujours en overlay teinté stylisé, jamais de vraie texture 
Mojang/Hypixel (même limite légale que la grille emoji qu'elle remplace).

**Testé end-to-end sur preview avant merge, avec un vrai compte et un vrai setup 
généré** (pas juste relecture de code) : compte Vault jetable créé + plan Pro inséré 
en base (contourne Stripe pour le test, même pattern que les comptes jetables déjà 
utilisés cette semaine) + lié à un vrai compte Hypixel (CUCUMBER, résolution Mojang 
réelle) → UUID réel `cec3ccc8-b31d-4cae-862f-6841a35e9686` → URL skin réelle 
`crafatar.com/skins/cec3ccc8-...`. Setup LATE Gemstone Mining regénéré via le pipeline 
groundé actuel : `armor_set: "Infernal Crimson"`, `weapon_name: "Hyperion"`, 
`tool: "Divan's Drill + ..."`, `cost_optimal: "~4.8B (6 items matched)"` — cohérent 
avec la validation du chantier grounding précédent. Contenu du tooltip d'armure dérivé 
du même objet setup : `title: "Infernal Crimson ✪✪✪✪✪"`, 
`lines: ["HP 2100+ | DEF 2200+ | STR 500+ | CD 150%+", "Set bonus: +50% Mining Speed in Crystal Hollows"]` 
— tracé directement depuis `armor_stats`/`armor_bonus`, rien d'inventé. Compte jetable 
et son lien Hypixel supprimés en fin de test (route de debug supprimée après validation).

## ✅ setup-generate-agent — grounding sur données réelles, testé en prod (28 juillet)

Remplace la dépendance à la mémoire brute de Haiku pour nommer du gear précis — 
bug concret signalé : suggérait du Mithril Armor pour du gemstone mining en late game 
au lieu de Divan's Armor. Deux volets, tous les deux validés par test réel sur preview 
Vercel (pas juste relecture de code) avant merge, méthode identique à l'arc 
`price_history_ah_variant_base` (branche preview, route de debug temporaire important 
directement les fonctions exportées — jamais de self-fetch HTTP, même contournement du 
mur SSO Vercel Deployment Protection).

**Catalogue de gear réel, prix réel** (`loadPricedItems`/`gearCatalogForBudget` dans 
`app/api/cron/setup-generate-agent/route.ts`) — jointure en JS entre `item_stats` 
(vrais stat blocks Hypixel, déjà collectés) et le dernier prix connu de 
`price_history_ah` (`__all_variants_blended__`, DAILY), filtrée par tier sur une bande 
de budget réelle (`max_gear_cost/25` → `max_gear_cost×3` depuis `TIER_CONFIG`). C'est 
le mécanisme qui corrige le bug Mithril/Divan's : le prix réel du Mithril tombe bien en 
dessous du plancher de budget LATE, donc il n'apparaît structurellement jamais dans ce 
catalogue-là — aucune règle "utilise Divan's en late game" codée en dur, ça sort 
directement des prix réels.

**Bug trouvé en testant, pas en relisant le code** : `item_stats.health/defense/...` 
est réellement à 0 en base pour la plupart des items endgame (Crown of Avarice, 
Hyperion, Infernal Crimson Chestplate confirmés à 0 par requête directe) — l'API 
Hypixel ne remplit ce champ que pour des items à stats plates simples, pas ceux dont le 
vrai stat vient des étoiles/reforge/génération. Afficher ces zéros au modèle aurait été 
une fausse information. Catalogue simplifié pour n'afficher que item_id/nom/catégorie/prix 
(la seule colonne fiable), trié par prix décroissant plutôt que par un score de 
puissance construit sur des colonnes creuses.

**Coût du setup calculé en code, jamais laissé à Claude** — testé et confirmé 2 fois de 
suite : même avec une règle de prompt explicite demandant de sommer les prix du 
catalogue, Haiku continue de sortir un chiffre habituel proche de `coins_display` (ex: 
"95-110M" alors que Divan's Drill seul vaut 1,86 milliard dans le catalogue qui lui est 
montré). Un modèle rapide/pas cher ne fait pas fiablement cette arithmétique en texte 
libre. `computeRealCost`/`applyRealCost` post-traite la réponse de Claude : matche 
`armor_set`/`weapon_name`/`tool`/`rod` contre le catalogue de prix réels, additionne les 
prix trouvés, écrase `cost_budget`/`cost_optimal`/`cost_endgame` avec ce total (± 
multiplicateurs simples) — Claude ne touche plus jamais ce chiffre.

**Bug réel trouvé dans le matcher lui-même, via un dump de debug pendant le test** : la 
première version du matcher matchait par sous-chaîne après avoir deviné/retiré "le 
dernier mot" — un mot générique partagé (Crimson, Magma, Hyper) suffisait à matcher un 
item complètement différent d'un tier totalement différent. Concrètement : "Infernal 
Crimson Armor" matchait à tort le vrai mais sans rapport "Crimson Helmet" (T1 Kuudra, 
~4M) en plus du bon "Infernal Crimson Helmet" (T5, ~500M) ; le texte inventé par Claude 
"Divan's Drill + Magma Fuel Tank..." matchait "Magma Rod"/"Magma Bow"/"Magma Necklace" — 
trois items réels mais sans aucun rapport, juste parce qu'ils partagent le mot "Magma". 
Corrigé avec deux matchers dédiés : `matchesArmorSet` utilise la vraie `category` de 
l'item (pas un mot deviné) pour retirer le mot de type Helmet/Chestplate/Leggings/Boots, 
et exige au moins 2 mots restants (un seul adjectif générique partagé ne suffit plus) ; 
`matchesExact` (weapon/tool/rod) exige que tous les mots significatifs de l'item 
apparaissent comme mots entiers, jamais une sous-chaîne. Revalidé sur le même exemple 
réel après fix : le nombre d'items matchés est tombé de 14-19 (faux positifs) à 
exactement 6 (4 pièces Infernal Crimson + Hyperion + Divan's Drill), total ~4,8B, 
cohérent avec les prix affichés dans le catalogue.

**Preuve concrète — LATE tier, Gemstone Mining (Crystal Hollows), testée en prod sur 
preview Vercel** : `armor_set: "Infernal Crimson Armor"`, `weapon_name: "Hyperion"`, 
`tool: "Divan's Drill + ..."` — plus aucune trace de gear bas-tier hors budget. 
`cost_optimal: "~4.8B — real current AH price of the named gear (6 items matched)"`, 
match exact avec la somme réelle des 6 items dans le catalogue affiché au modèle.

**Pas retouché** : `pet_name`/`gemstones` restent uniquement ancrés sur le texte wiki 
(pas de table de prix pet/gemstone dédiée à joindre pour l'instant) — documenté 
explicitement dans `GROUNDING_RULES` pour que Claude reste qualitatif dessus plutôt que 
d'inventer un nom d'item précis non vérifié.

## price_history_ah_variant_base + Landing page + Gating par tier — archivées (28/27/23 juillet, voir CLAUDE-archive.md)

Déplacées le 1er août dans le même lot d'archivage que les sessions 21-23 juillet
(CLAUDE.md retouchait de nouveau sa limite de 150k pendant la cartographie Source 2).
Landing page : hero verrouillé, retouches image, refonte `/features`/`/about`/légal.
Gating : faille `/api/market-data` sans auth trouvée et corrigée, architecture
plan/RLS à 2 couches. Aucun TODO vivant dans les deux — celui de Gating (câbler le
frontend Free) est déjà l'item 8 de "Prochaines étapes" ci-dessous.

## ✅ Sécurité compte/facturation — audit complet + failles corrigées (22 juillet)

Audit de sécurité exhaustif demandé avant les tests utilisateurs (RLS toutes tables, 
routes `player/*`, vues `SECURITY DEFINER`, routes cron, secrets côté client). Rien de 
critique trouvé côté `player/*` au-delà de ce qui était déjà documenté (voir section 
Sécurité Evolve plus bas) — mais l'audit a débordé vers les routes compte/abonnement, 
jamais vérifiées avant, et c'est là qu'étaient les vraies failles.

**🔴 Trouvé et corrigé — chaîne d'attaque complète sur le compte/facturation :**
- `subscriptions` avait une policy RLS nommée *"Users can read own subscription"* mais 
  `USING (true)` — en réalité lecture publique totale de `email`/`username`/
  `stripe_customer_id`/`stripe_subscription_id`/`plan`/`status` pour tout le monde via 
  la clé anon. **Corrigé** : policy scopée sur `email = auth.email()`, `TO authenticated` 
  seulement. `user_id` existe comme colonne mais n'est rempli par aucun chemin d'écriture 
  actuel (webhook, update-username) — scoping fait sur `email`, pas `user_id` (dette 
  notée, pas bloquante : migrer vers `auth.uid() = user_id` plus tard si `user_id` est 
  un jour rempli proprement).
- `/api/get-email-by-username` prenait un `username` et retournait l'`email` associé, 
  zéro auth, zéro rate-limit — oracle d'énumération complet. **Supprimée entièrement** 
  (pas de rate-limiting : pas d'infra existante, et l'alternative "token temporaire" 
  demande de toute façon la même plomberie serveur). Le login par username est refait 
  entièrement côté serveur à la place (voir ci-dessous).
- `/api/update-username`, `/api/cancel-subscription`, `/api/subscription` prenaient tous 
  un `email` en paramètre client, zéro vérification de session — n'importe qui connaissant 
  (ou énumérant via le point précédent) un email pouvait renommer le compte de quelqu'un 
  d'autre, résilier son vrai abonnement Stripe, ou lire son plan. **Corrigé** : les 3 
  routes appellent maintenant `auth.getUser()` via un client Supabase serveur lié aux 
  cookies, n'agissent que sur l'email de la session réelle, ignorent tout email fourni 
  par le client.

**Infrastructure ajoutée** : `lib/supabase-server.ts` (`createServerClient` de 
`@supabase/ssr`, lié aux cookies via `next/headers`) — première utilisation dans ce 
projet, jusqu'ici seul `createBrowserClient` existait. Réutilisable pour le chantier 
`player/*` à venir (même pattern d'auth serveur nécessaire).

**`/api/login`** (nouvelle route) remplace le flux "résoudre username → email côté 
client → `signInWithPassword`" : résout maintenant le username en interne, ne renvoie 
jamais l'email au client, pose la session directement via les cookies de la réponse. 
Corrige au passage un second petit oracle (le login distinguait "Username not found" 
d'un mot de passe faux — une seule erreur générique "Invalid credentials" maintenant).

**Testé end-to-end sur un vrai compte jetable** (créé/supprimé à chaque fois, jamais 
laissé en base) : login par email et par username, erreurs génériques sur mauvais 
mot de passe/username inconnu, et sur les 3 routes corrigées — appel avec la session 
réelle (fonctionne, agit sur le bon compte), sans session (401), et avec un email 
différent injecté dans le body (complètement ignoré, prouvé en observant que la réponse 
reste scopée à la session réelle).

**✅ Suite corrigée le même jour — `player/*` + liaison de compte :**
- `player_missions` et `player_progress` avaient les mêmes policies RLS 
  SELECT/INSERT/UPDATE totalement publiques que `subscriptions`. Ni l'une ni l'autre 
  n'a de colonne `user_id` pour scoper une policy par utilisateur — verrouillées à zéro 
  policy (service role uniquement), même posture que `player_data`/`player_skill_cards`.
- Les 4 routes `player/*` (`sync`, `missions`, `milestones`, `money-making`) exigent 
  maintenant une vraie session Vault (`auth.getUser()` via `lib/supabase-server.ts`).
- **Flux de liaison Vault ↔ Hypixel construit** : nouvelle table `hypixel_account_links` 
  (`user_id` clé primaire, `hypixel_uuid` `UNIQUE`, RLS scopée à `user_id = auth.uid()`). 
  "Premier arrivant, premier servi" — pas de preuve cryptographique d'appartenance, 
  choix assumé et proportionné : les données de jeu exposées ensuite (skills, slayers, 
  collections...) sont déjà publiques via l'API Hypixel officielle pour quiconque connaît 
  le pseudo, le vrai risque à couvrir était le spam d'écriture (déclencher sync/missions 
  sur un compte qui n'est pas le sien), pas une fuite de données déjà publiques. Nouvelle 
  route `POST /api/link-hypixel-account` (résout le pseudo via Mojang, refuse si déjà 
  lié à un autre compte Vault), UI minimale à `/link-hypixel` (pas stylée, à reprendre 
  avec le reste du design plus tard). Les 4 routes `player/*` n'acceptent plus aucun 
  `username`/`uuid` client — uniquement le compte réellement lié à la session.
- **Testé end-to-end sur 2 vrais comptes jetables** (créés/supprimés à chaque fois) : 
  liaison réussie sur un vrai pseudo Hypixel (Voxui09), `sync`/`milestones`/
  `money-making`/`missions` fonctionnels à travers le lien avec de vraies données 
  (Cucumber), un second compte sans lien correctement rejeté (400), une tentative de 
  lier un pseudo déjà revendiqué par un autre compte Vault correctement rejetée (409).

**🟡 Trouvé, toujours pas corrigé** :
- `method_feedback_summary` (vue `SECURITY DEFINER`) — `anon`/`authenticated` ont SELECT 
  dessus, bypass le RLS de `method_feedback` (RLS actif, zéro policy). Table vide 
  aujourd'hui donc impact nul, mais fuira tout commentaire/vote communautaire dès qu'elle 
  aura des données. `distinct_items` (l'autre vue `SECURITY DEFINER`) : risque nul, lit 
  `price_history` déjà publique légitimement.

**Aparté sans rapport à la sécurité** : `.env.local` contient une clé anon Supabase 
legacy désactivée depuis le 8 juillet — la prod utilise la nouvelle clé 
`sb_publishable_...`. `npm run dev` local est probablement cassé tant que ce fichier 
n'est pas mis à jour (fichier local, pas dans le dépôt, à corriger côté développeur).

## Sessions du 21-23 juillet — archivées (voir CLAUDE-archive.md)

Contenu narratif/diagnostic déplacé le 1er août pour repasser sous la limite de 150k
caractères de contexte auto-chargé (le fichier avait atteint 196k). Couvre : NBT pipeline
live, Session du 21 juillet, Infra collecte (3 bugs + audit complémentaire), le narratif
complet Phase 0-8 du chantier "Collecte totale" (le récapitulatif final "8 zones mergées
sur master" reste ci-dessous), Evolve état réel (première version backend), Sécurité
Evolve, Evolve architecture 3 sections + Section Skills, Chantier NBT joueur + networth
réel, Evolve Milestones REFONTE, Evolve Daily Missions RECONSTRUITE. Tout TODO encore
ouvert trouvé dans cette plage a été migré vers "Prochaines étapes"/"Ce que je ne veux
PAS" ci-dessous avant l'archivage. En cas de divergence entre l'archive et une section
restée ici, cette version (CLAUDE.md) fait toujours foi.

## Money Making — non retouché depuis le 13 juillet, donc toujours la référence

- 4 appels Claude parallèles (early/mid/end/late), jamais par sous-catégorie
- Cibles : Early 10M+/h, Mid 25M+/h, End 50M+/h, Late 70-100M+/h
- Budgets capital par tier, Bazaar/AH Flip personnalisés par tier
- Farming Methods et Vault Exclusive avec vrai setup (accessories, powers, 
  reforges, gemstones)
- Frontend générique (`parseTable` + modale `setupItem`), pas de modif nécessaire
- Statut : terminé et validé — ne pas reproposer de refonte sans demande

## Philosophie de développement

1. Pragmatisme > perfection théorique
2. Séparation stricte collecte (JS/SQL pur) vs analyse (Claude ciblé)
3. 1 appel Claude par catégorie logique, jamais par sous-catégorie
4. Toujours privilégier une source de données déjà collectée en interne
5. Clés React stables (`item_id`), jamais d'UUID éphémères
6. Toujours proposer `git add/commit/push`, jamais de push sans confirmation
7. **Jamais de constantes de jeu reconstituées de mémoire.** Tout seuil, tier, 
   XP requis, ou palier lié aux mécaniques Hypixel doit être vérifié contre le 
   wiki Hypixel officiel et/ou une table Supabase déjà collectée pour les agents 
   (ex : slayer_data, dungeon_data, magical_power_by_rarity...) avant d'être 
   codé en dur. Si aucune source fiable n'existe en interne, aller la chercher 
   via l'API Hypixel plutôt que d'inventer une valeur plausible.
8. **La landing page (hero + `/features` + `/about`) doit refléter fidèlement 
   ce qui existe réellement dans le dashboard — jamais une fonctionnalité 
   aspirationnelle, renommée ou obsolète.** Vérifier contre le vrai code des 
   composants (`app/dashboard/*`, `components/*`) avant d'écrire une 
   description marketing, jamais de mémoire ni de supposition — même règle 
   que le point 7, appliquée au contenu marketing plutôt qu'aux mécaniques de 
   jeu. Trouvé en pratique (27 juillet) : la copie annonçait un "#ah-sniper" 
   qui n'a jamais existé comme onglet (`app/dashboard/page.tsx` n'a que 5 
   tabs : Flash/Money/Patches/Radar/Evolve, AH Sniper a été absorbé par 
   Radar), et décrivait Money Making comme des "flips Bazaar/AH" alors que 
   le composant réel (`MoneyMakingSection.tsx`) n'a que deux catégories : 
   Active Grind et Vault Exclusive — zéro rapport avec du flip. **Corollaire 
   permanent : à chaque modification majeure du dashboard ou nouvelle 
   mécanique ajoutée (nouvel onglet, nouvelle catégorie, renommage, feature 
   retirée), le hero et les pages de features doivent être mis à jour dans 
   la même session, pas laissés dériver.** Le hero n'est jamais "verrouillé" 
   au sens de figé indéfiniment — seule sa composition visuelle (image de 
   fond) l'est pour l'instant ; son contenu textuel doit rester vivant et 
   suivre le produit réel en continu, exactement comme le reste du dashboard 
   (voir Philosophie d'évolution continue ci-dessous).

## Philosophie d'évolution continue

Rien dans Vault n'est "définitivement terminé". Chaque section du dashboard 
(Flash Alerts, Money Making, Radar, Patch Analysis, Evolve) et chaque système 
de collecte (ah-collect, bazaar-collect, historic-import) est amené à être 
revisité et amélioré au fil du temps — soit pour optimiser la performance/le 
coût, soit pour enrichir la précision et la personnalisation. 

"✅ Terminé" dans ce document signifie "fonctionnel et validé à ce stade", 
PAS "ne plus jamais y toucher". Ne jamais refuser une évolution en argumentant 
qu'une section a déjà été validée — vérifier plutôt si le changement demandé 
est cohérent avec la direction du projet, et si oui, avancer dessus normalement, 
en actualisant ce document en conséquence.

## Prochaines étapes

1. **✅ `HYPIXEL_API_KEY` — rechargée manuellement, fonctionnelle (23 juillet).** Après le 
   `403 Invalid API key` confirmé en Phase 2 puis reconfirmé sur `/api/player/sync` avec 
   un vrai compte, la clé a été rechargée manuellement côté Vercel — revérifiée en direct 
   (`200`, `success:true`, profils réels renvoyés). **C'est une clé de dev qui expire 
   régulièrement** (prochaine échéance ~25/07) — rechargement manuel à refaire à chaque 
   expiration tant que le produit n'est pas passé en clé de production (démarche de 
   validation officielle auprès de Hypixel, prévue une fois le produit terminé). 
   **`player/sync` détecte maintenant explicitement ce cas** : un `401`/`403`/
   `success:false` de l'API Hypixel est loggé dans `sync_log` avec un message clair 
   ("HYPIXEL_API_KEY invalide ou expirée — à régénérer sur developer.hypixel.net") au lieu 
   de se traduire silencieusement en 404 "No matching Skyblock profile found" — c'est 
   exactement comme ça que la panne Phase 2 était passée inaperçue jusqu'à l'audit manuel. 
   Phase 0 (infra) et Phase 1 (Classes de donjon) du chantier collecte totale restent 
   terminées et validées ; Phase 2 (Boss kills) a repris et sa première zone est 
   terminée (29 juillet, voir section dédiée en haut de ce document). **Expirée une 
   deuxième fois le 29 juillet, rechargée à nouveau** — confirme le rythme périodique, 
   pas un incident isolé. Piège additionnel trouvé ce jour-là : un déploiement preview 
   déjà construit garde l'ancienne clé figée au build, un simple redéploiement de la 
   prod ne suffit pas à la propager aux previews existants — il faut un nouveau build 
   sur la branche concernée.
2. Étendre la couverture `data_available:true` de Milestones/Daily Missions au fur et à 
   mesure que le chantier collecte totale avance (essence, musée, minions, accessoires 
   précis...) — les 12 catégories `uncollected` ajoutées le 23 juillet passeront à 
   calculable une par une
3. Historique de progression par snapshots (vitesse early→mid→end→late, 
   comparaison entre joueurs) — piste pour la 4e section Evolve premium
4. Rendu visuel 3D du setup (skin + armure superposée) pour la section Skills — chantier 
   séparé, pas commencé
5. Migration vers `item_variant_hourly_buckets` (conçu, pas branché)
6. Filtrage outlier sur variantes AH à faible `data_points` (voir section infra collecte)
7. `method_feedback_summary` (vue `SECURITY DEFINER`) à corriger avant que 
   `method_feedback` ait de vraies données (voir section sécurité)
8. Câbler le frontend Free pour Flash Alerts/Patch Analysis dégradés (backend prêt : 
   vues preview + `/api/market-data` filtré, voir section gating) — pas fait
9. Skyblock Level + XP Guide comme référentiel de tiers/milestones, en remplacement ou 
   complément du découpage EARLY/MID/END/LATE actuel (basé networth + avg skill) — piste 
   notée dès le chantier NBT/networth (22 juillet), jamais reprise depuis
10. Renommage historique des lignes `price_history_ah` (`nostar_norecomb_noreforge` → 
    `__all_variants_blended__`, 28 juillet, section archivée) — SQL par lots déjà fourni à 
    l'utilisateur, cosmétique, ne bloque rien, à exécuter quand souhaité

## Ce que je ne veux PAS

- Repartir sur n8n / Google Sheets / SkyCrypt
- Reproposer une refonte Money Making sans demande explicite
- Reproposer l'ancien format Personal Money Making (table `player_money_making`, 5 
  méthodes actives + 5 futures, abandonné avant d'être codé le 22 juillet) — remplacé par 
  Evolve Skills, architecture par système de progression plutôt que par méthode globale
- Fragmenter les appels Claude par sous-catégorie
- Repartir sur "NBT enchantements différé" — c'est fait, pipeline live
- Purge SQL sans vérifier le contenu réel de la table de référence
- Reconstruire l'ancien design Evolve du 13 juillet sans vérifier d'abord le repo