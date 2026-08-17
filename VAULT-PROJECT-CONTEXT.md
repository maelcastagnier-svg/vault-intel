# Vault — contexte projet (pour Claude Desktop / claude.ai)

> Document de référence pour interroger Claude sur le projet Vault en dehors de
> Claude Code. Décrit l'état ACTUEL du produit, pas un historique de session —
> pour le détail chronologique complet (bugs, décisions, dates), voir
> `CLAUDE.md` dans le repo. À mettre à jour à chaque étape majeure.
>
> Dernière mise à jour : 17 août 2026.

## Ce qu'est Vault

Plateforme SaaS d'intelligence économique gaming par abonnement, démarrage sur
**Hypixel Skyblock** (Minecraft). Dashboard web qui combine :
- des données de marché collectées en continu (Auction House, Bazaar),
- des mécaniques de jeu réelles cartographiées depuis les sources officielles
  (wiki, code communautaire, API Hypixel),
- des analyses générées par des agents Claude en cron, pas de génération à la
  demande côté utilisateur.

URL prod : https://vault-intel-iota.vercel.app
Repo : github.com/maelcastagnier-svg/vault-intel

## Stack

- **Next.js** sur **Vercel** (Pro) + **Supabase Postgres** (Pro)
- **Claude API** (Sonnet pour l'analyse riche, Haiku pour la classification en
  volume) en appels directs depuis les routes Vercel
- **API Hypixel officielle** + **SkyCofl API** (Premium+, JWT) pour les données
  de marché temps réel
- **Vercel Cron Jobs natifs** (n8n abandonné en production)
- **three.js + @react-three/fiber** pour le rendu 3D du personnage (skin +
  armure réels, plus de CSS 3D)

## Les 3 piliers du produit

### 1. Marché (Auction House + Bazaar)
Collecte continue (`ah-collect` toutes les 60s, `bazaar-collect` toutes les
5 min) → agrégation quotidienne (`ah-aggregate`) → historique par variante
exacte d'item (étoiles/reforge/enchants) avec repli en cascade vers une
variante "base" puis "blended" si pas assez de données. `ah_live` expose en
continu le top 25 flips par catégorie. **Radar** (agent Claude quotidien)
détecte les anomalies de marché multi-timeframe.

### 2. Money Making
4 tiers de progression (Early 10M+/h, Mid 25M+/h, End 50M+/h, Late 70-100M+/h),
un appel Claude par tier (jamais par sous-catégorie). Chaque méthode a un setup
précis et recréable (armure/arme/reforge/étoiles/enchant ultime, pas un nom de
set générique), coût calculé en code à partir du vrai catalogue de prix
(`computeRealCost`), jamais halluciné par le modèle. Rendu 3D du personnage
avec le setup exact dans `SetupOverlay`.

### 3. Evolve (progression du joueur)
Compare le profil réel du joueur (synchronisé depuis l'API Hypixel) à un
profil théorique cible. Sections : **Skills** (SkillBar + overlay 2 colonnes
current/target, gear réel possédé vs gear recommandé), **Milestones** (7
paliers de progression, ~30 `requirement_type` différents calculés en JS pur
sans coût Claude), **Daily Missions**.

## Pluton — le moteur économique

Pluton est la couche de connaissance qui alimente Money Making et Evolve avec
des données de jeu **classées par palier de progression réel**, construite
courant août 2026.

### Architecture (v2, actuelle)

Une seule table : **`pluton_elements`**, deux axes orthogonaux :

- **`element_type`** (navigation, "de quoi s'agit-il") : `item` |
  `progression_milestone` | `mechanic_formula` | `mob_zone_data` | `cosmetic` |
  `event_seasonal` | `admin_excluded` | `general_mechanic`.
- **`tier`** (progression, "à partir de quand c'est débloqué") : `NULL` si
  l'élément est une règle universelle non débloquable (ex: vitesse de cassage
  de bloc vanilla — jamais un tier par défaut pour ce genre de contenu), sinon
  un entier **1 à 7**, sémantique CUMULATIVE — `tier=N` signifie "présent dans
  le profil du joueur à partir du tier N". Profil Master = `WHERE tier<=7`,
  profil Amateur = `WHERE tier<=2`, etc.

Classement en cascade selon le type : `item` → prix réel AH/Bazaar mappé sur
les bornes `milestone_tier_totals` (jamais la rareté seule — testée et
rejetée, un Legendary peut être early game) → prérequis documenté → hérité
d'une source déjà classée → Haiku en dernier recours. `progression_milestone`
→ ratio XP réel cumulé. Le reste → `tier=NULL` structurel.

### État actuel (vérifié en base, 17 août 2026)

**183 384 éléments** dans `pluton_elements`, 0 doublon, 0 valeur de tier hors
[1,7], couvrant 154+ tables sources distinctes : les ~150 tables de référence
NEU-REPO/API du jeu, `skills`, `game_drops`, et l'intégralité du contenu wiki
extrait (`wiki_table_extract` + `wiki_haiku_extract`).

**Auto-alimentation permanente** : cron hebdomadaire `pluton-weekly-sync`
(lundi 5h15) — détecte les nouvelles pages wiki depuis le dernier run
(watermark sur `created_at`), les extrait (parsing maison gratuit, Haiku en
dernier recours), puis classe tout résidu non encore dans `pluton_elements`.
Résumable par construction même si une invocation dépasse le budget de 300s
(diff direct contre l'état réel en base, jamais uniquement un watermark).

**Ce qui n'est pas encore construit** : le moteur de calcul SQL qui consomme
`pluton_elements` pour Money Making (`WHERE tier<=N AND element_type='item'`
+ prix live recroisé au moment du calcul) et Evolve (gap analysis vs profil
théorique), ainsi que le Haiku "instructeur" qui traduit ça en objectifs
dashboard. C'est la prochaine étape réelle de Pluton.

## Philosophie de développement (règles dures)

1. Pragmatisme > perfection théorique.
2. Séparation stricte collecte (JS/SQL pur) vs analyse (Claude ciblé).
3. **1 appel Claude par catégorie logique**, jamais par sous-catégorie —
   règle non négociable pour la maîtrise des coûts.
4. Toujours privilégier une source de données déjà collectée en interne.
5. **Jamais de constante de jeu reconstituée de mémoire.** Tout seuil, tier,
   XP requis, palier lié aux mécaniques Hypixel doit être vérifié contre le
   wiki officiel et/ou une table Supabase déjà collectée avant d'être codé en
   dur.
6. Toute fonction critique (cron, agent Claude) est extraite en fonction plain
   exportée, testée via une route de debug temporaire qui l'appelle
   directement, résultat vérifié en base réelle avant merge, route supprimée
   après validation. **Ne jamais faire confiance à une réponse JSON de route
   seule — toujours revérifier l'état réel en base après.**
7. Toute écriture idempotente candidate à un retry = `upsert(ON CONFLICT DO
   NOTHING/ignoreDuplicates)`, jamais `insert()` nu. Vérifier l'unicité
   CROSS-TABLE quand la même donnée source peut atterrir dans plusieurs
   tables (l'unicité par table seule ne suffit pas).
8. Toute route de debug chaînant des appels Claude par polling HTTP répété :
   `curl -m` strictement supérieur au `maxDuration` de la route, jamais un
   retry sur simple timeout client sans vérifier un vrai statut de fin côté
   serveur (`sync_log`).
9. Piège de troncature récurrent sur ce projet : un `select()` Supabase/
   PostgREST **sans `.range()`** plafonne silencieusement à ~1000 lignes sur
   toute table dépassant ce seuil — toujours paginer explicitement au-delà.
10. La landing page doit refléter fidèlement ce qui existe réellement dans le
    dashboard — jamais une fonctionnalité aspirationnelle ou obsolète.

**Rien n'est "définitivement terminé".** "✅ Terminé" signifie "fonctionnel et
validé à ce stade", pas "ne plus jamais y toucher".

## Automatisations (crons Vercel actifs)

| Cron | Fréquence | Rôle |
|---|---|---|
| `ah-collect` | 1 min | Scan AH complet, décodage NBT, buffer par variante — poste de coût Vercel dominant du projet |
| `bazaar-collect` | 5 min | Prix Bazaar |
| `network-events-sync` | 15 min | Mayor, bingo, news réseau |
| `wiki-auto-sync` | 30 min | Cache brut des pages wiki |
| `ah-aggregate` | quotidien 23h59 | Historisation AH (1 point/jour/variante) |
| `patch-collect` / `patch-analysis-agent` | quotidien | Notes de patch + analyse Claude |
| `radar-agent` | quotidien 7h | Détection d'anomalies marché |
| `discovery-scan` | quotidien 4h | Nouvelles pages wiki → `discovery_queue` |
| `update-catalog` / `skyblock-resources-sync` / `data-retention` | quotidien | Catalogue items, ressources, purge |
| `money-making-agent` / `setup-generate-agent` | hebdo lundi | 4 tiers Money Making + setups précis |
| `neu-sync` / `armor-color-sync` / `wiki-referential-sync` / `skyhanni-repo-sync` | hebdo lundi | Tables de référence externes |
| `pluton-weekly-sync` | hebdo lundi 5h15 | Auto-alimentation Pluton (extraction + classification) |
| `milestones-sync` | mensuel | Référentiel Milestones |

## État du produit / roadmap actée (17 août 2026)

Séquence explicitement décidée par l'utilisateur, dans l'ordre :
1. ~~Finir Pluton (cartographie + extraction + classification + auto-alimentation)~~ **fait**
2. Calibrer les crons (en cours)
3. Optimiser à nouveau les coûts Vercel + API Claude (prompt caching pas
   encore implémenté sur les routes récentes)
4. Audit général du produit Vault + Pluton
5. Nettoyage complet + finalisation v1 prod
6. Refonte frontend
7. 1 semaine de test réel sur le compte Hypixel de l'utilisateur
8. Lancement

## Ce qu'on ne veut PAS reproposer

- Repartir sur n8n / Google Sheets / SkyCrypt
- Refonte Money Making sans demande explicite
- L'ancien format "Personal Money Making" (abandonné, remplacé par Evolve Skills)
- Fragmenter les appels Claude par sous-catégorie
- Purge SQL sans vérifier le contenu réel de la table de référence
