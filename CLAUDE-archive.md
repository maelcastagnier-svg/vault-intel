# CLAUDE-archive.md — Vault (historique archivé)

> Sessions du 21-23 juillet, sorties de CLAUDE.md le 1er août pour repasser sous la limite
> de 150k caractères de contexte auto-chargé. Contenu narratif/diagnostic de chantiers
> **déjà clos et supersédés** par des sections plus récentes restées dans CLAUDE.md — en
> cas de divergence, CLAUDE.md fait toujours foi, jamais ce fichier. Conservé pour
> traçabilité (comment un bug a été trouvé, quelles routes de debug ont servi à valider),
> pas comme référence vivante. Tout TODO encore ouvert trouvé dans cette plage a été migré
> vers "Prochaines étapes"/"Ce que je ne veux PAS" dans CLAUDE.md avant l'archivage — ne
> pas s'attendre à trouver un travail en attente ici qui ne soit pas déjà tracké là-bas.

Sections couvertes, dans l'ordre où elles apparaissaient dans CLAUDE.md :
- NBT — pipeline live (rappel technique court)
- Session du 21 juillet — dernier état technique connu
- Infra collecte — 3 bugs corrigés (22 juillet) + audit complémentaire
- Chantier collecte totale — narratif complet Phase 0 à Phase 8 (23-29 juillet) — le
  récapitulatif final "8 zones mergées sur master" reste dans CLAUDE.md, seule cette
  version narrative détaillée phase par phase est ici
- Evolve — état réel (22 juillet, première version du backend)
- Sécurité Evolve — TODO résolu
- Evolve — nouvelle architecture à 3 sections + Section Skills (22 juillet)
- Chantier NBT joueur + networth réel (22 juillet)
- Evolve — Milestones REFONTE COMPLÈTE (23 juillet)
- Evolve — Daily Missions RECONSTRUITE (23 juillet)

---

## NBT — pipeline live (confirmé, pas différé)

`ah-collect` décode le NBT binaire base64-gzip de chaque enchère BIN en concurrence 
sur toutes les pages AH : étoiles, master stars, recomb, reforge, enchantements, 
gemmes, attributs Kuudra. Deux clés : `variant_key_full` (exacte) et 
`variant_key_base` (agrégation quotidienne).
- Recomb : `✦` (pas `✿`, dye) — Étoiles : `✪` + master stars `➊`-`➓` — 132 reforges triés par longueur

## Session du 21 juillet — dernier état technique connu

**Qualité des données :** 289 inversions buy/sell corrigées, 2217 lignes prix zéro 
laissées (inactivité réelle du marché).

**Refonte collecte AH :**
- `ah_scan_buffer` — table tampon à moyenne glissante, remplace les inserts 
  minute par minute. Fonction : `upsert_scan_buffer_batch(p_rows JSONB)`. 
  Volume réduit de ~3,4M lignes/jour à ~2212 lignes/jour.
- Cron `ah-aggregate` (23h59) : consolide le buffer en bucket DAILY/DAILY_EXACT 
  dans `price_history_ah`, puis vide le buffer.
- `price_history_ah_variants` — table séparée pour les données NBT de variantes, 
  c'est la source fiable pour pricer une variante précise (voir bug networth ci-dessous).
- **Bug scan_count → confirmé résolu (22 juillet)** : vérifié en base, `scan_count` monte 
  correctement au-delà de 1000 sur les variantes liquides. La fonction était déjà correcte, 
  ce n'était pas un bug de code — juste jamais reconfirmé en prod avant cette session.

**Historic import restructuré :** boucle directe sur la liste SkyCofl (plus sur 
IDs internes Hypixel). SkyCofl utilise des flags numériques bitmask (pas 
seulement string "AUCTION") → items trackés passés de 2926 à 3798.

**Incident :** purge SQL basée sur `bazaar_1h` (25 items au moment T) a supprimé 
1,6M lignes Bazaar par erreur, réimport complet fait. **Ne jamais purger un 
historique en filtrant sur une table snapshot volatile.**

**Radar construit :** recherche instantanée client-side sur `items_catalog` 
(chargée une fois au montage, filtrée en JS, priorité starts-with), charts 
Recharts, liste de variantes NBT par item. `items_catalog` harmonisée avec les 
noms officiels via `/v2/resources/skyblock/items` (Hypixel).

**Points techniques notés :** l'index `uq_price_history_ah_daily` ne doit pas 
avoir de clause WHERE pour que les upserts Supabase JS fonctionnent ; colonne 
`granularity` étendue de VARCHAR(10) à VARCHAR(20) pour accueillir "DAILY_EXACT" ; 
`POWER_WITHER_BOOTS` est le vrai ID Hypixel des Necron's Boots ; SkyCofl et 
Hypixel partagent les mêmes IDs d'items.

## ✅ Infra collecte — 3 bugs corrigés (22 juillet, audit complet du pipeline)

Audit demandé suite à un soupçon (infondé) d'absence de données AH 5★ sur Necron's Armor 
— les données existaient déjà, c'était le bug networth documenté plus haut. L'audit a 
en revanche fait remonter 3 vrais bugs actifs, tous corrigés et déployés le jour même :

1. **`historic-import` — crash loop de 10+ jours, supprimé de `vercel.json`.** Planifié 
   `*/2 * * * *` en continu alors que c'est un job de rattrapage ponctuel (SkyCofl → 
   `price_history`/`price_history_ah`). Chaque invocation timeout à 60s depuis au moins 
   le 11 juillet (308 timeouts sur 7 jours, confirmé via `mcp__vercel__get_runtime_errors`) 
   — ne terminait jamais un batch, pur gaspillage d'invocations Vercel + quota SkyCofl/
   Hypixel. Route laissée intacte (`app/api/cron/historic-import/route.ts`) pour une 
   refonte future (déclenchement manuel ou pagination avec état persisté), juste retirée 
   du cron.
2. **`ah-collect` — `TODAY` figé au cold start, corrigé.** `const TODAY = new Date()...` 
   était calculé au niveau module, pas dans le handler. Sur une instance serverless qui 
   reste chaude (cron chaque minute), cette date ne se recalculait jamais tant que 
   l'instance ne redémarrait pas → `scan_date` dérivait silencieusement vers la veille 
   après minuit UTC. Confirmé en base : des lignes `scan_date` d'hier absorbaient encore 
   des scans d'aujourd'hui (`scan_count` > 1000). Fix : `TODAY` recalculé à chaque requête, 
   à l'intérieur du handler `GET`.
3. **`bazaar-collect` — ne scannait que le top 25 par spread%, corrigé.** Hypixel renvoie 
   déjà tout le catalogue Bazaar en un seul fetch (pas de pagination comme l'AH), mais le 
   code ne gardait que le top 25 (`spread_pct` 10-80%) avant d'écrire dans `price_history` 
   — tout item avec un spread durablement hors de cette bande n'avait jamais aucun point 
   quotidien. Découplé en deux usages de la même donnée déjà en mémoire : `bazaar_1h` 
   (feature Bazaar Flip) garde le filtre top 25/spread inchangé ; `price_history` reçoit 
   maintenant tout le catalogue (`buy > 0 && sell > 0` uniquement, aucun plancher de 
   volume/prix — un item peu liquide doit quand même avoir son point du jour) via une 
   nouvelle fonction batchée `upsert_bazaar_price_bucket_batch`. Testé sur un run réel en 
   prod : items couverts passés de 46 à 1544 en un seul cycle de cron.

**⚠️ Point en attente, pas urgent** : pas de filtrage d'outlier sur les variantes AH à 
faible `data_points` (seuil de fiabilité minimum = 3). Trouvé en passant : une variante 
avec seulement 3 data_points à un prix ~40x supérieur aux variantes voisines équivalentes 
— 2-3 enchères aberrantes suffisent à polluer durablement le prix d'une variante rare. 
À traiter si ça devient un problème visible, pas bloquant aujourd'hui.

### Audit complémentaire (22 juillet, suite) — vérification post-fix

- **`game_mechanics_misc` — RLS était désactivé, corrigé immédiatement** (trouvé par 
  l'advisory Supabase automatique lors de l'audit) : table de 8615 lignes lisible ET 
  **écrivable** par n'importe qui via la clé anon publique, contrairement au trou d'auth 
  Evolve documenté plus haut qui était sans conséquence (rien ne l'appelait). RLS activé + 
  policy SELECT publique (contenu de jeu, lecture publique voulue), aucune policy 
  d'écriture (INSERT/UPDATE/DELETE bloqués pour anon/authenticated ; le service role des 
  crons bypass RLS de toute façon, donc `wiki-auto-sync` continue de fonctionner). Audit 
  élargi à toutes les tables publiques : c'était la seule avec RLS désactivé.
  - Trouvé au passage (pas corrigé, hors scope de cette session) : 2 vues `SECURITY 
    DEFINER` (`distinct_items`, `method_feedback_summary`) remontées en ERROR par le 
    linter Supabase — s'exécutent avec les droits du créateur plutôt que de l'appelant, 
    contournant potentiellement RLS. À investiguer avant de toucher au RLS d'autres tables.
- **`price_history_ah` — résidus `historic-import` du 21 juillet (59 lignes/53 items 
  mélangeant reforges réelles et placeholder)** : historique figé, sans risque, ne se 
  reproduira plus maintenant que le cron est coupé. Pas d'action nécessaire.
- **`variant_key_base` sur `price_history_ah_variants` — pas de vraie moyenne agrégée** : 
  confirmé que c'est une fonctionnalité jamais construite (le fallback JS prend le prix 
  de la ligne exacte la plus récente partageant la même base, pas une moyenne pondérée du 
  groupe), pas un bug. À revisiter seulement si le pricing par variante exacte manque 
  trop souvent de données en pratique.

## 🚧 Chantier en cours — Collecte totale (données de référence + progression joueur)

Démarré le 23 juillet, suite logique du "pipeline données mécaniques à reconstruire" 
identifié le 22 (voir historique ci-dessous) mais élargi : reconstruire aussi bien le 
référentiel de jeu (Volet 1) que la progression joueur (Volet 2, `player/sync`) qui 
manque encore pour que Milestones/Money Making personnalisé calculent sur du réel. 
Ordre validé : organisation **par zone verticale** (référence + progression du même 
système ensemble), pas par volet séquentiel — un mob_wiki sans compteur joueur ou 
l'inverse ne sert à rien seul. Zones dans l'ordre d'impact : Phase 0 (infra) → 
Classes de donjon → Boss kills → Banque/Fast travel → Essence → Minions → Bestiary → 
Rift → Long tail misc (dojo/harp/abiphone/community shop/festivals).

**✅ Phase 0 — infra commune — TERMINÉ et validé en prod (23 juillet) :**
- **`sync_log`** (nouvelle table, service-role only) — chaque cron y log 
  `started_at/finished_at/status/rows_written/details/error`. Objectif direct : un job 
  cassé ou muet doit être visible en une requête, plus le pattern `historic-import`/
  `ah-collect TODAY` (bug silencieux des jours durant, trouvé seulement par audit manuel).
- **`neu-sync`** reconstruit (`app/api/cron/neu-sync/route.ts`, hebdo lundi 5h) — liste 
  des 40 fichiers confirmée par appel réel à l'API GitHub (pas supposée). Cache brut 
  systématique dans `neu_constants_raw` pour les 40 fichiers. 3 mappings dérivés vérifiés 
  champ par champ contre le JSON réel avant codage (`reforges.json`→`reforges`, structure 
  imbriquée par rareté — pas le format plat que devinait l'ancien code supprimé le 
  16 juillet ; `trophyfish.json`→`trophy_fish_thresholds` ; `essenceshops.json`→
  `essence_shop_upgrades`). Les autres fichiers (pets, gemstones, attribute_shards, 
  bestiary, reforgestones, rift_guide, leveling...) restent en cache brut seulement — 
  mapping repris zone par zone, pas deviné ici pour gagner du temps.
- **`skyblock-resources-sync`** reconstruit (quotidien 1h) — skills (ladder complet 
  1→cap depuis l'API officielle), collections (refresh), item_stats (nouveau, items 
  avec un champ `stats` réel).
- **`wiki-auto-sync`** migré de `hypixel-skyblock.fandom.com` vers le wiki officiel 
  `hypixelskyblock.minecraft.wiki` (même API MediaWiki, vérifié par appel réel), 
  troncature à 8000 caractères levée (limite auto-imposée, jamais une contrainte 
  réelle), état de pagination réinitialisé proprement (nouvelle source = nouveau 
  page set, l'ancien continue_token Fandom n'avait plus de sens).
- **Validé en prod sur 2 runs réels consécutifs** (route debug temporaire, supprimée 
  après validation) : neu-sync 40/40 fichiers, 683 lignes dérivées (300 reforges + 
  365 essence_shop_upgrades + 18 trophy_fish_thresholds — **comptes identiques** aux 
  données déjà chargées manuellement, confirme les mappings corrects). 
  skyblock-resources-sync : `skills` passé de 25 lignes (quelques niveaux repères 
  chargés à la main) à 587 (ladder complet officiel) ; `item_stats` de 0 à 1363 ; 
  `collections` refresh à 87 (stable). wiki-auto-sync confirmé fonctionnel sur le 
  nouveau domaine, contenu complet stocké. Les 2 runs ont produit des comptes 
  identiques (683/2029), confirmant que les upserts sont stables/idempotents.
  `vercel.json` mis à jour avec les 2 nouveaux crons.

**Historique — pourquoi ce chantier existe** : audit du 22 juillet ayant trouvé 
**30 tables de mécaniques de jeu sur 44 sans provenance traçable** dans le code ni 
l'historique git (`sblevel_tasks`, `fairy_soul_locations`, `sack_contents`, 
`museum_sets`, `museum_item_xp`, `item_upgrade_chains`, les 7 tables `garden_*`, 
`gemstone_slot_costs`, `essence_shop_upgrades`, `pet_stat_progression`, 
`george_pet_prices`, `npc_locations`, `dungeon_classes`, `dungeon_rng_scores`, 
`slayer_rng_scores`, `hotm_perks`, `hotf_perks`, `skills`, `forge_recipes`, 
`accessory_powers`, `magical_power_by_rarity`, `rift_guide`, `trophy_fish_thresholds`, 
`skymart_shop`, `hoppity_prestige`, `island_warps`, `minion_tier_xp`, 
`glacite_tunnel_waypoints`, `hotm_hotf_powders`, `player_base_stats`, `game_zones`, 
`accessory_upgrade_paths`) — peuplées par un processus hors dépôt (SQL manuel), sans 
mécanisme de mise à jour. Les 2 seuls pipelines qui en alimentaient une partie avaient 
été supprimés le 16 juillet (commit `7df1fa4`) sans jamais être reconstruits jusqu'à 
maintenant.

**✅ Phase 1 — Classes de donjon — TERMINÉ et validé sur Cucumber (23 juillet) :**
- `dungeon_classes` (table de référence, 15 lignes) **jugée fiable, gardée telle 
  quelle** — pas un résidu à refaire. Ce n'est pas une table de seuils numériques mais 
  un guide descriptif (3 paliers par classe : niveau 1/20/50, `key_ability`/
  `scaling_stat`/`notes`) — contenu vérifié cohérent avec les mécaniques Skyblock 
  connues (Berserk/Strength, Healer+Mage/Intelligence, Tank/Defense, Archer/Crit 
  Damage). Utile comme contenu explicatif, pas pour du calcul de progression.
- `member.dungeons.player_classes` vérifié sur le vrai profil Cucumber avant codage : 
  objet `{healer/mage/berserk/archer/tank: {experience}}`, **aucun champ "level" fourni 
  par l'API**. Catacombs et les classes utilisent chacun leur propre courbe XP→niveau, 
  distincte des skills classiques — aucune source vérifiée en interne (ni 
  `/v2/resources/skyblock/skills`, ni table interne), donc **XP brute stockée sans 
  niveau dérivé**, même principe que `hotm_progress`. Bonus trouvé au passage : 
  `member.dungeons.selected_dungeon_class` (classe actuellement équipée) — capturé 
  aussi (`dungeons.selected_class`).
- Ajouté dans `player/sync`, nesté dans la colonne `dungeons` existante (`dungeons.classes` 
  + `dungeons.selected_class`) — pas de migration, pas de nouvelle colonne nécessaire.
- Validé sur Cucumber via une route debug temporaire (supprimée après validation) 
  reproduisant exactement le mapping : `berserk` 354 564 XP (classe sélectionnée, 
  cohérent avec 220 runs Catacombs), `archer` 158 641, `tank` 53 541, `mage` 42 470, 
  `healer` 21 165.

**✅ Phase 2 — Boss kills — TERMINÉ et validé sur Cucumber (29 juillet)**, voir aussi la 
section dédiée tout en haut de ce document : `extractBossKills(member)` (fonction pure, 
même pattern que les 
phases suivantes) mappe Kuudra (tiers), Arachne et les variantes de l'Ender Dragon 
depuis leur vraie structure Hypixel. Bug réel trouvé en testant : `dragon_fight.
fastest_kill` contient une clé `"best"` qui est un agrégat méta (meilleur temps toutes 
variantes confondues, valeur identique à la variante la plus rapide réelle) et non une 
4e variante de dragon — exclue explicitement (`DRAGON_FASTEST_KILL_META_KEYS`) avant 
construction de `killed_types`. Migration `add_boss_kills_column.sql` exécutée, 
persistance confirmée sur données réelles.

**✅ Phase 3 — Banque + Fast Travel — TERMINÉ et validé sur Cucumber (29 juillet)** : 
`extractBankAndFastTravel(member)` — `member.profile.personal_bank_upgrade` (entier réel, 
tier du Personal Bank, distinct du `bank` déjà collecté qui est le solde coop partagé 
`profile.banking.balance`) + `member.player_data.visited_zones` (array réel de 152 zones 
Fast Travel débloquées, alimente enfin la tâche Milestones `fast_travel_unlocked` 
jusque-là `data_available:false`). Piège trouvé en vérifiant la structure brute : 
`profile.members` contient tous les coéquipiers du même profil coop, pas seulement 
Cucumber — une clé ressemblant par hasard à son `profile_id` appartenait en fait à un 
autre joueur ; seul le lookup par son vrai `hypixel_uuid` (pattern déjà en place ailleurs 
dans le fichier) est fiable. Migration `add_bank_tier_fast_travel_columns.sql` exécutée 
directement via le MCP Supabase (`apply_migration`, voir note sur la reconnexion MCP 
ci-dessous), testé en direct : `bank_tier: 1`, 152 zones, `persisted: true`, valeurs 
identiques à l'inspection brute.

**✅ Phase 4 — Essence — TERMINÉ et validé sur Cucumber (29 juillet)** : 
`extractEssence(member)` lit `member.currencies.essence`, un objet réel indexé par type 
(`DIAMOND/DRAGON/WITHER/SPIDER/UNDEAD/ICE/GOLD/CRIMSON` — les 8 vraies boutiques Essence), 
chaque entrée `{current: N}`. Types lus dynamiquement depuis les clés réellement 
renvoyées par Hypixel plutôt que codés en dur (règle 7 — pas de constante de jeu 
reconstituée de mémoire), pour ne jamais diverger si une 9e essence est ajoutée un jour. 
`member.attributes.stacks.*_essence` trouvé pendant la même recherche mais confirmé être 
un mécanisme séparé (stacks de fusion d'Attribute Shards) — exclu. Migration 
`add_essence_column.sql` appliquée via MCP, testé en direct : `DIAMOND: 744, DRAGON: 536, 
WITHER: 1, SPIDER: 612, UNDEAD: 1927, ICE: 868, GOLD: 891, CRIMSON: 555`, `persisted: true`.

**Note d'outillage — MCP Supabase reconnecté avec droits d'écriture (29 juillet)** : le 
connecteur `supabase` déclaré dans `.mcp.json` (hébergé, `https://mcp.supabase.com/mcp`) 
s'était déconnecté ; reconnecté via `/mcp` dans une session interactive (le flow OAuth ne 
peut pas se déclencher depuis une session non-interactive). Donne accès à 
`apply_migration`/`execute_sql`/`list_tables` etc. directement — les migrations additives 
non-destructives (`ADD COLUMN IF NOT EXISTS`) sont désormais appliquées directement au 
lieu de fournir un fichier `.sql` à coller manuellement ; les migrations plus sensibles 
(DROP, changement de type sur une table déjà peuplée, etc.) restent soumises à validation 
avant exécution.

**✅ Phase 5 — Minions — TERMINÉ et validé sur Cucumber (29 juillet)** : 
`extractMinions(member)` lit `member.player_data.crafted_generators`, un array réel de 
strings `"TYPE_TIER"` (ex `"COBBLESTONE_7"`, `"MITHRIL_2"`) — confirmé **par membre**, 
pas partagé au niveau du profil comme la banque (deux coéquipiers du même profil coop 
ont des listes différentes de 128 et 46 entrées). Résultat réel trouvé en vérifiant, pas 
un bug : le champ est absent (pas juste vide) sur le membre correctement résolu de 
Cucumber — cohérent avec l'absence totale de l'objectif `craft_wheat_minion` sur son 
membre alors qu'il est présent et `COMPLETE` chez un coéquipier. Elle n'a jamais crafté 
de minion ; `|| []` retombe honnêtement sur un array vide plutôt que d'aller chercher 
(à tort) la donnée d'un autre membre du coop — même garde-fou que Banque/Fast Travel. 
Migration `add_crafted_generators_column.sql` appliquée via MCP, testé en direct : 
`crafted_generators: []`, `persisted: true`.

**✅ Phase 6 — Bestiary — TERMINÉ et validé sur Cucumber (29 juillet)** : 
`extractBestiary(member)` lit `member.bestiary = {miscellaneous, kills, milestone, 
deaths}`. `kills` est un objet réel mob_id+tier → compteur (252 entrées sur Cucumber, 
ex `"graveyard_zombie_1": 240`), stocké tel quel (pass-through, inclut la clé annexe 
`last_killed_mob`, cohérent avec le format brut Hypixel). `milestone.
last_claimed_milestone` (71) est le vrai palier de progression Bestiary du jeu. `deaths` 
repéré dans la même structure mais volontairement non mappé cette passe — aucune feature 
Vault existante ne le consomme, même logique de report que `visited_modes`/les objectifs 
warp individuels notés dans les zones précédentes. Migration `add_bestiary_columns.sql` 
appliquée via MCP, testé en direct : `bestiary_milestone: 71`, 252 kills, 
`persisted: true`.

**✅ Phase 7 — Rift — TERMINÉ (mapping minimal) et validé sur Cucumber (29 juillet)** : 
`member.rift` confirmé exister avec 11 vrais sous-systèmes (`village_plaza`, 
`wither_cage`, `black_lagoon`, `dead_cats`, `wizard_tower`, `enigma`, `gallery`, 
`west_village`, `wyld_woods`, `castle`, `dreadfarm`) — mais **tous vides** sur le profil 
de Cucumber, et `member.currencies.motes` (la monnaie Rift) carrément absent. Cohérent 
avec le reste de son profil (jamais crafté de minion, voir Phase 5) : elle n'a 
quasiment jamais engagé le Rift. Faute de donnée réelle non-vide pour vérifier la forme 
des sous-systèmes, **volontairement pas mappés cette passe** — même logique que les 
champs annexes déjà reportés dans les zones précédentes, à reprendre avec un profil 
réellement engagé dans le Rift. `extractRift(member)` mappe uniquement `rift_motes` 
(même pattern `currencies.<type>.current` déjà validé pour Essence), honnêtement à 0 vu 
l'absence du champ. Migration `add_rift_motes_column.sql` appliquée via MCP, testé en 
direct : `rift_motes: 0`, `persisted: true`.

**✅ Phase 8 — Long tail (Dojo/Harp/Abiphone/Community/Festivals) — TERMINÉ (mapping 
partiel honnête) et validé sur Cucumber (29 juillet)** : dernière zone nommée de la 
liste d'origine, chaque sous-champ vérifié individuellement, mappé seulement quand une 
vraie donnée non-nulle en confirme la forme :
- **Dojo** : aucun bloc de stats dédié n'existe sur son profil 
  (`nether_island_player_data.dojo` absent) — seul le statut de la quête d'unlock 
  (`quests.quest_data.dojo`, `{status:"ACTIVE", progress:0, completed_at:0}`) est réel 
  et mappé.
- **Harp** : `foraging.songs.harp` confirmé exister mais vide — structure confirmée, 
  aucun contenu réel à mapper au-delà.
- **Abiphone** : donnée réelle et riche — `active_contacts` (4 contacts débloqués : 
  dean/elle/captain_ahone/igrupan) + stats d'appel par contact, mappés tels quels.
- **"Community shop"** : aucun champ littéralement nommé ainsi n'existe. Le vrai 
  système équivalent trouvé est `profile.community_upgrades` (Community Center — 
  partagé au niveau du profil coop comme la banque, pas un "shop") : 12 upgrades réels 
  (island_size/minion_slots/coins_allowance/guests_count) avec tier/date/claimant. 
  Documenté comme la correspondance la plus proche du terme demandé plutôt que 
  d'inventer un système inexistant.
- **Festivals** : `player_stats.candy_collected` a de la vraie donnée Spooky Festival 
  (4 instances réelles). Mining Fiesta / Fishing Festival / Jacob's Farming Contest 
  (les 3 autres catégories déjà notées dans `sblevel_tasks`) n'apparaissent sous aucun 
  champ contenant "festival" — non mappés, à reprendre avec un profil qui y a 
  participé plutôt que deviné.

`extractLongTail(member, profile)` — première fonction de zone à prendre `profile` en 
plus de `member` (nécessaire pour `community_upgrades`, partagé au niveau profil). 
Migration `add_longtail_columns.sql` appliquée via MCP, testé en direct : toutes les 
valeurs extraites identiques à l'inspection brute, `persisted: true`.

**Chantier collecte totale — les 8 zones nommées de la liste d'origine sont maintenant 
toutes traitées** (Phase 0 infra → Classes de donjon → Boss kills → Banque/Fast Travel → 
Essence → Minions → Bestiary → Rift → Long tail). Statut de fusion réel à date (23-29 
juillet) : Phase 0/1 mergées sur master ; Boss kills sur `feat/collecte-totale-boss-kills` 
(pas encore mergée) ; Banque/Fast Travel/Essence/Minions/Bestiary/Rift/Long tail toutes 
sur cette même branche `feat/collecte-totale-bank-fasttravel` (pas encore mergée non 
plus). **Note : ces deux branches ont depuis été mergées sur master, voir la section 
"Chantier collecte totale — Phase 2 complète : 8 zones mergées sur master (29 juillet)" 
restée dans CLAUDE.md — ce paragraphe est un instantané dépassé, gardé pour traçabilité 
uniquement.** Champs volontairement non mappés cette passe (à traiter zone par zone si 
besoin réel émerge) : `deaths` (Bestiary), les sous-systèmes Rift (village_plaza/
wyld_woods/castle/etc., vides sur le seul profil de test disponible), Mining Fiesta/
Fishing Festival/Jacob's Farming Contest.

## Evolve — état réel (mis à jour session du 22 juillet, source de vérité actuelle)

**Pipeline mort supprimé** : `api/evolve` (register + webhook n8n) et `cron/evolve-sync` 
(jamais présent dans `vercel.json`, donc jamais actif en prod malgré du code fonctionnel) 
ont été supprimés, avec les tables orphelines `weight_formulas` (18 lignes, coefficients 
Senither) et `skill_unlocks` (vide). `game_stage` uniformisé en MAJUSCULES 
(EARLY/MID/END/LATE) sur `player_data`, y compris le default en base.

**Backend fonctionnel (nouveau pipeline, remplace l'ancien) :**
- `api/player/sync` — sync GET on-demand (UUID via Mojang, profil via Hypixel), écrit 
  skills/slayers/dungeons/collections/pets/fairy_souls/game_stage/networth dans 
  `player_data`. `networth` est le **vrai total** (purse+bank+items décodés, voir 
  chantier NBT + networth ci-dessous), plus `networth_breakdown` (jsonb, détail par 
  catégorie). Pas de cron automatique, re-sync manuel côté frontend.
- `api/player/missions` — génère/retourne les missions journalières dans `player_missions`.
- `api/player/milestones` — skill/slayer/dungeon/fairy_soul/collection progress en JS pur 
  depuis `player_data`. Caps de skill et paliers de collection vérifiés via 
  `/v2/resources/skyblock/skills` et `/v2/resources/skyblock/collections` (table interne 
  `collections` seedée, 87 items). Slayers marqués `verified: false` dans le JSON — 
  aucune source fiable trouvée pour les seuils de tier (ni resource Hypixel, ni wiki 
  exploitable) : le frontend doit afficher un badge "à vérifier" dessus, jamais les 
  présenter comme des faits.
- `api/player/money-making` — lecture seule de `claude_analysis` (section 
  `money_making_{tier}`), retourne active+vault filtrés par `game_stage` du joueur. 
  Aucun appel Claude, aucune écriture.

**✅ Frontend branché (23 juillet).** L'ancien `EvolveSection.tsx` (design "Improvement/
Route/Skills/Money" du 13 juillet, appelait `/api/evolve` qui n'existe plus) remplacé 
entièrement. Structure : `app/dashboard/EvolveSection.tsx` (orchestrateur — lien Hypixel ? 
sinon 3 sous-tabs lazy-load) + `app/dashboard/evolve/{LinkPrompt,SkillCard,SkillsTab,
MilestonesTab,MissionsTab,types}.tsx`. Deux routes manquantes découvertes et construites 
au passage : `GET /api/player/skills` (`evolve-skills` écrivait `player_skill_cards`, 
rien ne le lisait pour le frontend) et `GET /api/player/status` (bootstrap — 
`hypixel_account_links` et `player_data` ont zéro policy RLS publique, le navigateur ne 
peut pas savoir "compte lié ?"/"quel profile_id ?" sans une route dédiée). Pas de sync 
automatique au montage (jusqu'à 300s) — bouton "Sync now" explicite. Gating non dupliqué 
— le tab Evolve est déjà `['pro','elite']`, les 5 routes appelées vérifient déjà 
`requirePlan()` server-side.

**Validé de bout en bout** (Cucumber + Orange en lecture directe des 3 sources de 
données, puis un vrai compte jetable avec abonnement Elite inséré en base, lié à Voxui09, 
session réelle testée sur les 4 routes) : la détection "déjà possédé" (free_swap) 
atteint bien l'UI — la carte Farming de Cucumber recommande d'équiper un set Mantid 
Cropie déjà présent dans son Large Backpack plutôt qu'un achat, même chose pour son set 
Shadow Assassin + Livid Dagger sur Zombie Slayer. Orange confirme le garde-fou early-game 
(target `unlock_access`, objectif ~100 coins). `player_missions` confirmé avec un vrai 
aller-retour DB via la route réelle (pas seulement la logique de sélection des 
candidats). **`GET /api/player/sync` reste bloqué par la même clé `HYPIXEL_API_KEY` 
morte trouvée en Phase 2 du chantier collecte totale** (toujours pas résolue à cette 
date — depuis rechargée plusieurs fois, voir "Prochaines étapes" dans CLAUDE.md) — les 3 
routes de lecture (skills/milestones/missions) ne l'appellent pas, donc fonctionnent 
normalement sur des données déjà synced, mais un vrai joueur ne peut pas rafraîchir son 
profil tant que la clé n'est pas vérifiée/régénérée côté `developer.hypixel.net`.

## ✅ Sécurité Evolve — TODO résolu (trouvé 22 juillet, corrigé le même jour)

Les deux points bloquants identifiés dans l'investigation initiale sont maintenant faits, 
voir la section "Sécurité compte/facturation" restée dans CLAUDE.md pour le détail 
complet (audit, fixes, tests end-to-end) :
1. Les 4 routes `player/*` vérifient `supabase.auth.getUser()` côté serveur.
2. Flux de liaison Vault ↔ Hypixel construit (`hypixel_account_links` + 
   `/api/link-hypixel-account` + UI minimale `/link-hypixel`).

**Personal Money Making — absorbé par la section Skills.** Ancien plan (table 
`player_money_making`, 5 méthodes actives + 5 futures) abandonné avant d'être codé : 
remplacé par une architecture plus large et plus granulaire (par système de progression, 
pas par méthode globale). Cette règle "ne pas reproposer l'ancien format" est reportée 
dans "Ce que je ne veux PAS" de CLAUDE.md.

## ✅ Evolve — nouvelle architecture à 3 sections (22 juillet, remplace l'ancien plan à 4 onglets)

Evolve devient **Skills / Milestones / Daily Missions**. Une 4e section premium sera 
définie plus tard (piste probable : progression globale/networth dans le temps, une fois 
qu'on aura un historique de snapshots — voir Prochaines étapes dans CLAUDE.md).

### ✅ Section Skills — TERMINÉ et testé (22 juillet)

Le cœur du produit. Fusionne l'ancien "Skills" et "Personal Money Making" en une seule 
logique : pour chaque système de progression actionnable, une carte à deux volets — 
**état actuel réel** (setup réellement possédé + coins/h dérivé de ce setup, jamais un 
chiffre générique de tier) vs **target atteignable** (le prochain pas concret, calibré sur 
le `purse` réel du joueur, pas juste son `game_stage`/networth global).

**9 systèmes actionnables** : Farming, Mining, Combat, Foraging, Fishing, Alchemy, 
Enchanting, Dungeoneering (Catacombs), Slayer (1 carte, 6 sous-cartes par boss : 
Zombie/Spider/Wolf/Enderman/Blaze/Vampire — pas 5, corrigé lors du design).

**Exclus, avec justification** (à ne pas reproposer sans nouvelle donnée) :
- **Carpentry** : aucun produit revendable, débloque juste des slots de minions.
- **Taming** : booste l'XP des pets, ne génère pas de coins directement. Angle 
  money-making réel adjacent (élever/revendre des pets, `george_pet_prices` existe déjà) 
  mais structurellement différent (flip, pas rendement/heure) — carte séparée éventuelle, 
  pas "Taming".
- **Hunting** : multiplicateur du taux de drop de Combat, pas une boucle de farm 
  indépendante.
- **Social** : aucun lien avec le rendement économique.

**Garde-fou principal (le point le plus important du design)** : jamais halluciner un item 
que le joueur ne possède pas — `current` grounded strictly sur `equipped_armor`/
`equipped_accessories`/`hotm_progress`/slayers/dungeons décodés. Pour un joueur sans setup 
(early game), la target ne doit jamais viser un objectif hors de portée — calibrée sur le 
`purse` réel, pas un objectif générique de fin de jeu. Si un système n'est pas encore 
débloqué (ex : Catacombs jamais entré), `target.type = "unlock_access"` plutôt qu'optimiser 
un rendement qui n'existe pas.

**Validé sur 2 profils réels avant merge** (Voxui09) :
- **Cucumber** (MID, purse 154.8M, networth 749M) — révèle un vrai cas "moyens mais skill 
  négligé" : carte Dungeoneering a correctement identifié 220 runs Catacombs / Floor 7 
  (vraie progression) mais armure **Groovy Fig** équipée (un set Foraging, aucun stat 
  donjon) — a recommandé Maxor's/Necron's comme achat le plus rentable disponible plutôt 
  que d'inventer un problème ailleurs. Carte Mining a honnêtement marqué `confidence: LOW` 
  faute de donnée d'outil fiable, au lieu d'inventer un chiffre précis.
- **Orange** (EARLY, purse 8 100, networth 8 100, tous skills niveau 0) — profil quasi-vide 
  réel de Voxui09, synced explicitement via `profile_id` pour valider le garde-fou early-
  game. Résultat correct : targets Farming/Mining = outil de base ~100 coins (dans le 
  budget), Slayer a correctement séparé Zombie (accessible maintenant) d'Enderman/Blaze/
  Vampire (correctement marqués hors de portée, zones non débloquées) plutôt que de 
  proposer un objectif générique de fin de jeu.

**Implémentation :**
- `member.skill_tree` (PAS `member.mining_core`, qui ne contient que powder/crystals/
  forge) décodé dans `player/sync` → `player_data.hotm_progress` (jsonb : nodes bruts 
  mining+foraging, ex `mining_speed: 9`, pas de tier dérivé — aucune table XP→tier vérifiée 
  en interne, donc pas codée en dur). Vérifié contre le code source de `hypixel-api-reborn` 
  avant codage (les perks HOTM ne vivent pas où on l'aurait supposé).
- `lib/money-making-constants.ts` — `TIER_CONFIG`/`GAME_TRUTHS` extraits de 
  `money-making-agent`, partagés par les deux crons (plus de dérive entre les benchmarks 
  coins/h généraux et personnalisés).
- `app/api/cron/evolve-skills/route.ts` — cron hebdomadaire (lundi 6h30, 30 min après 
  `money-making-agent` pour lire sa bibliothèque déjà fraîche comme référence/inspiration, 
  jamais copiée telle quelle). 1 appel Claude par profil synced (`claude-sonnet-4-6`, 
  `max_tokens: 16000`, `maxDuration: 300` — 120s/8000 tokens insuffisants pour la sortie 
  structurée des 9 cartes + 6 sous-cartes slayer, les deux relevés après un vrai échec 
  en prod, pas en anticipant).
- Table `player_skill_cards` (1 ligne par joueur par profil, upsert hebdomadaire, pas de 
  log quotidien — la boucle de progression est un effet de la fraîcheur des données 
  recalculées à chaque run, pas une logique "target atteinte" à tracker séparément). RLS 
  activé, **zéro policy** (verrouillé service-role uniquement, comme `player_data` — pas 
  la policy lecture publique utilisée pour le contenu de jeu générique comme 
  `game_mechanics_misc`, ce sont des données personnelles par joueur).
- Rendu visuel 3D du setup (skin + armure superposée) : chantier séparé, pas fait à cette 
  date, structure de données uniquement pour l'instant. **Depuis fait, voir la section 
  three.js dans CLAUDE.md.**

**⚠️ Bug trouvé et corrigé après le premier test (22 juillet, même jour)** : le prompt ne 
regardait que `equipped_armor`/`equipped_accessories` pour construire `current` — jamais 
`inventory_items`, `ender_chest_items`, `backpacks`, `personal_vault_items`, ni 
`wardrobe_slots`. Conséquence réelle constatée sur Cucumber : la carte Dungeoneering 
recommandait d'**acheter** un set Necron's/Maxor's (80-150M) alors qu'un set Ancient 
Necron's ✪✪✪✪✪ complet dormait déjà en Wardrobe slot 2, et qu'un set Ancient Crimson 
✪✪✪✪✪, un set Ancient Shadow Assassin ✪✪✪✪✪ complet, et un Livid Dagger ✪✪✪✪✪ dormaient 
dans le Jumbo Backpack — tous des swaps gratuits. Corrigé par `collectOwnedButUnequipped()` 
qui scanne les 5 emplacements non couverts et les envoie taggés par localisation, plus un 
nouveau `target.type: "free_swap"` (`budget_estimate: 0`, nomme l'item exact + son 
emplacement) distinct de `"upgrade"`. Le prompt marque maintenant explicitement 
"recommander un achat pour un item déjà possédé" comme le pire échec possible de la 
fonctionnalité — pire qu'une target hors de portée, parce que ça fait dépenser de l'argent 
réel pour rien. Revalidé sur Cucumber après fix : la carte propose bien le swap gratuit 
en nommant l'emplacement exact.

**⚠️ Trouvé en marge à cette date, `player_missions` avait des policies RLS totalement 
publiques — depuis corrigé, voir la section "Sécurité compte/facturation" restée dans 
CLAUDE.md (RLS verrouillé, service role uniquement, même traitement que `player_data`/
`player_skill_cards`).**

## ✅ Chantier NBT joueur + networth réel — TERMINÉ (22 juillet)

Remplace l'ancienne limite "networth = purse+bank uniquement". Statut à cette date :

1. **Décodage NBT complet joueur** — ✅ **fait et en prod**, les 7 catégories exposées 
   par l'API Hypixel côté inventaire joueur, chacune sa colonne jsonb sur `player_data` : 
   armure équipée (`equipped_armor`), accessory bag (`equipped_accessories`), inventaire 
   principal (`inventory_items`), enderchest (`ender_chest_items`), backpacks 
   (`backpacks`), Personal Vault (`personal_vault_items`), wardrobe (`wardrobe_slots`). 
   Tout validé sur un vrai joueur (Voxui09/Cucumber) avant merge, routes de debug 
   temporaires supprimées après validation à chaque fois.
   - Même format binaire base64-gzip que `ah-collect`, mais le décodeur ne pouvait pas 
     être appelé tel quel : `decodeItemBytes` (AH) suppose un seul item par blob 
     (`items[0]`), alors qu'un blob d'inventaire joueur encode une liste de plusieurs 
     items. `lib/skyblock-item-decoder.ts` refactorisé : logique par-item extraite dans 
     `decodeItemNBT`, réutilisée par `decodeItemBytes` (inchangé, AH) et la nouvelle 
     `decodeItemListBytes` (multi-items, joueur).
   - Backpacks : `backpack_icons` et `backpack_contents` sont deux objets indexés par la 
     **même clé slot** (vérifié explicitement contre le code source de `hypixel-api-reborn`, 
     pas supposé par ordre de tableau) — 8 sacs / 116 items confirmés sur Cucumber.
   - Personal Vault (`member.inventory.personal_vault_contents`) — c'est la feature nommée 
     "Vault" du jeu, **différente** des coffres posés sur l'île ou des items dans le monde 
     de l'île (voir limite API ci-dessous). Même format simple que inv_contents/enderchest.
   - **⚠️ Limite API confirmée (pas un chantier en attente, une vraie impossibilité)** : 
     les coffres posés sur l'île et les items présents dans le monde de l'île **ne sont 
     pas exposés par l'API Hypixel publique**, à aucun endroit. Recherche exhaustive faite 
     dans tout l'arbre de structures de `hypixel-api-reborn` (lib TS activement maintenue, 
     modélise le schéma complet de l'API) — aucun champ de ce type n'existe. L'API expose 
     des données de profil/inventaire joueur, jamais l'état du monde/des chunks. Ce n'est 
     pas une question de permission ou de setting à activer, la donnée n'existe simplement 
     pas dans la réponse JSON de Hypixel.
   - **Wardrobe (tenues sauvegardées, `member.loadout.armor`, objet indexé par slot "1".."27" 
     × 4 pièces)** ✅ **fait et en prod**. Confirmé **PAS des doublons** de l'armure déjà 
     comptée : le wardrobe permute avec `inv_armor` (l'armure équipée), donc toute tenue 
     stockée dans un slot non porté est invisible ailleurs (pas dans `inv_armor`, pas dans 
     l'inventaire/enderchest/backpacks). Validé sur Cucumber : 5 slots débloqués, 3 pleins 
     avec de vrais sets complets (Wise Yog, Ancient Necron's ✪✪✪✪✪, Necrotic Aurora ✪✪✪✪✪).
   - **Découverte notée, pas creusée** : chaque item NBT (armure au moins) porte un champ 
     `extra.donated_museum` (+ `timestamp`, `boosters`) absent des items d'AH — probablement 
     un flag/timestamp indiquant si une copie de cet item a été donnée au musée. Pourrait 
     donner un raccourci pour le blocage Musée (évite l'appel `/v2/skyblock/museum` séparé) 
     mais à valider avant d'en dépendre — pas urgent.
2. **Vrai networth** — ✅ **fait, en prod, validé sur Cucumber** (748 978 005 vs 164 935 046 
   avant le fix ci-dessous, cohérent avec purse 154M + plusieurs sets ✪✪✪✪✪ complets). 
   Calculé depuis les items réels décodés × prix marché déjà collecté en interne, plus 
   purse+bank. Breakdown détaillé par catégorie stocké dans `player_data.networth_breakdown` 
   (jsonb : purse, bank, items_total, et par catégorie value/items_priced/items_unpriced), 
   `networth` est le vrai total. Chaque item décodé porte `variant_key_full`/
   `variant_key_base`/`item_count` (sans ça, impossible de matcher un prix).
   - **Bug critique trouvé et corrigé** : `calculateNetworth` interrogeait `price_history_ah` 
     pour le matching par variante — mais cette table (granularité DAILY) est une **moyenne 
     par item toutes variantes confondues**, écrite avec un `variant_key` placeholder 
     (`'nostar_norecomb_noreforge'`) qui ne correspond à l'état réel d'aucun item. Résultat : 
     armure/accessoires/wardrobe pricés à 0 quel que soit le tier. La vraie source par-variante 
     est `price_history_ah_variants` (déjà filtrée `scan_count >= 3` à l'écriture) — 
     `calculateNetworth` pointe maintenant dessus. `price_history_ah` reste utilisée ailleurs 
     (vue item agrégée) mais **ne doit jamais servir à pricer une variante précise**.
   - **`detectGameStage` recalibré en même temps** : les seuils networth actuels 
     (5M/100M/1B) datent de l'époque "networth = purse+bank uniquement" et sous-comptaient 
     largement les joueurs bien équipés. Alignés sur les bandes déjà validées de Money 
     Making (0-50M / 50M-500M / 500M-5B / 5B+) plutôt que d'inventer de nouveaux seuils — 
     élimine aussi l'incohérence entre les deux définitions de EARLY/MID/END/LATE qui 
     coexistaient dans le code. Le gate est un OR sur networth ET avg skill (le plus 
     restrictif des deux fixe le stage) — validé sur Cucumber : networth 748M (> seuil END) 
     mais avg skill ~23 (< 25) → reste bloqué en MID, comportement voulu.
   - **⚠️ Amélioration future notée, pas la version finale** : `game_stage` ne devrait à 
     terme pas se baser sur le networth (un item cher hérité/acheté ne reflète pas 
     l'avancement réel du joueur), mais sur un score composite de puissance/avancement 
     global — skills, niveaux catacombs/slayer, qualité réelle de l'équipement (étoiles/
     reforge/enchants présents) — avec le networth comme un signal parmi d'autres, pas 
     dominant. Le recalibrage actuel (seuils Money Making) est une amélioration 
     incrémentale sur la même logique existante, pas cette refonte.
3. **Skyblock Level + XP Guide** comme référentiel de tiers/milestones — piste notée, 
   reportée dans "Prochaines étapes" de CLAUDE.md, jamais reprise depuis.
4. **Historique de progression par snapshots** — reporté dans "Prochaines étapes" de 
   CLAUDE.md.

## ✅ Evolve — Milestones — REFONTE COMPLÈTE TERMINÉE ET VALIDÉE (23 juillet, 2 passes)

Remplace intégralement l'ancien système (paliers codés en dur : skill levels/slayer 
XP/dungeon floors/fairy souls/top-10 collections, un flat array) par le vrai guide de 
complétion à 7 tiers (Starter→Amateur→Intermediate→Skilled→Expert→Professional→Master).

**Source des tâches — hybride, décidé après audit de ce qui existait déjà en base :**
- **Tâches "wiki"** — scrapées en direct depuis le wiki officiel 
  (`hypixelskyblock.minecraft.wiki`, page `SkyBlock Guide/Tasks/<Tier>`), jamais l'ancien 
  scrape Fandom tronqué à 8000 caractères. Parser dédié dans `milestones-sync` qui décode 
  les templates `{{Skl|Skill|Numeral}}` et `{{Coll|Item Numeral}}` (chiffres romains → 
  arabe, ex: `LX`→60 — cohérent avec le cap skill 60 déjà vérifié ailleurs).
- **Tâches "vault"** — Fairy Souls (échelle déjà vérifiée `[50,100,150,200,255]`) + 12 
  catégories `sblevel_tasks` confirmées absentes du guide wiki (réconciliation des 53 
  tâches réelles sblevel_tasks contre les tâches wiki) : `fast_travel_unlocked`, 
  `essence_crimson_shop`, les 4 tâches d'event (`mining_fiesta`/`spooky_festival`/
  `fishing_festival`/`jacob_farming_contest`), `unlocking_relays`, `mythological_kills`, 
  `complete_objectives`, et les 3 `skill_related_task` (activité brute farming/mining/
  fishing). Requirement type `uncollected`, toujours `data_available:false` — montrées 
  comme roadmap en attente plutôt que masquées.

**⚠️ 2e passe (même jour) — écart massif découvert et corrigé.** La 1ère version stockait 
1 ligne `milestone_tasks` par catégorie composite du wikitable (ex: "Collections" = 1 
ligne regroupant 18 requirements), donnant 179-196 lignes pour 7 tiers. Or la page 
overview `SkyBlock Guide` (tableau "Stages", vérifié par fetch direct) annonce 
**2237 tâches individuelles** au total : Starter 120, Amateur 247, Intermediate 448, 
Skilled 507, Expert 479, Professional 294, Master 142. Restructuration complète : 
**chaque requirement individuelle est maintenant sa propre ligne** `milestone_tasks` 
(même granularité que ce que Daily Missions utilisait déjà en interne) — 1616 tâches wiki 
+ 17 vault = 1633 lignes au total après restructuration, contre 289 avant.

**Honnêteté sur l'écart restant** : même après restructuration, on reste sous les 2237 
annoncés (1633 vs 2237, ~73%). Cause confirmée, pas un bug de notre côté : la page 
overview marque elle-même sa section "Tasks" `{{Outdated|section=yes}}`, et les 
sous-pages par tier sont démontrées incomplètes au-delà de Starter/Master — validé par 
deux méthodes indépendantes (somme des requirements sur le wikitext ET comptage `<li>` 
sur le HTML rendu, qui s'accordent à quelques unités près). Nouvelle table 
`milestone_tier_totals` stocke le total annoncé par tier (scrapé automatiquement depuis 
la même page overview à chaque run de `milestones-sync`), exposée dans l'API 
(`tasks_known` vs `tasks_announced`) pour que Milestones affiche honnêtement "X tâches 
connues sur ~Y annoncées" plutôt que de laisser croire que le compte scrapé est le vrai 
total du jeu. Répartition connue/annoncée par tier (23 juillet) : Starter 134/120, 
Amateur 148/247, Intermediate 279/448, Skilled 392/507, Expert 310/479, 
Professional 217/294, Master 136/142 — cohérent avec "Starter et Master quasi complets 
(les tiers les plus édités), le grind du milieu délaissé par les contributeurs wiki".

**Calcul de progression — strictement limité à ce qui est vérifiable aujourd'hui :** une 
tâche individuelle n'affiche une progression que si sa requirement est d'un type qu'on 
sait vérifier avec certitude : `skill` (niveau déjà calculé dans `player_data.skills`, 
pas de reconversion XP) et `collection` (via `player_data.collections` + la table 
`collections` déjà vérifiée). Tout le reste (`item`/`mobtype`/`uncollected` — accessoires 
précis, minions, musée, essence, dojo...) reste `data_available: false` jusqu'à ce que le 
chantier de collecte totale étende `player/sync` à ces zones. **Ces zones ont depuis été 
comblées en grande partie par les Blocs 4/6 (voir CLAUDE.md).**

**2 bugs réels trouvés et corrigés pendant la validation :**
1. La colonne `tiers` de la table `collections` utilise la clé JSON `amountRequired` 
   (camelCase), pas `amount_required` — l'ancien `milestones/route.ts` faisait déjà 
   cette même erreur silencieusement, donc son "top 10 collections" ne fonctionnait 
   probablement jamais correctement.
2. Postgres rejette un batch `ON CONFLICT DO UPDATE` contenant deux fois la même clé de 
   conflit ("cannot affect row a second time") — le wiki liste réellement certains items 
   deux fois dans une même catégorie (ex: "Pyrochaos Dagger" apparaît deux fois dans le 
   musée de Master). Dédupliqué avant upsert (garde la première occurrence, même tâche 
   réelle, aucune perte).

**Infra** : `milestone_tasks` (granularité individuelle) + `milestone_tier_totals` 
(totaux annoncés) + cron `milestones-sync` (mensuel, le 1er à 6h). 
`player/milestones/route.ts` restructuré autour de `computeMilestones(uuid, profileId)`, 
exportée et réutilisable (même pattern que `runEvolveSkills`).

**Validé sur Cucumber et Orange, les deux passes (23 juillet)** :
- **Cucumber** (MID, 220 runs Catacombs) : progression réelle et cohérente, décroissante 
  avec la difficulté des tiers — complétion (tâches calculables) 19/28 (Starter) → 
  31/51 (Amateur) → 26/55 (Intermediate) → 16/56 (Skilled) → 5/43 (Expert) → 2/21 
  (Professional) → 0/10 (Master).
- **Orange** (EARLY, profil quasi-vide, tous skills niveau 0) : 0 complétion strictement 
  partout, sur les 7 tiers — confirme le même garde-fou early-game déjà validé pour 
  Skills (jamais de progression fictive sur un profil vide).

## ✅ Evolve — Daily Missions — RECONSTRUITE, dépend enfin réellement de Milestones (23 juillet, révisée le même jour : 10 quêtes, mélange tiers débloqués)

Remplace l'ancien générateur indépendant (`generateMissions()`, if/else codés en dur sur 
skills/slayers/dungeons, aucun lien avec Milestones). Logique actuelle 
(`buildMissionCandidates()`, exportée et testable) :
1. Trouve le **tier actuel** du joueur : le premier tier (Starter→Master) qui a encore au 
   moins une tâche `data_available:true` non complétée. Un tier avec zéro tâche 
   calculable, ou dont toutes les tâches calculables sont déjà faites, est sauté (transparent, 
   ni bloquant ni "actuel" en soi).
2. Pioche dans **ce tier ET tous les tiers avant lui** (déjà débloqués par construction) — 
   jamais un tier après le tier actuel, qui reste non débloqué. Depuis la restructuration de 
   `milestone_tasks` en granularité individuelle (voir section Milestones), chaque ligne 
   EST déjà une requirement individuelle, plus besoin de casser une tâche composite ici.
3. Classe l'ensemble combiné par ratio `current/target` décroissant (le plus proche de la 
   complétion en premier — vraie victoire rapide dérivée de données réelles, jamais un temps 
   estimé inventé), garde les **10** premières (relevé de 5 à 10 le 23 juillet).

**Aucune récompense inventée** : `coins_reward`/`xp_reward` mis à 0 sur chaque mission 
(l'ancien système avait des valeurs codées en dur sans base réelle — pas reconduit).

**Validé sur Cucumber et Orange (23 juillet, après la révision à 10)** — via route debug 
temporaire appelant directement `buildMissionCandidates()`, supprimée après validation :
- **Cucumber** (MID) : 9 candidats retournés, tous du tier Starter (`Alchemy level 4 3/4`, 
  `Cobblestone/Coal/Leather/Raw Chicken/Raw Mutton/Gravel Collection`, `Carpentry level 4`, 
  `Hunting level 4`) — Starter n'est pas encore fini pour ce joueur (skills annexes 
  négligés malgré son avancement général), donc `currentTierIndex = 0` et il n'y a aucun 
  tier "avant" à mélanger. Comportement correct, pas un bug — le mélange multi-tier ne 
  s'active que quand un joueur a un tier antérieur fini mais avec des restes calculables 
  encore incomplets, cas non rencontré sur ces deux profils de test.
- **Orange** (EARLY, profil vide) : 10 candidats, tous Starter niveau 4 (tous les skills à 
  0/4) + 1 collection — jamais de mission hors de portée, même garde-fou early-game que 
  Skills et Milestones.

**Limite connue, mineure, inchangée à cette date** : parmi des candidats strictement à 
égalité (ratio 0/0 par exemple), l'ordre de sélection n'est pas garanti stable d'un run à 
l'autre (dépend de l'ordre de retour Postgres, pas de tri secondaire). Toutes les valeurs 
affichées restent réelles et honnêtes — juste l'ensemble exact des 10 peut varier entre 
deux requêtes le même jour pour un joueur avec beaucoup de candidats à zéro. Pas bloquant, 
amélioration possible plus tard (tri secondaire déterministe) — jamais reprise depuis.
