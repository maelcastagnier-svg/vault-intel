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
- price_history_ah_variant_base — 3e palier d'agrégation AH, reconstruit après perte
  accidentelle (28 juillet, archivé le 2 août) — le TODO différé (renommage
  historique des lignes) est migré dans "Prochaines étapes" de CLAUDE.md, item 10
- Evolve — nouvelle architecture à 3 sections + Section Skills (22 juillet)
- Chantier NBT joueur + networth réel (22 juillet)
- Evolve — Milestones REFONTE COMPLÈTE (23 juillet)
- Evolve — Daily Missions RECONSTRUITE (23 juillet)
- Landing page — hero verrouillé (27 juillet, ajouté au lot d'archivage du 1er août)
- Gating par tier d'abonnement (23 juillet, ajouté au lot d'archivage du 1er août)

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
## ✅ Landing page — hero verrouillé pour le lancement de cette semaine (27 juillet)

Après plusieurs semaines d'itération sur l'identité visuelle Vault (coffre-fort + clé, 
esthétique mi-Wakfu/Dofus mi-Minecraft) explorée à travers de nombreux prototypes en 
Claude Artifacts (rendu code pur WebGL, génération d'image via Pollinations.ai, tentative 
Hugging Face Inference API, géométrie 3D réelle via Three.js) — la direction artistique 
retenue et **intégrée dans le vrai code de production** (`app/page.tsx`, pas un mockup) 
est une image générée de type Minecraft Dungeons/Story Mode : coffre-fort doré au centre, 
clé flottante éclairée par un faisceau de lumière descendant du plafond, salle des coffres 
dans la pénombre en arrière-plan, texte "VAULT" en blocs dorés au sol (sert de signature 
visuelle de la scène, pas de logo dupliqué par-dessus).

**Ce qui a été fait, dans l'ordre** :
- Image source fournie par l'utilisateur (`Desktop/Image Vault/HeroBackground.png.png`), 
  netteté renforcée via `sharp().sharpen({ sigma: 1.1, m1: 1.0, m2: 0.6, ... })` (unsharp 
  mask) pour corriger le flou sur les détails fins (coffres empilés en arrière-plan, 
  bijoux au sol, bords du texte "VAULT") — validé par comparaison avant/après zoomée sur 
  la zone la plus critique avant d'appliquer au fichier final.
- Convertie en JPEG qualité 90 (2,4 Mo en PNG → 293 Ko), déplacée vers 
  `public/images/hero-background.jpg`.
- `.hero` dans `app/page.tsx` restructuré : `.hero-bg` (image de fond, `background-size: 
  cover`, `background-position: center 22%`) + `.hero-copy` (panneau de texte superposé — 
  fond semi-transparent sombre en dégradé, fine bordure dorée, 4 coins ornementaux en 
  coin-bracket, `backdrop-filter: blur`) — même traitement de panneau déjà validé sur les 
  prototypes Artifact précédents.
- Panneau positionné en haut de la section (dans la zone du faisceau lumineux/arche, 
  au-dessus du coffre et de la clé) pour ne jamais cacher les deux éléments visuels 
  centraux de la composition.
- Titre/sous-titre/CTA du hero remplacés : "Unlock the vault of your Skyblock economy" 
  + sous-titre intelligence de marché + boutons "Sign in" (`/login`) / "View pricing" 
  (`#pricing`) — remplace l'ancien texte générique "The edge YouTube will never give you" 
  qui n'avait aucun lien avec l'identité visuelle travaillée.
- Testé en local (`npm run dev`) avant validation : page 200, image servie correctement 
  à `/images/hero-background.jpg` (293 Ko confirmés), texte du hero présent dans le HTML 
  rendu.

**Verrouillé pour le lancement** : on arrête d'itérer sur la composition/le contenu de 
cette image hero — elle ne doit plus être régénérée ni recomposée sans demande explicite. 
Ce verrouillage concerne uniquement l'image (le fond visuel) — le TEXTE de la page hero 
et des pages `/features`/`/about` reste vivant et doit suivre le dashboard réel à chaque 
évolution, voir la règle 8 de la Philosophie de développement plus bas.

**Suite du même jour — retouche image + site complet + corrections de fidélité** :
- Image : logo/watermark en bas à droite supprimé (flou local + composite feathered plutôt 
  que clone-stamp, évite toute couture visible), vignette horizontale ajoutée pour plonger 
  les piles de coffres flous en arrière-plan dans la pénombre sans toucher la colonne 
  centrale nette (clé/coffre/texte VAULT), passe de netteté renforcée une fois les zones 
  bruitées assombries.
- `background-position` corrigé de `22%` à `85%` : le texte "VAULT" intégré à l'image se 
  trouve à ~78-91% de la hauteur de la source, et une position à 22% (biaisée vers le haut) 
  pouvait le faire sortir du cadre sur les viewports larges/courts. Le panneau de texte 
  opaque avec bordure/coins dorés a aussi été retiré (demande explicite : "enlever le gros 
  cadre") — la lisibilité vient maintenant uniquement de `text-shadow` par élément.
- `app/globals.css` (jusque-là vide, reste du template Next.js par défaut, `<title>` encore 
  "Create Next App") peuplé avec le système de design partagé (polices, tokens couleur, 
  `.vault-card` coin-bracket, nav, boutons, typographie de page) — toutes les pages 
  héritent maintenant de la DA du hero au lieu de dupliquer leurs propres styles. Nouveaux 
  `components/SiteNav.tsx`/`SiteFooter.tsx`, nouvelles pages `/about` et `/features`, 
  `/privacy` et `/terms` restylées (contenu légal inchangé, juste l'habillage).
- Stats du bandeau (`/api/homepage-stats`) vérifiées réellement live sur la prod (pas 
  juste testées localement) : `priceDataPoints` a incrémenté entre deux appels à quelques 
  minutes d'écart (5 074 872 → 5 074 880), confirmant une vraie lecture DB à chaque requête, 
  pas une valeur mise en cache ou statique.
- Places premium plafonnées par palier plutôt qu'un chiffre global : 1000 Alert / 500 Pro / 
  250 Elite (1750 places premium au total), reflété sur la page pricing et dans les Terms.
- Legal : ajout du droit de rétractation UE/UK à 14 jours (avec la clause standard de 
  renonciation pour accès immédiat au contenu numérique), base légale RGPD, cookies, 
  transferts internationaux, sécurité des données, confidentialité des mineurs, propriété 
  intellectuelle, limitation de responsabilité, force majeure — juridiction de gouvernance 
  laissée en placeholder explicite (pas d'entité juridique enregistrée connue, mieux vaut 
  un vide visible qu'une fausse info).
- **Deux erreurs de fidélité trouvées et corrigées après audit demandé par l'utilisateur** 
  (voir règle 8 de la Philosophie de développement) : "#ah-sniper" n'a jamais existé comme 
  onglet réel (`app/dashboard/page.tsx` n'a que 5 tabs, AH Sniper a été absorbé par Radar), 
  et Money Making décrit comme "flips Bazaar/AH" alors que le vrai composant n'a que deux 
  catégories (Active Grind / Vault Exclusive), aucun rapport avec du flip. Corrigé partout 
  (hero, `/features`, bullets de pricing) après vérification directe du code des composants 
  réels, pas de mémoire.

**Amélioration possible en V2, pas bloquant pour ce lancement** : décliner d'autres 
visuels de la même famille (même moteur de génération, même traitement de netteté) pour 
les autres sections du site (dashboard, About/How it works, pages de fonctionnalités) — 
pas commencé, aucune demande actuelle en ce sens.

## ✅ Gating par tier d'abonnement (Free/Alert/Pro/Elite) — implémenté et corrigé une faille réelle (23 juillet)

Plans validés : **Free** (0$, Flash Alerts dégradé top-5 + Patch Analysis Live résumé 
seulement, aucune liaison Hypixel possible) → **Alert** (4,99$, Flash Alerts + Patch 
Analysis complets) → **Pro** (19,99$, +Radar +Money Making Active +Evolve Skills/
Milestones complets) → **Elite** (39,99$, +Money Making Vault Exclusive +Evolve Daily 
Missions +accès anticipé).

**🔴 Trouvé en auditant l'architecture avant de coder — faille réelle, pas juste une 
lacune** : `/api/market-data` n'avait **aucune vérification d'auth**, servait déjà tout 
le contenu payant (Money Making 4 tiers + Vault Exclusive, Patch Analysis complet, Radar) 
à n'importe quelle requête anonyme. `ah_live`, `bazaar_1h`, `price_history`, 
`price_history_ah`, `price_history_ah_variants` avaient des policies RLS `USING(true)` — 
lisibles par n'importe qui avec la clé anon, interrogées **directement depuis le 
navigateur** (`FlashAlertsPage.tsx`/`LiveRankedFeed.tsx`/`RadarSection.tsx`), donc aucune 
route Next.js ne pouvait jamais les protéger. Les 4 routes `player/*` vérifiaient l'auth 
et la liaison Hypixel mais jamais le plan — un compte Free qui liait un Hypixel avait déjà 
accès complet à Evolve.

**Deux couches, un seul point de vérité chacune** :
- `lib/get-plan.ts` (`getUserPlan`/`requirePlan`) — lit `subscriptions` par l'email de la 
  session authentifiée réelle, jamais un paramètre client. Vérifié à **chaque appel**, 
  pas seulement à la liaison du compte Hypixel (un downgrade après coup ne laisse pas 
  l'accès ouvert).
- `has_plan(min_plan)` fonction SQL + nouvelles policies RLS sur les 5 tables interrogées 
  directement par le navigateur — même principe côté DB, là où aucune route Next.js ne 
  peut intervenir.
- `lib/gate-content.ts` — filtrage de contenu partagé (`filterMoneyMaking` retire Vault 
  Exclusive sauf Elite, `filterPatchInsight`/`filterPatchAnalysisContent` réduit à 
  titre+`direct_impact` pour Free, Live uniquement — vérifié contre le vrai schéma 
  `insight_patch` avant de coder).

**Aperçu Free sans nouvelle infra de délai** : vues `ah_live_free_preview`/
`bazaar_1h_free_preview` (top 5, jamais `best_auction_uuid`) — possédées par `postgres`, 
contournent volontairement le RLS désormais restreint de `ah_live`/`bazaar_1h` pour cet 
aperçu précis et rien d'autre. Même mécanisme que les vues `SECURITY DEFINER` déjà notées 
comme risque sur `method_feedback_summary`/`distinct_items` (toujours pas corrigées, 
tables vides), mais cette fois scopé et documenté sciemment plutôt que subi.

**Pas encore fait** : les tabs Flash/Patches du dashboard restent `['alert','pro','elite']` 
— le frontend ne sait pas encore afficher l'aperçu Free dégradé (backend prêt : vues + 
`/api/market-data` filtré). Tab Evolve corrigé `['elite']` → `['pro','elite']` (Skills/
Milestones sont Pro, pas Elite).


## ✅ price_history_ah_variant_base — 3e palier d'agrégation AH, reconstruit après perte accidentelle, testé en prod (28 juillet)

**Contexte de la perte** : une modification non commitée de `ah-aggregate/route.ts` 
existait déjà en local avant cette session (visible dès le premier `git status`). En 
corrigeant une erreur de branche (un lot de commits parti par erreur directement sur 
`master` au lieu d'une branche preview), un `git reset --hard origin/master` a 
accidentellement écrasé cette modification jamais commitée. Recherche de récupération 
exhaustive avant d'abandonner : historique local VS Code (`%APPDATA%\Code\User\History`) 
— le fichier y était bien suivi, mais le dernier snapshot datait du 21 juillet et était 
identique au commit déjà en base, donc rien de plus récent capturé (probablement parce que 
la modification perdue avait été faite par Claude Code directement, pas par une sauvegarde 
dans l'éditeur VS Code, seul déclencheur de cet historique) ; aucun fichier `.swp`/`~`/`.bak` 
nulle part dans le repo ; le projet n'est pas dans le dossier synchronisé OneDrive donc pas 
d'historique de versions de ce côté non plus. Confirmé irrécupérable par ces moyens — 
**l'utilisateur a retrouvé la spec exacte dans une conversation précédente** (table SQL + 
méthode de calcul + seuil de fiabilité) et l'a recollée intégralement pour reconstruction 
verbatim. Leçon opérationnelle retenue : toujours vérifier l'état du repo (`git status`) 
avant un `reset --hard`, y compris quand l'opération vise à corriger une erreur sans rapport 
avec les fichiers concernés.

**Ce qui a été reconstruit** — 3e palier d'agrégation dans `ah-aggregate/route.ts`, entre 
l'exact (`price_history_ah_variants`, 1 ligne par `variant_key_full`) et le blended toutes-
variantes (`price_history_ah`, 1 ligne par item) :
- Nouvelle table `price_history_ah_variant_base` — 1 ligne par 
  `(base_item_id, variant_key_base, bucket_date)`, regroupe les mêmes lignes fiables du 
  buffer (`scan_count >= 3`) que la table exacte. `avg_price` pondéré par `scan_count` 
  (fiabilité), `min_price`/`max_price` = extrêmes du groupe, `volume`/`data_points` sommés, 
  `contributing_variants` = nombre de `variant_key_full` distincts dans le groupe. Écrite 
  uniquement si `data_points >= 10` OU `contributing_variants >= 2`.
- **Renommage du placeholder blended** sur `price_history_ah` (table 2) : 
  `nostar_norecomb_noreforge` → `__all_variants_blended__`. L'ancien nom collidait avec le 
  VRAI `variant_key` du plain item (0 star/no recomb/no reforge) utilisé ailleurs 
  (`RadarSection`, `SetupOverlay`) pour dire "Base item" — un flip pouvait silencieusement 
  se faire comparer à la moyenne blended en croyant comparer contre le plain item réel. 
  Deux consommateurs actifs corrigés en même temps pour rester cohérents avec le nouveau nom 
  (`item-history/route.ts` ligne ~105, `RadarSection.tsx` × 4 occurrences — toutes confirmées 
  lire exclusivement `price_history_ah`, jamais `price_history_ah_variants` où la même chaîne 
  signifie autre chose et n'a jamais été touchée). Renommage historique des lignes déjà en 
  base **volontairement différé** (SQL par lots fourni à l'utilisateur, timeout sur un 
  `UPDATE` direct vu les 3,3M lignes de la table) — sans dépendance fonctionnelle sur le 3e 
  palier, qui ne lit jamais `price_history_ah`.

**Validé en conditions réelles sur preview Vercel** : `vercel crons run` ne fonctionne que 
sur la prod (confirmé via la doc Vercel), et un self-fetch HTTP vers `/api/cron/ah-aggregate` 
depuis une autre route du même déploiement se heurte au mur SSO de Vercel Deployment 
Protection (confirmé : 200 avec un corps non-JSON au lieu du vrai JSON de la route — le 
`CRON_SECRET` n'atteignait jamais le handler). Contournement définitif : logique extraite en 
fonction exportée `runAhAggregate()`, appelée par import direct depuis une route de debug 
temporaire (server-side sur le déploiement, lit `CRON_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` 
depuis l'env Vercel — aucun secret n'a besoin de transiter par la conversation). Route de 
debug supprimée après validation (`app/api/debug/test-variant-base/`), au passage un autre 
résidu de debug oublié depuis le 18 juillet (`app/api/debug/nbt-test/`, test de décodage NBT, 
zéro référence ailleurs dans le repo) a aussi été nettoyé.

**Preuve concrète** — run réel sur données de production (buffer de 10 000 lignes) : 
`base_inserted: 5402` sur `5529` groupes vus (127 exclus à raison, sous le seuil de 
fiabilité). Exemple `POWER_WITHER_CHESTPLATE` (Necron's Chestplate — confirme au passage que 
le préfixe `POWER_WITHER_*` couvre tout le set, pas juste les boots déjà notées) : 
`variant_key_base` = `5star_recomb_fuming`, `contributing_variants: 5`, `data_points: 6413`, 
`avg_price: 80 986 268`, `min_price: 25 000 000`, `max_price: 1 300 000 000`. La moyenne 
pondérée reste proche du bas de la fourchette malgré un `max_price` clairement aberrant 
(enchère isolée à un prix absurde, bruit habituel de l'AH) — preuve que la pondération par 
`scan_count` dilue bien les groupes à faible fiabilité plutôt que de les laisser fausser la 
moyenne, cohérent avec l'intention de la spec.

**Pas encore fait, migré dans "Prochaines étapes" de CLAUDE.md (item 10)** : renommage 
historique des lignes `price_history_ah` déjà en base (SQL par lots fourni, à exécuter par 
l'utilisateur quand il le souhaite — cosmétique, ne bloque rien).

## Blocs 1-7 (plan d'audit 8 blocs, 30-31 juillet) — archivés (1er août)

Déplacés le 3 août pour repasser sous la limite de 150k de CLAUDE.md (chantier NEU-REPO
de ce jour a besoin de place). Chantier "plan d'audit 8 blocs" complet et fermé --
pipeline prix de vente AH (Bloc 1), observability sync_log (Bloc 2), scoring AH (Bloc 3),
Milestones 69 tâches (Bloc 4), Radar multi-timeframe (Bloc 5), item_owned Milestones
(Bloc 6), zones joueur Bloc 7. Bloc 8 (Pluton) est resté explicitement en pause --
voir CLAUDE.md pour ce statut, toujours a jour. Contenu integral ci-dessous.

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


---

# 2e vague d'archivage — sessions 22 juillet au 17 août, sorties de CLAUDE.md le 23 août

> CLAUDE.md avait regrandi à 212 482 caractères (au-delà de la limite de 150k caractères
> de contexte auto-chargé documentée ci-dessus) après plusieurs semaines de construction
> Pluton ininterrompue sans nouvel archivage. Contenu narratif/diagnostic de chantiers
> **déjà clos et supersédés** par des sections plus récentes restées dans CLAUDE.md — en
> cas de divergence, CLAUDE.md fait toujours foi, jamais ce fichier. Conservé pour
> traçabilité, pas comme référence vivante.

Sections couvertes, dans l'ordre où elles apparaissaient dans CLAUDE.md :
- Pluton — architecture v2 (element_type + gating), TERMINÉE (13-17 août)
- Pluton — architecture 7-tiers de classification, SUPERSÉDÉE (13 août)
- Pluton Farming — construit et validé (5 août)
- Pluton Mining — validé de bout en bout, setup 100% maxé (5 août)
- CLÔTURE FINALE — 2 derniers points fermés (4 août)
- CHANTIER FINAL clos — audit de fermeture (4 août)
- Extraction brute wiki — premier lot, player_stats (3 août)
- Correction méthodologique — extraction brute NEU-REPO (3 août)
- 3 anomalies cron réelles corrigées (3 août)
- CHANTIER FINAL — extraction complète + automatisation résiliente (2 août)
- Cartographie exhaustive Hypixel Skyblock (31 juillet – 2 août)
- computeMilestones() étendu (30 juillet)
- Unification taxonomie tiers (29 juillet)
- Audit hypixel-api-reborn (29 juillet)
- Chantier collecte totale — Phase 2 (29 juillet)
- Phase 1 — base de connaissances jeu partagée (29 juillet)
- Evolve Skills — SkillBar + SkillProgressOverlay (29 juillet)
- Régression prod critique + résilience skin (28 juillet)
- SkinArmorRender migré CSS 3D → three.js (28 juillet)
- Money Making — SetupOverlay en prod (28 juillet)
- Audit complet architecture cible + 4 correctifs (28 juillet)
- Gear précis+justifié, pricing par variante exacte (28 juillet)
- Skin + armure réels dans SetupOverlay — CSS 3D (28 juillet)
- setup-generate-agent — grounding sur données réelles (28 juillet)
- Sécurité compte/facturation — audit complet (22 juillet)

**Note de contexte importante pour la traçabilité** : cette plage couvre la construction
complète de Mining/Farming (validées le 5 août, formules toujours actives et inchangées
dans `lib/pluton-mining.ts`/`lib/pluton-farming.ts`) et l'architecture Pluton v2
(`pluton_elements`, 183k lignes, toujours la base vivante de la classification 7-tiers).
Rien de ce qui est archivé ici n'est obsolète au sens fonctionnel — seul le RÉCIT
chronologique de comment on y est arrivé est déplacé, pas l'état actuel du système
(documenté à jour dans CLAUDE.md).

## ✅ Pluton — architecture v2 (element_type + gating), TERMINÉE (13-17 août)

**Remplace l'architecture 7-tiers ci-dessous** — l'utilisateur a jugé le modèle "tier
seul" trop mélangé (items/mécaniques/XP/mob data tous dans la même table, impossible
de naviguer pour un calcul Pluton précis). Nouvelle architecture validée par
l'utilisateur après plusieurs itérations de discussion :

**Principe** : deux axes orthogonaux au lieu d'un seul.
- `element_type` (navigation) : `item` | `progression_milestone` | `mechanic_formula` |
  `mob_zone_data` | `cosmetic` | `event_seasonal` | `admin_excluded` | `general_mechanic`.
- `tier` (progression, un seul champ, sémantique CUMULATIVE) : `NULL` si l'élément n'est
  **pas réellement débloquable** (règle universelle vraie pour tout joueur dès le début,
  ex: vitesse de cassage de bloc vanilla, définition d'une stat — **jamais** un tier par
  défaut pour ce genre de contenu). Sinon 1-7, où `tier=N` veut dire "présent dans le
  profil du joueur à partir du tier N, jusqu'au 100%". Tier 7 = l'ancrage absolu = tout
  ce qui est gated par construction (pas un jugement à part) — profil Master =
  `WHERE tier <= 7` (= tout), profil Amateur = `WHERE tier <= 2`, etc.
- Paramètres de gating par type, cascade priorisée : `item` → prix réel AH/Bazaar mappé
  sur les bornes `milestone_tier_totals` (jamais la rareté seule, testée et rejetée —
  un Legendary peut être early game, un Rare peut être endgame) → sinon prérequis
  documenté → sinon hérité d'une source déjà classée → sinon Haiku dernier recours.
  `progression_milestone` → ratio XP réel cumulé (`cumulative_xp/xp_total_max`, pas le
  ratio de niveau brut). `mechanic_formula`/`cosmetic`/`event_seasonal`/`admin_excluded`
  → `tier=NULL` structurel, pas de jugement.

**Schéma créé et déployé** : `pluton_elements` (migration `create_pluton_elements_v2`) —
une seule table (remplace les 7 `pluton_tier_*`), colonnes `element_type`/`activity`/
`tier`/`gate_type`/`gate_reference`/+ mêmes colonnes de traçabilité qu'avant
(`source_table`/`source_row_id`/`raw_data`/`classification_method`/
`classification_confidence`/`classification_reason`), `unique(source_table,
source_row_id)`, RLS + policy lecture publique. Élimine structurellement la classe de
bug de doublon cross-table d'hier — une seule table de destination.

**Route de classification** : `app/api/debug/trigger-elements-classify-ref/route.ts`,
même pattern que la veille (jugement Haiku par table de référence NEU-REPO/API, batch de
15, upsert dès le départ, invoquer avec `curl -m 310` strictement supérieur à
`maxDuration=300`). **2 vrais bugs de schéma trouvés et corrigés en route** : Anthropic
structured output rejette un `enum` combiné à un `type` nullable (`['string','null']`),
peu importe si `null` est dans l'enum ou non — contourné avec une valeur sentinelle
`'none'` (mappée vers `null` côté code, jamais écrite en base) plutôt qu'un type nullable.

**✅ Tables de référence NEU-REPO/API terminées (14 août)** : 150/150 tables classées,
35 783 lignes, 0 doublon, 0 erreur. Distribution `element_type` cohérente
(`mechanic_formula` 12 712 dont 46% gated, `item` 12 711 dont 34% gated — taux bas
justifié, les tables de type "relation"/"upgrade path" documentent des liens entre items
déjà classés ailleurs plutôt que des items autonomes, pas un bug —, `progression_milestone`
3 565 = 100% gated par définition, `mob_zone_data` 3 324, `general_mechanic` 1 881,
`cosmetic` 1 180, `event_seasonal` 410). `skills` (612 lignes, migrées avec le vrai ratio
XP cumulé `cumulative_xp/xp_total_max`, pas le ratio niveau brut utilisé par erreur en v1)
et `game_drops` (203 lignes, zone-based) migrées aussi — total post-référence : 36 598
lignes, 152 source_table distinctes, 0 doublon.

**✅ Contenu wiki terminé (17 août)** — `wiki_table_extract` : route
`trigger-elements-classify-wte` (jugement Haiku par PAGE, appliqué à toutes ses lignes
résiduelles). **1 vrai bug de perf trouvé et corrigé en route** : la boucle faisait un
`upsert()` individuel par ligne (potentiellement des centaines de round-trips DB par
page) — sur 137 641 lignes au total ça aurait pris des dizaines d'heures cumulées.
Corrigé en upsert par lots de 500 (même garantie `ON CONFLICT ignoreDuplicates`), gain de
vitesse énorme confirmé (de ~1700-1900 lignes/round à 400 pages/round sans timeout).
**Terminé à 137 641/137 641 lignes (100%)** — 2 pages géantes (`Necromancy/List of Souls`
3216 lignes, `SkyBlock Levels/Tasks` 3120 lignes) bloquaient le fetch par lot Haiku
(`.in()` avec 3000+ ids) : classées manuellement en SQL direct plutôt que forcées dans le
pipeline (raisonnement transparent, `classification_method='manual_v2'`).

`wiki_haiku_extract` : route `trigger-elements-classify-whe`, même principe mais sur les
`entries[]` déjà structurées par B2 (`source_label`/`stat_name_guess`/`bonus_raw`/
`condition_note`) — moins cher, pas besoin de relire la page. **Terminé** (1157 pages
résiduelles traitées, `remaining_after_this_run: 0`).

**État final vérifié en base** : **178 715 éléments dans `pluton_elements`**, 0 doublon
(`distinct_keys = total`), **154 `source_table` distinctes** couvertes (150 tables de
référence + `skills` + `game_drops` + `wiki_table_extract` + `wiki_haiku_extract`).
Distribution `element_type` cohérente sur les 8 catégories — `item` 48 302 (24% gated),
`mechanic_formula` 37 965 (27% gated), `mob_zone_data` 23 311 (24% gated),
`progression_milestone` 19 043 (67% gated — logique, une milestone est presque toujours
un vrai palier), `cosmetic` 18 817 (10% gated), `event_seasonal` 17 644 (14% gated),
`general_mechanic` 12 897 (11% gated), `admin_excluded` 736 (**0% gated par construction**,
vérifié). Total : 45 727 éléments gated (un vrai tier 1-7) / 132 988 non-gated (`NULL`,
contenu universel/cosmétique/admin correctement exclu du modèle de progression plutôt que
forcé par défaut).

**Nettoyage effectué** : les 7 tables `pluton_tier_1_starter`..`_7_master` (v1)
supprimées, les 3 routes de debug (`trigger-elements-classify-ref`/`-wte`/`-whe`)
supprimées après vérification finale.

**🔴 Bug de corruption tier trouvé+corrigé (17 août, avant clôture)** : 2670 lignes
avaient un `tier` hors de l'échelle [1,7] (jusqu'à 500) — Haiku recopiait parfois une
échelle brute du jeu présente dans le contenu source (SkyBlock Level 500+, niveau HOTM
10+, niveau Carpentry 200+) au lieu de la convertir vers l'échelle Pluton 1-7. Corrigé
par (1) prompt renforcé avec règle explicite + exemple de conversion + interdiction
littérale de copier un nombre brut, (2) `clampTier()` côté code
(`Math.max(1, Math.min(7, Math.round(n)))`) en filet de sécurité permanent, jamais
confié uniquement à la sortie structurée du modèle. 2670 lignes supprimées et
reclassifiées, vérifié après : `min_tier=1, max_tier=7` exactement.

**✅ Cron permanent d'auto-alimentation construit et vérifié (`pluton-weekly-sync`,
17 août)** : `app/api/cron/pluton-weekly-sync/route.ts`, programmé lundi 5h15
(`vercel.json`). Chaîne 2 phases dans la même invocation (demande explicite
utilisateur — "quand la cartographie est finie on lance extract dans la foulée") :
- **Phase 1 extraction** : watermark sur `game_mechanics_misc.created_at` (même
  mécanisme que `discovery-scan`), B1 (`extractStructuredTables`, gratuit) puis Haiku B2
  en dernier recours si B1 ne trouve rien → `wiki_table_extract`/`wiki_haiku_extract`.
- **Phase 2 classification** : tout le résidu non encore dans `pluton_elements`, même
  jugement Haiku element_type+gating (prompt renforcé + `clampTier()`). Scope
  volontairement limité au wiki (symétrique de `discovery-scan`) — les ~150 tables de
  référence NEU-REPO/SkyHanni-REPO reçoivent rarement de nouvelles lignes, pas couvertes
  ici pour garder le cron simple (documenté en commentaire dans la route, avec la requête
  SQL à lancer si un vrai résidu s'y accumule un jour).

**2 vrais bugs trouvés en testant, corrigés avant clôture** :
1. `insert()` nu sur `wiki_table_extract`/`wiki_haiku_extract` → tout retry rescanant
   une page déjà extraite aurait fait remonter des 23505 en boucle (pas de risque de
   duplication réelle, contraintes uniques déjà en place, mais calcul/logs gaspillés).
   Corrigé en `upsert(ignoreDuplicates)`.
2. Le watermark d'extraction n'avance que sur un succès complet (`finishSync`) — or
   `maxDuration=300` tue l'invocation avant d'y arriver dès qu'un run dépasse le budget
   (observé sur le premier test réel, backlog de 273 pages). Filet indépendant ajouté :
   skip explicite de toute page déjà présente dans `wiki_table_extract`/
   `wiki_haiku_extract` avant même de tenter B1/B2 — résumable par construction, peu
   importe l'état du watermark.
3. **`select()` sans `.range()` sur les deux fonctions de classification résiduelle**
   (`classifyWikiTableExtractResidual`/`classifyWikiHaikuExtractResidual`) — plafond
   silencieux ~1000 lignes côté PostgREST, invisible sur `wiki_table_extract` (~140k
   lignes)/`wiki_haiku_extract` (~5200 lignes). Trouvé concrètement : un run a rendu
   `wte_rows:0` alors qu'un résidu réel de 2307 lignes existait (confirmé par requête
   SQL directe). Même piège de troncature déjà rencontré ailleurs sur ce projet —
   corrigé en paginant par lots de 1000 comme `runClassificationPhase` le fait déjà pour
   `pluton_elements`. Reverifié après fix : run suivant a traité `wte_rows:3545` (preuve
   que le résidu était bien invisible avant, pas absent).

**État final vérifié en base après tous les fixes (17 août)** : **183 384 éléments dans
`pluton_elements`**, 0 doublon (`distinct_keys = total`), 0 tier hors [1,7], 0 résidu non
classé sur `wiki_table_extract`/`wiki_haiku_extract`. Chantier Pluton (cartographie +
extraction + classification + auto-alimentation) considéré **complet**.

**Prochaine étape actée par l'utilisateur** : Pluton consomme `pluton_elements`
pour Money Making (`WHERE tier<=N AND element_type='item'/'mechanic_formula'` + prix
LIVE de `price_history_ah` recroisé au moment du calcul, jamais le prix figé dans
`gate_reference`) et pour Evolve (diff données réelles joueur vs profil théorique
`WHERE tier <= tier_joueur+1` → gap analysis) — le moteur de calcul SQL + le Haiku
"instructeur" d'objectifs dashboard ne sont pas encore construits, prochaine étape
réelle de Pluton. Puis, dans l'ordre acté par l'utilisateur le 17 août : ~~calibrer les
crons~~ ✅, ~~optimiser à nouveau les coûts~~ ✅ (voir section dédiée juste au-dessus),
audit général Vault+Pluton (en cours), nettoyage complet + finalisation v1 prod, refonte
frontend, 1 semaine de test réel sur le compte Hypixel de l'utilisateur, puis lancement.

**✅ `ah-collect` optimisé côté coûts (17 août)** — identifié via données réelles
(`mcp__vercel__get_runtime_logs` + `sync_log`, jamais deviné) comme le vrai poste de
coût Vercel du projet : ~51h de compute cumulé sur 5 jours contre <3h pour tous les
autres crons réguliers combinés. Fréquence délibérément **inchangée** (1 min, demande
explicite utilisateur — "on reste à 60 sec pour ah live"), 3 optimisations internes
sans changement de comportement/données : (1) `fetchSoldAuctions()` lancé en parallèle
du buffer-upsert au lieu de séquentiellement après, (2) les 2 boucles d'historique
(`price_history_ah_variants`+`price_history_ah_variant_base`) fusionnées en un seul
`Promise.all`, (3) taille de lot d'insert `ah_live` 50→500. Vérifié en prod via
`sync_log` réel : durée moyenne ~22-25s → **13.3s**, `rows_written` inchangé (~6800),
0 erreur. Architecture `ah-collect` (pagination Hypixel, décodage NBT, buffer par
variante exacte avec moyenne glissante, agrégation quotidienne base/blended par
`ah-aggregate`, top 25 flips/catégorie dans `ah_live`) confirmée conforme à la
description de l'utilisateur — en réalité plus efficace que décrit littéralement (la
variante "blended" a déjà été retirée du live le 11 août pour coût, calculée une fois/
jour par `ah-aggregate` à la place, pas un bug).

## ✅ Pluton — architecture 7-tiers de classification, SUPERSÉDÉE par l'architecture v2 ci-dessus, tables supprimées (13 août, remplacée le 17 août)

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


## Pluton Slayer — construction complète 5 boss (18 août) — archivé le 24 août

> Déplacé depuis CLAUDE.md (3e vague d'archivage, seuil 150k) — narratif de
> construction uniquement, état actuel déjà résumé dans la section "audit
> exhaustivite NBT" du 23-24 août restée en tête de CLAUDE.md.

## ✅ Pluton Slayer — construit et validé, Zombie/Spider/Enderman/Blaze T1-T5/T4 + Wolf T1-T4 (18 août)

5e activité généralisée, et la **première nécessitant un vrai moteur de
combat** (temps de kill via dégâts/seconde réels) plutôt qu'un rendement par
action — prérequis explicitement identifié par le gap Sea Creature de
Fishing. Démarré sur un seul Slayer (Zombie/Revenant Horror, scope acté via
`AskUserQuestion`), **étendu à Spider (Tarantula Broodfather) le même jour**
après un recadrage explicite de l'utilisateur sur l'exhaustivité de la
matière première (voir mémoire `feedback_exhaustivite_matiere_premiere_
pluton` — extraire toute la source dispo par activité, jamais un
sous-ensemble curaté par commodité). `activity_key='slayer'` générique,
`pluton_slayer_boss_tiers`/`_weapon_stats`/`_armor_stats` portent une colonne
`slayer_key` pour accueillir Wolf/Enderman/Blaze/Vampire sans migration.

**Formule de dégâts réelle, corrigée après une 2e lecture complète** (page
"Damage" pour la formule générale + page "Damage Calculation" pour la
classification Additive/Multiplicative, jamais lue en entier au premier jet) :
`DamageDealt = (5+BaseDamage+FlatDamageBonuses)×(1+Force/100)×
AdditiveMultiplier×MultiplicativeMultiplier×(1+CritDamage/100 si critique)`.
**🔴 Bug réel trouvé+corrigé avant tout redéploiement** : les bonus "+X%
dégâts vs type de mob" (armes ET armure) sont **Multiplicative** (chaque
source son propre facteur ×, confirmé explicitement sur le wiki pour
Halberd of the Shredded +250%Undead=×3.5 et Tarantula/Primordial Armor
Octodexterity=×2/×1.5), **pas additifs entre eux** comme codé au premier
jet (`×(1+200%+100%)=×4.0` au lieu de `×3.0×2.0=×6.0` pour Reaper
Falchion+Reaper Armor — écart réel de +50% sur les tiers END/LATE Zombie,
recalculé). Seul le perk Warrior du niveau Combat est Additive (confirmé).
Le bonus "+100 Damage" d'Enrage est un ajout **plat** à `BaseDamage`, pas un
%. Cadence d'attaque réelle (wiki live "Bonus Attack Speed", pas encore
cachée côté `hypixelskyblock_wiki`, fetchée en direct) :
`Ticks = floor(10/(1+BonusAttackSpeed/100))`, 20 TPS, base 2 coups/s à 0 AS,
plafond réel 4 coups/s (AS≥82). Stats de base réelles (wiki "Stats#Combat
Stats") : PV=100, Force=0, Crit Chance=30%, Crit Damage=50%. Bonus de niveau
Combat réel (table `skills`, perk "Warrior") : +210% dégâts (Additive) +
+30% Crit Chance au niveau 60 max — modélisé à niveau max pour tous les
tiers, même hypothèse "skill progressé en parallèle" que Mining/Farming.

**Armes/armures réelles sourcées** — Zombie : Undead Sword(dmg30,+100%Undead,
libre)→Revenant Falchion(dmg90,force+50,+150%,gate ZS3)→Reaper Falchion
(dmg120,force+100,+200%,gate ZS6)/Reaper Scythe(dmg333,gate ZS7) ; Revenant
Armor(0 offensif, survie pure)→Reaper Armor(force+75,+100%,ability Enrage
+100dmg-plat/+100force/+100vit 6s/25s cooldown, LATE uniquement, moyenne
pondérée par uptime — même méthode que Mining Speed Boost). Spider : Spider
Sword(dmg30,+100%Arthropod,libre)→Recluse Fang(dmg60,force+30,+150%,gate
ZS2)→Tarantula Fang(dmg90,force+45,+200%,gate ZS4)→Scorpion Foil(dmg120,
force+60,+250%,gate ZS6)→Sting(dmg150,force+75,+300%,gate ZS8, ability
Stinger="toujours critique" — modélisé en forçant `critChance=100`) ;
Tarantula Armor(0 force,Octodexterity×2 confirmé wiki,Radioactive +1 Crit
Damage/10 Force plafond+100)→Primordial Armor(0 force,Octodexterity×1.5
confirmé,Radioactive +1.5/10 Force plafond+150). **Gear gaté par XP de
collection, jamais par prix AH** (la plupart `salable=no`/`n` confirmé) —
mapping direct par (slayer, tier joueur) plutôt que la recherche
combinatoire budget-AH des autres activités (même raison que l'outil
spécialisé de Farming).

**🔴 2 gaps documentés, pas des oublis** (identiques aux deux Slayers) :
- Seul le drop garanti (pool "Token", `odds=Guaranteed` explicite) compte
  dans `coins_per_hour_boss_phase_only` — tous les autres drops (Catalysts/
  Runes/enchant books/Scythe Blade/Shards...) suivent un système de poids
  multi-pool par kill dont la conversion poids→probabilité exacte n'est pas
  proprement sourcée (le `requirement` du wiki gate un palier de
  reward-track, pas un poids RNG directement utilisable) — même discipline
  que le taux de coffre au trésor de Mining, ou Sea Creature de Fishing.
- La phase de farm de mobs (XP Combat nécessaire pour faire spawn le boss)
  n'est **pas modélisée** — nécessiterait un 2e mini-modèle de combat (PV/
  loot des mobs de base, non sourcé). `coins_per_hour_boss_phase_only`
  représente donc uniquement la phase "combat contre le boss déjà spawné",
  extrapolée à l'heure comme si un nouveau boss était toujours immédiatement
  disponible — métrique partielle/idéalisée, documentée comme telle.

**3 vrais bugs trouvés et corrigés en vérifiant en prod** (au-delà de la
correction Additive/Multiplicative ci-dessus) :
1. `armor_set_prefix` (`NOT NULL`) recevait `null` au tier EARLY (aucune
   armure gérée à ce palier) — corrigé par un libellé explicite.
2. `pluton_rankings.target_block_id` référence `pluton_target_blocks(id)`,
   **pas** `pluton_slayer_boss_tiers(id)` — le code utilisait ce dernier,
   "marchait" pour Zombie par pure coïncidence d'ids (1-5 déjà utilisés par
   d'autres activités dans `pluton_target_blocks`, donc silencieusement
   liés aux MAUVAISES lignes), a explosé en violation de contrainte dès
   Spider (ids 6-10 inexistants). 10 vraies lignes `pluton_target_blocks`
   (`activity_key='slayer'`) ajoutées, jointure corrigée.
3. `SPIDER_SWORD` sourcée mais jamais insérée en base — EARLY Spider
   ressortait `has_setup:false` sur les 5 paliers, corrigé.

**État final vérifié en base** (recoupé par calcul manuel indépendant sur
mid/SPIDER_T1 — 497 388 calculé à la main vs 497 790 réel, cohérent à
l'arrondi près) : **40 combos tier×palier** (`pluton_rankings`
`activity_key='slayer'`, 0 `has_setup:false`). Zombie reste négatif sur les
20 combos (coût de spawn > valeur de la chair garantie seule, honnête vu le
gap RNG documenté) — **Spider ressort positif sur plusieurs combos**
(mid/end/late T1-T3, jusqu'à ~9.4M/h en end/late T2) grâce au prix Tarantula
Web (~1016) très supérieur à Revenant Flesh (~140), différence réelle entre
Slayers, pas un artefact. Cron `pluton-slayer-refresh` (quotidien 5h20,
`vercel.json`, déjà générique — aucune modif nécessaire pour Spider) rejoue
les deux Slayers. Route de debug temporaire supprimée après validation.

**Wolf Slayer (Sven Packmaster) ajouté juste après** ("continue sur les
autres slayers"), même rigueur d'exhaustivité. Seulement **4 paliers réels**
(pas 5, confirmé wiki — cohérent avec `TIER_CONFIG` qui note déjà "Wolf
T3-T4 (MAX)"). **Aucune arme Wolf gratuite n'existe** (rien avant Shaman
Sword @ Wolf Slayer 3, contrairement à Undead Sword/Spider Sword) — EARLY
honnêtement non éligible (`top_setup:null`), pas un oubli. Armes : Shaman
Sword(dmg100,force+20,+100%vs Wolves,gate WS3)→Pooch Sword(dmg160,force+80,
+200%vs Wolves,gate WS6) — **2 mécaniques réelles inédites** : Bonus Attack
Speed direct sur l'arme (+5%, premier cas réel pour Pluton, jusqu'ici
toujours 0) et un bonus plat "+10/+20 Damage par niveau de collection Wolf
Slayer" (niveau assumé = palier minimum requis pour MID/WS3, niveau max
documenté WS9 "Alpha Wolf" pour END/LATE, jamais inventé). Armure : Mastiff
Armor (0 Force/mob-type — design de spécialisation survie confirmé, Crit
Damage plat +60) préférée à Armor of the Pack (son seul bonus offensif est
multijoueur-conditionnel, exclu comme Dolphin Pet de Fishing). **Pack
Mentality** (Pooch Sword : +100% vs Wolves si Mastiff/Armor of the Pack
complet) vérifiée explicitement plutôt que supposée. Vérifié en base (calcul
manuel indépendant sur mid/WOLF_T1 — DPS=3705.4 calculé à la main, exact) :
16 combos supplémentaires (12 avec setup + 4 EARLY `null`), **56 combos au
total** pour les 3 Slayers. Wolf ressort positif sur T2/T3 en END/LATE
(jusqu'à ~1.78M/h), même schéma que Spider.

**Enderman Slayer (Voidgloom Seraph) ajouté juste après**, même rigueur.
Seulement 4 paliers réels (pas 5, comme Wolf). Armes : Voidwalker
Katana(dmg105,force+40,CD+15%,+150%Endermen,gate ES1,quasi-libre)→Voidedge
Katana(dmg155,force+60,CD+25%,gate ES3)→Atomsplit Katana(dmg305,force+100,
CD+50%,+300%Endermen,gate ES6 — Vorpal Katana intermédiaire volontairement
sauté, même simplification que Reaper Scythe/Sting). Armure : Final
Destination Armor (0 Force directe, survie pure) avec **Vivacious
Darkness** (toggle continu coût Soulflow, pas une ability à cooldown —
modélisée avec `duration=cooldown=1` réutilisant le mécanisme d'Enrage pour
encoder un uptime réel de 100%, LATE uniquement) : Force+30, Bonus Attack
Speed+20, +100% dégâts vs Endermen. **Malevolent Hitshield** — mécanique
réelle inédite : le boss encaisse un nombre fixe de coups (15/30/60/100
selon palier) à 3 déclenchements réels (spawn+2/3+1/3 PV) sans perdre de
PV — modélisée comme temps d'attaque directement ajouté au TTK plutôt
qu'ignorée. Yang Glyphs/Nukekubi Fixations/Broken Heart Radiation exclues
(mécaniques de survie/réaction joueur, pas de ralentissement réel du DPS).

**🔴 1 vrai oubli trouvé en vérifiant Enderman en prod** : les armes Spider
ET Enderman ont chacune leur propre stat Crit Damage (Recluse Fang+10%,
Tarantula Fang+20%, Scorpion Foil+30%, Sting+40%, Voidwalker+15%,
Voidedge+25%, Atomsplit+50%) — sourcée en lisant les pages armes, jamais
câblée dans le calcul jusqu'ici (Zombie/Wolf non affectés, 0 sur leurs
armes). Colonne `base_crit_damage` ajoutée, recalcul complet, revérifié
(EARLY/ENDERMAN_T1 : DPS=3318.2 calculé à la main = 3318 en base après
correction, exact — était 3103 sans le fix, écart réel confirmé).

**État à ce stade** : 72 combos pour les 4 Slayers construits. Enderman
ressort toujours négatif (bosses très chers en PV/temps de Hitshield, drop
Null Sphere ~225 coins, pas assez pour compenser) — cohérent avec le gap RNG
documenté, pas un signal d'erreur.

**Blaze Slayer (Inferno Demonlord) ajouté juste après**, même rigueur.
Seulement 4 paliers réels (pas 5, comme Wolf/Enderman). **Aucune dague Blaze
gratuite/starter n'existe** (confirmé wiki : rien avant Firedust/Twilight
Dagger @ Blaze Slayer 2) — EARLY honnêtement non éligible, comme Wolf.
**Aucune armure Blaze Slayer n'existe non plus** — confirmé explicitement
par le wiki, seul Slayer dans ce cas ("the only Slayer that does not reward
an exclusive set of armor, instead using Subzero Wisp Pet as a main scaling
slayer item" — pet non modélisé, même gap pets déjà documenté ailleurs).
Armes : Twilight Dagger(dmg90,force+45,+50%vs Blazes,CritDamage+15%,gate
BS2)→Deathripper Dagger(dmg160,force+75,+250%vs Blazes,CritDamage+25%,
**CritChance+10%**,gate BS6) — choisies contre Firedust/Pyrochaos par
comparaison réelle (mêmes stats brutes, bonus Infernal strictement
supérieur sur Twilight/Deathripper, pas un coup de dé).

**2 mécaniques réelles inédites** : **Demonsplit** — le boss se scinde en 2
sous-boss (Quazii+Typhoeus) avec de vrais PV propres à 50% PV (T1/T2,
scission simple) ou 2/3 et 1/3 PV (T3/T4, double scission) — modélisée en
additionnant les PV réels totaux des démons directement dans `health` du
boss stocké (T1: 2.5M+500k+500k=3.5M ; T2: 10M+1.75M+1.75M=13.5M ; T3:
45M+5M+5M×2=65M ; T4: 150M+10M+10M×2=190M) plutôt que le PV affiché du boss
seul. **Hellion Shield** (T2+) — 99% de réduction de dégâts sauf en
attaquant avec une Dague dont l'attunement courant (1 de 4 couleurs,
rotation toutes les 8 coups) correspond à celui du bouclier ; chaque vraie
dague ne couvre que 2 des 4 couleurs (Twilight/Deathripper : Spirit+Crystal)
— modélisée via une nouvelle colonne `damage_uptime_pct` sur
`pluton_slayer_boss_tiers` (100 pour T1 sans bouclier, 50 pour T2-T4),
multipliant le DPS effectif avant calcul du TTK — même discipline que le
Malevolent Hitshield d'Enderman (temps/effet réel quantifié, jamais ignoré).

**🔴 1 vrai oubli trouvé en vérifiant Blaze en prod, même famille que le
bug Crit Damage d'Enderman** : Deathripper Dagger a aussi une vraie stat
Crit Chance propre (+10%, wiki), jamais câblée au calcul (Twilight n'en a
pas, valeur wiki confirmée à 0). Colonne `base_crit_chance` ajoutée
(NOT NULL DEFAULT 0), backfill Deathripper=10, recalcul complet. Revérifié
par calcul manuel indépendant sur end/BLAZE_T1 : DPS=9555.46 calculé à la
main = 9555 en base après correction (était 9086 sans le fix, écart réel
+5.2% confirmé, cohérent avec le ratio de multiplicateur crit
`(1+0.70×0.75)/(1+0.60×0.75)`) ; mid/BLAZE_T1 (Twilight, non affecté par ce
bug) confirmé exact indépendamment (DPS=1780.7≈1781).

**État final vérifié en base** : **88 combos au total** pour les 5 Slayers
construits (Zombie/Spider/Wolf/Enderman/Blaze). **Blaze ressort positif sur
tous ses combos MID/END/LATE** (ex: end/late BLAZE_T1 ~19.8K/h,
mid/BLAZE_T1 ~3.7K/h) — premier Slayer sans aucun combo négatif, cohérent
avec le prix élevé de Derelict Ashe (~1717 coins/unité) largement supérieur
à son coût de spawn, différence réelle entre Slayers plutôt qu'un signal
d'erreur (même lecture que Spider/Wolf déjà positifs sur plusieurs paliers).
Cron `pluton-slayer-refresh` (quotidien 5h20, déjà générique) rejoue les 5
Slayers. Route de debug temporaire supprimée après validation.

**🔴 Vampire Slayer (Riftstalker Bloodfiend) — gap structurel réel, pas
construit, décision explicite de l'utilisateur (`AskUserQuestion`)** :
sourcé exhaustivement avant de conclure (page boss, `Vampire Slayer`
overview, les 2 Karambit, les 2 Steak Stake, les 3 pièces d'armure — pas un
vrai set 4 pièces, `Coven Seal`, page stat `Rift Damage`) — **2 murs
structurels réels, pas un raccourci de confort** :
1. Coût de spawn ET drop garanti (`Coven Seal`) sont libellés en **Motes**
   (monnaie exclusive au Rift Dimension), pas en coins — `Coven Seal` n'est
   même pas auctionable/tradeable (`salable=yes` contre 10 Motes
   uniquement) — aucun taux de conversion Motes→coins sourcé nulle part.
2. Le Rift utilise sa propre stat **Rift Damage** (base 20, sources listées
   sur sa page dédiée : armes/armure/équipement/consommables) **à la place**
   de Force/Crit Chance/Crit Damage — le wiki confirme explicitement que
   "le skill Combat n'a aucun effet dans le Rift". Contrairement au monde
   principal (pages "Damage"/"Damage Calculation" avec formule complète),
   **aucune formule sourcée** ne relie Rift Damage aux dégâts réels infligés
   — pages "Rift Stat"/"Rift Speed" cherchées, absentes du cache wiki.
Bâtir un calculateur ici nécessiterait d'inventer soit un multiplicateur
Rift Damage→dégâts, soit un taux Motes→coins — les deux violent la règle
"jamais de constante de jeu inventée". Documenté honnêtement comme gap
structurel (même catégorie que le Rift historiquement incomplet dans Vault,
cf `rift_motes` seul mappé/11 sous-systèmes vides). L'utilisateur a acté de
passer directement à Dungeons plutôt que de construire une approximation.

**Prochaine étape actée par l'utilisateur** : Dungeons (dernière activité de
la liste actée le 17 août). `activity_key='slayer'` reste prêt à accueillir
Vampire Slayer si une formule Rift Damage venait à être sourcée plus tard.

