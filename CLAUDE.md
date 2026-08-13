@AGENTS.md
# CLAUDE.md — Vault (contexte projet pour Claude Code)

> Basé sur la session la plus récente disponible. En cas de divergence avec une
> session antérieure sur le même sujet, cette version fait foi.

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

## Méthode de vérification standard de ce projet

Répété des dizaines de fois dans l'historique ci-dessous, noté une fois ici plutôt
que réexpliqué à chaque section : toute fonction critique (cron, agent Claude) est
extraite en fonction plain exportée (`runXxx()`), testée via une route de debug
temporaire qui l'appelle directement (contourne les chaînages coûteux type
`runEvolveSkills`), résultat vérifié en base réelle avant merge, route de debug
supprimée après validation. Quand ce pattern est mentionné ci-dessous simplement
comme "vérifié en prod", c'est cette méthode.

## ✅ Pluton — architecture 7-tiers de classification, clôturée (13 août)

Classification de toutes les sources référentielles (wiki + NEU-REPO/API) en 7 tables
`pluton_tier_1_starter` → `pluton_tier_7_master`, mêmes bornes networth que
`milestone_tier_totals` (0-5M/5M-50M/50M-150M/150M-500M/500M-1.5B/1.5B-5B/5B+).
Classification en cascade : règle rareté (gratuite) → règle prix réel AH/Bazaar
(gratuite) → jugement Haiku en dernier recours — par page pour le wiki, par table
pour les référentiels NEU-REPO/API.

**État final vérifié en base** : 174 131 lignes classées au total, 0 doublon
croisé entre tiers, 0 valeur nulle, RLS + policies publiques en lecture sur les 7
tables, 2 fonctions helper (`pluton_rarity_to_tier`, `pluton_networth_to_tier`)
avec `search_path` fixé après un avis de sécurité Supabase.

**🔴 Incident réel trouvé et corrigé pendant cette clôture, piège à ne pas
reproduire** : plusieurs routes de debug de classification Haiku par lots,
invoquées via des `curl` répétés avec un timeout client de 280s alors que
`maxDuration=300` côté Vercel, ont chevauché leurs invocations — le client
abandonnait avant que le serveur ait fini, la requête suivante était relancée
pendant que la précédente tournait encore, recalculant le même résidu et tentant
d'insérer les mêmes lignes deux fois. Deux bugs en cascade :
1. Les premiers `insert()` n'avaient pas de `ON CONFLICT` — chaque collision
   remontait comme une erreur Postgres brute (23505) au lieu d'être ignorée,
   des milliers d'erreurs sont apparues dans les logs Supabase.
2. Même après correction en `upsert(ignoreDuplicates)`, une vraie corruption de
   données existait déjà : la contrainte unique de chaque table ne protège que
   PAR TABLE — la même ligne source a pu être classée dans DEUX tiers adjacents
   différents par deux invocations concurrentes (ex : une ligne dans tier_2 ET
   tier_3). **12 319 lignes dupliquées entre tiers** (1817 + 10 502, deux vagues
   de nettoyage, touchant aussi bien le lot de référence que des lots antérieurs
   `wiki_table_extract`/`wiki_haiku_extract` déjà crus terminés proprement)
   trouvées et supprimées via une requête cross-table (`row_number() over
   (partition by source_table, source_row_id order by created_at)`, garde la
   plus ancienne classification, supprime les autres) — 0 doublon restant après.

**Règle retenue pour toute future route de debug chaînant des appels Claude par
polling HTTP répété** : soit utiliser un `curl -m` légèrement SUPÉRIEUR au
`maxDuration` de la route pour ne jamais chevaucher deux invocations, soit
vérifier un vrai statut de fin côté serveur (type `sync_log`) avant de relancer —
et toujours `upsert(ON CONFLICT DO NOTHING/ignoreDuplicates)` plutôt que
`insert()` simple sur toute écriture idempotente candidate à un retry, ET
vérifier l'unicité CROSS-TABLE quand la même donnée source peut atterrir dans
plusieurs tables de destination différentes (l'unicité par table ne suffit pas).

**Prochaine étape actée par l'utilisateur** : lancer B3 (audit de couverture +
triangulation multi-source).

## ✅ Pluton Farming — construit et validé (5 août)

Généralisation demandée après validation de Mining, même rigueur ("n'omet rien,
n'invente rien"). Mécanique différente découverte en route : Farming n'a AUCUNE
stat de vitesse (contrairement à Mining) — après 2 forks soumis à l'utilisateur,
plafond retenu = moteur Minecraft réel (20 blocs/seconde, 20 TPS, donné par
l'utilisateur), appliqué comme débit fixe universel. Plafond Fortune END/LATE
réutilise la section "Theoretical Maximum" du wiki, PUIS corrigé après audit
demandé par l'utilisateur ("as-tu vraiment tout maxé ?") qui a trouvé 1 vrai trou
(Fly Shard, attribut "Fortunate Farmer", +25 Farming Fortune absent du build de
référence) : **+2037.7 Farming Fortune** + 472/484/509 Crop Fortune selon culture.

**3e passe** : l'utilisateur a signalé une méthode manquante (pest farming) — les
Pests sont un revenu ADDITIF à n'importe quelle culture, pas une méthode
concurrente. Bug de données trouvé : `garden_pest_rare_drops` donnait 33% pour le
Slug là où les 13 pages wiki individuelles disent 0.75% — recalculé depuis les
vraies pages, Beetle (Nether Wart) gagne (~76.8K coins/kill).

**4e passe** : l'utilisateur a challengé le chiffre ("le pest farming peut
rapporter 40M+/h, pourquoi si bas ?") — a fait remonter un 2e trou, "Bonus Pest
Chance" (jusqu'à 8 Pests simultanés par spawn au lieu d'1, plafond wiki 551.5 BPC
→ 6.515 Pests/cycle), qui nécessite de swapper Blossom (Farming Fortune) vers
Pesthunter's Set (0 FF mais BPC + cooldown réduit) — arbitrage par comparaison de
totaux, pas un calcul combinatoire complet.

**Résultat final (late)** : Mushroom 21.65M/h, Pumpkin 21.50M/h, Wheat 17.94M/h —
**toujours sous le repère 40M+/h cité par l'utilisateur**, écart non résolu et
documenté (hypothèses non vérifiées : arbitrage Pesthunter plus favorable, ou
"40M+" = un pic plutôt qu'une moyenne). Dépendance cross-activité ouverte : le
Mooshroom Cow Pet peut dépasser Rose Dragon (le pet retenu) si le joueur a >6 762
Strength, mais vérifier ce seuil demande le calculateur Combat/Slayer (pas
construit). **Aucun repère en jeu pour valider les cultures seules**
(contrairement à Mining) — chiffres sourcés/vérifiés mathématiquement, gap
Pest Farming documenté honnêtement. Détail complet dans `PLUTON-ARCHITECTURE.md`
section 3. **Prochaine étape actée** : Foraging, Fishing, Slayer/Combat, Dungeons
restent à construire.

## ✅ Pluton Mining — validé de bout en bout, setup 100% maxé (5 août)

Reprise de Pluton (Bloc 8) : Mining seul d'abord. Architecture
`stat_bonus_sources`/`activity_stat_weights`/`equip_slot_capacity` construite et
validée contre un repère en jeu réel (setup Divan's maxé : Ruby 15-20M/h, Topaz
30M/h, Jasper 60M/h). Résultat final (setup 100% maxé, late/end) : **Ruby
46.2M/h, Topaz 38.6M/h, Jasper 57.2M/h** — Jasper (repère le plus fiable) à
-4.7% de la cible réelle. Détail complet (setup exact, formules sourcées, 3 bugs
de persistance corrigés, gaps restants) dans `PLUTON-ARCHITECTURE.md` section 2.
Point de méthode retenu : le Pickaxe Ability "Mining Speed Boost" doit être
modélisé en moyenne pondérée par temps d'activité réel (durée/cooldown, ×1.556
au niveau max), pas "actif en continu" — une itération précédente always-on (×4)
surestimait de 2-3x, corrigé après écart signalé par l'utilisateur contre son
repère en jeu. **Prochaine étape actée à l'époque** : généraliser aux 5 autres
activités — Farming fait depuis (voir ci-dessus).

## ✅ CLÔTURE FINALE — 2 derniers points fermés, chantier de fondation clos (4 août)

Suite de "CHANTIER FINAL clos" ci-dessous : fermeture des 2 derniers points avant
de considérer tout le chantier de cartographie (wiki + NEU-REPO + SkyHanni-REPO +
collecte totale) vraiment terminé.

1. **`skyblock/garden` — reste bloqué, raison confirmée** : `403 Invalid API key`
   (`HYPIXEL_API_KEY` à nouveau expirée, cycle périodique). `extractBloc7Zones()`
   confirme que `garden_copper`/`garden_greenhouse_crops`/`garden_chips` viennent
   déjà du PROFILE (`member.garden_player_data`), pas de cet endpoint séparé — qui
   tiendrait un état différent (niveau garden, visiteur en file, milestones crop),
   toujours non capturé.
2. **SkyHanni-REPO (Source 4) épuisée** — 52 derniers fichiers criblés, **10
   nouvelles tables** (`garden_composter_items`, `garden_pest_rare_drops`,
   `garden_visitor_requests`, `anita_upgrade_costs`, `rift_effigy_locations`,
   `diana_sphinx_answers`, `mythological_ritual_mobs`, `skyblock_island_metadata`,
   `sea_creature_fishing_xp`, `kuudra_tier_prestige_costs`, `skyblock_bingo_ranks`,
   `dungeon_dance_room_sequence` — 12 en réalité, voir WIKI-MAPPING.md Checkpoint
   29), ajoutées à `skyhanni-repo-sync`. 113 fichiers `constants/` au total, tous
   inspectés — source épuisée. Bug de dédoublonnage trouvé+corrigé en prod
   (`garden_visitor_requests` : "Pest Wrangler"/"Pest Wrangler?" fusionnés avant
   upsert).
3. **Contamination Slayer T4/T5 régénérée et confirmée propre** — lot groupé
   (`money-making-agent`+`setup-generate-agent` filtrés mid/end/late, puis
   `runEvolveSkills` pour Cucumber). **Incident opérationnel** : boucle de
   sondage HTTP (curl, timeout client 280s) a relancé la route de debug avant
   fin d'exécution serveur — 3 exécutions complètes chevauchées au lieu d'une
   (sans risque de corruption, upserts idempotents, mais surcoût API évitable —
   règle retenue : vérifier `sync_log` avant de relancer, jamais un retry sur
   timeout client). Vérifié en base : `claude_analysis.money_making_{mid,end,late}`
   propres, `player_skill_cards` de Cucumber régénérée (`generated_at`
   2026-08-04). 3 lignes `method_setups` orphelines supprimées en SQL. Masquage
   retiré : `SLAYER_BUG_CONTAMINATED_METHOD_IDS`/`SLAYER_BUG_FIX_DEPLOYED_AT`/
   `stale_slayer_data` supprimés de `lib/money-making-constants.ts` et de leurs
   4 consommateurs.

**Signal de clôture** : seuls 2 vrais restes (`npc_locations` Bucket/HTML,
`dungeon_classes` sans source) — gaps honnêtes, pas des blocages. Chantier de
fondation considéré clos.

## ✅ CHANTIER FINAL clos — audit de fermeture (4 août)

Criblage brut du wiki (`game_mechanics_misc`/`game_wiki`, ~6395 pages) terminé,
parcouru en entier une première fois. Derniers lots fermés : `cosmetic_skins`
(497 pages), `fairy_soul_locations` (+19 coordonnées, 3 zones entières),
`skyblock_guide_tasks` (179 lignes, distinct de `milestone_tasks`),
`location_details` enrichie (271→286 lignes, colonne `mobs` neuve, 15 nouveaux
lieux) — 27 checkpoints détaillés dans `WIKI-MAPPING.md`. 2 bugs trouvés+corrigés :
`cosmetic_skins` ratait 18/497 pages (filtre par nom de clé peu fiable),
`cleanLocationCell` fuitait le pipe de `{{Zone|X|Y}}` à 2 arguments.

**Audit de fermeture demandé par l'utilisateur** — chiffres vérifiés en direct :
- **Automatisations** : 18 crons actifs, tous `success` sur leur dernier run réel
  sauf `setup-generate-agent` en `partial` (23/24, échec accepté, pas une
  régression).
- **Base de données** : 189 tables. Zéro-lignes classées : légitimement vides et
  documentées (`skyblock_fire_sales`, `mayors`, `method_feedback`), stubs Phase-0
  jamais nettoyés (`items`/`minions`/`pets`/`rift_items`/`dungeon_data`/
  `fishing_data`/`kuudra_data`/`slayer_data`/`subscription` singulier), reste
  (`claude_insights`/`claude_predictions`/`market_anomalies`/`reddit_signals`/
  `craft_arbitrage`/`bazaar_5min`/`bazaar_aggregates`/`events_calendar`/
  `game_context`/`loot_tables`/`bestiary_milestones`/`player_builds`/
  `vector_indexes`) non creusé — probablement des tables préparées pour une
  feature pas encore branchée.
- **Couverture par système** : Combat/Slayer, Farming, Foraging (+ Heart of the
  Forest), Fishing, Dungeons, Crimson Isle/Kuudra, Enchanting/Alchemy,
  Mining/HOTM/HOTF, Garden, Rift (mapping mécanique complet, données joueur
  bloquées faute de profil engagé), Économie/Événements réseau, cosmétiques,
  lieux, fairy souls, essence, minions, bestiary, musée, donjons, festivals —
  tous mappés avec au moins une table réelle sourcée. Carpentry/Taming/Social
  confirmés cosmétique/faible-enjeu, exclus par décision explicite.

**Gaps honnêtes restants à cette date** (2 fermés depuis par CLÔTURE FINALE
ci-dessus) : `npc_locations` (Bucket/HTML), `dungeon_classes` (source jamais
confirmée), `method_feedback_summary` (vue `SECURITY DEFINER` toujours lisible
par `anon`/`authenticated`, bypass RLS de `method_feedback` — impact nul tant
que la table est vide, voir Prochaines étapes #7), `HYPIXEL_API_KEY` (expiration
périodique ~4-6 jours), `sack_contents`/`weight_formulas` (one-shot par décision
explicite), `location_details` (4 paires "monde miroir" du Rift avec `mobs` non
fusionné, ambiguïté volontairement non résolue — WIKI-MAPPING.md checkpoint 27).

## ✅ Extraction brute wiki — premier lot, player_stats (3 août)

Premier lot de l'extraction brute (7724 pages cachées, 6280 dans un bucket
générique "game_wiki" jamais inspecté). Trouvé : système "Stats" jamais capturé —
16 pages individuelles (Health, Strength, Speed, Defense, True Defense,
Intelligence, Crit Chance, Crit Damage, Attack Speed, Ferocity, Ability Damage,
Mining Speed, Sea Creature Chance, Magic Find, Pet Luck, Mending), chacune un
`{{Infobox/Stat}}` uniforme — fondamental pour un futur calculateur de stats.
Nouvelle table `player_stats` (16 lignes).

**2 bugs de parsing trouvés en vérifiant le résultat réel en prod, corrigés** :
1. `ways_to_increase` — regex s'arrêtait au premier `|` d'un template imbriqué
   (`{{Skill|Enchanting}}`), retournait `null` sur 7/16 pages. Corrigé (capture
   jusqu'à fin de ligne).
2. `content.indexOf('}}', start)` pour la fin de l'infobox s'arrêtait au premier
   `}}` rencontré — presque toujours un template imbriqué DANS l'infobox
   (`{{SkyBlock Level}}`, `{{Skill|Farming}}`...), tronquant l'infobox avant
   `base_value`/`max_value` sur 9/16 pages. Corrigé avec un vrai suivi de
   profondeur d'accolades (`findTemplateEnd`).
3. Attack Speed a un typo wiki réel (`atke_value` au lieu de `base_value`) — géré
   comme fallback documenté.

Vérifié : 16/16 lignes, 0 valeur nulle sur base_value/max_value. Volontairement
pas fait : les tables "Increasing Base/Bonus X" (plus riches, structure
hétérogène par stat). Candidats forts repérés, non traités : "Necromancy/List of
Souls", "Traveling Zoo/Events", "Chocolate Rabbits/List", "Museum/Milestones UI",
"David Hunterborough/UI/Attribute Milestone", "Abiphones/ContactsTable",
"SkyBlock Levels/Tasks", "Crop Fortune/Tabber", "Mutations", "Quests".

## ✅ Correction méthodologique — extraction brute NEU-REPO, 7 tables + 2 automatisées (3 août)

Correction demandée après un biais de catégorisation présupposée (audit
précédent reparti sur un cadre "15 systèmes + Économie"). Méthode reprise sans
liste de référence : 17 fichiers NEU-REPO déjà fetchés mais jamais inspectés,
lus pour leur contenu réel, classés selon ce qu'ils contiennent — jamais par
correspondance de nom. NEU-REPO épuisé : 40/40 fichiers vérifiés par contenu.

**🔴 Bug réel trouvé+corrigé** : `lib/skill-xp.ts`'s `RUNECRAFTING_XP` avait un
index faux (15200 au lieu de 15300, niveau 24) ET 15 niveaux inventés
au-delà du vrai cap (`leveling_caps.runecrafting = 25` dans NEU-REPO, le tableau
en dur allait jusqu'à 40) — violation de la règle "jamais de constante de jeu
reconstituée de mémoire". Consommé par `player/sync`/`player/skills` ; aucune
tâche `milestone_tasks` ne vérifie Runecrafting ; les 2 profils de test réels
ont un XP bien en dessous du point de divergence — bug réel mais dormant,
corrigé avant impact.

**Sources déjà existantes, provenance confirmée+automatisée** :
- `npc_locations` (84 lignes, one-shot 10 juillet) — source réelle : `abiphone.json`
  (match exact). `call_names` (21/84 NPCs) jamais capturé, ajouté.
- `glacite_tunnel_waypoints` (20 lignes, one-shot) — source confirmée
  (`glacite_tunnel_waypoints.json`). Bug trouvé : upsert (au lieu de replaceAll)
  laissait une ligne orpheline par collecteur (24 au lieu de 20) — ancien
  chargement indexait `waypoint_order` à partir de 1, nouveau parseur à partir
  de 0. Aucun code applicatif ne lit cette table (zéro impact), corrigé
  (replaceAll).

**7 nouveaux jeux de données réels, automatisés via neu-sync** : `attribute_shards`
(189)+`attribute_shard_leveling_costs` (5×10) ; `bestiary_mobs` (203)+
`bestiary_brackets` (185) ; `level_bonus_stats` (53) ; `pet_score_magic_find`
(11)+`pet_rarity_value` (6) ; `essence_upgrade_costs` (3580)+
`essence_upgrade_extra_items` (3996, ~528 items) ; `carnival_shop_items` (24) ;
`pet_level_xp_curve` (119)+`pet_rarity_level_offset` (6)+`custom_pet_leveling`
(300, 5 pets spéciaux) ; `bazaar_stock_id_map` (954, backfill
`attribute_shards.bazaar_stock_id`). Confirmé cosmétique/sans valeur mécanique,
pas construit : `dyes.json`/`animatedskulls.json`/`legacyrainbownames.json`,
`calendar.json` (périmé 2024), `resource_pack.json` (vide).

Testé via harness local rejouant le code exact contre les vrais fichiers fetchés
avant tout déploiement. `neu-sync` refactorée en `runNeuSync()` exportée.
Vérifié : run complet 40/40 fichiers, 0 échec. Des 38 tables du backlog initial,
il ne restait plus que `dungeon_classes` (aucune source) et l'enrichissement
optionnel `accessory_powers` côté NEU-REPO/wiki simple.

## ✅ 3 anomalies cron réelles corrigées — trouvées par l'audit de clôture (3 août)

3 crons en prod montraient un statut anormal (`money-making-agent` partial,
`setup-generate-agent` bloqué en `running`, `radar-agent` en erreur 3/4 runs).
Diagnostiqués via logs Vercel réels + inspection directe du schéma Supabase.

**🔴 `money-making-agent` (priorité absolue)** — 2 bugs empilés :
1. `money_making_methods` était une table Phase-0 (`category`/`min_networth`/
   `coins_per_hour_min`/`requirements`/`setup`/`verified`) qui n'a jamais
   correspondu à ce que `saveToLibrary()` écrit (`tier`/`skill`/`coins_min`/
   `calculation`/`confidence`/`status`/`price_snapshot`) — chaque upsert
   échouait silencieusement depuis le début (log Vercel confirmé : `"Could not
   find the 'calculation' column..."`). Table reconstruite (0 ligne, aucune
   perte), contrainte unique corrigée en `(method_id, tier)`, RPC
   `increment_validation_count()` manquante créée (avalée par un try/catch
   silencieux jusque-là).
2. `get_full_context()` (utilisée par money-making-agent, setup-generate-agent
   ET evolve-skills) filtrait encore sur `source='fandom_wiki'` (abandonnée le
   22 juillet) — ~320 lignes périmées lues contre 9859+ vraies pages
   `hypixelskyblock_wiki` silencieusement ignorées. Corrigé : `wiki_kuudra`
   0→33 pages, `wiki_slayers` 7→37.
3. `max_tokens` 4000→16000 : 2 tiers/4 (mid/end) tronquaient en plein JSON,
   laissant `money_making_mid` périmé 7 jours et `money_making_end` **17
   jours** dans `claude_analysis` (table lue par le frontend). Vérifié en
   prod : 4 tiers réussissent, `money_making_methods` 0→24 lignes réelles.

**🔴 `setup-generate-agent` bloqué en `running`** — vrai timeout plateforme
(`"Vercel Runtime Timeout Error: Task timed out after 120 seconds"`), pas un
blocage applicatif. Cause : 4 tiers séquentiels, ~8 batches séquentiels de 3
méthodes, aller-retours DB sériels dans `applyPreciseCost()`. Parallélisé par
tier + `maxDuration` 120→300. Vérifié : run complet ~35s, 23/24 setups générés.

**🟡 `radar-agent` en erreur JSON (3/4 derniers runs)** — `max_tokens: 2000`
insuffisant pour `positive[]`/`negative[]` (~10 entrées chacune), relevé à
8000. Vérifié : JSON valide, 6 positifs + 7 négatifs. (Noté hors scope :
`long_term_pool_size` reste à 0, préexistant, pas creusé.)

## ✅ CHANTIER FINAL — extraction complète + automatisation résiliente (2 août)

Chantier distinct de la cartographie ci-dessous : Volet 1 (compléter données
partielles) + Volet 2 (automatiser tables one-shot), Volet 2 priorisé ("on ne
construit pas plus de contenu tant que ce qu'on a déjà n'est pas sécurisé"). 6
règles strictes (zéro donnée inventée, extraction 100%, `discovery_queue`
active, zéro doublon, cron résilient + `sync_log` par table externe, zéro appel
Claude). Détail dans WIKI-MAPPING.md, section "CHANTIER FINAL — Volet 2".

**État initial** : audit vs `list_tables` a trouvé 48 tables référentielles
chargées une seule fois par migration SQL, jamais reliées à un cron — `neu-sync`
ne couvrait que 4 tables.

**✅ Volet 2 — 9 tables automatisées (2 août)** : cron hebdo **`wiki-referential-
sync`** (lundi 5h45) reparse les pages déjà cachées par `wiki-auto-sync` —
`hotm_forge_durations`, `garden_pests`/`garden_pest_fortune_penalty`,
`time_pocket_upgrades`/`time_pocket_aging_items`/`minion_upgrade_items`,
`sack_tiers`/`trapper_pelt_rarities`/`trapper_pelt_modifiers` (construit d'abord
en 4 crons séparés, fusionnés le même jour — 7 sous-fonctions isolées par
try/catch individuel sous une seule entrée `sync_log`). Plus **`discovery-scan`**
(quotidien) : nouvelle colonne `game_mechanics_misc.created_at` détecte les
pages nouvelles et les logue automatiquement dans `discovery_queue`, zéro Claude.

**Obstacle contourné** : mur SSO Vercel jamais vu (`ssoProtection.enabled:true`)
— contourné en rejouant les parseurs en local (`npx tsx`) contre le vrai contenu
déjà en base. 2 bugs de parsing trouvés+corrigés avant déploiement (fuite de
lignes entre deux wikitables adjacentes, table sautée par erreur d'ancrage).

**🔴 Correction méthodologique (3 août)** — le plan "Groupe A" (15 tables
supposées wiki par proximité de nom) s'est révélé faux : 5/17 tables vérifiées
une par une (`sblevel_tasks`, `dungeon_rng_scores`, `gemstone_slot_costs`,
`island_warps`, `game_zones`) étaient en fait NEU-REPO, contenu sans rapport
avec la page wiki devinée par nom (ex : `dungeon_rng_scores` = poids de drop RNG
par donjon/item, rien à voir avec la page wiki "Dungeon Score"). **Root cause** :
matching par proximité de nom de page, jamais vérifié le contenu réel. **Méthode
corrigée** : toujours vérifier où la donnée EN BASE a été réellement chargée
(contenu, pas nom) avant de décider quel cron doit la couvrir.

**Conséquence** : sur les 38 tables restantes, ~29 se sont avérées NEU-REPO (pas
wiki) — `neu-sync` étendu de 4 à ~29 tables, chaque mapping vérifié ligne à
ligne (détail dans WIKI-MAPPING.md). 2 tables (`george_pet_prices`,
`pet_stat_progression`) découvertes faussement marquées bloquées, corrigées.

**🔴 Bug de données corrigé** : `magical_power_by_rarity` avait Mythic à tort à
20 (vraie valeur 22) et manquait Divine/Special/Very Special/Ultimate — corrigé
par SQL directe, cron de refresh ajouté à `wiki-referential-sync`.

**3 dernières tables du backlog fermées le même jour** : `player_base_stats`
(neu-sync, `misc.json.base_stats`), `forge_recipes` (étend
`syncHotmForgeDurations`, parsing Material Cost du wiki Forge),
`magical_power_by_rarity` (voir ci-dessus).

**✅ `hotm_hotf_powders` fermé (3 août)** — table n'avait que 4 lignes stub. 4
pages sources (Mithril/Gemstone/Glacite Powder + Forest Whispers, 4 devises pas
3 comme supposé) structure hétérogène : Mithril a 2 wikitables (Blocks/Mobs) ;
Forest Whispers en a 2 imbriquées différemment ; Gemstone/Glacite Powder
n'ont AUCUNE wikitable, seulement des listes en prose — capturées telles
quelles (`obtaining_notes`/`gain_boost_notes`). Fait sans Supabase MCP
(déconnecté) : pages fetchées via API MediaWiki brute. 3 bugs de parsing
trouvés+corrigés (`parseRowspanTable` ne gérait pas les cellules jointes
`|A || B`, template `{{Slot|X}}` non nettoyé, lien `[[Cible|Alias]]` affichait
la cible au lieu de l'alias).

**🟡 `npc_locations` — complexité confirmée pire que prévu, reste en
discovery_queue** : chaque page de zone (`NPC/List/<Zone>`, 21 zones) n'a
AUCUNE wikitable dans son wikitext — contenu généré côté serveur par
`{{#invoke:NPC|npcsInLocationTable}}` (`Module:NPC`), store propriétaire
(extension "Bucket", pas Cargo — confirmé). Deux voies futures possibles :
parser le HTML rendu (~400KB/zone) ou scraper chaque page NPC individuellement
— aucune n'est un ajout rapide, diagnostic complet dans `discovery_queue` #25.

**🟡 `accessory_powers`** — pas un gap strict (23 lignes réelles déjà présentes),
enrichissement optionnel (table wiki structurée "Power Stones/List") laissé de
côté, priorité basse.

**🔴 `dungeon_classes`** — aucune source trouvée (contenu a l'air écrit à la
main), aucune correspondance NEU-REPO ni wiki malgré recherche répétée.

Sur les 38 tables initialement supposées wiki, seuls `npc_locations` et
`dungeon_classes` restent de vrais gaps.

## 🚧 Cartographie exhaustive Hypixel Skyblock (31 juillet – 2 août)

Chantier séparé du Bloc 8/Pluton, déclenché par la rigueur exigée sur les
formules HOTM ("on avance trop au coup par coup"). Méthode : cartographier le
jeu depuis ses vraies sources (wiki officiel, NEU-REPO, API Hypixel, projets
communautaires) PUIS comparer la base à cette cartographie. Après une première
passe système-par-système biaisée (vérifiait une liste présupposée plutôt que
de laisser les sources révéler leur structure), méthode corrigée en 5 étapes :
A (découverte brute) → B (regroupement par les sources) → C (comparaison
Supabase) → D (plan de tables) → E (automatisation). Détail complet (15 159
pages wiki, 112 Nav réels, 32 endpoints API, 3 projets communautaires) dans
`WIKI-MAPPING.md`.

**Tier 1 (Économie/Événements réseau, 1er août)** : 5 nouvelles tables —
`discovery_queue`, `skyblock_mayor_election`, `skyblock_news` (9 lignes),
`skyblock_fire_sales` (0 ligne, vide en vrai), `skyblock_bingo_events`+
`skyblock_bingo_goals` (25 goals). Cron `network-events-sync` (`*/15 * * * *`,
4 fonctions groupées). Table `mayors` (colonnes inventées, jamais alignées sur
la vraie API) laissée non touchée, remplacée par `skyblock_mayor_election`.
`sack_contents` (677 lignes) et `rift_guide` (73 lignes) existaient déjà
réellement, marquage 🔴 précédent corrigé en 🟡.

**Tier 2 + 3 (2 août)** : `sack_tiers` (capacités réelles), Trapper (système
neuf : NPC Trevor, monnaie Pelts, `trapper_pelt_rarities`/
`trapper_pelt_modifiers`). Power Stones déjà 100% couvert par
`accessory_powers` — corrigé. Minion Modifiers (58 items) et Time Pocket/Aging
Items restés en `discovery_queue` à ce stade (fermés depuis, voir CHANTIER
FINAL ci-dessus). 10 événements saisonniers confirmés réels (Mining Fiesta
programmée par Mayor Cole, lien avec `skyblock_mayor_election` ; Shen's Auction
= enchère à gagnants multiples, pas de table, fréquence trop faible).

**Source 3 + discovery_queue vidée (2 août)** : Garden Pests chargé (`garden_pests`
15 lignes + `garden_pest_fortune_penalty` 15 lignes, triangulé SkyHanni/
Firmament/hypixel-api-reborn puis recroisé wiki). **Bug de prod trouvé via
discovery_queue #6** : `radar-agent` interrogeait encore l'ancienne table
`mayors` (0 ligne), contexte mayor silencieusement vide injecté dans le prompt
Claude depuis le lancement de Radar — corrigé pour lire
`skyblock_mayor_election`. `discovery_queue` finale : 12 resolved / 1 pending
(`/v2/skyblock/bingo`, bloqué `HYPIXEL_API_KEY`). Point noté : le wiki officiel
`wiki.hypixel.net` a fermé le 21 juillet 2026 — sans impact, projet déjà sur
`hypixelskyblock.minecraft.wiki` depuis le 22 juillet.

**🔴 Bug corrigé — Slayer max tiers Blaze/Spider inversés** : `leveling.json`
(NEU-REPO) donnait Blaze=T4/Spider=T5, l'inverse exact de `GAME_TRUTHS`
(`lib/money-making-constants.ts`, Money Making + Evolve Skills) qui affirmait
Blaze=T5/Spider=T4. Vérifié contre le wiki (page Inferno Demonlord = "Tier IV"
max, page Tarantula Broodfather = "Tier V" avec mécanique exclusive à ce
palier) — les deux sources s'accordent, `GAME_TRUTHS` avait les deux inversés.
Corrigé (+ duplication en dur trouvée dans `setup-generate-agent/route.ts`),
mergé sur master. **Contamination trouvée avant correction, masquée en code
puis régénérée le 4 août** (voir CLÔTURE FINALE plus haut) : 3 lignes
`claude_analysis`/`method_setups` (`spider_t4_slayer` mid, `blaze_t5_slayer_
grind` end, `blaze_t5_slayer_scorched_books_arbitrage` late) + 2 générations
`player_skill_cards` de Cucumber (l'une citait littéralement "T4 Tarantula
(max)").

**✅ `weight_formulas` reconstruite — Senither weight** : `weight.json`
(NEU-REPO) a révélé 2 formules concurrentes (Lily/Senither), aucune en base.
Senither validé par recherche de popularité (consensus forums + SkyCrypt
l'utilise). Table reconstruite (20 lignes) avec la vraie formule Senither
(skills : `(niveau×10)^(0.5+exponent+niveau/100)/1250` + overflow ; slayers :
`min(XP,1M)/divider` + overflow par palier ; donjons : `niveau^4.5×percentage_
modifier` + overflow), sourcée du code Python de `timnoot/senitherweight`.
Trou réel trouvé (pas deviné) : constantes slayer disponibles seulement pour
zombie/spider/wolf/enderman — Blaze et Vampire absents de la source, documenté
comme manquant plutôt qu'inventé.

**Source 2 (wiki officiel) — résumé par système** (détail complet dans
WIKI-MAPPING.md) : taxonomie de 681 catégories wiki confirmée, ~432 gameplay
réelles après filtrage. Faits marquants par système :
- **Combat/Slayer** : fix T4/T5 reconfirmé 5x indépendamment. Mécanique jamais
  mappée : Healing au kill d'un boss Slayer (ajoutée il y a 13 jours,
  2026-07-20). Chaîne de déblocage des 6 Slayers jamais vérifiée avant
  (Zombie→Spider via T2 Revenant→Wolf via T2 Tarantula→Enderman via T4 Sven→
  Blaze via T3 Voidgloom, Vampire séparé) — signal qu'Evolve Skills pourrait ne
  vérifier que l'accès zone (pas corrigé, hors scope).
- **Farming** : formule Crop Fortune jamais sourcée (1 point = 1% chance de
  +100% drops, garanti tous les 100 points). Cap Farming peut dépasser 60 via
  médailles Gold Jacob's Contest (+1/crop doré).
- **Foraging** : Heart of the Forest cartographié en entier (8 tiers/36 perks,
  0%→couvert). **Root cause du bug de formule HOTM du Bloc 8 identifiée** : le
  perk Sweep de HotF utilise `floor((NextLevel+1)^3)`, reproduit exactement le
  même total (1 758 267) que le nœud Mining Speed de HOTM — confirme que
  Pluton utilisait la mauvaise formule/indexation à l'époque.
- **Fishing** : Sea Creature Chance jamais sourcée (base 20%, cap 100%, **÷4
  sur Private Island/Garden**). Treasure Fishing : 89%/10%/1% (good/great/
  outstanding).
- **Dungeons** : formule complète de Dungeon Score trouvée (Skill+Explore+
  Speed+Bonus, 6 rangs D→S+, seuils 0/100/160/230/269.5/300) — répond au trou
  d'origine `dungeon_rng_scores`. Dungeonizing : +485% de stats multiplicatif
  max.
- **Crimson Isle/Kuudra** : 5 tiers, seuils de réputation faction (1000/3000/
  7000/12000). Boss fight à 5 phases (Crates→Ballista→Fuel→Stomach→Lair).
- **Enchanting/Alchemy** : XP Enchanting `3.5×X^1.5`, plafond 500k/jour.
  🟡 Alchemy plafonne à 50, pas 60 (contrairement à Combat/Farming/Enchanting).
- **Rift** : mapping mécanique fait, données joueur réelles bloquées (aucun
  profil de test engagé).
- **Carpentry/Taming/Social** : Carpentry cosmétique-only, plafonne aussi à 50
  (2e skill après Alchemy). Taming a le même pattern de cap extensible que
  Farming/Jacob's (pets donnés à George).

**Couverture honnête au moment de la correction méthodologique** : localisation
des sources ~80-90%, identification des systèmes ~70-75%, contenu réellement
lu ~3-5%, validation live ~0% — 15-25% honnête au global à ce moment-là (les
chantiers suivants ont fait progresser ce chiffre, voir sections plus haut).

## Blocs 1-7 (plan d'audit 8 blocs) — archivés (voir CLAUDE-archive.md)

Pipeline prix de vente AH (Bloc 1) → observability sync_log (Bloc 2) → scoring
AH (Bloc 3) → Milestones 69 tâches (Bloc 4) → Radar multi-timeframe (Bloc 5) →
item_owned Milestones (Bloc 6) → zones joueur (Bloc 7). Bloc 8 = Pluton
(sections ci-dessus).

## ✅ computeMilestones() étendu — 15 nouveaux requirement_type, zéro coût Claude (30 juillet)

Milestones avait déjà l'architecture (7 tiers) mais `computeMilestones()` ne
savait vérifier que `skill`/`collection`/`fairy_souls`. Branché en 3 lots
(JS pur sur données déjà en base, zéro appel Claude) :
- **Lot 1** : `boss_kill`, `bank_tier`, `fast_travel_count`, `essence_amount`,
  `minion_count`, `bestiary_milestone`.
- **Lot 2** : `slayer_claimed_level`, `slayer_tier_kills`, `jacob_contest_
  participation`, `jacob_medal_count`, `festival_participation`.
- **Lot 3** : `dungeon_floor_played`, `chocolate_factory_amount`, `auction_
  activity`, `fishing_activity`.

4 tâches vault placeholder flippées de `uncollected` vers un vrai type
computable ("Unlock Fast Travel Zones" → `fast_travel_count`, "Crimson Essence
Shop" → `essence_amount`, "Participate in Spooky Festival" → `festival_
participation`, "Participate in Jacob's Farming Contest" → `jacob_contest_
participation`). Vérifié après chaque lot sur Cucumber ET Orange (profil vide
reste à 0 partout, même garde-fou early-game).

**Reste hors scope** : tâches `uncollected` sans donnée collectée (Mining
Fiesta, Fishing Festival, Mythological Ritual) ou sans seuil cible vérifié
(les 3 "Activity") — pas de seuil inventé. Tâches `mobtype` (5 lignes,
catégories Bestiary larges) non calculables — nécessiteraient une table
mob→catégorie pas encore construite.

## ✅ Unification taxonomie tiers — progression_tiers fusionnée dans milestone_tier_totals (29 juillet)

`progression_tiers` (Phase 1) et les 7 tiers de Milestones utilisaient déjà
exactement les mêmes libellés (Starter→Master, vérifié caractère pour
caractère) et `progression_tiers` n'était consommée par aucun code applicatif
(grep confirmé) — supprimée, `milestone_tier_totals` devient la table unique
des 7 tiers (+colonnes `tier_order`/`networth_min`/`networth_max`/
`purse_reference`/`money_making_tier_key`/`calibration_note`, données migrées
par jointure sur `tier=label`). Vérifié après migration : 7 lignes intactes,
`tier_order` 1→7 correct, pont `TIER_CONFIG` de Money Making toujours
fonctionnel.

## ✅ Audit hypixel-api-reborn — 6 nouvelles zones collectées (29 juillet)

Nouvelle méthode d'audit : trouver une vraie source de référence documentant la
structure exhaustive d'un profil Skyblock plutôt que d'inspecter un seul
profil de test. `hypixel-api-reborn` (lib TS, ~150 fichiers de types) comme
référence, recoupée avec le code source de SkyCrypt sur un point (minions).

**🔴 Bug confirmé et non corrigé** (documenté, à faire) : `rift_motes` lit
`currencies.motes.current`, alors que le vrai champ Hypixel est
`currencies.motes_purse` (nombre plat, pas objet imbriqué) — les deux chemins
renvoient 0 par coïncidence sur Cucumber (elle n'a ni l'un ni l'autre), jamais
détecté. Pour tout joueur ayant réellement des Motes, retournerait
silencieusement 0. Fix trivial (`member.currencies?.motes_purse ?? 0`) à faire
dès que la Phase Rift sera retouchée.

**6 zones réelles trouvées et collectées** (toutes vérifiées en direct sur
Cucumber, zéro coût Claude) :
- **Donjons — détail par étage** (`dungeon_secrets`, `dungeon_unlocked_journals`,
  `catacombs_floors`, `master_catacombs_floors`) — étage 0-7 avec `times_played`/
  `best_score`/`mobs_killed`/`watcher_kills`/`fastest_time_ms`/`fastest_time_s_ms`/
  `fastest_time_s_plus_ms`.
- **Slayer — claimed_levels + détail par tier** (`slayer_detail`, additif) —
  `boss_kills_tier_0..4`/`boss_attempts_tier_0..4` (l'ancien mapping ne stockait
  que la somme).
- **Jacob's Farming Contests** (`jacob_medals`, `jacob_perks`, `jacob_unique_
  brackets`, `jacob_personal_bests`, `jacob_contests`).
- **Chocolate Factory** (`chocolate_factory`) — repéré au Long tail mais écarté
  à tort comme hors-scope, en fait un vrai système de progression complet.
- **Auctions** (`auction_stats`) — bids/won/gold dépensé-gagné/vendu-acheté par
  rareté.
- **Fishing** (`fishing_stats`) — `sea_creature_kills` + `items_fished`.

## ✅ Chantier collecte totale — Phase 2 complète : 8 zones mergées sur master (29 juillet)

Boss kills → Banque/Fast Travel → Essence → Minions → Bestiary → Rift → Long
tail, chacune testée en direct sur Cucumber (jamais devinée), mergées via
`feat/collecte-totale-boss-kills` puis `feat/collecte-totale-bank-fasttravel`
(2 conflits texte résolus par concaténation). Zéro coût API Claude sur tout le
chantier.

**Boss kills** (`player_data.boss_kills`) — `member.nether_island_player_data.
kuudra_completed_tiers` est un objet PLAT mélangeant nom de tier (=complétions)
et `highest_wave_<tier>` (=meilleure vague), séparés en `completed_tiers`/
`highest_wave`. Arachne : `objectives.defeat_arachne_keeper.status===
'COMPLETE'`. Ender Dragon : `player_stats.end_island.dragon_fight.fastest_kill`
n'a pas de compteur réel, seulement un meilleur temps par variante — clé
`"best"` (record toutes variantes) exclue explicitement pour ne pas gonfler
`killed_types`.

**Fiable, prêt à consommer** : Boss kills, **Banque+Fast Travel** (`bank_tier`,
`fast_travel_zones` — 152 zones réelles), **Essence** (8 boutiques réelles),
**Minions** (`crafted_generators`, par-membre pas partagé coop), **Bestiary**
(`bestiary_kills`, 252 compteurs).

**Partiel/honnêtement incomplet** : **Rift** (`rift_motes` seul mappé, les 11
sous-systèmes réels tous vides sur le profil de test, forme non vérifiée) ;
**Festivals** (`festival_candy`, seul Spooky Festival a de la donnée réelle) ;
**Dojo** (seul le statut de quête d'unlock mappé) ; **"Community shop"**
(`community_upgrades` = Community Center, terme le plus proche) ; **Harp**
(`harp_songs`, structure confirmée mais vide chez Cucumber).

**Non mappé, noté pour ne pas être redécouvert** : `bestiary.deaths`,
`member.attributes.stacks.*_essence` (fusion Attribute Shards, distinct de la
monnaie Essence), `member.player_data.visited_modes`, objectifs warp
individuels.

## ✅ Phase 1 — base de connaissances jeu partagée (activity_gear_categories + progression_tiers) (29 juillet)

Deux tables : **`activity_gear_categories`** — promeut `SKILL_GEAR_CATEGORIES`
(le fix du bug Ragnarok Axe) en vraie table partagée
(`lib/activity-gear.ts`/`lib/gear-pricing.ts`), Evolve Skills ET Money Making
(`setup-generate-agent`) lisent maintenant la même table. **`progression_
tiers`** — depuis supprimée/fusionnée (voir "Unification taxonomie tiers"
ci-dessus).

**3 bugs trouvés en testant** :
1. `parseJSON` (evolve-skills) ne récupérait pas quand Claude préfixait sa
   réponse de prose — fallback ajouté (découpe premier `{` au dernier `}`).
2. `max_tokens` 16000→24000 (profil riche en gear tronquait le JSON).
3. `loadActivityGearCategories` loggait un échec de requête en carte vide
   silencieusement — `gear_name` retombait à `null` partout sans signal.

**Vérifié** : Orange (vide) 0 violation sur ses 2 items ; Cucumber (le plus
chargé) run complet réussi, 4 items `target.gear_name` vérifiés, 0 violation,
`current.armor_set_used` varie bien par carte ; 3/3 échantillon Money Making
Haiku réussi, 0 violation détectée.

## ✅ Evolve Skills — SkillBar + SkillProgressOverlay, current = setup optimal possédé (29 juillet)

Remplace les panneaux plats `SkillCard` des 8 skills non-Slayer par une barre
XP (`SkillBar.tsx`) ouvrant un overlay 2 colonnes (`SkillProgressOverlay.tsx`) —
gauche : vrai setup actuel via `SkinArmorRender`/`SetupCharacterPanel.tsx` ;
droite : gear cible de Claude. Accordéon 6 boss Slayer reste sur l'ancien
`SkillCard` (chantier séparé).

**2 bugs trouvés en testant** :
1. `current` affichait l'équipement littéralement porté (set Foraging sur la
   carte Farming) — `lib/skill-setup-adapter.ts` réécrit pour scanner tout
   l'équipement possédé (équipé + inventaire + ender chest + backpacks +
   Personal Vault + wardrobe), choisi par Claude via `armor_set_used`.
2. `target` pouvait nommer un item réel dans la mauvaise catégorie
   fonctionnelle (épée de combat recommandée en outil Foraging car nom
   contient "Axe") — catalogue filtré par catégorie (`SKILL_GEAR_CATEGORIES`)
   + vérification serveur `verifyGearName`.

Bug latent trouvé au passage : ancien code lisait `stars` (n'existe pas,
vrai champ `total_stars`) mettant `armor_stars` à 0 silencieusement ; glyphe
Unicode Private Use Area dans les noms d'items cassait les lookups par nom
exact. Validé sur Cucumber/Orange : `current` varie correctement par skill,
`target.gear_name` ne contamine jamais une autre activité.

## 🔴 Régression prod critique + résilience skin — corrigées (28 juillet)

**Signalé par l'utilisateur** : cliquer sur un setup Money Making plantait
toute la page en prod. **Root cause** : `useLoader(THREE.TextureLoader,
skinUrl)` lève une exception non capturée par `Suspense` — ce projet n'avait
zéro Error Boundary React, une erreur non capturée démonte tout l'arbre React.
**Déclencheur confirmé** : `crafatar.com` retournait un vrai `521` au moment
du test — l'ancienne version CSS (`background-image`) dégradait silencieusement,
la migration WebGL a supprimé cette dégradation gracieuse.

**Fix** : `SceneErrorBoundary` (classe React) enveloppe le `Canvas` — panne 3D
dégrade vers un placeholder texte. **Résilience complète** : `/api/player/status`
résout aussi `mojang_skin_url` via `sessionserver.mojang.com` (2e source live,
CORS permissif confirmé) — `SkinArmorRender` essaie `[crafatar, mojang-direct]`
en séquence via `useResilientTexture()` (remplace `useLoader()`). Dernier
recours : `public/images/skin-placeholder.svg` (asset statique généré, pas une
copie Mojang). Vérifié avant merge : résolution Mojang testée en direct
(~2.1s), build Vercel `READY`.

## ✅ SkinArmorRender migré de CSS 3D vers three.js/@react-three/fiber (28 juillet)

**Pourquoi** : `filter:drop-shadow`/`backdrop-filter` sur les calques
ancêtres et `ArmorLayer` sans `preserve-3d` aplatissaient silencieusement la
scène CSS 3D — 3 symptômes du même problème de fond (piège documenté dans la
spec CSS elle-même). Migration vers three.js pour éliminer cette classe de bug
structurellement. Toute la donnée métier déjà validée reste inchangée
(`BODY_PARTS`, `inflate`, couleurs réelles, contenu tooltips) — seule la
couche de rendu change, transform CSS→three.js vérifié deux fois
indépendamment (même négation, normales sortantes correctes pour les 6 faces).

**Éclairage** : `DirectionalLight`+`MeshStandardMaterial` calcule l'ombrage
depuis la géométrie réelle (remplace 6 `brightness()` réglés à la main),
appliqué skin+armure de façon cohérente. **Interaction** : événements pointeur
natifs R3F (raycasting) remplacent `mouseenter`/`mouseleave` DOM.

**Nouvelles dépendances** : `three`, `@react-three/fiber`, `@types/three`
(pas de `drei`). Vérifié avant merge : build Vercel `READY`, Artifact de
preuve autonome (bug trouvé et corrigé dans l'Artifact lui-même : import
relatif `three.core.min.js` ne résolvait pas contre une URL `blob:`, sans
rapport avec le composant livré), confirmé visuellement par l'utilisateur.
Point de repère vérifié comme comportement attendu (pas un bug) : un set
d'armure complet enveloppe géométriquement 100% du skin — pas de concept de
couverture partielle côté données (Money Making génère toujours un
`armor_set` atomique 4 pièces).

## ✅ Money Making — SetupOverlay en prod : 3 colonnes, couleurs d'armure réelles, tooltips riches (28 juillet)

**Couleur cuir réelle par pièce** — NEU-REPO `items/` (jamais fetché par
neu-sync) contient la vraie couleur de teinture Hypixel (`nbttag.display:
{color:NNNNN}`) par `LEATHER_*`, confirmée contre une valeur déjà documentée
(Necron's Chestplate : `15155516` = `#E7413C`, match exact). Échantillonnage
des 649 fichiers d'armure : 62% leather avec couleur, 19% tête de joueur
reskinnée, 17% autre matériau (zéro donnée couleur). Cron hebdo `armor-color-
sync` (lundi 5h30), nouvelle colonne `item_stats.default_color`, retombe sur
placeholder vanilla (`#A06540`) si `null`.

**Layout loadout 3 colonnes** (LEFT stats/CENTER personnage 3D/reste en bas),
nouveau `GearSlot` (tooltip riche coloré par vraie rareté). **Bug de rendu
plat trouvé en 3 couches empilées** (chaque fix nécessaire mais pas
suffisant) : `filter:drop-shadow` sur le panneau modal (corrigé en
`box-shadow`) → `backdrop-filter` sur le calque de flou extérieur (sorti sur
un `<div>` frère) → `ArmorLayer` sans `preserve-3d` sur lui-même (vrai
dernier bug, invisible tant que le personnage est en armure complète).
**Leçon retenue** : un artifact de preuve isolé ne valide qu'UNE hypothèse à
la fois — seule la vérification contre le composant réel intégré a fini par
attraper les 3 bugs.

**Tooltips riches par pièce au survol** (casque/plastron/bras/jambes/bottes),
état du skin distingué (`'loading'|'linked'|'unlinked'|'error'`).
Explicitement pas inclus : vraie texture Minecraft cuir/armure (question
légale sur l'asset externe non tranchée) — les couleurs mergées ici sont des
valeurs RGB Hypixel elles-mêmes, dissociées de cette question.

## ✅ Audit complet architecture cible + 4 correctifs mergés (28 juillet)

**🔴 `ah_live` vide à chaque run** (urgence, corrigée avant l'audit lui-même) —
2 bugs empilés : (1) requête ciblait encore `price_history_ah` filtré
`granularity='DAILY_EXACT'`, alors que `ah-aggregate` avait migré le
per-variante exact vers `price_history_ah_variants` — un consommateur oublié
lors du renommage. (2) `.in('base_item_id', ...)` avec 2300+ valeurs
dépassait silencieusement la limite d'URL PostgREST, erreur jamais vérifiée.
Batché par 200 + logging réel. Vérifié : `ah_live` 0→300 lignes cohérentes.

**🔴 Même famille de bug dans Radar** — `RadarSection.tsx` interrogeait aussi
`price_history_ah.variant_key`, qui ne contient plus que le placeholder
blended. Corrigé vers `price_history_ah_variants`. Vérifié sur HYPERION : 108
vraies variantes distinctes (contre 1 placeholder avant).

**🟡 `evolve-skills`** — audité comme "cron manquant", en fait retrait
volontaire (23 juillet) pour respecter l'interdiction Hypixel de polling
continu — appel synchrone par-profil depuis `player/sync` après un sync
réellement demandé. Pas rajouté au cron.

**✅ Free — tier réel, 5 tabs verrouillés ajoutés** : `TABS` n'avait aucune
entrée `free` alors que l'infra dégradée existait déjà
(`ah_live_free_preview`/`bazaar_1h_free_preview`, filtres de contenu du 23
juillet). Patch Analysis : juste ajouté `'free'` à `TABS` (composant déjà
défensif). Flash Alerts : nouveau composant `FreeFlashPreview.tsx` (les vues
preview sont trop pauvres pour réutiliser les cartes payantes existantes).
Vérifié : RLS intacte (`ah_live`/`bazaar_1h` toujours bloquées pour anon).

**✅ Radar — count réel** : libellés codés en dur (`"4781 ITEMS"` etc.)
remplacés par des comptes réels dérivés du catalogue déjà chargé +
`count:'exact', head:true` sur `price_history_ah_variants`. Piège trouvé :
cette table est gated par `has_plan()` — un client anon SANS session y voit
toujours 0, corrigé en testant avec un vrai compte connecté. Revalidé :
`"65.2K variant price points tracked"`, `"1475 Bazaar · 3738 AH"`, `"5213
ITEMS"`.

**✅ Patch Analysis — dimension mécanique/gameplay ajoutée** : prompt
100% économique élargi à `mechanics_impact`/`gameplay_changes` (2 nouvelles
colonnes `insight_patch`), instruit de ne jamais forcer un angle gameplay non
pertinent. Validé sur 2 runs réels (Berserk revert, Lotus Atoll gating) +
garde-fou "ne pas forcer" confirmé (2 patches économiques ont bien
`mechanics_impact: null`). Gating revérifié (Free exclu, Alert+ inclus).

**Trouvé, non lié, pas touché** : `insight_patch.gameplay_impact` (colonne
orpheline, `null` partout, zéro référence) — dans la liste de nettoyage,
pas fusionnée pour éviter une migration supplémentaire à un chantier déjà
validé. **Reste à faire** : `debug-boss-kills` mal placé dans
`app/api/cron/`, `refresh-variant-stats`/`backfill-variant-stats` à évaluer
(probables reliquats legacy).

## ✅ Gear précis+justifié, pricing par variante exacte, rareté réelle (28 juillet)

Au lieu d'un nom de set générique, Vault définit une spec PRÉCISE
(étoiles/reforge/hot potato/ultimate enchant) recréable, coût calculé sur
cette spec exacte. `armor_reforge`/`weapon_reforge` copiés verbatim depuis la
vraie liste REFORGES ; `ultimate_enchant` doit être un vrai ID ou `null` ;
nouveau champ `gear_justification`.

**Coût par variante réelle — cascade à 3 paliers** (via `buildVariantKeys`,
jamais réimplémentée en parallèle) : (1) `price_history_ah_variants` match
exact spec complète ; (2) `price_history_ah_variant_base` match exact sans
reforge ; (3) **palier "broad"** nouveau — LIKE sur préfixe étoiles+recomb
seul, moyenne pondérée par `data_points`. Nécessaire car les vrais
exemplaires AH portent quasi toujours un ultimate enchant signature même
quand la spec l'omet — validé sur `INFERNAL_CRIMSON_HELMET` : palier 3 trouve
894 313 653 (`precision:"broad"`), pas un fallback blended déguisé.

**Bug réel trouvé+corrigé** : le matcher `armor_set` (règle "≥2 mots
restants" ajoutée pour éviter les faux positifs type "Crimson Helmet")
rejetait aussi les vrais sets à un seul mot distinctif ("Sorrow Armor" → 0
pièce matchée). Remplacé par un concours de spécificité par catégorie de
pièce (`bestArmorPiecesForSet`) — corrige les deux problèmes avec le même
mécanisme.

**Rareté réelle** — `item.tier` déjà dans `/v2/resources/skyblock/items`
mais jamais mappé, nouvelle colonne `item_stats.rarity`. **`GearSlot`** —
arme/outil/canne en case cliquable avec tooltip NBT (rareté/étoiles/stats/
enchants/reforge). **Apparence** : toute armure Skyblock est soit cuir teinté
soit tête reskinnée (aucune texture de base unique côté serveur, vérifié) —
couleur cuir vanilla par défaut en attendant un vrai pack de texture Vault
(chantier futur, pas commencé). Testé end-to-end sur preview, plusieurs
passes de correction guidées par de vrais bugs (0 exact variants → fallback
"broad" ajouté → revalidé).

## ✅ Skin + armure réels dans SetupOverlay — première version CSS 3D (28 juillet)

Remplace la grille d'inventaire emoji par le vrai skin Minecraft rendu en
cuboïdes CSS 3D (`components/SkinArmorRender.tsx`, `lib/skin-uv-map.ts`,
format UV public non-Mojang). Proportions vérifiées contre le vrai modèle
Mojang après plusieurs passes : `perspective` CSS (vrai point de fuite)
retiré (une vue isométrique n'a pas de point de fuite) ; géométrie d'armure
corrigée (casque+plastron+bottes = couche "outer" inflate 1.0, legging =
"inner" inflate 0.5, toujours invisible sous plastron+bottes — vrai en jeu
aussi). Item tenu en main abandonné après 2 passes ratées (pas d'outil pour
vérifier visuellement) — stats affichées en texte à la place. Migré vers
three.js le même jour (voir section dédiée plus haut) suite aux bugs
d'aplatissement CSS découverts juste après.

## ✅ setup-generate-agent — grounding sur données réelles (28 juillet)

Bug concret signalé : suggérait du Mithril Armor pour du gemstone mining
late-game au lieu de Divan's. **Catalogue de gear réel, prix réel**
(`loadPricedItems`/`gearCatalogForBudget`) — jointure `item_stats`+dernier
prix `price_history_ah`, filtrée par bande de budget réelle du tier — corrige
le bug structurellement (le prix réel du Mithril tombe sous le plancher
LATE, il n'apparaît plus dans le catalogue).

**Bug trouvé en testant** : `item_stats.health/defense/...` est réellement à
0 en base pour la plupart des items endgame (stats venant des étoiles/reforge/
génération, pas de colonnes plates) — catalogue simplifié à
item_id/nom/catégorie/prix uniquement, trié par prix.

**Coût calculé en code, jamais par Claude** — testé 2 fois : même avec une
règle de prompt explicite, Haiku sort un chiffre habituel proche de
`coins_display` au lieu de sommer le catalogue réel (ex: "95-110M" au lieu de
1,86Md pour Divan's Drill seul). `computeRealCost`/`applyRealCost`
post-traite : matche `armor_set`/`weapon_name`/`tool`/`rod` contre le
catalogue, écrase `cost_budget`/`cost_optimal`/`cost_endgame`.

**Bug réel dans le matcher lui-même** : la 1ère version matchait par
sous-chaîne après avoir retiré "le dernier mot" — un mot générique partagé
("Crimson", "Magma") suffisait à matcher un item complètement différent
("Infernal Crimson Armor" matchait à tort "Crimson Helmet" T1 Kuudra en plus
du bon T5 Infernal Crimson Helmet). Corrigé avec `matchesArmorSet` (vraie
`category` de l'item, ≥2 mots restants) et `matchesExact` (mots entiers,
jamais une sous-chaîne). Revalidé : faux positifs 14-19→exactement 6 items
matchés, ~4,8B cohérent avec le catalogue.

**Preuve concrète (LATE, Gemstone Mining)** : `armor_set:"Infernal Crimson
Armor"`, `weapon_name:"Hyperion"`, `tool:"Divan's Drill + ..."`,
`cost_optimal:"~4.8B"` (6 items matchés, somme exacte). `pet_name`/
`gemstones` restent ancrés wiki-only (pas de table de prix dédiée à joindre).

## ✅ Sécurité compte/facturation — audit complet + failles corrigées (22 juillet)

Audit de sécurité exhaustif avant tests utilisateurs. **🔴 Chaîne d'attaque
complète trouvée+corrigée** :
- `subscriptions` avait une policy RLS `USING (true)` — lecture publique
  totale (`email`/`stripe_customer_id`/`plan`/`status`...) via clé anon.
  Corrigé : scopée `email = auth.email()`, `TO authenticated`.
- `/api/get-email-by-username` (zéro auth, zéro rate-limit) — oracle
  d'énumération complet. Supprimée entièrement, login refait côté serveur.
- `/api/update-username`, `/api/cancel-subscription`, `/api/subscription`
  prenaient un `email` en paramètre client sans vérifier la session —
  n'importe qui pouvait renommer/résilier le compte de quelqu'un d'autre.
  Corrigé : les 3 routes utilisent `auth.getUser()` via un client Supabase
  serveur lié aux cookies (nouveau `lib/supabase-server.ts`), ignorent tout
  email client.

`/api/login` (nouvelle route) résout le username en interne, ne renvoie
jamais l'email au client, pose la session via cookies. Erreur générique
"Invalid credentials" (corrige un 2e oracle qui distinguait username inconnu
vs mot de passe faux).

**Suite corrigée le même jour** : `player_missions`/`player_progress`
verrouillées (RLS service-role uniquement, mêmes policies publiques que
`subscriptions` trouvées). 4 routes `player/*` exigent une vraie session
Vault. **Flux de liaison Vault↔Hypixel construit** : `hypixel_account_links`
(1er arrivant 1er servi — assumé, le vrai risque était le spam d'écriture,
pas la fuite de données déjà publiques via l'API Hypixel), route
`POST /api/link-hypixel-account`. Testé end-to-end sur comptes jetables
(créés/supprimés) : login email+username, 3 routes corrigées (session réelle
OK, sans session 401, email injecté ignoré), liaison Hypixel + rejets 400/409.

**🟡 Toujours pas corrigé** : `method_feedback_summary` (vue `SECURITY
DEFINER`) bypasse le RLS de `method_feedback`, impact nul tant que la table
est vide (voir Prochaines étapes #7).

## price_history_ah_variant_base + Landing page + Gating par tier — archivées (voir CLAUDE-archive.md)

Landing page : hero verrouillé (composition visuelle seulement, contenu
textuel doit rester vivant), refonte `/features`/`/about`/légal. Gating :
faille `/api/market-data` sans auth corrigée, architecture plan/RLS à 2
couches.

## Money Making — non retouché depuis le 13 juillet, toujours la référence

- 4 appels Claude parallèles (early/mid/end/late), jamais par sous-catégorie
- Cibles : Early 10M+/h, Mid 25M+/h, End 50M+/h, Late 70-100M+/h
- Budgets capital par tier, Bazaar/AH Flip personnalisés par tier
- Farming Methods et Vault Exclusive avec vrai setup (accessories, powers,
  reforges, gemstones)
- Frontend générique (`parseTable` + modale `setupItem`), pas de modif nécessaire
- Statut : terminé et validé — ne pas reproposer de refonte sans demande

## Sessions du 21-23 juillet — archivées (voir CLAUDE-archive.md)

NBT pipeline live, infra collecte (3 bugs), narratif complet "collecte totale"
Phase 0-8, Evolve (première version backend + sécurité), Evolve Milestones/
Daily Missions refontes complètes.

## Philosophie de développement

1. Pragmatisme > perfection théorique
2. Séparation stricte collecte (JS/SQL pur) vs analyse (Claude ciblé)
3. 1 appel Claude par catégorie logique, jamais par sous-catégorie
4. Toujours privilégier une source de données déjà collectée en interne
5. Clés React stables (`item_id`), jamais d'UUID éphémères
6. Toujours proposer `git add/commit/push`, jamais de push sans confirmation
7. **Jamais de constantes de jeu reconstituées de mémoire.** Tout seuil, tier,
   XP requis, ou palier lié aux mécaniques Hypixel doit être vérifié contre le
   wiki Hypixel officiel et/ou une table Supabase déjà collectée avant d'être
   codé en dur. Si aucune source fiable n'existe en interne, aller la chercher
   via l'API Hypixel plutôt que d'inventer une valeur plausible.
8. **La landing page (hero + `/features` + `/about`) doit refléter fidèlement
   ce qui existe réellement dans le dashboard** — jamais une fonctionnalité
   aspirationnelle, renommée ou obsolète. Vérifier contre le vrai code des
   composants avant d'écrire une description marketing. Trouvé en pratique
   (27 juillet) : la copie annonçait un "#ah-sniper" jamais existant comme
   onglet, et décrivait Money Making comme des "flips Bazaar/AH" alors que le
   composant réel n'a que Active Grind/Vault Exclusive. **Corollaire
   permanent** : à chaque modification majeure du dashboard, hero et pages de
   features doivent être mis à jour dans la même session.

## Philosophie d'évolution continue

Rien dans Vault n'est "définitivement terminé". "✅ Terminé" signifie
"fonctionnel et validé à ce stade", PAS "ne plus jamais y toucher". Ne jamais
refuser une évolution en argumentant qu'une section a déjà été validée —
vérifier plutôt si le changement est cohérent avec la direction du projet.

## Prochaines étapes

1. **`HYPIXEL_API_KEY`** — clé de dev à expiration périodique (~4-6 jours
   observés), rechargement manuel à refaire à chaque expiration tant que le
   produit n'est pas passé en clé de production. `player/sync` détecte
   explicitement ce cas (401/403/success:false loggé clairement dans
   `sync_log`). Piège : un déploiement preview déjà construit garde l'ancienne
   clé figée au build, un redéploiement prod ne suffit pas à la propager.
2. Étendre la couverture `data_available:true` de Milestones/Daily Missions
   au fur et à mesure que la collecte avance
3. Historique de progression par snapshots (vitesse early→mid→end→late,
   comparaison entre joueurs) — piste pour la 4e section Evolve premium
4. Rendu visuel 3D du setup pour la section Skills — fait depuis (voir
   Evolve Skills SkillBar + SkinArmorRender three.js ci-dessus)
5. Migration vers `item_variant_hourly_buckets` (conçu, pas branché)
6. Filtrage outlier sur variantes AH à faible `data_points` (seuil fiabilité
   min = 3, pas bloquant aujourd'hui)
7. `method_feedback_summary` (vue `SECURITY DEFINER`) à corriger avant que
   `method_feedback` ait de vraies données
8. Câbler le frontend Free pour Flash Alerts/Patch Analysis dégradés — fait
   depuis (voir Audit complet architecture cible ci-dessus)
9. Skyblock Level + XP Guide comme référentiel de tiers/milestones, en
   remplacement/complément du découpage EARLY/MID/END/LATE actuel (basé
   networth + avg skill) — piste notée depuis le 22 juillet, jamais reprise
10. Renommage historique des lignes `price_history_ah`
    (`nostar_norecomb_noreforge` → `__all_variants_blended__`) — SQL par
    lots déjà fourni à l'utilisateur, cosmétique, à exécuter quand souhaité
11. Nettoyage reliquats : `debug-boss-kills` mal placé dans `app/api/cron/`,
    `refresh-variant-stats`/`backfill-variant-stats` à évaluer,
    `insight_patch.gameplay_impact` (colonne orpheline, à supprimer/fusionner
    avec `mechanics_impact`)
12. Pluton — généraliser l'architecture 7-tiers/stat_bonus_sources aux 4
    activités restantes (Combat/Slayer, Foraging, Fishing, Dungeons) ; lancer
    B3 (audit de couverture + triangulation multi-source) sur la
    classification 7-tiers venant d'être clôturée

## Ce que je ne veux PAS

- Repartir sur n8n / Google Sheets / SkyCrypt
- Reproposer une refonte Money Making sans demande explicite
- Reproposer l'ancien format Personal Money Making (table `player_money_making`,
  abandonné avant d'être codé le 22 juillet) — remplacé par Evolve Skills
- Fragmenter les appels Claude par sous-catégorie
- Repartir sur "NBT enchantements différé" — c'est fait, pipeline live
- Purge SQL sans vérifier le contenu réel de la table de référence
- Reconstruire l'ancien design Evolve du 13 juillet sans vérifier d'abord le repo
