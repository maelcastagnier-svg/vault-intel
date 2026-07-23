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

URL prod : https://vault-intel-iota.vercel.app
Repo : github.com/maelcastagnier-svg/vault-intel

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

**Prochaine étape** : Phase 2 (Boss kills — Kuudra tiers, Arachne, Dragons de l'End). 
Pas commencé — structure brute à vérifier sur un vrai profil avant codage.

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

**⚠️ Frontend pas branché.** `EvolveSection.tsx` existe mais code encore l'ANCIEN 
design "Improvement/Route/Skills/Money" du 13 juillet, et n'est même pas importé dans 
`page.tsx` — l'onglet Evolve du dashboard affiche un "coming soon" statique. À 
reconstruire avec les vrais onglets (Daily Missions, Milestones, Skills, Personal 
Money Making) une fois le backend stabilisé. Ne pas réutiliser le code de 
`EvolveSection.tsx` tel quel.

## ✅ Sécurité Evolve — TODO résolu (trouvé 22 juillet, corrigé le même jour)

Les deux points bloquants identifiés dans l'investigation initiale sont maintenant faits, 
voir la section "Sécurité compte/facturation" tout en haut de ce document pour le détail 
complet (audit, fixes, tests end-to-end) :
1. Les 4 routes `player/*` vérifient `supabase.auth.getUser()` côté serveur.
2. Flux de liaison Vault ↔ Hypixel construit (`hypixel_account_links` + 
   `/api/link-hypixel-account` + UI minimale `/link-hypixel`).

Toujours pas fait avant de rebrancher `EvolveSection.tsx` dans `page.tsx` : reconstruire 
le frontend lui-même (l'ancien design du 13 juillet ne correspond plus à l'architecture 
Skills/Milestones/Daily Missions) — c'est un chantier produit, plus un chantier sécurité.

**Personal Money Making — absorbé par la section Skills, voir ci-dessous.** Ancien plan 
(table `player_money_making`, 5 méthodes actives + 5 futures) abandonné avant d'être codé : 
remplacé par une architecture plus large et plus granulaire (par système de progression, 
pas par méthode globale). Ne pas reproposer l'ancien format.

## ✅ Evolve — nouvelle architecture à 3 sections (22 juillet, remplace l'ancien plan à 4 onglets)

Evolve devient **Skills / Milestones / Daily Missions**. Une 4e section premium sera 
définie plus tard (piste probable : progression globale/networth dans le temps, une fois 
qu'on aura un historique de snapshots — voir Prochaines étapes).

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
- Rendu visuel 3D du setup (skin + armure superposée) : chantier séparé, pas fait, 
  structure de données uniquement pour l'instant.

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

**⚠️ Trouvé en marge, pas corrigé** : `player_missions` a des policies RLS totalement 
publiques (SELECT/INSERT/UPDATE, `USING (true)`) — n'importe qui peut lire/modifier les 
missions de n'importe quel joueur via la clé anon. Même famille de problème que le bug 
`game_mechanics_misc` déjà corrigé, mais sur des données personnelles cette fois. Pas 
traité cette session (hors scope de la demande), à corriger avec la même logique que 
`player_skill_cards`/`player_data` (RLS verrouillé, service role uniquement) quand le 
chantier sécurité auth sera fait.

## ✅ Chantier NBT joueur + networth réel — TERMINÉ (22 juillet)

Remplace l'ancienne limite "networth = purse+bank uniquement". Statut final :

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
3. **Skyblock Level + XP Guide** comme référentiel de tiers/milestones, en remplacement 
   ou complément du découpage EARLY/MID/END/LATE actuel (basé sur networth + avg skill).
4. **Historique de progression par snapshots** — mesurer la vitesse de progression 
   early→mid→end→late d'un joueur dans le temps, et permettre la comparaison entre joueurs.

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
chantier de collecte totale étende `player/sync` à ces zones.

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

## ✅ Evolve — Daily Missions — RECONSTRUITE, dépend enfin réellement de Milestones (23 juillet)

Remplace l'ancien générateur indépendant (`generateMissions()`, if/else codés en dur sur 
skills/slayers/dungeons, aucun lien avec Milestones). Nouvelle logique 
(`buildMissionCandidates()`, exportée et testable) :
1. Trouve le **tier actuel** du joueur : le premier tier (Starter→Master) qui a encore au 
   moins une tâche `data_available:true` non complétée. Un tier avec zéro tâche 
   calculable, ou dont toutes les tâches calculables sont déjà faites, est sauté.
2. Prend ses tâches calculables non complétées directement — depuis la restructuration de 
   `milestone_tasks` en granularité individuelle (voir section Milestones), chaque ligne 
   EST déjà une requirement individuelle, plus besoin de casser une tâche composite ici.
3. Classe par ratio `current/target` décroissant (le plus proche de la complétion en 
   premier — vraie victoire rapide dérivée de données réelles, jamais un temps estimé 
   inventé), garde les 5 premières.
4. Ne va jamais chercher dans un tier supérieur au tier actuel — reste "réalisable à 
   l'instant T" par construction, pas besoin d'un modèle de difficulté/durée séparé.

**Aucune récompense inventée** : `coins_reward`/`xp_reward` mis à 0 sur chaque mission 
(l'ancien système avait des valeurs codées en dur sans base réelle — pas reconduit).

**Validé sur Cucumber et Orange (23 juillet)** :
- **Cucumber** (MID) : `Alchemy level 4 (3/4)`, `Cobblestone Collection 4 (206/1000)`, 
  `Coal Collection 2 (2/100)`, `Leather Collection 2 (1/100)`, 5e mission variable entre 
  `Carpentry level 4` et `Raw Chicken Collection 2` (tous deux à 0/cible — égalité 
  honnête, l'ordre entre candidats strictement à égalité n'est pas garanti stable, limite 
  mineure connue, pas un bug). Révèle ses skills/collections réellement négligés malgré 
  son avancement général.
- **Orange** (EARLY, profil vide) : 5 cibles triviales (niveau 4 dans un skill, ou tier 
  bas d'une collection à 0) — jamais de mission hors de portée, même garde-fou early-game 
  que Skills et Milestones.

**Limite connue, mineure** : parmi des candidats strictement à égalité (ratio 0/0 par 
exemple), l'ordre de sélection des 5 missions n'est pas garanti stable d'un run à l'autre 
(dépend de l'ordre de retour Postgres, pas de tri secondaire). Toutes les valeurs 
affichées restent réelles et honnêtes — juste l'ensemble exact des 5 peut varier entre 
deux requêtes le même jour pour un joueur avec beaucoup de candidats à zéro. Pas bloquant, 
amélioration possible plus tard (tri secondaire déterministe).

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

1. **Chantier collecte totale — Phase 2 (Boss kills) — BLOQUÉ.** `HYPIXEL_API_KEY` 
   renvoyait un vrai `403 Invalid API key` (pas un rate-limit — headers de quota absents, 
   pas un `429`) lors du test Phase 2 le 23 juillet. En attente que la clé soit vérifiée/
   régénérée côté `developer.hypixel.net`. Phase 0 (infra) et Phase 1 (Classes de donjon) 
   terminées et validées en prod le 23 juillet.
2. Étendre la couverture `data_available:true` de Milestones/Daily Missions au fur et à 
   mesure que le chantier collecte totale avance (essence, musée, minions, accessoires 
   précis...) — les 12 catégories `uncollected` ajoutées le 23 juillet passeront à 
   calculable une par une
3. Historique de progression par snapshots (vitesse early→mid→end→late, 
   comparaison entre joueurs) — piste pour la 4e section Evolve premium
4. Reconstruire le frontend Evolve (3 onglets : Skills, Milestones, Daily Missions) — 
   le backend des 3 est maintenant terminé (Skills, Milestones et Daily Missions tous 
   validés le 23 juillet)
5. Rendu visuel 3D du setup (skin + armure superposée) pour la section Skills — chantier 
   séparé, pas commencé
6. Migration vers `item_variant_hourly_buckets` (conçu, pas branché)
7. Filtrage outlier sur variantes AH à faible `data_points` (voir section infra collecte)
8. `method_feedback_summary` (vue `SECURITY DEFINER`) à corriger avant que 
   `method_feedback` ait de vraies données (voir section sécurité)

## Ce que je ne veux PAS

- Repartir sur n8n / Google Sheets / SkyCrypt
- Reproposer une refonte Money Making sans demande explicite
- Fragmenter les appels Claude par sous-catégorie
- Repartir sur "NBT enchantements différé" — c'est fait, pipeline live
- Purge SQL sans vérifier le contenu réel de la table de référence
- Reconstruire l'ancien design Evolve du 13 juillet sans vérifier d'abord le repo