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
- `price_history_ah_variants` — table séparée pour les données NBT de variantes.
- **Bug potentiellement encore ouvert** : `scan_count` ne progressait pas au-delà 
  de 1 en prod malgré une fonction validée manuellement — à vérifier en premier.

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

## Evolve — état réel (mis à jour session du 22 juillet, source de vérité actuelle)

**Pipeline mort supprimé** : `api/evolve` (register + webhook n8n) et `cron/evolve-sync` 
(jamais présent dans `vercel.json`, donc jamais actif en prod malgré du code fonctionnel) 
ont été supprimés, avec les tables orphelines `weight_formulas` (18 lignes, coefficients 
Senither) et `skill_unlocks` (vide). `game_stage` uniformisé en MAJUSCULES 
(EARLY/MID/END/LATE) sur `player_data`, y compris le default en base.

**Backend fonctionnel (nouveau pipeline, remplace l'ancien) :**
- `api/player/sync` — sync GET on-demand (UUID via Mojang, profil via Hypixel), écrit 
  skills/slayers/dungeons/collections/pets/fairy_souls/game_stage/networth (purse+bank 
  uniquement) dans `player_data`. Pas de cron automatique, re-sync manuel côté frontend.
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

**Personal Money Making — EN PAUSE.** L'endpoint existe (filtrage JS lecture seule, 
voir ci-dessus) mais l'appel Claude personnalisé n'est pas branché : `inventory_summary` 
sur `player_data` n'est qu'un flag de présence booléen 
(`{"armor":"has_armor","equipment":"has_equipment","wardrobe":null}`), pas un détail 
d'items équipés. Décision : plutôt que promettre une analyse "basée sur ton équipement" 
sans donnée réelle, on construit d'abord le décodage NBT complet (voir chantier 
ci-dessous) avant de coder l'appel Claude.

## Chantier en cours — NBT joueur + Skyblock Level/XP Guide (démarré 22 juillet)

Remplace l'ancienne limite "networth = purse+bank uniquement" :

1. **Décodage NBT complet joueur** : armure équipée ✅ **fait et en prod** (voir ci-dessous), 
   inventaire, backpacks, enderchest, accessory bag restent à faire. Même format binaire 
   base64-gzip que `ah-collect`, mais le décodeur ne peut pas être appelé tel quel : 
   `decodeItemBytes` (AH) suppose un seul item par blob (`items[0]`), alors qu'un blob 
   d'inventaire joueur encode une liste de plusieurs items. `lib/skyblock-item-decoder.ts` 
   a été refactorisé : logique par-item extraite dans `decodeItemNBT`, réutilisée par 
   `decodeItemBytes` (inchangé, AH) et la nouvelle `decodeItemListBytes` (multi-items, 
   joueur). `player/sync` décode `inv_armor` et écrit `player_data.equipped_armor` 
   (jsonb : item_name/reforge/stars/enchantments/gems par slot), validé sur un vrai 
   joueur (Voxui09, 4/4 pièces correctement décodées) avant merge.
   - **Découverte notée, pas creusée** : chaque item NBT (armure au moins) porte un champ 
     `extra.donated_museum` (+ `timestamp`, `boosters`) absent des items d'AH — probablement 
     un flag/timestamp indiquant si une copie de cet item a été donnée au musée. Pourrait 
     donner un raccourci pour le blocage Musée (évite l'appel `/v2/skyblock/museum` séparé) 
     mais à valider avant d'en dépendre — pas urgent.
2. **Vrai networth** — calculé depuis les items réels décodés × prix marché déjà 
   collecté en interne, plus purse+bank.
3. **Skyblock Level + XP Guide** comme référentiel de tiers/milestones, en remplacement 
   ou complément du découpage EARLY/MID/END/LATE actuel (basé sur networth + avg skill).
4. **Historique de progression par snapshots** — mesurer la vitesse de progression 
   early→mid→end→late d'un joueur dans le temps, et permettre la comparaison entre joueurs.

## Evolve — Milestones vs Daily Missions (architecture clarifiée 22 juillet)

**Milestones** = le guide de complétion 100% du jeu, permanent et complet. Basé sur 
`sblevel_tasks` (99 lignes, déjà en base — pas le "SkyBlock Guide" externe, voir 
investigation ci-dessous) réparti sur les 7 tiers Hypixel (Starter→Amateur→Intermediate→
Skilled→Expert→Professional→Master) selon la difficulté réelle en jeu. Pour chaque 
joueur : classe son tier actuel par tâche, montre explicitement ce qu'il a manqué dans 
les tiers précédents (pas juste le tier courant), trace le chemin complet restant 
jusqu'à 100% de complétion absolue. C'est LA référence de progression du joueur, 
recalculée à chaque re-sync.

**Daily Missions** = sélection quotidienne dynamique piochée dans les tâches Milestones 
non complétées de ce joueur, filtrée pour ne montrer que ce qui est réalisable rapidement 
à l'instant T (pas des objectifs de plusieurs semaines). Dépend de Milestones comme 
source de données — pas une structure indépendante.

**Ordre de construction** : Milestones d'abord (fondation complète), Daily Missions 
ensuite (vient piocher dedans une fois Milestones fonctionnel).

### Investigation "SkyBlock Guide" externe (22 juillet) — sources insuffisantes, pivot vers `sblevel_tasks`

- **Fandom wiki** (`game_mechanics_misc`) : Starter complet et validé (120/120 tâches, 
  vérifiées item par item). Amateur et au-delà tronqués à 8000 caractères par notre 
  propre scraper (`wiki-auto-sync/route.ts:100`, `content.slice(0,8000)` — limite qu'on 
  s'impose nous-même, corrigeable si besoin plus tard).
- **Weird Gloop** (`hypixelskyblock.minecraft.wiki`) : plus riche que Fandom pour Starter 
  (120/120 exact, avec Museum + Mob Types absents de Fandom), mais Amateur réel = 148 
  tâches sur les 247 annoncées par sa propre page sommaire — la page sommaire porte 
  elle-même un bandeau "This section needs to be reworked as its content is outdated" 
  (dernière modif 3 juillet 2026). Pas fiable au-delà de Starter.
- **`NotEnoughUpdates-REPO`** (actif, poussé en 2026) : aucun fichier Guide/tiers. 
  Contient `sblevels.json` (= notre `sblevel_tasks`, confirme la source) et 
  `leveling.json` (XP skills identique à `player/sync`, caps de skill en désaccord sur 
  3 points avec l'API Hypixel — foraging/farming/taming à trancher, et vraies données 
  `slayer_xp` par **niveau** 1-9 — différent des **tiers** 1-5 déjà utilisés en 
  `verified:false` dans `milestones/route.ts`, pas encore exploitées, à ne pas confondre).
- **SkyHanni + SkyHanni-REPO** (très actifs, poussés le jour même) : la feature 
  "SkyblockGuide" lit l'UI du jeu en direct (regex sur tooltips), aucune donnée statique 
  bundlée. Skytils probablement pareil (pas vérifié en détail).
- **Conclusion** : aucune source externe ne maintient le détail par-tier au-delà de 
  Starter. On construit notre propre répartition sur `sblevel_tasks` plutôt que 
  d'attendre une source complète qui n'existe pas.

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

1. **Milestones** — valider la proposition de répartition de `sblevel_tasks` sur les 
   7 tiers + le design de calcul par-joueur (perf, pas de recalcul lourd) avant de coder
2. **Daily Missions** — une fois Milestones fonctionnel, piocher dedans (pas avant)
3. Décodage NBT complet joueur (armure, inventaire, backpacks, enderchest, 
   accessory bag) + vrai networth
4. Historique de progression par snapshots (vitesse early→mid→end→late, 
   comparaison entre joueurs)
5. Reconstruire le frontend Evolve (4 onglets : Daily Missions, Milestones, 
   Skills, Personal Money Making) une fois le backend NBT/XP Guide stabilisé
6. Vérifier si le bug `upsert_scan_buffer_batch` est résolu
7. Migration vers `item_variant_hourly_buckets` (conçu, pas branché)

## Ce que je ne veux PAS

- Repartir sur n8n / Google Sheets / SkyCrypt
- Reproposer une refonte Money Making sans demande explicite
- Fragmenter les appels Claude par sous-catégorie
- Repartir sur "NBT enchantements différé" — c'est fait, pipeline live
- Purge SQL sans vérifier le contenu réel de la table de référence
- Reconstruire l'ancien design Evolve du 13 juillet sans vérifier d'abord le repo