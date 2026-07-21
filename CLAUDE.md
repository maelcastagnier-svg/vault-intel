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

1. **Décodage NBT complet joueur** : armure équipée, inventaire, backpacks, enderchest, 
   accessory bag. Même format binaire base64-gzip que `ah-collect` (déjà live sur les 
   enchères AH), mais jamais encore appliqué à l'inventaire d'un joueur — chantier séparé, 
   pas un simple réemploi du décodeur existant.
2. **Vrai networth** — calculé depuis les items réels décodés × prix marché déjà 
   collecté en interne, plus purse+bank.
3. **Skyblock Level + XP Guide** comme référentiel de tiers/milestones, en remplacement 
   ou complément du découpage EARLY/MID/END/LATE actuel (basé sur networth + avg skill).
4. **Historique de progression par snapshots** — mesurer la vitesse de progression 
   early→mid→end→late d'un joueur dans le temps, et permettre la comparaison entre joueurs.

**Prochaine étape immédiate à la reprise** : vérifier si un "Skyblock XP Guide" (niveau 
SkyBlock → XP cumulée) existe déjà dans une table Supabase interne ou via l'API Hypixel 
(`/v2/resources/skyblock/...`) **avant** de le construire — même principe que pour 
skills/collections cette session (voir règle 7 ci-dessous) : ne jamais coder en dur 
sans avoir vérifié la source d'abord.

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

1. **Vérifier si le Skyblock XP Guide existe déjà** (table Supabase interne ou 
   API Hypixel) avant de le construire pour le chantier NBT joueur / Skyblock Level
2. Décodage NBT complet joueur (armure, inventaire, backpacks, enderchest, 
   accessory bag) + vrai networth
3. Historique de progression par snapshots (vitesse early→mid→end→late, 
   comparaison entre joueurs)
4. Reconstruire le frontend Evolve (4 onglets : Daily Missions, Milestones, 
   Skills, Personal Money Making) une fois le backend NBT/XP Guide stabilisé
5. Vérifier si le bug `upsert_scan_buffer_batch` est résolu
6. Migration vers `item_variant_hourly_buckets` (conçu, pas branché)

## Ce que je ne veux PAS

- Repartir sur n8n / Google Sheets / SkyCrypt
- Reproposer une refonte Money Making sans demande explicite
- Fragmenter les appels Claude par sous-catégorie
- Repartir sur "NBT enchantements différé" — c'est fait, pipeline live
- Purge SQL sans vérifier le contenu réel de la table de référence
- Reconstruire l'ancien design Evolve du 13 juillet sans vérifier d'abord le repo