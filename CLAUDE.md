@AGENTS.md
# CLAUDE.md — Vault (contexte projet pour Claude Code)

> Basé sur la session la plus récente disponible. En cas de divergence avec une
> session antérieure sur le même sujet, cette version fait foi.

## 🎯 Vision finale et définitive de Pluton (dictée par l'utilisateur, 21 août)

Cette section est la référence permanente pour toute construction Pluton —
ne jamais dévier de cette pipeline sans accord explicite de l'utilisateur.

**1. Cartographie** — prendre TOUTE source possible sur Hypixel Skyblock
pour compléter le 100% informationnel possible sur le jeu, peu importe
l'info, elle peut être essentielle.

**2. Extraction et classement en 7 tiers de progression** — l'extraction
initiale se fait par Claude Code directement (pagination, lecture, jamais
Haiku pour ce travail de construction — voir mémoire `feedback_budget_api_
claude`). Tout ce qui est cartographié est classé dans un stockage en
7 tiers représentant l'avancement du joueur (starter→master). **Chaque
tier doit représenter un joueur complet à cette étape de sa vie de
joueur** — chaque tier contient en son sein le 100% informationnel sur cet
état d'avancement (ex: le tier "starter" = 100% de ce qu'un joueur starter
a besoin). Les **mécaniques non-client** (fonctionnement intrinsèque du
moteur de jeu, formules internes non exposées au joueur) sont classées **à
part**, jamais dans les tiers — les joueurs n'y ont pas accès. Tout le
reste (items, mécaniques accessibles au joueur) rentre dans les tiers.

**3. Utilisation pour le dashboard** — pour chaque skill du jeu, faire
découler toutes les activités qui existent en jeu liées à ce skill. Ces
activités sont classées en 7 tiers d'accessibilité selon le niveau
d'avancement global nécessaire pour les accomplir. Pour chaque activité,
un **setup optimal qui n'omet absolument rien** : items optimaux avec leur
NBT précis (enchantement, reforge, étoiles régulières ET Master Star,
gemmes socketées + qualité, et tout autre modificateur NBT réel du jeu —
rien n'est omis), mécaniques optimales — un vrai loadout complet A à Z
pour l'activité. L'activité est ensuite liée à son prix de marché réel
(Bazaar/AH) pour produire une **money making method** = activité + setup +
pricing. Usage final : comparaison interne pour proposer les meilleures
money making methods dans la section Money Making du dashboard (coins/h
par tier), et pour Evolve, proposer le meilleur setup/activité par rapport
à la progression réelle du joueur à l'instant T.

**Setup optimal = recherche réelle, pas un chemin canonique fixe** — le
moteur doit comparer l'espace des items pertinents (et leurs variantes
NBT) pour trouver le setup réellement optimal par activité×tier, pas
seulement suivre le chemin de gear "évident"/déjà documenté. Un item hors
du chemin canonique peut ressortir meilleur (ex illustratif, pas à
reproduire à la lettre : un Hyperion bien enchanté avec spam Wither Impact
pourrait battre Reaper Falchion à un tier avancé de Zombie Slayer) — la
recherche doit être capable de le découvrir, pas seulement confirmer un
choix pré-décidé.

**Discipline d'exécution** : chaque skill traité un par un (jamais tous
les skills/toutes les activités d'un coup), zéro appel API pendant la
construction (Claude Code fait ce travail directement), automatisation
finale en cron hebdomadaire une fois le moteur validé sur au moins un cas
connu — voir le plan `joyful-shimmying-finch.md` pour le détail complet
des phases en cours.

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

## ✅ Pluton — audit exhaustivite NBT (enchants/gemmes/accessoires) + 2 bugs critiques (23-24 août)

**Recadrage explicite de l'utilisateur** après la migration 7-tiers : *"le systeme na aucun trou... les setups tont vraiment complet ??"* puis, après une 1re réponse honnête listant les trous connus : *"on utilise qu'un peux a chaque fois pas tout... cherche les trous, comble correctement, ne compte rendu que quan c'est finis... tu as open bar."* Mandat : travail autonome prolongé, zéro check-in intermédiaire, fermeture réelle plutôt qu'un audit superficiel.

**Méthode** : requêtes SQL directes sur `game_mechanics_misc` (`game_wiki`/`enchant_wiki`/`accessory_wiki`, contenu déjà caché) pour lire le contenu RÉEL de chaque enchant/gemme/accessoire jamais évalué — jamais une valeur devinée (règle #7). Agents dédiés pour Fishing (réussi) et accessoires/pets Combat (échec 1re fois sur limite de session, relancé avec succès) ; reste fait directement par Claude Code.

### Fermetures réelles (nouvelles constantes centralisées `lib/pluton-engine.ts`)

**Combat** (Slayer/Bestiary/Sea Creature kills/Zombie Slayer v2, 4 fichiers) :
- **Thunderlord** (single-target, préféré à Thunderbolt qui est AoE) — frappe tous les 3 coups, moyenne=bonus/3, jusqu'à +20% DPS à master (7 paliers réels I-VII)
- **Fire Aspect** (multiplicatif, confirmé par l'historique wiki) — X%/s pendant Ys, jusqu'à +36% DPS à master
- **Inferno** (ultimate ARME, source Kuudra) — tous les 10 coups, jusqu'à +12.5% DPS à master
- **Habanero Tactics** (ultimate ARMURE, **Slayer UNIQUEMENT** — wiki explicite "Slayer weapons") — +25% additif à master
- **Tabasco** — +2/+3 dégâts plats (condition "pas de Dragon Pet" toujours vraie, aucun pet modélisé avant ce lot)
- **Looting** — multiplie le drop garanti ; **exclu des Slayers par le wiki** ("does NOT apply on Slayers"), appliqué Bestiary/Sea Creature seulement
- **Scavenger** — coins plats/kill, négligeable mais gratuit
- **Impaling** — +dégâts vs Aquatic, Sea Creatures=Aquatic (confirmé depuis 0.23.3) — Sea Creature kills uniquement
- **Accessoires/pet universels** (gap le plus important — `stat_bonus_sources` n'avait AUCUNE ligne strength/crit_damage/crit_chance/bonus_attack_speed pour Combat, contrairement à Mining/Foraging/Fishing) : Pet Griffin (Str+50/CC+10/CD+50/BonusAS+25), The Primordial (belt, Str+15/CD+20%), Annihilation Cloak (cloak, Str+20/CD+20%), Manticore Claw (bracelet, Str+20/BonusAS+2.5%), Molten Necklace (Str+20), Red Claw Artifact (accessory_bag, CD+5%) — item_id vérifié contre `items_catalog`, gate investissement max

**Fishing** : Angler (+SCC), Luck of the Sea (+TC), Ultimate Flash (ultimate ROD, +chance attraction instantanée). **Mining** : Flowstate (ultimate, +1-3 Mining Speed/bloc consécutif, plafond 200, steady-state). **Foraging** : First Impression (ultimate AXE, +Sweep sur Log Breaks).

**Essence Shops — 12 boutiques auditées** (9 restaient) : Crimson/Dragon/Ice/Gold/Fossil/Safari + Sun Gecko (nouvelle, Rift-exclusive) lues intégralement. Rien de câblable de plus sauf 2 gaps `excluded_complex` : One Punch (Dragon, +dégâts flat 1er coup vs Enderman, dilue sur combat long) et Two-Headed Strike (Dragon, +BonusAS sur reforges Renowned/Spiked).

**Nouvelle table `pluton_mechanic_coverage`** — classification interrogeable par skill (statut `wired`/`excluded_*`/`not_yet_audited`, raison, source), remplace le suivi en commentaires, backfillée (~100 lignes).

### 🔴 2 bugs réels critiques trouvés en vérifiant (pas des artefacts des ajouts du jour)

**1. Zombie négligé dans `lib/pluton-slayer.ts` depuis le 22 août** — `UNDEAD_SWORD`/`REVENANT_SWORD`/`REAPER_SWORD`/`REAPER_SCYTHE` et `REVENANT`/`REAPER` étaient absents de `WEAPON_RARITY`/`ARMOR_RARITY_BY_PREFIX`/`JASPER_SLOTS_BY_WEAPON` — Zombie n'a **jamais eu de reforge ni de gemme Jasper** dans ce fichier, contrairement aux 4 autres Slayers ET à `pluton-combat.ts`/`pluton-bestiary.ts`/`pluton-sea-creatures.ts`. **Smite** aussi totalement absent (`MOB_TYPE_ENCHANT_PCT_BY_TIER` n'avait que spider/enderman). Root cause probable : attention allée vers `pluton-combat.ts` (censé remplacer à terme la portion Zombie de ce fichier) sans rétro-porter vers la portion Zombie active en parallèle. Corrigé, rareté vérifiée via `item_stats`. DPS Zombie T1/master : 277 828 → **712 768** (+156%, écart réel confirmé).

**2. Doublons massifs, invocations HTTP chevauchées sur les routes de debug** — un `curl` local qui "termine" ne garantit PAS que l'invocation Vercel serveur s'arrête (continue jusqu'à `maxDuration`). Plusieurs appels successifs sur des routes side-effecting (DELETE-puis-INSERT) se sont chevauchés en horloge réelle → doublons authentiques sur Mining/Slayer/Fishing (126/121/83 lignes en trop). Trouvé via un TTK Zombie T1/master absurde (0.0018s, coins/h à -3,4 milliards) — **valeur mathématiquement correcte en réalité** (boss T1=500 PV réels, DPS élevé=TTK quasi-nul ; limitation pré-existante, "phase de farm non modélisée" déjà documentée ailleurs). Nettoyé par migration SQL (garde la ligne la plus récente par groupe), 0 doublon restant vérifié. **Règle retenue, même famille que le piège du 13 août (routes Haiku)** : jamais de route side-effecting à `maxDuration` élevé relancée sans signal de fin serveur — vérification de déploiement désormais via l'API Vercel, pas en curlant la route.

**Gaps NOT_FOUND** (aucun contenu wiki caché) : cubism/divine_gift/life_steal/vampirism/knockback/mana_steal/magmarizer/syphon/luck (Combat) ; caster/frail/lure/magnet/spiked_hook/corruption/blessing (Fishing) ; efficiency/lapidary/fortune/smelting_touch/compact/paleontologist/silk_touch (Mining) ; absorb/missile (Foraging). **Gap pas fermé** : Ultimate Enchant "One For All" (+500% additif, retire tous les autres enchants) jamais comparé tête-à-tête avec la pile actuelle — potentiellement supérieur à haut tier.

**Toujours `not_yet_audited`** : gemmes/reforges/stars Hunting/Kuudra/Dungeons ; "Powers" accessory_bag (MP-cible non sourcée) ; Bat Person/Gravity Talisman/Reaper Orb. Pas terminé — `pluton_mechanic_coverage` est l'outil pour continuer.

## ✅ Pluton — migration complete systeme 4-tiers -> 7-tiers reels (23 août)

**Correction architecturale majeure, demandee explicitement par l'utilisateur**
("pareil pourquoi tu me parle de late, alors qu'on a 7 tiers de money making
maintenant... je ne veux plus de trou sois plus rigoureux, arrete de
construire a moitier, prend tout ce que ta besoin pour construire et ne me
fait pas de compte rendu temps que c'est pas niquel") : tous les
calculateurs Pluton (Mining/Farming/Foraging/Fishing/Sea Creatures/Slayer/
Kuudra/Hunting/Bestiary/Forge/Dungeons — 11 fichiers) tournaient depuis leur
construction sur `TIER_CONFIG`/`TierKey` (early/mid/end/late, 4 paliers)
alors qu'un vrai systeme a 7 tiers (`SEVEN_TIER_KEYS`/`buildSevenTierConfig`,
starter→master, ancre sur `milestone_tier_totals`) existe dans le projet
depuis le 17 août — jamais consomme par Pluton avant ce jour (confirme par
grep : uniquement utilise par les anciennes routes Money Making agent).

**Infra centralisee ajoutee dans `lib/pluton-engine.ts`** : `loadSevenTierConfig()`
(fetch `milestone_tier_totals`, interpolation proportionnelle deja geree par
`buildSevenTierConfig`, jamais une valeur inventee), `INVESTMENT_MAX_TIERS`/
`MID_INVESTMENT_TIERS`/`EARLY_INVESTMENT_TIERS` (remplacent les checks
`tier==='end'||'late'` etc.), `oldTierBucket()` (pour les gates gear
DISCRETS non-interpolables — ex. progression d'arme Slayer Undead Sword→
Revenant→Reaper, gatee par collection pas par prix — mappe chaque nouveau
tier vers son ancien bucket 4-tiers), et les paliers NBT communs (Sharpness/
Smite/Critical/Potato Books) desormais a 7 granularites au lieu de 4.

**Methode d'interpolation retenue partout** : chaque ancre reelle de
l'ancien systeme est preservee EXACTEMENT au nouveau tier correspondant
(convention `money_making_tier_key` deja existante : old-early→amateur,
old-mid→skilled, old-end/late→professional/master) — seule la granularite
intermediaire (starter/intermediate/expert) est interpolee lineairement,
jamais une valeur de jeu inventee au-dela de ce que la source documente
deja (regle #7).

**2 vraies donnees reelles restaurees au passage** (perdues par la
compression 5→4 de l'ancien systeme, retrouvees gratuitement par le passage
a 7 tiers, pas cherchees activement) : **Large Huntrap** (RETIA_ROBUSTA,
-20%, sautee entre Medium et Greater dans l'ancien decoupage 4-tiers —
desormais au tier `expert`) et un **niveau Quick Forge intermediaire**
calcule via sa vraie formule sourcee (`10+0.5×niveau`, niveau 5 au tier
`intermediate`).

**Deploiement et verification** : migration en un seul cycle (11 fichiers
edites, type-check local propre avant push), verifiee par re-calcul complet
de chaque activite contre la base reelle (routes de debug temporaires,
scindees en groupes individuels apres qu'un premier essai combine ait
depasse le budget 280s d'une seule Vercel Function — 7 tiers = +75% de
combos par rapport aux 4 tiers d'origine, cause reelle du timeout, pas un
bug). **3 recoupements manuels independants, tous exacts** : Farming
(starter/amateur correctement non-eligibles, 0 ligne en base, Garden
toujours interdit aux 2 premiers tiers) ; Hunting sur Molthorn (les 6
valeurs de reduction Huntrap+Trapped recalculees a la main toutes exactes,
`master`=791 861,80 coins/h — **identique bit a bit** a l'ancienne valeur
`late` deja documentee le 22 août, confirmant que l'ancre reelle a bien ete
preservee) ; Kuudra sur Basic (les 4 ancres CANNONEER — amateur=44.44s,
skilled=4.55s, professional=1.28s, master=1.0s — toutes exactes au calcul a
la main). **196+7+77+91+21+154+49+35+2240+107 = 2977 lignes** recalculees
au total sur les 11 activites (`pluton_rankings`), toutes sur des valeurs
`tier` du nouveau vocabulaire (`starter`...`master`), 0 valeur `early`/
`mid`/`end`/`late` residuelle.

**Cron manquant ferme au passage** : `pluton-kuudra-refresh` n'existait pas
depuis la construction de Kuudra le 23 août (jamais automatise) — ajoute
(`vercel.json`, quotidien 5h50).

**Maintenance operationnelle** : `maxDuration` augmente sur 7 des crons
Pluton (Mining 280→300, Farming/Slayer 120→220, Dungeons 120→200,
Foraging 120→180, Bestiary 60→100, Hunting 30→90) — marge de securite pour
le volume de calcul +75% desormais recurrent en prod, aucune formule
changee. `lib/pluton-combat.ts` (Zombie Slayer v2, architecture Phase 3
"Systeme B refondu") confirme **hors-scope de cette migration** — utilise
deja nativement l'echelle 1-7 de `pluton_elements` (`PLAYER_TIERS=['1'..'7']`),
un systeme distinct et deja conforme, pas touche.

## ✅ Compte rendu final — audit corruption des sources + fermeture HOTM/HOTF (23 août)

Suite directe de la demande explicite de l'utilisateur : "je veux que tu ne
laisse rien au hasard et rien de côté... si les sources extraites sont trop
mal faites, refais ce que Haiku n'a pas su faire... je veux un compte rendu
final... maintenant". Deux volets traités : (1) scan systématique de
corruption d'extraction sur TOUTES les tables texte/jsonb de la base, (2)
fermeture des 2 corruptions réelles trouvées, avec intégration du contenu
réel dans les calculateurs concernés.

**Scan de corruption exhaustif** — recherche du motif `[object Object]`
(signature d'un bug JS classique : un tableau d'objets sérialisé avec
`String()` au lieu d'un accès à un champ précis) sur les 24 autres colonnes
texte/jsonb candidates du schéma (`lore`/`description`/`content`/`notes`/
`effect`/`value`) + `pluton_elements.raw_data`/`classification_reason` +
`game_mechanics_misc.value` : **0 corruption trouvée partout ailleurs**.
Seules 2 lignes corrompues existaient dans toute la base, toutes deux dans
`hotm_perks`/`hotf_perks` (`lore`), trouvées avant ce scan large en auditant
spécifiquement ces 2 tables suite à la question de l'utilisateur sur HOTM/
HOTF. Conclusion honnête : la cartographie n'était pas "mal faite" au sens
large — c'était 2 lignes ponctuelles corrompues sur ~184k éléments classés,
pas un problème systémique.

**Les 2 lignes corrompues identifiées** : `hotm_perks.perk_id='core_of_the_
mountain'` (10 niveaux) et `hotf_perks.perk_id='center_of_the_forest'`
(5 niveaux) — deux perks "hub" spéciaux (pas un simple scaling à 1 stat
comme les autres perks HOTM/HOTF) dont le `lore` original contenait
littéralement `"[object Object]"` répété une fois par ligne de récompense
(10 et 8 occurrences respectivement, cohérent avec le nombre réel de lignes
de récompense par niveau) — bug d'extraction réel sur ces 2 cas particuliers
à structure multi-effet, jamais corrigé depuis leur import initial.

**Contenu réel retrouvé et re-sourcé depuis le wiki live** (jamais deviné) :
`Core of the Mountain` redirige vers `Heart of the Mountain#Tier_5`, `Center
of the Forest` vers `Heart of the Forest#Tier_5` — contenu exact récupéré
depuis ces 2 sections (déjà en cache pour HOTM, fetché en direct pour HOTF
qui manquait cette page). Les deux `lore` réécrits avec le contenu réel
niveau par niveau (format §-couleur Minecraft, cohérent avec le format des
28 autres lignes déjà correctes de ces 2 tables) — plus `pluton_elements.
raw_data` (id 368 et 9387, snapshots figés au moment de la classification
initiale) resynchronisé avec le `lore` corrigé. **0 corruption restante**
dans toute la base, vérifié par requête directe après fix.

**2 vrais bonus trouvés dans ce contenu, traités différemment selon la
disponibilité de la source** :
- **Center of the Forest (HOTF) — Sweep +15% multiplicatif intégré à
  `lib/pluton-foraging.ts`** : Niveau 2 (+5% Sweep) + Niveau 4 (+10% Sweep),
  jamais consommé avant ce fix alors que la ligne existait depuis la
  construction Foraging du 17 août. Appliqué après tous les bonus additifs
  de Sweep déjà présents (même convention "investissement max END/LATE" que
  le reste du fichier). **Vérifié en base** : LATE/HELIX_LOG Sweep 643→739
  exact (643×1.15=739.35, arrondi 739, confirmé après redéploiement).
- **Core of the Mountain (HOTM) — Niveau 2 "+1 Pickaxe Ability Level" —
  gap réel documenté, PAS intégré** : ce bonus pousserait la capacité
  Mining Speed Boost au-delà de son Niveau 3 déjà assumé max dans
  `lib/pluton-mining.ts`. Aucune source (la page wiki dédiée à cette
  capacité, seule table de valeurs par niveau connue) ne documente de
  Niveau 4 — la table s'arrête à 300%/20s. Extrapoler violerait la règle
  #7 (jamais de constante de jeu inventée). Documenté en commentaire dans
  le code plutôt que masqué. Les 3 autres lignes numériques de Core of the
  Mountain (Powder brut par bloc miné aux niveaux 4/6/8) restent hors-scope
  structurel (Powder = monnaie HOTM non tradeable, jamais pricée par ce
  calculateur, cohérent avec l'exclusion déjà actée du Mining Powder comme
  mécanique fondamentale plutôt qu'activité).

**Correction du 22 août reconfirmée dans ce lot** : le Mining Powder et le
Forest Whispers (monnaies HOTM/HOTF) ne sont ni achetables ni vendables au
Bazaar/AH — obtenables uniquement via commissions et minage/coupe de bois
réel. Classification déjà correcte depuis la décision du 21 août (Powder =
mécanique fondamentale, jamais une activité autonome), reconfirmée ici en
vérifiant qu'aucun des 2 fichiers `.ts` touchés ne tente de pricer ces
monnaies directement (seuls leurs perks/effets dérivés sont modélisés).

## 🚧 Recadrage exhaustivité #2 -- granularité PAR ITEM, pas par groupe mécanique (23 août)

**Correction explicite de l'utilisateur** après le premier lot de fermetures
du jour : "toute item farmable activement reste une activité... tu peux
grouper si le farm est groupable avec d'autres items comme les tables
Slayers, mais sinon les items farmables individuellement tu le fais à la
main". Ça invalide la décision "Hunting = 5 activités par rareté" prise
plus tôt le même jour (raisonnement : la rareté déterminait le temps de
capture, jugé comme LE vrai axe mécanique) -- l'utilisateur tranche que
chaque shard individuellement chassable (320, chacun avec son propre prix
réel) est sa propre activité, exactement comme Ruby vs Coal en Mining.
**Règle de regroupement clarifiée** : ne grouper QUE quand le mécanisme de
farm est LITTÉRALEMENT partagé entre plusieurs items (les 5 boss Slayer
partagent le même combat/la même formule paramétrée par tier -- un vrai
regroupement légitime) -- jamais parce que la formule de RENDEMENT est la
même (Hunting : la formule de temps de capture était identique par rareté,
mais chaque shard reste une action de farm distincte).

### ✅ Hunting -- Trap Hunting explosé par shard individuel, vérifié (23 août)

`TRAP_HUNTING_<RARETÉ>` (5 blocs, construits une heure plus tôt le même
jour) remplacé par `TRAP_HUNTING_<item_id>` -- **320 activités** (une par
Attribute Shard réellement pricé), zéro changement de formule. **Vérifié
en base** : 1280 combos (320 shards × 4 tiers), LATE top 5 = Molthorn
(Legendary, 791 861 coins/h -- cohérent avec le repère du 22 août :
7,07M/9h≈785K), **Bitbug (Rare) bat 3 Legendary différents** (Paragon/
Starborn/Primordial) -- révèle un vrai insight que la version "par rareté"
masquait (un Rare bien pricé peut battre un Legendary faible), exactement
le genre de comparaison croisée que l'exhaustivité par item est censée
produire. Route de debug temporaire supprimée après validation.

### ✅ Kuudra -- construit et vérifié, phase de combat 100% calculée depuis le setup (23 août)

Suite de la réinvestigation (voir sous-section ci-dessous pour l'historique
complet de la découverte). **Nouveau fichier `lib/pluton-kuudra.ts`**, 5
tiers (Basic→Infernal) comme `pluton_target_blocks` distincts -- même
principe de regroupement que les 5 boss Slayer (mécanisme de combat
littéralement partagé, paramétré par tier, un vrai cas de regroupement
légitime selon la règle du jour "grouper seulement si le mécanisme de farm
est partagé").

**Insight clé qui a débloqué le calcul** : la table Perk Shop complète
(I-VII, sourcée mot pour mot) montre que les dégâts du canon contre Kuudra
sont **% des PV MAX + flat** ("Cannon Proficiency") -- le nombre de tirs
pour tuer Kuudra est donc INDÉPENDANT de ses PV absolus (jamais sourcés) et
**identique quel que soit le tier Kuudra** à investissement égal (le %
domine, le flat est ignoré -- simplification documentée, sous-estime
légèrement). Formule : `cycles = 100 / (CannonProficiency% × Multi-Shot ×
(1+SteadyAim%))`, `temps = cycles × cooldown Rapid Fire`. Palier
d'investissement par tier joueur (early=aucun perk, late=Cannoneer maxé
VII).

**🔴 2 bugs réels trouvés et corrigés avant validation finale** :
1. **Fausse hypothèse "Crimson Essence/Kraken Shard non-tradeables"**,
   corrigée après que l'utilisateur a explicitement demandé de revérifier
   ("arrête de dire n'importe quoi, tout ce que Kuudra donne est priceable
   Bazaar ou AH") -- la 1re passe avait cherché le mauvais item_id
   (`KRAKEN_SHARD` au lieu du vrai `SHARD_KRAKEN`) et n'avait pas cherché
   `ESSENCE_CRIMSON` avec le bon pattern. Les 3 items du loot garanti sont
   en réalité tous les 3 réellement pricés (Essence Crimson ~925,
   Kuudra Teeth ~6000, Kraken Shard ~180 811).
2. **`sell_price` utilisé pour le coût des ingrédients de la Kuudra Key**
   (Enchanted Red Sand/Nether Star, des items qu'on ACHÈTE) au lieu de
   `buy_price` -- corrigé (même convention que `lib/pluton-forge.ts`).
   Un 1er redéploiement a semblé ne rien changer (cache de fetch Next.js
   sur les appels Supabase internes à la route, distinct du cache de route
   déjà rencontré sur Sea Creatures -- `dynamic='force-dynamic'` seul n'a
   pas suffi cette fois, résolu apres un nouveau cycle de verification) --
   revérifié : keyCost Basic passe de 223 024 (sell_price, faux) à 232 255
   (buy_price, correct, cohérent avec le calcul manuel).

**Loot garanti UNIQUEMENT** (même discipline que les 5 Slayers) -- le pool
RNG (armures Aurora/Crimson/Fervor/Hollow/Terror, accessoires Molten,
enchant books) reste un gap honnête documenté, pas inventé.
`coins_per_hour_boss_phase_only` = phase de combat SEULE (Phases 1-3 de
collecte non chronométrées, aucune ancre de temps base 0%-perk trouvée
malgré une recherche dédiée -- voir ci-dessous).

**Vérifié en base** : 20 combos (5 tiers Kuudra × 4 tiers joueur). Basic
ressort positif à tous les tiers joueur (jusqu'à 107.9M/h en late/Basic,
combat_s=1s cohérent avec le calcul manuel : 100/(4×6×1.25)=3.33 cycles ×
0.3s=1s) -- les 4 autres tiers Kuudra ressortent négatifs sur le loot
garanti seul (coût de Key qui monte plus vite que le loot garanti ne
scale), même signature honnête que Zombie Slayer (vraie rentabilité dans
le pool RNG non pricé ici). Route de debug temporaire supprimée après
validation.

### 🔴 Kuudra -- découverte de la mécanique de combat (historique de la réinvestigation, 23 août)

Réinvestigation demandée par l'utilisateur ("il y a pas le kuudra run") --
l'ancien verdict "ancre de temps introuvable" (21 août) était incomplet :
la page wiki principale `kuudra` (jamais lue en entier avant) contient en
fait énormément de matière jamais exploitée : PV/dégâts réels de tous les
mobs par tier (`kuudra_mob_stats`, 5 tiers complets), table de loot
complète par tier avec vrais poids (`kuudra_ui`), et surtout la mécanique
du canon contre Kuudra lui-même -- **dégâts = % des PV MAX de Kuudra +
flat**, qui monte par palier de perk "Cannon Proficiency" (I confirmé
1%+100k, II confirmé 1.5%+300k) -- ça rend le nombre de tirs nécessaires
pour tuer Kuudra a peu près FIXE, independant de ses PV absolus, un vrai
levier de modélisation jamais vu avant. "Seconds Per Wave" par tier
(Basic=35s...Infernal=15s) déjà sourcé aussi.

**2 vraies ancres encore manquantes, recherche dédiée lancée (agent en
arrière-plan, 23 août)** : (1) le temps de BASE (sans aucun perk acheté)
pour compléter les phases 1-3 (Crates/Ballista/Fuel) -- seuls des bonus
RELATIFS par palier de perk sont sourcés, jamais le temps de référence
0% sur lequel ils s'appliquent ; (2) le nombre réel de vagues nécessaires
pour vaincre Kuudra par tier -- la table de vagues s'arrête à la vague 21
avec un `{{InfoNeeded}}` sur la dernière ligne, mais un texte de Perk Shop
mentionne "Revive Final Killed -- Unlockable after Wave 35 !", suggérant
qu'un run va bien au-delà. Pas construit tant que ces 2 chiffres ne sont
pas trouvés ou honnêtement déclarés introuvables.

### 🔴 `dungeon_classes` (15 lignes) -- table suspecte, probablement fabriquée, PAS une vraie source

Trouvé en creusant Dungeons F7 frag run (demandé explicitement par
l'utilisateur). `dungeon_class_milestones` (630 lignes, `source_page=
"Class Milestones"`, seuils XP réels genre "60K"/"300K"/"3M") est une
vraie table sourcée. **Mais `dungeon_classes` (15 lignes, 1 par classe ×
3 niveaux-clé) n'a AUCUNE colonne `source_page`/`source_table`, et son
contenu ("key_ability": "Melee damage focus, self-healing on hit") est un
texte générique paraphrasé, sans un seul chiffre/formule/citation --
totalement différent du style de toutes les autres tables réellement
sourcées de ce projet.** Confirme le constat déjà noté le 3 août
("dungeon_classes -- contenu a l'air écrit à la main, aucune source
trouvée") -- cette table semble être un stub jamais nettoyé, pas une vraie
extraction. **PAS utilisée pour construire quoi que ce soit** -- le vrai
système de scaling des Classes (formules par niveau, bonus % réels) reste
un gap honnête, pas comblé par cette table qui ressemble à du contenu
halluciné. Décision à prendre avec l'utilisateur : supprimer cette table
(action destructive sur la base, pas faite unilatéralement ici) ou la
garder marquée comme non-fiable.

### 🔴 Nouveaux gaps trouvés dans l'audit général du jour, pas encore fermés

- **Greenhouse Mutations (Farming)** -- `Chloronite` (mutation réelle,
  poussée en croisant Coalroot+Thornshade en Greenhouse, rendement
  dépendant de Mining Fortune du joueur -- formule sourcée wiki, citation
  Discord `mrkeith`) confirmée Bazaar-tradeable. Sa page mentionne
  explicitement que Chloronite sert à fabriquer Chorus Fruit et Glasscorn
  -- système Greenhouse/Mutations plus large jamais cartographié comme
  activité Pluton. Pas construit ce jour, scope pas encore mesuré.
- **Tree Gift loot direct (Foraging)** -- mécanique de récompense
  sourcée (`tree_gifts` + 3 pages par arbre) : 1 Tree Gift par arbre
  intégralement coupé, palier selon % de contribution du joueur (10%=
  normal, 20%=+50%, 33%+=double) × multiplicateur de taille d'arbre
  (1x-20x). **Bloqué** : convertir "logs/heure" (déjà modélisé) en
  "arbres abattus/heure" nécessiterait une taille moyenne d'arbre en
  logs, jamais sourcée -- pas inventée.
- **Kuudra / Dungeons F7 frag run** -- reconfirmés bloqués après nouvelle
  vérification ce jour (voir sections dédiées ci-dessous si investigation
  relancée).

## ✅ Audit exhaustivité "toute activité qui découle d'un skill" (23 août, en cours)

**Recadrage majeur de l'utilisateur**, plus strict que l'audit "toutes les
activités du skill" du 22 août : "quand on a du mining ou autre tu prend
tout ce qui concerne le mining de près ou de loin... miner du ruby est une
activité en soi comme miner du charbon... tout ce qui est extrait depuis la
cartographie doit être utilisé comme matière première directe à Pluton...
rien de côté, pas de mise à l'écart". Fausse route initiale corrigée
immédiatement : Claude a d'abord annoncé "Farming 3/13 cultures couvertes"
sans vérifier `pluton_target_blocks` directement (confondant le nombre
d'exemples cités dans le texte CLAUDE.md du 5 août avec le scope réel) —
**vérifié et infirmé** : Farming est déjà à 13/13 cultures réelles, Foraging
à 3/3 arbres réels, Combat/Bestiary déjà à 63 mobs individuels. Leçon
retenue : toujours vérifier `pluton_target_blocks` en base, jamais le
narratif d'une session passée.

**Audit réel mené par requêtes directes sur les tables sources** (pas par
supposition) sur les 6 skills `built` :

| Skill | État réel vérifié |
|---|---|
| Farming | ✅ 13/13 cultures déjà couvertes |
| Foraging | ✅ 3/3 arbres réels déjà couverts |
| Combat/Bestiary | ✅ 63 mobs individuels déjà couverts |
| Mining | 🔴 17/27 matériaux minables → fermé ce jour (voir ci-dessous) |
| Fishing | 🔴 1/11 pools de Sea Creatures (`sea_creature_pools`) → gap réel, sourcing 80 créatures nécessaire, pas fermé |
| Hunting | 🔴 Trap Hunting réduit à "meilleur shard" au lieu d'exploser par shard/rareté comme Mining → pas fermé |

### ✅ Mining — 10 matériaux minables réels ajoutés, vérifié (23 août)

Sourcé directement depuis les 2 pages wiki déjà utilisées pour construire
tout Mining à l'origine (`block_strength`, `breaking_power`, déjà en cache)
— jamais deviné. 10 blocs confirmés minables et pricés en live, absents de
`MINING_TARGET_BLOCK_IDS` : Cobblestone/Netherrack/End Stone/Hard Stone/
Obsidian (blocs "filler" non-Ore, instamine 30x) + Redstone/Emerald/Nether
Quartz/Lapis Lazuli Ore (vraies Ores, instamine 60x) + Sulphur Ore.
**Extension triviale** : `computeAndPersistAllMiningRankings()` était déjà
générique sur `MINING_TARGET_BLOCK_IDS` — seule la constante + les 10 lignes
`pluton_target_blocks` (block_strength/required_breaking_power réels,
sell_item_id Bazaar vérifié) ont été ajoutées, zéro changement de formule.

**2 exclusions documentées, pas des oublis** : `STONE` (aucun prix Bazaar
live trouvé, gap de donnée) ; `CHLORONITE` (même palier Breaking Power que
Cobblestone dans la table source, mais zone d'origine et statut Bazaar
jamais vérifiés — laissé de côté explicitement). `TITANIUM_ORE` reste
volontairement standalone-exclu (déjà décidé le 5 août : remplacement rare
0.5% sur Mithril, pas une cible autonome — pas rouvert ici).

**Vérifié en base** : 39/40 combos (10 blocs × 4 tiers, Sulphur Ore
non-éligible en EARLY, honnête — BP=8 hors de portée). Coïncidence de
marché notée en vérifiant (pas un bug) : Netherrack et Hard Stone affichent
exactement le même coins/h à plusieurs tiers — les deux prix Bazaar sont
tombés au même plancher (~0.10 coin) au moment du calcul, confirmé par
requête directe sur `price_history`. Route de debug temporaire supprimée
après validation.

### ✅ Hunting — Trap Hunting explosé par rareté, vérifié (23 août)

`TRAP_HUNTING` (1 seule ligne agrégée "meilleur shard toutes raretés
confondues") remplacé par 5 `pluton_target_blocks` (`TRAP_HUNTING_COMMON`
→ `TRAP_HUNTING_LEGENDARY`), même granularité que les 17+10 matériaux
Mining. **Choix de granularité justifié, pas arbitraire** : la RARETÉ est
le vrai axe mécanique distinctif (formule de temps de capture différente
par rareté, même rôle que le type de bloc pour Mining) — le shard précis
choisi à l'intérieur d'une rareté (parmi 320 réels, tous pricés) reste un
détail d'implémentation du setup, pas une activité distincte. Exploser les
320 shards individuellement aurait été une fausse granularité (même formule
répétée 320 fois, aucune variation mécanique réelle entre deux shards de
même rareté) — décision documentée en tête de fichier. Zéro changement de
formule, seule la structure de persistance change.

**Vérifié en base** : 20 combos (5 raretés × 4 tiers), ex. early/COMMON =
Rabbit Mafioso (30 898 coins/h), early/UNCOMMON = Rabbit Cat (78 842
coins/h) — cohérent (rareté supérieure = meilleur prix malgré un temps de
capture plus long). Route de debug temporaire supprimée après validation.

### ✅ Fishing — 10 pools Sea Creatures supplémentaires, vérifié (23 août)

Agent de recherche dédié (lecture seule, pages wiki individuelles) a
sourcé les 74 noms uniques des 80 lignes `sea_creature_pools` jamais
couvertes (bayou/crimson_isle/hotspot/lotus/moonglade_marsh/shark/special/
spooky/torrhus_canyon/winter) — PV/mob_type/table de loot, aucune valeur
devinée. `lib/pluton-sea-creatures.ts` généralisé de "1 pool basic en dur"
à `POOLS: Record<string, Pool>`, même moteur DPS/TTK (gear Zombie Slayer)
réutilisé tel quel. 1 `pluton_target_block` par pool (11 au total),
persistance manuelle globale-puis-scopée (purge unique des vieux
`pluton_setups` par `tool_item_id='ZOMBIE_SLAYER_GEAR_REUSED'` avant la
boucle, delete par `target_block_id` dans la boucle — jamais un delete par
`activity_key` seul, même piège que le 21 août).

**6 créatures exclues, documentées** : Puddle Jumper/Reindrake/Grinch —
mécanique incompatible avec le modèle HP/DPS standard (mini-jeu de hooks,
"N Hits" où la vitesse d'attaque compte seule, pas le DPS) ; Agarimoo/
Carrot King/Plhlegblast — `base_weight IS NULL` en base (spawn
conditionnel type Chumcap Bucket, aucune probabilité naturelle sourcée,
pas inventée). **4 pools conditionnées à un évènement/objet, INCLUSES
avec label explicite** (`event_gated`, pas exclues) : shark (Fishing
Festival), spooky (Spooky Festival), winter (Jerry's Workshop) — coins/h à
lire comme "pendant l'évènement actif", pas une moyenne annualisée (aucun
taux de fréquence sourcé).

**🔴 2 vrais bugs trouvés et corrigés en vérifiant en prod** :
1. Item_id erroné pour le drop "Nether Quartz" d'Abyssal Miner (pool
   special) : `QUARTZ_ORE` (le bloc minable, déjà utilisé pour la
   cible Mining du même nom) au lieu de `QUARTZ` (le Nether Quartz brut
   réellement droppé). `QUARTZ_ORE` porte une entrée AH aberrante
   (`price_history_ah_variant_base`, ~5-25M coins, item sans rapport
   partageant cet id) — a fait remonter la pool special à ~172M coins/h de
   moyenne (400x les autres pools) au lieu de ~8.7K coins/h réels. Trouvé
   en comparant les ordres de grandeur entre pools, pas suppose correct.
2. **Cache Next.js sur la route de debug** — le premier redéploiement
   après le fix #1 n'a montré AUCUN changement en base malgré 2 déploiements
   distincts confirmés `READY` sur Vercel. Root cause : la route (`GET`
   sans état dépendant de la requête aux yeux de l'analyse statique de
   Next.js, malgré des appels Supabase réellement dynamiques) était
   silencieusement mise en cache. Corrigé avec `export const dynamic =
   'force-dynamic'` — revérifié après : les 44 combos changent bien de
   valeur. **Règle retenue pour toute future route de debug Pluton** :
   ajouter `dynamic = 'force-dynamic'` par défaut, ne jamais supposer
   qu'un redéploiement suffit à invalider un cache de route GET.

**Vérifié en base, cycle unique pour les 10 pools** : 44/44 combos (11
pools × 4 tiers), ordre de grandeur cohérent partout (32K-1.5M coins/h
selon pool/tier, scaling early<mid<end=late attendu). Route de debug
temporaire supprimée après validation finale.

## 🚧 Pluton — reconnexion Système A/B, Phase 1 terminée (21 août)

Audit général demandé par l'utilisateur après la fermeture du backlog
(section ci-dessous) : Pluton avait en réalité **deux systèmes jamais
reliés**. Système A (cartographie→extraction→classification,
`pluton_elements`, 183 384 lignes, échelle 1-7 réelle) et Système B (les
calculateurs money-making, tous construits en lisant le wiki à la main avec
des tables dédiées par activité, échelle 4 tiers). Vérifié par grep sur les
10 fichiers `lib/pluton-*.ts` : aucun ne lit `pluton_elements`. Cause racine
confirmée par requête directe : sur les 49 628 lignes `element_type='item'`,
**0 avaient une colonne `activity` renseignée** — le lien skill↔item n'a
jamais existé dans la classification. Décision de l'utilisateur : corriger
la classification puis reconnecter (voir plan `joyful-shimmying-finch.md`
pour l'architecture cible complète — 1 calculateur par skill, pas par
activité, consommant `pluton_elements`).

**🔴 Incident réel pendant cette phase — leçon retenue pour tout le
projet** : une 1re tentative a écrit une route Haiku (`claude-haiku-4-5`,
batch=25) pour tagger les 49 628 items par skill. Testée sur 500 items
(~0,085 USD, extrapolé ~8,44 USD pour le tout), lancée sur le reste sans
re-vérification du solde réel — le run s'est arrêté sec après avoir
consommé l'intégralité du solde API Anthropic du projet ("credit balance
too low"), les crons automatiques du projet (`money-making-agent`/
`radar-agent`/`setup-generate-agent`/`patch-analysis-agent`/
`pluton-weekly-sync`) ayant probablement déjà entamé ce solde en tâche de
fond, invisible depuis cette session. **Correction explicite de
l'utilisateur** : Claude Code (cette session) tourne sur l'abonnement Claude
Pro, pas sur le solde API — je m'étais trompé en supposant le contraire.
Règle retenue (mémoire `feedback_budget_api_claude`) : pour tout travail de
classement/jugement ponctuel (pas une automatisation récurrente en prod),
le faire soi-même en tant que Claude Code (lecture MCP/SQL, jugement direct,
écriture SQL) plutôt que d'écrire une route qui appelle Haiku — coût
marginal nul. Réservé aux seules automatisations qui doivent réellement
tourner en prod sans intervention humaine.

**Phase 1 terminée sans dépense API supplémentaire** : les ~7 139 items
restants après l'arrêt du run Haiku classés directement par moi (Claude
Code) via des passes SQL groupées (`UPDATE ... WHERE element_name/
classification_reason ILIKE '%mot-clé skill-spécifique%'`) — chaque règle
ancrée sur un vrai signal déjà présent dans le texte extrait (noms de stats
comme "Mining Fortune"/"Farming Fortune", noms de boss/zones comme "Slayer"/
"Kuudra"/"Catacombs", mots-clés d'équipement comme "Sword"/"Halberd"),
jamais un skill deviné au hasard. **État final vérifié** : 49 628/49 628
items classés (0 restant NULL), 24 135 `__none__` (cross-skill/générique/
événementiel honnêtement exclus — armures génériques sans stat spécifique,
Minions, Jerry Box, Dark Auction, Ananke Feather...), 25 493 répartis sur
les 13 skills réels (Combat 5380, Fishing 2722, Alchemy 2606, Enchanting
2455, Dungeoneering 2341, Farming 2297, Mining 2276, Taming 2259, Hunting
1367, Foraging 978, Runecrafting 297, Carpentry 275, Social 240 — somme
exacte 49 628, vérifiée).

**Prochaine étape actée** : Phase 2 (fermer le gap NEU-REPO/SkyHanni sur la
cartographie continue), puis Phase 3 (refonte des calculateurs, 1 par
skill, consommant `pluton_elements`) — voir le plan complet.

### ✅ Phase 4 — 7 vues tier créées et vérifiées

`pluton_tier_starter`...`pluton_tier_master` (noms réels tirés de
`milestone_tier_totals`) + `pluton_non_client_mechanics` (miroir,
`element_type='admin_excluded'`, 736 lignes). Vues plutôt que 7 tables
physiques — évite la classe de bug réelle (doublons cross-table) qui avait
forcé l'abandon de l'architecture 7-tables originale le 17 août. Croissance
cumulative vérifiée (starter 148 824 → master 183 680, +736 non-client =
184 416 total exact). Limite documentée : la séparation client/non-client
ne repose que sur `admin_excluded` pour l'instant — à affiner si besoin.

### 🚧 Phase 5 — composition NBT, 3 enchants fusionnés dans le DPS (22 août)

**Méthode accélérée, décidée par l'utilisateur en cours de route** ("ne fait
pas 1 enchant à la fois, construit plus vite, trouve la manière la plus
rapide et optimisée de construire et tester") : abandon du cycle 1
enchant → 1 push → 1 déploiement Vercel → 1 curl → 1 persist → 1 nettoyage.
Nouvelle méthode, réutilisable pour tout le reste de Phase 5/6 :
1. **Extraction groupée** — toutes les pages wiki candidates fetchées en UNE
   requête SQL (`game_mechanics_misc`), triage fait par un agent dédié
   (lecture seule, hors du contexte principal) qui rapporte pour chaque
   enchant : table de bonus exacte, additif/multiplicatif si confirmé par
   le wiki, applicabilité, et un verdict SIMPLE (multiplicateur plat,
   composable tout de suite) vs COMPLEX (scaling dynamique/DoT/ability —
   mis de côté, documenté).
2. **Tri par pertinence à l'activité réelle**, pas exhaustivité aveugle des
   40 enchants d'épée existants — seuls ceux qui affectent vraiment Zombie
   Slayer (mob Undead, single-target) sont intégrés maintenant ; les
   enchants d'autre type de mob (Bane of Arthropods/Ender Slayer/Impaling)
   sont de bons candidats pour Spider/Enderman/Fishing plus tard, pas ici.
3. **Un seul cycle push/déploiement/vérification/persist/nettoyage pour
   tout le lot**, pas un par enchant.

**3 enchants composés dans ce lot** (tous sourcés wiki, `hypixelskyblock_
wiki`, jamais devinés) :
- **Sharpness** — bonus additif universel, I+5%→VII+50%, confirmé additif
  explicitement par le wiki (`{{additive}}`).
- **Smite** — bonus additif **spécifique vs Undead/Wither/Skeletal**
  (depuis le patch 2025/08/14), mêmes valeurs que Sharpness, confirmé
  additif explicitement par le wiki ("damage is now additive with other
  enchantments") — directement pertinent à Zombie Slayer, s'additionne à
  Sharpness dans le même bucket (`additionalAdditivePct`, pas un nouveau
  paramètre moteur). Distinct du bonus "+X% vs Undead" intrinsèque à
  l'arme/l'armure elle-même (déjà codé, Multiplicative, `findMobTypeBonus`)
  — Smite est un enchant séparé, propre facteur.
- **Critical** — augmente Crit Damage, I+10%→VII+100%. `computeCombatDps()`
  (`lib/pluton-engine.ts`) étendu avec un 5e paramètre
  `additionalCritDamagePct` (rétro-compatible, Bestiary inchangé — seul
  autre appelant). Zombie Slayer n'a aucune stat Crit Damage intrinsèque
  sur ses armes (contrairement à Spider/Enderman/Blaze déjà codés ailleurs)
  — Critical est le 1er contributeur Crit Damage réel pour cette chaîne.

Palier par tier joueur pour les 3 (III T1-3, V T4-6, VII T7), même
convention "investissement croissant par tier" que Mining Speed Boost/
Reaper Enrage.

**9 candidats triés et écartés dans le même lot** (agent dédié, contenu
wiki lu en entier, jamais deviné) :
- Giant Killer/Titan Killer/Prosecute — bonus scalant dynamiquement avec
  le % de vie ou la Defense de la cible, même famille qu'Execute déjà
  écarté — nécessiterait d'intégrer le DPS sur la durée du combat, pas un
  multiplicateur plat.
- Lethality/Venomous — DoT à stacks (réduction de Defense/poison), pas un
  multiplicateur instantané.
- Vicious/Champion — pas des enchants de dégâts (Ferocity/XP-économie).
- Cleave — dégâts de zone (AoE), n'affecte pas le DPS single-target d'un
  boss Slayer.
- First Strike (déjà noté avant ce lot) — bonus uniquement sur le 1er coup,
  mécanique burst, formule d'intégration pas encore posée.

**Vérifié en base, en un seul cycle** : DPS T7/ZOMBIE_SLAYER_T1 = 41 646.2748
exact (calcul à la main : 149×2.99×4.10×6.0×1.9×2 — bucket additif 210+50+50
=310% → ×4.10, Crit Damage 50+100=150% → multiplicateur crit ×1.9) —
confirmé identique en base après persist (35 combos). Traçabilité complète :
`pluton_rankings.accessories.nbt_modifiers` documente les 3 enchants
appliqués par combo. Route de debug temporaire supprimée après validation.

**2e lot, même jour, même cycle unique** — Gemmes + Hot/Fuming Potato Book :
- **Gemmes** — vérifié AVANT de coder (pas supposé) : seuls Reaper Falchion
  (1 emplacement Jasper-only, item EPIC) et Reaper Armor (1 emplacement
  Combat universel, LEGENDARY) ont un vrai emplacement de gemme (infobox
  wiki `gemstone_slots`) — Undead Sword/Revenant Falchion/Revenant Armor
  n'en ont AUCUN, confirmé absent de leur infobox, pas un trou. Type
  retenu = **Jasper** (Strength), choisi par vraie comparaison des 4 types
  Combat disponibles sur l'emplacement universel de l'armure (Ruby=Health/
  Sapphire=Intelligence/Amethyst=Defense, aucun effet sur le DPS) — 1er cas
  concret de "recherche sur l'espace réel" plutôt qu'un choix suivi par
  défaut. Qualité PERFECT (T7 uniquement, ces emplacements n'existent que
  sur le gear Reaper). Valeurs sourcées table `gemstones` (déjà validée par
  `lib/pluton-mining.ts`) : +11 Force (Jasper PERFECT @ EPIC, Falchion),
  +13 Force (Jasper PERFECT @ LEGENDARY, Armor).
- **Hot Potato Book / Fuming Potato Book** — modificateur **universel**
  (toute épée/armure du jeu, pas spécifique à cette activité). **Contradiction
  réelle trouvée dans la source wiki elle-même** (même famille que la
  contradiction Execute déjà documentée) : la page Hot Potato Book a un
  encadré-résumé "x10 → Str+10/Dmg+10" qui contredit sa propre table
  détaillée (+2/usage, donc +20 à 10 usages par extrapolation linéaire).
  Résolu en faveur de la page Fuming Potato Book, dont l'encadré combiné
  est cohérent en interne sur 2 valeurs indépendantes (5 FPB seuls = +10,
  10 HPB+5 FPB = +30, toutes deux = usages×2) — retenu comme la source la
  plus fiable, pas le résumé isolé et incohérent. Palier 5/10/15 usages par
  tier (T1-3/T4-6/T7).

**Vérifié en base, même cycle unique push/déploiement/vérification/persist/
nettoyage** : DPS T7/ZOMBIE_SLAYER_T1 = 59 067.2076 exact (calcul à la main :
179×3.53×4.10×6.0×1.9×2, Force totale 253 = 100(arme)+75(armure)+24(Enrage
moy.)+24(gemmes)+30(potato), Dégâts base 179 = 5+120+24(Enrage)+30(potato)) —
confirmé identique en base après persist. `pluton_rankings.accessories.
nbt_modifiers` trace les 6 modificateurs appliqués par combo.

### ✅ Reforge + Recombobulator 3000 + The Art of War — fermeture complète, plus rien à moitié (22 août)

**Recadrage explicite de l'utilisateur** : "ne fait pas les choses à
moitié... si je suis starter et que je fais une certaine activité en
fishing par exemple, je veux un setup vraiment complet" — après avoir noté
Recombobulator/Art of War/Ability Scrolls comme "pas encore audités" et
enchaîné sur un autre chantier, correction explicite : finir un audit
avant de passer au suivant, pas laisser des items ouverts indéfiniment.

**Audit réel (pas supposé)** : `grep "reforge"` sur `lib/pluton-combat.ts`
et `lib/pluton-slayer.ts` → **0 résultat dans les deux fichiers**. Le
Reforge — un des leviers NBT les plus impactants du jeu — n'était appliqué
NULLE PART sur les 5 Slayers, malgré le plan Phase 5 le listant comme
"déjà propre et complet, utilisable direct" (vrai pour la DONNÉE, faux pour
l'INTÉGRATION — jamais câblé). Fermé complètement dans ce lot :

- **Reforge — vraie recherche sur l'espace des candidats**, pas une
  supposition ("Heroic"/"Legendary" auraient semblé évidents). Le moteur
  simule le DPS de CHAQUE reforge candidat (table `reforges`, 9 par
  catégorie SWORD/ROD ou ARMOR, à la rareté réelle de l'item) et retient
  le meilleur réel. **Confirmé en pratique que le "meilleur" dépend de la
  rareté** : les paliers d'Attack Speed (`floor(10/(1+AS/100))`, non-linéaire)
  créent des sauts de valeur — ex. "Fast" (bonus AS pur) peut dominer un
  reforge "évident" comme "Legendary" simplement en franchissant un palier
  de tick. Armure = 4 pièces identiques reforgées (×4), simplification
  documentée (le modèle ne différencie pas les 4 pièces).
- **Recombobulator 3000** — sourcé wiki : augmente l'effet des Reforges et
  Gemmes (décale la rareté d'un cran pour ces deux lookups), **aucun
  downside réel documenté** ("Reforges appliqués avant ou après profitent
  quand même du bonus") → toujours appliqué. N'affecte PAS les stats
  intrinsèques de l'item (Damage/Force de base restent celles de la rareté
  d'origine) — seul reforge+gemme en bénéficient ici, gap documenté
  (bénéfice complet nécessiterait des stats de base recombobulées par
  item, non sourcées).
- **The Art of War** — sourcé wiki : +5 Force, universel (Weapons/Axes),
  coût unique modique, appliqué par défaut.
- **The Art of Peace** — sourcé wiki : +40 HP par pièce d'armure, documenté
  dans le loadout (`nbtModifiers`/`accessories`) pour un setup complet,
  **sans effet sur le calcul** (HP n'entre pas dans la formule DPS/coins-
  par-heure) — inclus dans la description, pas dans le score, distinction
  explicite plutôt qu'omis silencieusement.
- **Ability Scrolls (Wither Scrolls)** — confirmé item-spécifique à la
  famille Necron's Blade/Hyperion, absente des calculateurs actuels
  (aucune arme en cours de scope n'y appartient) — hors-scope réel, vérifié
  par recherche directe, pas une supposition.
- **Power Scrolls** (`power_scroll_recipes`) — confirmé système distinct
  (buff temporaire 5s sur activation d'ability), même famille qu'Execute/
  First Strike déjà écartés (burst, pas un multiplicateur DPS soutenu).
- **Dyes** — confirmé cosmétique pur (couleur uniquement), aucune donnée
  de stat sur aucune des ~90 pages vérifiées.

**2 trous structurels supplémentaires trouvés en construisant la recherche
de reforge** (pas seulement le reforge lui-même) :
1. `computeCombatDps()` (`lib/pluton-engine.ts`) n'avait AUCUN moyen de
   composer un bonus de Crit Chance ni une vitesse d'attaque non-nulle —
   étendu avec `additionalCritChancePct`/`bonusAttackSpeed` (rétro-
   compatible, Bestiary inchangé).
2. Crit Chance n'était jamais plafonnée à 100% (vraie limite du jeu) dans
   AUCUN des deux fichiers — sans conséquence tant qu'aucune source ne
   dépassait 100, mais Sharp/Pure reforge + Critical enchant peuvent
   réellement y arriver (confirmé : combo Zombie T7 atteint exactement 108%
   avant plafond) — corrigé dans les deux fichiers.

**Vérifié en base, un seul cycle pour les 5 Slayers** (2 calculs complets à
la main, tous deux exacts) :
- Zombie T7/ZOMBIE_SLAYER_T1 : reforge arme=Fast (LEGENDARY, +50 AS),
  reforge armure=Pure ×4 (MYTHIC, +40 Force/+48 CC/+40 CD/+20 AS) —
  Crit Chance plafonnée à 100% (108% avant plafond, confirme le bug #2
  ci-dessus était réel). DPS = 205 850.1432 exact (calcul à la main :
  179×4.03×4.10×6.0×2.90×4.0, palier Attack Speed AS=70→ticks=5).
- Spider END/SPIDER_T5 (Sting, `always_crit`) : reforge arme=Spicy (MYTHIC),
  reforge armure=Fierce ×4 (MYTHIC) — Force totale 202 exact, DPS
  135 573.30395 exact (calcul à la main, palier AS=15→ticks=8).

Route de debug temporaire supprimée après validation.

### ✅ Couche NBT étendue aux 4 autres Slayers, même jour (22 août)

Décision explicite : plutôt que migrer Spider/Wolf/Enderman/Blaze vers
`pluton_elements`/échelle 1-7 (chantier séparé, pas fait ici), la couche NBT
(Sharpness/Critical/enchant vs-type-de-mob/gemmes/Potato Books) a été
**ajoutée directement à `lib/pluton-slayer.ts`** (architecture early/mid/
end/late + tables dédiées déjà validées le 18 août, inchangée sinon) — même
discipline "ne pas conflater deux chantiers différents" que le reste de
cette session.

**Scoping fait AVANT tout code** (agent dédié, 14 items des 4 chaînes) :
gemstones réelles pour seulement 5/14 items (Sting ×2 Jasper, Tarantula
Fang ×1, Pooch Sword ×1, Atomsplit/Voidedge Katana ×1 chacun — Mastiff
Armor a bien 4 emplacements mais tous Ruby-only = Health, sans effet DPS,
ignorés ; Primordial Armor a un champ `gemstone_slots` présent mais
**commenté par le wiki lui-même** `<!--...infoneeded-->`, traité comme
absent) ; étoiles confirmées absentes des 14 items (mécanique non
applicable, pas un gap) ; enchant vs-type-de-mob réel seulement pour
Spider (Bane of Arthropods, "applied to Weapons" — couvre les dagues) et
Enderman (Ender Slayer, confirmé applicable aux katanas malgré leur nom
cosmétique — leur page wiki déclare `type=Sword`) — Wolf et Blaze n'en ont
AUCUN, confirmé par recherche directe, pas un oubli.

**Vérifié en base, un seul cycle pour les 4 slayers** (2 combos recalculés
à la main, tous deux exacts) : Spider END/SPIDER_T5 (Sting+Primordial,
`always_crit`) — Force totale 131 (75 arme+26 gemmes+30 potato), DPS
50 637.86959 exact. Wolf LATE/WOLF_T4 (Pooch Sword+Mastiff, Pack Mentality
×2) — Force totale 123 (80 arme+13 gemme+30 potato), DPS 90 716.4 exact.
88 combos persistés (`activity_key='slayer'`, inchangé). Route de debug
temporaire supprimée après validation.

### ✅ Pluton Fishing — couche NBT complétée à tous les tiers (22 août)

**Exemple donné explicitement par l'utilisateur** en poursuivant le
recadrage "ne rien laisser à moitié" : "si je suis starter et que je fais
une certaine activité en fishing, je veux un setup vraiment complet" —
audit de `lib/pluton-fishing.ts` (construit le 17 août) a confirmé le même
type de trou que Combat avant sa fermeture.

**Avant ce lot** : Piscary (enchant, +Fishing Speed)/Expertise (enchant,
+Sea Creature Chance)/reforge rod (Salty/Treacherous/Stiff/Lucky)/reforge
armure (Submerged)/gemme Aquamarine n'étaient ajoutés QUE si `tier==='end'
||'late'` — un joueur starter/mid avait un setup strictement dépourvu de
ces 5 modificateurs. Sourcés wiki (agent dédié) : Piscary (I-VII, +1 à +7
Fishing Speed, additif confirmé "Fs stacks additively"), Expertise (I-X,
+0.6% à +6% Sea Creature Chance) — tous deux avec un vrai palier de niveau
(Enchanting/drop rare pour VI/VII), désormais scalés par tier comme
Sharpness Combat (jamais 0). Reforges rod/armure : **pas de table par
rareté sourcée** (contrairement aux reforges Combat) — seule la valeur MAX
documentée ("+7%"/"Cost to Apply" 2.5k-600k, wiki dédié) — appliqués
désormais à TOUS les tiers (coût réel modique, aucune raison de les
réserver à end/late).

**🔴 2 bugs réels trouvés et corrigés, pas seulement le trou de tier** :
1. **Gemme Aquamarine appliquée sans vérifier la rod** — la version
   précédente ajoutait `PERFECT_AQUAMARINE_GEMSTONE_FS` inconditionnellement
   en end/late, sans vérifier que la rod réellement choisie par la
   recherche budgétaire avait un emplacement. Vérifié AVANT de recoder :
   seules Rod of Champions (1)/Rod of Legends (2)/Rod of the Sea (2) ont un
   vrai emplacement — Fishing Rod/Challenging Rod n'en ont AUCUN. Calculé
   désormais par rod réellement sélectionnée + rareté RECOMBOBULÉE
   (Recombobulator confirmé applicable aux rods, aucune exclusion
   documentée).
2. **Double-comptage réel, pré-existant, découvert en vérifiant en prod
   après le premier fix** : `applyFishingPetsAndAccessories()` tirait déjà
   ces 5 sources (`stat_bonus_sources`, `equip_slot='passive'`) à TOUS les
   tiers via son filtre générique (jamais tier-gaté) — combiné à l'ancien
   bloc "end/late only" qui les ajoutait une 2e fois, **Fishing
   double-comptait déjà ces 5 sources en END/LATE avant même cette
   session**. `'passive'` exclu du filtre générique — la nouvelle logique
   explicite (palier par tier + vérification rod) devient la seule source.
3. Hot Potato Book/The Art of War confirmés exclus des rods (textes wiki
   respectifs : "Swords and Armor"/"Weapons/Axes", aucune mention Rods) —
   vérifié explicitement, non appliqués, pas un oubli.

**Vérifié en base, un seul cycle** (2 combos recalculés à la main, tous
deux exacts) : EARLY/WATER_POOL (Challenging Rod, sans emplacement gemme) —
Fishing Speed 141.4 (35 base+68.4 accessoires+35 pet+3 Piscary), Sea
Creature Chance 28.6 (10 base+5.8 accessoires+1.8 Expertise+7 reforge
rod+4 reforge armure) — exact. Route de debug temporaire supprimée après
validation.

### ✅ Audit "toutes les activités du skill" — Bestiary + Sea Creature kills fermés (22 août)

**Question explicite de l'utilisateur** en poursuivant le recadrage : "les
5 Slayers sont-ils vraiment la seule activité Combat ?? vérifie bien que
pour chaque skill tu as bien TOUTE les activités possibles." Vérifié contre
`pluton_skill_activities` (table d'inventaire officielle du projet, pas
redevinée) — réponse : **non**. Combat a 2 autres activités `built` jamais
touchées par la fermeture NBT : Dungeons (Floor I-VII Normal) et Bestiary/
grind mob générique. Fishing a une 2e activité `built` (Sea Creature kills,
distincte de la Pêche) dans le même cas.

- **Bestiary** (`lib/pluton-bestiary.ts`) — appelait `computeCombatDps()`
  avec 0 des couches NBT construites pour Slayer, malgré une réutilisation
  directe du même gear Zombie. Fermé avec les mêmes valeurs déjà sourcées
  (Sharpness/Smite si Undead/Critical/reforge recherché/Recombobulator/
  gemme Jasper/Potato Books/The Art of War) — 63 mobs viables inchangés
  (aucune régression sur le filtrage déjà validé le 21 août).
- **Sea Creature kills** (`lib/pluton-sea-creatures.ts`) — pire cas : avait
  sa PROPRE copie locale de la formule de base (`computeDps`), dupliquée
  avant même que `computeCombatDps` existe dans le moteur partagé,
  strictement sans Crit Chance/Attack Speed composables. Remplacée par
  `computeCombatDps()` du moteur partagé + même couche NBT complète.
- **Dungeons (Floor I-VII)** — vérifié par lecture directe du code (pas
  supposé) : aucune logique DPS/Strength/reforge n'existe dans ce fichier,
  confirmant la doc déjà en place (méthode ancrée sur le score/temps de run
  externe, **ne dépend pas du gear du joueur** par construction) — hors
  scope de cette fermeture NBT à raison, pas un trou oublié.

**Vérifié en base** : Bestiary 63/107 mobs viables (identique à la
construction du 21 août, filtrage non régressé) ; Sea Creature kills 4
combos (early/mid/end/late), TTK/coins-par-heure cohérents avec la
progression de gear déjà validée (TTK LATE=0.58s vs EARLY=21.58s). Route
de debug temporaire supprimée après validation.

**Prochaine étape actée** : même audit "toutes les activités du skill"
pour Mining/Farming/Foraging/Hunting (les seuls autres skills `built`) —
vérifier si leurs calculateurs ont bien tout le NBT skill-approprié
(enchants/reforges/gemmes spécifiques à chaque skill) appliqué, ou si le
même écart "documenté mais pas câblé" existe ailleurs.

### ✅ Mining audité — déjà quasi-complet, 1 vrai trou fermé (Recombobulator) (22 août)

Contrairement à Combat/Fishing, `lib/pluton-mining.ts` (construit/calibré
le 5 août contre un vrai repère en jeu, écart -4.7% documenté) s'est avéré
**déjà rigoureux** : HOTM maxé, sockets de gemmes réels (3 slots
Amber/Jade/Topaz + arbitrage réel du 5e slot combo par impact sur le
rendement, pas une supposition), reforge Jaded (armure) et arbitrage réel
Ambered-vs-Glacial (foret), Hephaestus Relic, Drill Engine, Eager Miner,
niveau Mining 60. Aucune réécriture nécessaire.

**Seul trou réel trouvé** : `computeGemSocketBonus()` utilisait toujours la
rareté de BASE de l'armure/l'outil, jamais recombobulée — Recombobulator
3000 (déjà modélisé comme toujours appliqué pour Combat/Fishing, aucun
downside réel documenté) n'était pas câblé ici. **Corrigé uniquement pour
le lookup gemme** (jamais le reforge Jaded, dont les stats ne sont
sourcées qu'à LEGENDARY — pas de donnée MYTHIC/DIVINE à extrapoler,
contrairement aux gemmes qui ont une vraie table complète par rareté).

**Trouvaille en cours de route** : `RARITY_ORDER` (moteur partagé) plafonnait
à MYTHIC — étendu à DIVINE après avoir confirmé que **Divan's Drill a une
rareté de BASE Mythic** (le seul cas parmi tout Pluton jusqu'ici, confirmé
explicitement par le wiki Recombobulator lui-même : "the only items with an
intentional base Mythic rarity are Divan's Drill...") — sans cette
extension, le Drill n'aurait reçu aucun bénéfice de Recombobulator du tout.
Table `gemstones` confirmée couvrir DIVINE (Amber/Jade/Topaz) avant
d'étendre.

**🔴 Incident opérationnel réel pendant la vérification** : le run de
persist complet (72 combos, tous tiers×blocs) a timeout à 2 reprises
(maxDuration 60 puis 280 insuffisants au premier essai) — `sync_log`
confirme que les runs réels de ce cron tournaient DÉJÀ à 111-120s AVANT ce
changement (contre une limite de 120s), donc déjà à la marge. Un run réel
du cron programmé (4h30 UTC) a percuté mes tests concurrents et est resté
bloqué en `status='running'` sans jamais finir (id 42126, jamais nettoyé
par son propre `finishSync`). **Vérifié avant toute correction** : la
table `pluton_rankings` (activity_key='mining') était retombée à 42/65
lignes après mes tentatives échouées (DELETE committé, INSERT partiel
tué par le timeout) — un vrai risque de données incomplètes en prod,
pas juste un ratage de test. Corrigé : relancé un persist complet propre
(65/65 lignes restaurées, vérifié), `maxDuration` du cron production
120→280 (marge de sécurité, aucune formule changée), ligne `sync_log`
bloquée marquée `error` manuellement plutôt que laissée `running` pour
toujours.

**Vérifié en base** : Ruby Gemstone LATE 46.2M/h (5 août) → 57.68M/h
(22 août) — **+24.8%, cohérent avec le saut exact Amber/Jade LEGENDARY
→MYTHIC (80→100 et 40→50, tous deux exactement +25%)**, confirme le
mécanisme sans avoir eu besoin de recalculer à la main les 15+ couches
imbriquées du fichier. Route de debug temporaire supprimée après validation.

### ✅ Farming audité — déjà complet (aucun trou trouvé) (22 août)

`lib/pluton-farming.ts` (construit le 5 août, **4 passes d'audit déjà
demandées par l'utilisateur** à l'époque — "es-tu sûr d'avoir tout maxé ?",
Pest Farming ajouté après avoir été signalé comme omis, Bonus Pest Chance
corrigé après un chiffre challengé "40M+/h en vrai") s'est confirmé
**déjà au même niveau d'exigence** que ce chantier demande : reprend le
"Theoretical Maximum" déjà publié et vérifié par le wiki lui-même (armure
Helianthus **déjà explicitement recombobulée** dans ce total officiel, pas
une omission), Pest Farming avec formules réelles (Bonus Pest Chance,
Pesthunter Phillip en régime permanent via Little's Law, pièges). Aucune
réécriture nécessaire — contrairement à Combat/Fishing, la structure
"total wiki déjà publié" de ce fichier n'a pas le même point de défaillance
("documenté mais pas câblé pièce par pièce") que les calculateurs Combat.

### ✅ Foraging — Citrine (gemmes) + Frenzy (item ability), jamais modélisés (22 août)

Contrairement à Farming, **trou réel trouvé** (agent dédié, 6 items
vérifiés — 3 outils + 3 armures) : Foraging n'avait NI gemmes NI item
ability modélisés du tout, alors que les deux existent réellement.

- **Citrine** (Foraging Fortune, pas Sweep) — emplacements réels vérifiés
  AVANT de coder : Fig Hew=1, Figstone Splitter=2, Helix Chopper=2
  (outils) ; Canopy=0 (confirmé absent de l'infobox), Fig=1, Helix=2
  (armure — 1 seul champ `gemstone_slots` par SET sur la page wiki, pas
  par pièce, traité comme un total pour l'objet armure complet, même
  convention que Reaper Armor/Combat). Appliqué à TOUS les tiers où
  l'item concerné est réellement choisi par la recherche budgétaire
  (contrairement au Sharpening Shard déjà codé, ces emplacements existent
  dès Fig/mid-tier, pas seulement Helix/end-late).
- **Frenzy** (item ability outil, PERMANENT une fois un seuil de logs
  coupés atteint) : Fig Hew +1 Sweep/2000 logs (max 20), Figstone
  Splitter +1/10000 (max 20, **plus lent malgré l'upgrade** — vérifié tel
  quel contre le wiki, pas une contradiction supposée), Helix Chopper
  +1/20000 (max 40, soit 800 000 logs coupés pour le cap) — investissement
  réel très important, même discipline "investissement max END/LATE" que
  le Sharpening Shard déjà codé.

`CITRINE_PERFECT_BY_RARITY` ajouté au moteur partagé (`pluton-engine.ts`),
même pattern que Jasper/Aquamarine.

**Vérifié en base, un seul cycle** : LATE/HELIX_LOG — Foraging Fortune
32 exact (16 Citrine outil + 16 Citrine armure, tous deux Helix
EPIC→recombobulé LEGENDARY=8×2), Sweep 583 exact (393 base déjà documentée
+150 Sharpening Shard existant +40 Frenzy nouveau — recoupe exactement la
valeur déjà publiée le 17 août avant cette session). Route de debug
temporaire supprimée après validation.

### ✅ Essence Shops — audit des 11 boutiques terminé, 4 vrais trous fermés (22-23 août)

Suite de la section précédente. Les 9 boutiques restantes (Wither/Dragon/
Crimson/Ice/Gold/Diamond/Forest/Fossil/Safari) vérifiées via agent dédié
puis **recoupées manuellement contre le wikitext brut avant tout code** —
discipline qui a payé : le rapport de l'agent affirmait *"Frozen Skin (Ice
Essence Shop) = +5 Crit Chance"*, contredit par la source elle-même
(`{{stat|cr}}`) — vérifié directement : `cr` = **Cold Resistance** (page
wiki dédiée confirmée, sans rapport avec le combat), **pas intégré**.
Même discipline sur "Dwarven Expertise" (Fossil, stat `dmf`) : ni la page
wiki "Mining Fortune" ni "Gemstone Fortune" ne citent Fossil Essence Shop
dans leur `ways_to_increase` — stat non-classifiable avec confiance,
**laissé de côté plutôt que deviné**.

**4 vrais trous fermés, chacun confirmé indépendamment avant d'écrire du
code** :
- **Wither — "Forbidden Strength"** : +1/2/3/4/5 Force (5 paliers,
  niveau max), **aucune restriction de lieu** (contrairement aux 4 perks
  soeurs Health/Defense/Speed/Intelligence de la même boutique, non
  suivies par Pluton) — universel Combat, appliqué dans les 4 fichiers
  (`pluton-combat.ts`/`pluton-slayer.ts`/`pluton-bestiary.ts`/`pluton-
  sea-creatures.ts`) exactement comme The Art of War déjà codé.
- **Diamond — "Rhinestone Infusion"** : +2..+20 Gemstone Fortune (10
  paliers), "while on Mining Islands" — **confirmé par cross-référence**
  (la page wiki "Gemstone Fortune" cite explicitement "Diamond Essence
  Shop" dans ses `ways_to_increase`, pas une supposition depuis le nom).
- **Forest — "Lumberjack"** : +2..+20 Foraging Fortune (10 paliers),
  aucune restriction (vérifié distinct de sa "sœur" Forest Training,
  elle explicitement "while on Foraging Islands").
- **Forest — "Trapped"** : +1..+5% vitesse de capture Huntrap (5
  paliers), stack ADDITIVEMENT avec le palier de trap (formule déjà
  documentée en tête de `pluton-hunting.ts` — "calculated first then
  multiplied with all other modifiers which stack additively").

Toutes ces monnaies (Essence comme Powder) confirmées non-tradeable (0
`item_id` catalogué, vérifié avant même de commencer l'audit) — traitées
partout comme HOTM/HOTF : niveau max assumé atteignable, jamais un prix
sur la monnaie elle-même.

**Vérifié en base, un seul cycle pour les 7 fichiers touchés** : Zombie
T7 DPS 205 850.1432→208 404.1152 exact (+5 Force), Mining Ruby LATE
57 683 461→58 164 959 (+0.83%, cohérent avec +20 Gemstone Fortune sur
~2296 de base), Foraging LATE Foraging Fortune 232→252 exact (+20),
Trap Hunting 4 tiers (19h/17h/12h/9h de capture, tous exacts avec le
+5% Trapped additionné au palier de trap). Route de debug temporaire
supprimée après validation.

### 🔴 Essence Shops — 2/11 vérifiées ici (22 août) — **audit complet des 12 terminé le 23-24 août, voir en tête de fichier, pas dupliqué ici**

### ✅ Foraging — Heart of the Forest (HOTF), 2e vrai trou trouvé le même jour (22 août)

**Question directe de l'utilisateur** après le premier bilan ("on a bien
pris en compte tout, même les HOTM et HOTF ??") — a immédiatement fait
remonter un 2e trou réel, la preuve que le premier bilan n'était pas encore
complet. Vérifié : Mining a bien HOTM (`HOTM_MAX`, confirmé), **Foraging
n'avait JAMAIS touché HOTF** (`hotf_perks`, 30 lignes, arbre analogue à
HOTM sur les Foraging Islands, monnaie Forest Whispers) — 0 référence dans
tout le fichier malgré la table déjà en base depuis la cartographie.

3 perks directs/permanents retenus (niveau max END/LATE, même convention
que `HOTM_MAX`) : `sweep` (niveau 50, +50 Sweep), `foraging_fortune`
(niveau 50, +150 FF), `foraging_madness` (palier unique, +10 Sweep/+50 FF).
Exclus et documentés, pas inventés : `forest_strength` (jusqu'à +1000
Sweep/+1000 FF mais conditionnel à la stat Strength du joueur, jamais
trackée par ce calculateur Foraging pur — aucune valeur de référence
sourcée, inventer un total violerait la règle #7), `half_full`/`half_empty`
(nécessitent un 2e joueur à proximité), `early_bird` (+20 Sweep/+100 FF
mais seulement les 250 premiers arbres/jour, fraction négligeable du
volume horaire visé), `collector` (drop différent, hors scope logs).

**Vérifié en base** : LATE/HELIX_LOG — Sweep 583→643 exact (+50+10),
Foraging Fortune 32→232 exact (+150+50). Route de debug temporaire
supprimée après validation.

### ✅ Hunting audité — déjà correctement scopé (22 août)

`lib/pluton-hunting.ts` (Trap Hunting, seule activité `built` du skill)
vérifié : pas de gemstone/reforge applicable (le Huntrap est un objet posé
dans le monde, pas du gear porté — infobox wiki confirmée sans champ de
stats combat/gemstone). Les 3 exclusions déjà documentées dans le fichier
(Desert Temple -25% bonus de localisation, Forest/Combat Trap -10%
spécifiques au type de shard, Charm Hunting) restent des vrais choix
raisonnés — pas des oublis : `attribute_shards` n'a aucune colonne
type-Forest/Water/Combat exploitable pour les conditionner par shard
individuellement, et la page wiki "Huntraps#Locations" elle-même est
marquée `{{Sectionstub}}` (liste reconnue incomplète par le wiki source).
Aucun changement nécessaire.

### 🎯 Bilan de l'audit "toutes les activités / tout le NBT" — 6 skills `built` couverts (22 août)

Chantier complet demandé par l'utilisateur ("vérifie bien que pour chaque
skill tu as bien TOUTE les activités possibles... rien laissé au hasard").
Vérifié contre `pluton_skill_activities` (inventaire officiel, pas
redeviné) — les 6 skills `built` couvrent en réalité **10 activités**, pas
6 (plusieurs skills ont 2+ activités distinctes jamais auditées comme un
groupe avant cette passe) :

| Skill | Activités `built` | Trou trouvé | Statut |
|---|---|---|---|
| Combat | Slayer×5, Dungeons, Bestiary | Reforge absent (Slayer×5) ; NBT absent (Bestiary) | ✅ fermés |
| Fishing | Pêche, Sea Creature kills | Tier zéro à early/mid ; formule dupliquée sans NBT | ✅ fermés |
| Mining | Minage+Forge | Recombobulator non câblé sur les gemmes | ✅ fermé |
| Farming | Culture+Pest | — | ✅ déjà complet |
| Foraging | Coupe de bois | Gemmes+item ability jamais modélisés | ✅ fermés |
| Hunting | Trap Hunting | — | ✅ déjà correctement scopé |

Dungeons confirmé structurellement hors-scope (méthode ancrée sur le score,
pas sur le gear — vérifié par lecture directe du code, pas supposé).

Chaque fermeture suit la même discipline : scoping par agent dédié AVANT
tout code (jamais une supposition), un seul cycle push/déploiement/
vérification/persist/nettoyage par lot, au moins 1 calcul recoupé à la
main par lot avant persist. 2 incidents opérationnels réels trouvés et
corrigés en cours de route (Mining : timeout + sync_log bloqué + données
partiellement effacées, restaurées) — documentés dans leurs sections
respectives ci-dessus, pas cachés.

**Explicitement hors scope de cette passe** : les activités `backlog`
(Kuudra, Dungeons Master Mode, frag runs, Enchanted Books flip, Forest/
Water/Combat Hunting) restent des gaps structurels réels déjà documentés
individuellement (données manquantes à la source, pas un défaut
d'application du NBT) — pas retouchées ici, chantier distinct.

### 🚧 Phase 3 — Système B refondu, 1re tranche (Zombie Slayer) vérifiée

`lib/pluton-combat.ts` — 1er fichier "1 skill = 1 calculateur" (remplace à
terme `pluton-slayer.ts`+`pluton-dungeons.ts`+`pluton-bestiary.ts`, 3
fichiers pour le même skill Combat). Gear sourcé **en direct** depuis
`pluton_elements` (nouveaux helpers `getGearStatsFromElements`/
`findBaseStat`/`findMobTypeBonus` dans `lib/pluton-engine.ts`), échelle
tier joueur **1-7 réelle** (pas early/mid/end/late). Portée bornée à Zombie
Slayer pour l'instant (1re tranche vérifiée avant d'étendre aux 4 autres
Slayers/Dungeons/Bestiary) — `pluton-slayer.ts`/`pluton-dungeons.ts`/
`pluton-bestiary.ts` restent actifs et inchangés, pas de retrait avant
migration complète vérifiée.

**2 vrais trous structurels trouvés dans le Système A en construisant
ceci** (corrigés au cas par cas, pas masqués) :
1. La classification originale ne tague AUCUN item par skill (0/49 628,
   corrigé Phase 1) NI par tier sur les lignes `wiki_haiku_extract` qui
   portent les vraies valeurs de stats (594/3890 seulement gérées à
   l'origine) — corrigé pour Zombie Slayer en réutilisant la recherche déjà
   validée cette session (paliers ZS3/ZS6 réels), jamais inventé.
2. **Bug réel trouvé en vérifiant Reaper Falchion en prod** :
   `stat_name="Damage"` porte à la fois la valeur plate (+120) et le bonus
   vs type de mob (+200% "against Undead mobs") pour la même arme — la 1re
   version de `getGearStatsFromElements` dédupliquait par `stat_name` (Map),
   perdant silencieusement une des deux lignes selon l'ordre retourné par
   SQL. Corrigé : retourne un tableau complet, `findBaseStat`/
   `findMobTypeBonus` filtrent sur `stat_name` ET `condition_note`.
   Recoupé à la main sur les 2 combos non-triviaux : Revenant Falchion+
   Armor (95×1.5×3.1×2.5×1.3×2=2871.375 exact) et Reaper Falchion+Armor
   (149×2.99×3.1×6.0×1.3×2=21544.8636 exact).

**Gaps de données restants, documentés et retournés explicitement par le
code** (`dataSourceGaps`, jamais masqués) : le bonus +100% Undead de Reaper
Armor et le timing de l'ability Enrage restent introuvables dans
`pluton_elements` même après recherche sur plusieurs pages candidates —
fallback sur la valeur déjà validée (sourcée wiki à l'origine dans
`lib/pluton-slayer.ts`), jamais une invention nouvelle. Force+75 de Reaper
Armor est réellement présente dans `pluton_elements` mais sous
`wiki_table_extract` (page "Strength", format `cells`/`headers` différent
de `wiki_haiku_extract`) — `getGearStatsFromElements` n'interroge que
`wiki_haiku_extract` pour l'instant, extension à faire.

**Vérifié en base** : 35 combos (5 paliers boss Zombie × 7 tiers joueur),
additif confirmé (22 blocs `slayer` + 63 `combat` Bestiary intacts après).
Cron `pluton-combat-refresh` (quotidien 5h45) créé, couvre Zombie Slayer
uniquement pour l'instant — à étendre au fur et à mesure de la migration.

## ✅ Pluton — fermeture complète du backlog (21 août, terminé)

Recadrage explicite de l'utilisateur après Sea Creature kills : ne plus
avancer un item de backlog "à la carte" — chaque skill doit être traité
sérieusement via la pipeline (activités réelles sourcées → setup → prix
marché réel = money making), sans laisser de statut vague. Reproche concret
et justifié : une note antérieure disait "Powder grinding = valeur" sans
vérifier que la Powder n'est pas un item revendable — exactement le type de
raccourci interdit par la règle #7 (jamais de constante/valeur de jeu
supposée). **Principe retenu pour tout le reste du projet** : bien
distinguer une **mécanique fondamentale de skill** (monnaie de progression,
stat, palier — jamais une "activité" en soi, un ingrédient qui nourrit une
ou plusieurs vraies activités) d'une **activité réelle** (action+setup+drop
revendable à un prix Bazaar/AH réel). Avant de classer quoi que ce soit
comme activité : est-ce que ça produit directement un item revendable, ou
est-ce que ça alimente autre chose ?

**Recherche menée avant toute construction** (3 agents Explore en parallèle,
lecture seule, zéro coût API supplémentaire) sur tout le backlog restant —
verdicts décisifs plutôt que "pas encore investigué" :

- **Mining Powder** — confirmé mécanique fondamentale pure (monnaie HOTM/
  HOTF), pas une activité. Sa valeur est déjà absorbée dans le calculateur
  Mining gemstone existant (les perks qu'elle achète le boostent). Statut
  `pluton_skill_activities` id 2 : `backlog` → `excluded_low_value`.
- **Mining raw ore** (COAL/IRON/GOLD/DIAMOND/GLACITE/MITHRIL_ORE) — **faux
  trou signalé par l'agent, vérifié et infirmé** : `lib/pluton-mining.ts` a
  déjà un fallback prix Bazaar live quand `effective_sell_price` est NULL,
  les 6 blocs sont déjà rankés sur les 4 tiers avec des valeurs réelles
  cohérentes (ex: Diamond Ore end/late ≈61.9M/h) — confirmé par requête
  directe sur `pluton_rankings` avant de coder quoi que ce soit. Aucun
  changement nécessaire, label mis à jour pour refléter la couverture réelle.
- **Kuudra** — confirmé gap structurel réel (la page wiki source elle-même a
  un trou explicite `{{InfoNeeded}}` sur le nombre de vagues, aucune des
  30+ pages `kuudra_wiki` cachées ne donne le temps total de run ni les PV
  du boss). Note reformulée en décisive, même catégorie que Vampire Slayer.
- **Enchanted Books flip (Anvil)** — mécanique confirmée réelle et gratuite
  sur Hypixel (`game_mechanics_misc`, contrairement à Minecraft vanilla),
  mais bloquée par la **couverture de prix** : seulement 2 enchant books
  cachés en Bazaar/AH actuellement, aucune paire de niveaux adjacents
  pricée des deux côtés. Gap de données, pas de mécanique — note reformulée.
- **Bestiary / grind mob générique** — confirmé buildable (`zone_mob_stats`
  107 lignes + `game_drops` 1235 lignes, drops réels non-XP), mais le
  contenu réel s'avère bien plus brut que rapporté par l'agent (HP/dégâts en
  texte libre avec templates wiki `hp|200|icononly=yes`, niveaux multiples
  séparés par `/`, texte de drops semi-structuré avec des cas cassés comme
  "Only rolled when the player has dealt at least dmg|short=yes|1M1x Lumino
  Fiber" collé sans séparateur) — nécessite un vrai travail de parsing par
  zone, pas un simple branchement. Scope réduit explicitement aux zones/mobs
  au format le plus propre en premier lieu (voir suite de ce chantier).
- **Hunting** — Trap Hunting et Charm Hunting confirmés buildables (formules
  réelles sourcées : table temps de capture par rareté de shard + stacking,
  table %/niveau) ; Forest/Water/Combat restent des gaps réels (mécaniques
  `{{confirm}}` non chiffrées dans le wiki source lui-même).

### ✅ Forge crafting margin (Mining) — construit et vérifié

Nouveau fichier `lib/pluton-forge.ts`, `activity_key='mining'` (additif, ne
touche pas aux 18 blocs mining existants). `forge_recipes` (107 recettes
réelles, `ingredients` jsonb + `forge_time_hours`) avait `market_value`/
`profit_per_forge` jamais chiffrés — calculé ici depuis les vrais prix
Bazaar (`buy_price` pour les ingrédients achetés, `sell_price` pour le
produit fini vendu — 1re activité Pluton avec un vrai côté achat, nécessite
les 2 prix distincts contrairement à `loadPriceCache()` du moteur partagé
qui n'a jamais eu besoin que d'un seul prix jusqu'ici). **Vérification
préalable qui a évité un faux signal** : 21/107 recettes avaient
`forge_time_hours=0.01` (30s), soupçonné défaut de parsing — recoupé contre
`hotm_forge_durations` (source indépendante, même `item_name`) : confirmé
réel (Bejeweled Handle, Tungsten Key, pièces de drill — vrais crafts rapides
gatés par la rareté des ingrédients, pas par le temps), donnée gardée
telle quelle.

**Tier-scaling réel trouvé** : perk HOTM `quick_forge` (`hotm_perks`,
`stat_formula` sourcée littéralement) — réduit le temps de forge jusqu'à
-30% au niveau 20 max. Appliqué par tier (early=0%, mid=niveau 10≈-15%,
end/late=-30%), même convention "investissement croissant par tier" que
Mining Speed Boost/Reaper Enrage ailleurs dans Pluton.

**Vérifié en base** : 44 recettes priceables des 2 côtés, 32 rentables (ex:
Will-o'-wisp +81.3M/craft, Refined Tungsten +127 916/craft) ; 12 recettes
avec marge négative gardées telles quelles (ex: Gleaming Crystal -3.2M,
Perfect Plate -2.4M — coût réel des ingrédients dépasse la valeur de vente,
donnée réelle, pas cachée). Recoupé à la main sur Refined Tungsten (end/late
= 127 916.46/0.7 = 182 737.80 exact contre la valeur persistée). Cron fusionné
dans `pluton-mining-refresh` existant (même skill, même cadence) plutôt
qu'un nouveau cron séparé. Route de debug temporaire supprimée après
validation.

### ✅ Bestiary / grind mob générique (Combat) — construit et vérifié

Nouveau fichier `lib/pluton-bestiary.ts`, nouveau namespace `activity_key=
'combat'` (distinct de `slayer`/`dungeons`, vérifié additif — 22 blocs
Slayer + 7 Dungeons intacts après). `computeCombatDps`/`computeAttacksPer
Second` extraits dans `lib/pluton-engine.ts` (formule Damage/Damage
Calculation déjà dupliquée 2x sur Slayer/Sea Creature kills — Bestiary est
le 3e consommateur, évite une triplication).

**Correction avant tout code** : une première lecture avait cru que
`game_drops` (`source_type='mob'`, 167 lignes) donnait des probabilités de
drop d'item réelles — vérifié directement, c'est en fait un regroupement de
variantes de mob par bracket Bestiary (`item_id='ZOMBIE_SOLDIER'` y désigne
une catégorie de mob, pas un objet lootable). La seule vraie source de
drops reste le texte libre `zone_mob_stats.drops`.

**Portée bornée, documentée** : `zone_mob_stats` (107 lignes, texte wiki
brut, aucune colonne numérique propre) parsé en best-effort — HP simple
uniquement retenu (multi-niveau `/`, `"X Hits"`, `"?"`, `"(Abilities)"`
explicitement exclus, 11 mobs rejetés) ; seuls les drops **garantis**
comptent dans l'espérance (jamais les `"0-Nx Item"`, dont aucune probabilité
n'est chiffrée nulle part côté wiki source — même discipline que le pool RNG
déjà exclu de `coins_per_hour_boss_phase_only` sur Slayer, 33 mobs rejetés
faute de drop garanti priceable). 63 mobs viables au final sur 107.

**2 bugs réels trouvés et corrigés avant tout persist** (dry-run vérifié
avant d'écrire en base) :
1. Regex HP ne capturait pas le point décimal (`"2.5M"` lu comme `2`, jamais
   multiplié par M car le caractère suivant immédiat était `.` pas `m`) —
   Mutated Blaze/Pack Magma Cube/Smoldering Blaze/Mushroom Bull affectés.
2. Plusieurs lignes `zone_mob_stats` partagent le même `(zone_page, name)`
   avec des drops réellement distincts (3 vraies lignes "Zealot" dans The
   End, une seule droppant un Summoning Eye) — la contrainte
   `UNIQUE(activity_key, block_id)` en aurait silencieusement supprimé 2/3.
   `block_id` suffixé par l'id réel de la ligne source, même discipline
   multi-méthodes que Dungeons.

**Fausse piste évitée** : plusieurs valeurs semblaient aberrantes en 1re
lecture (Jungle Key Guardian ~388K/loot, Zealot→Summoning Eye ~1.2M/loot) —
vérifiées directement contre `price_history` avant d'être "corrigées" à
tort : toutes les deux réelles (Jungle Key ≈194 115 coins, Summoning Eye
≈1 200 931 coins, prix Bazaar actuels), pas des bugs.

**Vérifié en base** : recoupé à la main sur Miner Zombie EARLY (TTK=
0.4431s exact, coins/h=2791.98 cohérent). Cron `pluton-bestiary-refresh`
(quotidien 5h35, `vercel.json`) créé. Route de debug temporaire supprimée
après validation.

### ✅ Trap Hunting (Hunting) — construit et vérifié, lot de fermeture terminé

Nouveau fichier `lib/pluton-hunting.ts` — **1re activité Pluton pour le
skill Hunting** (skill neuf 2025/2026, jamais couvert avant). Formule
réelle sourcée mot pour mot (page wiki "Huntraps", 3 citations Discord dev
`mrkeith` explicitement référencées sur la page elle-même) : temps de
capture par **rareté du shard** (Common 8-12h → Legendary 16-24h), réduit
par le palier de Huntrap (Small 0% → Astral -50%, mappé sur early→late).
Parmi les 321 Attribute Shards réels pricés (`attribute_shards`, rareté +
`bazaar_stock_id` déjà en base), retient le meilleur coins/h par tier —
**Molthorn (Legendary, ~7.07M coins) domine tous les tiers**, recoupé à la
main exact (Astral : 20h×0.5=10h → 706 500.38/h, exact).

**Charm Hunting explicitement écarté, pas oublié** — reclassé selon le
principe mécanique-fondamentale-vs-activité établi dans ce même lot :
Charming est un **modificateur passif** posé sur du combat déjà en cours
(chance `chc%` de shard bonus au kill d'un mob déjà charmable), pas une
activité autonome avec sa propre action+setup. La stat Charm Chance
(0.04%-2% selon niveau Hunting) et la relation Hunter Fortune→nombre de
shards par proc ("multiplicateur hf") ne sont jamais chiffrées précisément
dans le wiki source — mécanisme réel, ampleur non modélisable sans
inventer un ratio. **Forest/Water/Combat Hunting restent des gaps réels**
(stamina Lasso, formule pull Fishing Net, vitesse Black Hole — tous
`{{confirm}}` explicite côté wiki source, pas une recherche insuffisante).

Cron `pluton-hunting-refresh` (quotidien 5h40, `vercel.json`) créé. Route de
debug temporaire supprimée après validation.

**Lot de fermeture de backlog terminé** (4 constructions : Forge/Bestiary/
Trap Hunting + 1 confirmation raw-ore-déjà-fonctionnel, 4 fermetures de
statut décisives : Powder/Kuudra/Enchanted Books/Charm Hunting). Reste
ouvert dans `pluton_skill_activities` (`backlog`, gaps honnêtes documentés,
pas de code à écrire tant qu'aucune source réelle n'apparaît) : Kuudra
(ancre de temps introuvable), Dungeons Master Mode/frag run Floor VI (déjà
notés), Enchanted Books flip (couverture de prix), Forest/Water/Combat
Hunting (mécaniques non chiffrées). Prochaine étape actée : consommateur
frontend du classement `pluton_rankings` (jamais lu par aucune UI à ce
stade) + fonction de recommandation Evolve — scope backend déjà posé dans
le plan pipeline 7-tiers, pas commencé.

## ✅ Pluton Fishing — Sea Creature kills, méthode additive (21 août)

Premier item du backlog des 13 skills fermé (`pluton_skill_activities` id 7,
`backlog`→`built`). Ferme le gap documenté depuis la construction de Fishing
(17 août) : "tuer un Sea Creature nécessite un modèle de combat qui n'existe
pas encore — c'est précisément le sujet de la prochaine activité (Slayer/
Combat)". Ce modèle existe désormais (`lib/pluton-slayer.ts`).

**Architecture délibérément additive, pas une modification de Fishing** :
nouveau fichier `lib/pluton-sea-creatures.ts`, nouvelle ligne
`pluton_target_blocks` (`activity_key='fishing'`,
`block_id='WATER_POOL_SEA_CREATURES'`) — `lib/pluton-fishing.ts` (déjà
validé en prod) n'est pas retouché, même discipline "multi-méthodes" que
Dungeons. Le coins/h produit ici s'ADDITIONNE au `coins_per_hour_raw_block_
only` déjà persisté pour `WATER_POOL`, il ne le remplace pas.

**Gear de combat réutilisé, pas reconstruit** : la progression Zombie
Slayer (Undead Sword→Revenant Falchion→Reaper Falchion+Reaper Armor, même
formule de dégâts déjà sourcée et validée) sert de moteur DPS/TTK. Choix
justifié, pas arbitraire : 2 des 10 Sea Creatures de la pool "basic" (Sea
Walker, Rider of the Deep) sont `mob_type=Undead` — bénéficient réellement
du bonus Multiplicative de ce gear.

**Table des 10 Sea Creatures sourcée page par page** (HP/dégâts/mob_type/
table de loot, nerf Mars 2025 confirmé — PV actuels utilisés, pas les
anciens pré-nerf). Poids réels déjà en base (`sea_creature_pools`,
pool=`basic`, somme=4296, cohérent avec les pourcentages de capture
individuellement documentés par le wiki). **3 corrections d'item_id avant
tout calcul** (`items_catalog` interrogée plutôt que supposée) : Lily Pad =
`WATER_LILY` (pas `LILY_PAD`), Ink Sac = `INK_SACK`/`ENCHANTED_INK_SACK`
(pas `*_INK_SAC`), Enchanted Iron Ingot = `ENCHANTED_IRON` (pas
`*_IRON_INGOT`), Aquamarine Dye = `DYE_AQUAMARINE`. Squid Boots/Fish
Affinity Talisman/Water Hydra Head introuvables en Bazaar, résolus via le
fallback AH (`price_history_ah_variant_base`). **1 item honnêtement non
pricé** : Bone Dye (Sea Archer, drop ultra-rare 1/3M) — aucune entrée
Bazaar/AH trouvée, contribue 0 à l'espérance, documenté plutôt qu'inventé.

**🔴 Bug réel trouvé et corrigé avant tout déploiement** (relecture du code
juste après écriture) : la persistance appelait initialement
`persistSetupsAndRankings()` du moteur partagé (`lib/pluton-engine.ts`),
dont le `delete()` est scopé par `activity_key` SEUL (conçu pour un rebuild
complet d'une activité mono-méthode) — appliqué tel quel à `'fishing'`,
cela aurait effacé les lignes `WATER_POOL` déjà validées avant de les
remplacer par les 4 seules lignes Sea Creature kills. Corrigé en écrivant
une persistance manuelle scopée sur `target_block_id` (delete + insert
propres à cette méthode uniquement) plutôt que de modifier le moteur
partagé (qui reste correct pour Dungeons/futures activités mono-méthode,
seul l'appelant était mal scopé ici).

**Simplification documentée** : le temps de combat n'est PAS soustrait de
la cadence de capture (calculée indépendamment par `lib/pluton-fishing.ts`,
non retouché) — sous-estime légèrement le vrai total plutôt que de coupler
les 2 calculs, même discipline que les autres métriques partielles/
idéalisées déjà documentées (Slayer : phase de farm de mobs non modélisée ;
Dungeons : Classes non modélisées).

**Vérifié en base** (calcul manuel indépendant sur EARLY — TTK pondéré
recalculé à la main sur les 10 créatures avec leurs poids réels :
52.85102s, exact contre 52.85082551256637 persisté) : 4 lignes
`pluton_rankings` (`target_block_id` dédié), additional coins/h
1.12M (early) → 1.72M/h (end/late), s'ajoutant au coins/h `WATER_POOL` déjà
existant. Route de debug temporaire supprimée après validation.

## 🚧 Pluton — pipeline skill→activité→setup→money making, backlog 13 skills établi (21 août)

Recadrage de fond demandé par l'utilisateur : Pluton ne doit pas être une
suite d'activités construites une par une sur commande, mais une vraie
**pipeline** — cartographie (déjà faite, `pluton_elements` 183k lignes) →
extraction (déjà faite) → **pour chaque skill, décortiquer toutes les
activités réelles qui en découlent** → setup optimal par activité **sur
l'échelle 1-7 cumulative** (celle de `pluton_elements`/`milestone_tier_totals`,
pas les 4 paliers early/mid/end/late hérités de Money Making) → lien prix
réel Bazaar/AH → classement meilleur→pire par tier pour le dashboard Money
Making → recommandation Evolve (activité/setup logique actuel + cible de
progression). **Contrainte budget explicite** : ~12€ de crédit API Claude
restant — aucun nouveau pipeline Haiku/cron consommant l'API n'est construit
pour la découverte ; l'énumération des activités reste faite directement par
Claude Code (lecture wiki/`pluton_elements`), même discipline que toutes les
activités précédentes, coût nul (conversation déjà en cours).

**Audit du code existant (agent Explore)** : les 6 calculateurs actuels
partagent du code copié-collé réel (persistance delete-puis-rebuild, lookup
prix Bazaar/AH, boucle tier×cible — extractible dans un futur
`lib/pluton-engine.ts`) mais leurs **formules de rendement restent
structurellement différentes** par activité (tick/softcap Mining,
engine-cap+pest Farming, Sweep Foraging, multi-roll Fishing, DPS/TTK Slayer,
EV-coffre-ancrée-score Dungeons) — un solveur générique unique n'est pas
réaliste sans inventer de raccourcis.

**Backlog des 13 skills réels établi en une seule passe** (table
`pluton_skill_activities`, décision explicite de l'utilisateur : "finis
tout les skills, te mélange pas avec des tâches complexes supplémentaires" —
plutôt que de creuser une seule activité neuve en profondeur). Chaque ligne
est sourcée (wiki `game_mechanics_misc`/`pluton_elements`), jamais inventée :

- **`built`** (6 activités, déjà en prod) : Mining (minage gemstone),
  Farming (culture+pest), Foraging (coupe de bois), Fishing (pêche, Sea
  Creature exclu), Slayer (5/6 Slayers), Dungeons (Floor I-VII Normal Mode).
- **`backlog`** (activités réelles confirmées, pas encore construites) :
  Mining → Powder grinding, Forge (craft) ; Fishing → Sea Creature kills
  (**gap rouvrable maintenant** que le moteur DPS/TTK de Slayer existe) ;
  Combat → **Kuudra** (5 paliers, combat multi-phases, table de loot dense
  ~40 items, sourcé en partie — boss/coûts/loot déjà lus, ancre de temps par
  run pas encore trouvée), Dungeons Master Mode, frag run (ex: Floor
  VI/Sadan, cité explicitement par l'utilisateur — nécessite de sourcer les
  Classes), grind mob générique/Bestiary (diffus, pas investigué) ;
  Enchanting → craft/flip Enchanted Books (marge Anvil, pas encore
  investigué) ; Hunting → 5 méthodes de chasse (Forest/Water/Combat/Charm/
  Trap), drops = Attribute Shards réels (prix Bazaar déjà en base),
  mécaniques non sourcées.
- **`excluded_low_value`** (skill confirmé sans money-making direct — reste
  visible/tracké avec un poids faible pour le grind joueur, pas masqué) :
  **Alchemy** (XP-only, confirmé par le wiki lui-même : "the only
  requirement being Coins"), **Runecrafting** (confirmé cosmétique-only
  explicitement par le wiki), **Enchanting** (le mécanisme XP du skill
  lui-même, distinct du craft/flip listé en backlog ci-dessus), Carpentry/
  Social (déjà confirmés cosmétiques le 17 août), Taming (XP-sink via
  nourriture de pets, `taming_cost` confirmé).

**Prochaine étape actée par l'utilisateur** : continuer à traverser les
skills/activités du backlog (Kuudra "ressortira naturellement" en
traitant Combat plus en profondeur) — pas de deep-dive isolé sur une seule
activité pour l'instant.

## ✅ Pluton Dungeons — Floor I clear complet S+, 1er consommateur de l'architecture multi-méthodes (18 août)

6e activité généralisée, et **premier chantier qui recadre l'objectif réel de
Pluton**. Jusqu'ici, Pluton calculait une seule méthode par (tier joueur ×
cible) — le meilleur setup pour miner tel bloc, tuer tel boss Slayer à tel
palier. En démarrant Dungeons, l'utilisateur a explicitement recadré la
vision : Pluton doit être un moteur qui, pour chaque skill, décompose les
activités/mécaniques/items à plus-value, produit des setups ET des méthodes
de money-making réelles, classe le tout sur les 7 tiers du jeu, et identifie
en continu ce qui est possible et optimal à l'instant T contre les vrais prix
Bazaar/AH — avec, à terme, une capacité d'auto-alimentation en nouvelles
méthodes. Exemple concret donné (Dungeons) : un "frag run" (rush une salle
ciblée, tue un boss/mob spécifique pour son loot, sort) est une méthode
solo-viable **distincte** d'un clear complet à 5 joueurs — les deux doivent
pouvoir coexister et être comparées, plutôt qu'une seule méthode "clear
complet" imposée par défaut.

**Découverte architecturale clé (avant tout code)** : aucun changement de
schéma n'était nécessaire. `pluton_target_blocks` (déjà la table "cible"
partagée par toutes les activités) porte déjà `block_name` (label humain) et
`pricing_note` (texte libre) — il suffit que ces deux colonnes décrivent une
**méthode** plutôt qu'une simple cible ("Floor I — Clear complet (score S+)"
au lieu d'un simple nom d'étage). `pluton_setups`/`pluton_rankings`
fonctionnent déjà tels quels : rien n'empêche plusieurs lignes
`pluton_target_blocks` pour le même `activity_key`+`tier` — le pattern
"plusieurs méthodes par tier" était donc une question de **contenu**
(combien de lignes on insère), pas d'architecture, déjà démontré
implicitement par les 5 paliers de boss Slayer. **Décision explicite** :
pas rétroactif sur Mining/Farming/Foraging/Fishing/Slayer (restent à une
méthode par cible), seulement Dungeons et la suite — réutilisable plus tard
sans migration si besoin.

**Différence mécanique fondamentale avec Slayer** : un run de donjon n'a pas
de formule DPS→temps-de-kill (navigation + puzzles + secrets + boss, aucune
donnée sourcée ne permet de simuler ce temps réel). Le temps de run est donc
**ancré sur un vrai seuil documenté** plutôt que dérivé d'un DPS simulé :
page wiki "Dungeon Score" (formule complète Skill+Explore+Speed+Bonus, 6
rangs D→S+, seuils 0/100/160/230/269.5/300) donne le seuil exact de temps
pour Speed=100 par étage (Floor I : ≤600s). Vérifié déterministe : à ce
temps, Skill=100 (0 mort/0 puzzle raté) + Explore=100 (100% clear, seuil
secrets Floor I=30%) + Speed=100 = score 300 pile (S+), sans même compter le
Bonus crypts — même logique que le plafond moteur 20 actions/sec de
Farming/Foraging (un seuil réel, jamais une moyenne inventée), confirmée par
l'utilisateur ("vise run S ou S+ à chaque fois").

**Coffre de récompense = Obsidian** (meilleur coffre Floor I, pas de Bedrock
avant Floor V) — **personnel par joueur**, pas de partage de loot à diviser
entre le groupe (confirmé wiki "Dungeon Reward Chest" : chaque joueur ouvre
son propre coffre, coût déduit de sa propre Purse/Bank). Party 2-5 requise
pour le run (aucun solo possible Floor I) mais coins/h reste une valeur PAR
JOUEUR, pas divisée.

**Table de loot Floor I complète et réelle sourcée** (nouvelle table
`pluton_dungeons_chest_loot`, 75 lignes, 5 coffres Wood/Gold/Diamond/
Emerald/Obsidian) — extraite mot pour mot depuis la page wiki "The Catacombs
- Floor I - Loot", qui documente déjà le résultat du vrai système
weight/quality simulé par les éditeurs (`average_chance_no_bonuses`/
`average_chance_max_bonuses`, jamais re-dérivé à la main ici). EARLY/MID
utilisent `chance_no_bonus_pct` (aucun accessoire Treasure) ; END/LATE
utilisent `chance_max_bonus_pct` (Treasure Artifact/Ring/Talisman + Boss
Luck perk + Hideongeon Shard maxés — même convention "investissement max"
que Mining/Foraging). **"Added Cost"** par entrée (ex: Bonzo's Staff +2M,
Recombobulator 3000 +5M, Fuming Potato Book +1M, Bonzo's Mask +1M) — un
surcoût réel payé SEULEMENT si l'item concerné est effectivement tiré,
confirmé méthodologie explicite avec l'utilisateur : `E[coût] = coût de
base du coffre + Σ(probabilité × added_cost)`.

**🔴 1 fausse hypothèse corrigée avant le premier calcul** : l'Essence
(Wither/Undead) semblait a priori non-priceable (sert à l'Essence Shop, pas
un objet classique) — l'utilisateur a immédiatement corrigé ("ba si elle se
revend l'essence ??"), vérifié : `ESSENCE_WITHER`/`ESSENCE_UNDEAD` ont bien
un vrai prix Bazaar live (~2238/~610 coins), inclus dans le calcul plutôt
qu'exclu à tort.

**État Floor I initial vérifié** (recoupé par calcul manuel indépendant sur
end/late : E[valeur]≈867 406, E[coût]≈670 034, net×6 runs/h≈1 184 232,
cohérent à l'arrondi près avec les 1 184 185,97 persistés) : 4 combos
initiaux, EARLY/MID≈122 490/h, END/LATE≈1 184 186/h.

**Généralisation Floors II-VII (même jour, suite immédiate)** — l'utilisateur
a tranché "généraliser Floor II-VII (même pattern)" plutôt que de construire
le frag run Floor VI/Sadan en premier. Même méthode "clear complet visant
S+" partout : temps de run ancré sur le vrai seuil Speed=100 par étage,
sourcé page "Dungeon Score" (`<=600s` Floor I/II/III/V, `<=720s` Floor
IV/VI, `<=840s` Floor VII — offsets réels différents par palier de la
formule `T=TotalSeconds-offset`). **Coffre Bedrock choisi dès Floor V**
(disponible à partir de cet étage, score S+ 300 déjà suffisant pour les
deux, Bedrock strictement meilleur qu'Obsidian). Table de loot complète des
6 étages restants sourcée mot pour mot depuis les pages wiki "Floor
II/III/IV/V/VI/VII - Loot" (~230 lignes au total ; Floor VII, la plus
volumineuse à 129 entrées/50 Ko de wikitext brut, extraite via un agent
dédié pour ne pas saturer le contexte principal — même discipline
d'exhaustivité que Floor I, aucune ligne inventée). Nouveaux items par
étage (Adaptive gear Floor II-III, Spirit gear+pet Floor IV, Shadow Assassin
Floor V, Necromancer Lord Floor VI, Wither gear+Necron parts Floor VII) tous
vérifiés avec un vrai prix live (Bazaar puis fallback AH nostar_norecomb).
**1 vrai gap documenté** : "Wither Shard" (Floor VII Bedrock) n'a aucune
entrée `items_catalog` trouvée — `entry_item_id=NULL`, exclu proprement du
calcul (ligne conservée en base pour traçabilité, contribue 0).

**🔴 Bug de performance réel trouvé en vérifiant en prod** : la première
version de `computeAndPersistAllDungeonsRankings()` faisait 1 requête
Supabase par item × ligne de loot × combo tier/étage — jusqu'à plusieurs
centaines de requêtes séquentielles, confirmé par les logs Vercel (dizaines
de `504 Task timed out after 60 seconds` d'affilée). **Piège de sondage
répété reproduit une seconde fois dans cette session** : une boucle de
polling en arrière-plan a re-déclenché la route toutes les ~13s sans
vérifier de statut réel côté serveur, exactement la règle déjà notée le 13
août (curl répétés sans vérifier `sync_log`) — stoppée dès identifiée.
Corrigé en réécrivant le moteur pour tout charger en quelques requêtes
batchées (même pattern que `loadPricedItems` de `lib/gear-pricing.ts` — une
requête large filtrée par date, réduite en `Map` "premier vu = plus récent"
en JS), calcul entièrement en mémoire, inserts `pluton_setups`/
`pluton_rankings` groupés au lieu d'un aller-retour par combo.
`maxDuration` 60→120 en filet de sécurité additionnel.

**État final vérifié en base après le fix** (recoupé par calcul manuel
indépendant sur early/Floor VII Bedrock — le combo le plus complexe,
dominé par les pièces Wither Helmet/Boots ~50-70M à ~6-8% de chance chacune
et Necron's Handle 467M à 0.1%: E[valeur]≈13 460 910, E[coût]≈3 086 349,
net×4.286 runs/h≈44 462 404, cohérent à l'arrondi près avec les
44 460 637,25 persistés) : **28 combos** (7 étages × 4 tiers,
`pluton_rankings` `activity_key='dungeons'`, 0 `has_setup:false`). Floor
III/IV/V/VI ressortent négatifs en EARLY/MID (coût de base fixe du coffre
pas compensé par les chances `no_bonus`, réduites sans investissement
Treasure) mais positifs en END/LATE — écart réel, pas un artefact, cohérent
avec le fait que ces étages nécessitent un vrai investissement Treasure
accessories pour être rentables. Floor VII ressort massivement positif à
tous les tiers (Wither armor/Necron parts, contenu post-F7 réputé lucratif
en jeu, cohérent). Cron `pluton-dungeons-refresh` (quotidien 5h25,
`vercel.json`) rejoue les 28 combos. Route de debug temporaire supprimée
après validation.

**🔴 Gap documenté, pas un oubli** : le système de Classes (Archer/Mage/
Tank/Healer/Berserk, scaling de stats propre) n'est pas modélisé ici — cette
méthode (ancrée sur le score, temps de run externe) ne dépend pas du DPS du
joueur, donc le choix de classe n'affecte pas ce calcul. Un futur "frag run"
ciblé (ex: Floor VI, boss Sadan/Blood Room, exemple cité par l'utilisateur)
redeviendra DPS-dépendant et nécessitera de sourcer les Classes à ce
moment-là — pas construit dans ce chantier.

**Explicitement hors scope de ce chantier** : découverte continue
automatisée de nouvelles méthodes (moteur Claude/Haiku façon
`pluton-weekly-sync`, vision long terme de l'utilisateur) ; Master Mode ; le
frag run Floor VI/Sadan cité en exemple. **Prochaine étape actée par
l'utilisateur** : le frag run Floor VI/Sadan (2e méthode réelle, valide
l'architecture multi-méthodes avec 2 méthodes distinctes sur le même
étage — nécessitera de sourcer le système de Classes, DPS-dépendant cette
fois), avec la même rigueur d'exhaustivité que Slayer.

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

## ✅ Pluton Fishing — construit et validé (17 août)

4e activité généralisée après Mining/Farming/Foraging. Mécanique la plus
complexe rencontrée jusqu'ici : une capture se résout en **4 rolls
successifs** (wiki "Fishing", intro) — Sea Creature (Sea Creature Chance%) →
Trophy (Lotus Atoll/Crimson Isle uniquement, hors scope) → Treasure
(Treasure Chance%, si pas de Sea Creature) → sinon Fish/Junk normal.

**Formule bite-time réelle sourcée** (wiki "Fishing Speed#Mechanics") :
`Ticks = BaseTicks(200-400, moy.300) − (FishingSpeed/FishingSpeedCap)×BaseTicks`,
`Secondes = Ticks/20`, `Ticks=0` si `FishingSpeed≥FishingSpeedCap` (300
"Everywhere else"). Contrairement à Farming/Foraging, **aucune réutilisation
du plafond moteur 20 actions/seconde** ici — cette formule EST déjà le vrai
mécanisme source de cadence (pas un palier à défaut d'alternative).
Décompte de prise (1-4s, moy. 2.5s) non affecté par Fishing Speed, réduit
-25% via Quick Bite (END/LATE uniquement).

**🔴 Sea Creature exclu du calcul de coins/h — gap documenté, pas un oubli** :
tuer un Sea Creature nécessite un modèle de combat (PV du mob, dégâts/s du
joueur, temps de kill) qui n'existe pas encore côté Pluton — c'est
précisément le sujet de la **prochaine activité (Slayer/Combat)**. Sea
Creature Chance reste modélisée comme une fraction de captures perdues
(jamais retirée du dénominateur captures/heure), donc `coins_per_hour_raw_
block_only` **sous-estime le vrai revenu Fishing** (le loot de Sea Creature
est souvent la vraie source principale de revenu en jeu) — documenté
honnêtement, même catégorie que le taux de coffre au trésor jamais modélisé
par Mining.

**Table de loot Treasure réelle et complète** (`Treasure/Loot/Water`, wiki,
37 lignes distinctes — dédupliquées depuis `pluton_elements` qui en portait
148, artefact de classification antérieur non corrigé ici, hors scope),
3 paliers qualité good/great/outstanding (89%/10%/1%, wiki "Treasure") +
palier "Normal Catch" (Fish/Junk hors Treasure), poids wiki utilisés tels
quels comme probabilités. Items non pricés (Raw Salmon/Tropical Fish/
Pufferfish base, Enchanted Tropical Fish, pets Squid — aucun prix Bazaar/AH
fiable trouvé) contribuent 0 à l'espérance, jamais inventés.

**Gear sourcé et pricé réel** (`pluton_fishing_armor_stats`/`pluton_fishing_
rod_stats`) : armures Angler(early)→Backwater→Diver's→Sponge→Shark Scale→
Abyssal(late) — spécialisées Sea Creature Chance+Treasure Chance, **0
Fishing Speed** (absentes de la table wiki "Fishing Speed#Sources", même
pattern de spécialisation par stat déjà observé sur l'armure Helix de
Foraging) ; cannes Fishing Rod→Challenging→Rod of Champions→Rod of
Legends→Rod of the Sea (Fishing Speed+Sea Creature Chance). Salmon/Thunder/
Magma Lord Armor exclues (aucun prix AH récent fiable). 22 nouvelles lignes
`stat_bonus_sources` (pets compétitifs testés par impact réel coins/h comme
Mining/Foraging, équipement necklace/cloak/belt/bracelet — Frozen Amulet
domine strictement au collier, chaîne Ichthyic/Finwave/Gillsplash choisie au
cape/ceinture/gants — simplification documentée, pas une vraie comparaison
combinatoire par slot —, accessory-bag talismans/rings/artifacts au palier
max de chaque chaîne, couche investissement max END/LATE avec enchants/
reforges/gemmes réels).

**1 vraie erreur de transcription trouvée et corrigée avant tout test** : le
palier "great" de la table de loot pointait par erreur vers `GRAND_EXP_
BOTTLE` au lieu de `TITANIC_EXP_BOTTLE` (le vrai objet de cette ligne wiki)
— repérée en relisant le code juste après écriture, corrigée avant le
premier déploiement de vérification.

**État final vérifié en base** (recoupé par calcul manuel indépendant sur le
tier EARLY — espérance Treasure ≈14.9K, cohérente à l'arrondi près) : 4
combos tier×cible (une seule cible réelle `WATER_POOL`, générique — hors
Backwater Bayou/Lotus Atoll/Jerry's Workshop), coins/h 149K-192K/h
(`raw_block_only`, nettement plus bas que Mining/Farming/Foraging — cohérent
avec l'exclusion documentée du Sea Creature, pas un signal d'erreur). Cron
`pluton-fishing-refresh` (quotidien 5h10, `vercel.json`) créé, même pattern
que les 3 précédents. Route de debug temporaire supprimée après validation.

**Prochaine étape actée par l'utilisateur** : Slayer/Combat — fournira
justement le modèle de dégâts/temps-de-kill qui manque ici, avec l'occasion
de revenir enrichir Fishing avec la valeur Sea Creature une fois ce modèle
disponible (piste notée, pas un chantier automatique). Puis Dungeons.

## ✅ Pluton Foraging — construit et validé (17 août)

Généralisation du moteur Pluton à une 3e activité, après Mining/Farming.
Mécanique hybride des deux précédentes, jamais rencontrée telle quelle avant :
- Comme Mining : une vraie stat de gear (**Sweep**) détermine le rendement PAR
  ACTION (logs par swing), formule réelle sourcée wiki "Sweep#Sources" —
  `Logs = 1 + min(35, 4×log10(1+max(0,(Sweep+√Sweep−Toughness)/Toughness^0.511)^1.9))`,
  plafond 36 logs/swing. Toughness (même stat que Block Strength de Mining) :
  Fig=10, Mangrove=50, Helix=150.
- Comme Farming : aucune stat de gear ne détermine la cadence de swing (aucun
  "Foraging Speed" documenté, contrairement à Mining Speed) — réutilise le
  même plafond moteur Minecraft (20 actions/seconde) déjà validé et approuvé
  par l'utilisateur pour Farming le 5 août, généralisé ici sur demande
  explicite ("essaye de toujours créer nos formules comme ça si on a pas de
  donné exact").
- **Foraging Fortune** (stat séparée, "100 FF = +1 log garanti") multiplie le
  rendement par swing, formule identique à Mining/Farming Fortune.

Design réel confirmé en sourçant (pas supposé) : le gear Helix (Torrhus
Canyon, Toughness=150, le plus élevé) investit à 100% en Sweep, **zéro**
Foraging Fortune (absent des tables wiki "Foraging Fortune#Armor"/"#Tools")
— cohérent avec un bloc à très haute résistance où le vrai goulot
d'étranglement est le rendement par swing, pas le multiplicateur de drop.

**Gear sourcé et pricé réel** (nouvelles tables `pluton_foraging_armor_stats`/
`pluton_foraging_tool_stats`, même schéma que Mining) : Canopy Armor (early,
~2.3M), Fig Armor+Fig Hew/Figstone Splitter (mid, déjà en base depuis
l'architecture v2), Helix Armor+Helix Chopper (end/late, ~181M) — Spruce Axe
exclu (outil starter non-tradeable, aucune ligne `item_stats`, cohérent avec
l'exclusion déjà actée de `LEAFLET`/`PARK` Armor). `stat_bonus_sources`
étendue avec 14 nouvelles lignes `stat_name='sweep'` (pets Jade Dragon/Sloth,
accessoires avec vraie compétition par slot — Honeycomb Necklace bat Mangrove
Locket, Torrhus Belt bat Moonglade Belt, Veilshroom Bracelet bat Mangrove
Grippers —, enchant Sweep Booster, milestone Swoop, consommable Century
Cake). Sharpening Attribute Shards (Crow/Heron/Vulture, bonus cible-spécifique
Fig/Mangrove/Helix) modélisés en couche investissement max END/LATE séparée
(pas dans `stat_bonus_sources`, faute de colonne cible — même précédent que
les bonus Gemstone-only de Mining, déjà hardcodés en constantes).

**MVP documenté, pas caché** : ordre de coupe optimal assumé (pénalité -50%
réelle si mauvais ordre/jet de hache, non modélisée) ; Gecko/Tiamat Shard
(amplificateurs %, système d'Attribute Shards à slots/niveaux propre non
construit) non modélisés ; Phanpyre/Groundhog (jour/nuit), Tadgang (collection
non cataloguée), Mochibear/Bambuleaf (croisement Combat ambigu) exclus —
situationnels/non vérifiés, même discipline que les "Temporary Sources" déjà
exclues par Farming.

**1 vrai bug trouvé et corrigé en vérifiant en prod** : une première version
ajoutait le bonus enchant/milestone/consommable (+64 Sweep) une seconde fois
dans la couche investissement max END/LATE, alors qu'il était déjà appliqué à
tous les tiers via `stat_bonus_sources` — confirmé par calcul manuel sur le
`total_sweep` persisté (308+114 au lieu de 308+50 attendu pour FIG_LOG
END/LATE). Corrigé, revérifié en base : FIG_LOG 358 (308+50 Crow Shard),
MANGROVE_LOG 453 (353+100 Heron Shard), HELIX_LOG 543 (393+150 Vulture
Shard) — exact.

**État final vérifié en base** : 12 combos tier×bloc (`pluton_rankings`
`activity_key='foraging'`), coins/h cohérents (7.9M-19.2M/h selon
tier/bloc, "raw_block_only" — vente du log brut au Bazaar uniquement, même
convention que Mining/Farming, Tree Gifts/loot non inclus). Cron
`pluton-foraging-refresh` (quotidien 5h00, `vercel.json`) créé, même pattern
que `pluton-mining-refresh`/`pluton-farming-refresh`. Route de debug
temporaire supprimée après validation.

**Prochaine étape actée par l'utilisateur** ("Sourcing wiki d'une activité à
la fois") : Fishing, puis Slayer/Combat, puis Dungeons — même discipline
(wiki officiel, formules réelles, plafond moteur si aucune donnée exacte
n'existe). Généraliser un vrai solveur générique reste différé jusqu'à avoir
2+ activités réelles construites (objectif `PLUTON-ARCHITECTURE.md`, pas
commencé).

## 🚧 Audit général — nettoyage pont pricing/mécanique (17 août, en cours)

Suite du volet sécurité/performance Supabase (section dédiée plus bas). Étape
4 de la séquence du 17 août, poussée par la demande explicite : deux "ponts"
logiques Supabase — **pricing** (collecte+buffer+historique, alimente Flash
Alert/Radar/historique) et **mécanique** (base de Pluton+Haiku pour tout
calcul dashboard) — doivent être automatisés dans toute leur forme, sans
faille, sans table/route inutile.

**Audit A/B/C/D/E mené via 3 agents Explore en parallèle (lecture seule)** +
vérification directe de chaque trouvaille avant toute correction.

**🔴 Corrections de sécurité appliquées** :
- `test-skycofl-token` — fuite réelle des 10 premiers caractères de
  `SKYCOFL_ACCOUNT_TOKEN` sans authentification, route de debug oubliée en
  prod. **Supprimée.**
- `item-history`/`item-search` — bypass total du gating Pro+ (clé
  service-role, aucune vérification de plan) malgré 0 appelant frontend
  actuel. Font partie du pont pricing (alimentent "l'historique de prix" —
  confirmé nécessaire par l'utilisateur), donc **gatées `requirePlan('pro')`**
  plutôt que supprimées. `item-history` étend au passage la variante "base"
  (`price_history_ah_variant_base`), jamais exposée jusqu'ici alors que
  exact/blended l'étaient déjà.
- `skycofl-ah-import`/`skycofl-import` — aucune vérification d'accès
  (contrairement aux routes sœurs `init-ah-import`/`admin/build-id-mapping`
  qui vérifient `Bearer CRON_SECRET`) — même garde ajoutée.

**🔴 2 bugs "status=success" trompeurs corrigés (même cause racine : `error`
jamais vérifiée sur un appel Supabase)** :
- `update-catalog` — `supabase.rpc('get_all_catalog_items')` échouait
  silencieusement, `items_catalog.updated_at` figé depuis le 30 juillet
  malgré un "success" chaque nuit. `error` désormais vérifiée + catalogue
  vide = échec explicite.
- `data-retention` — DELETE monolithique sur `price_history_ah` (1,5M lignes
  en retard de purge, 45% de la table) et `price_history` (296 lignes)
  retombait en erreur PostgREST jamais lue. Remplacé par un DELETE par lots
  via 2 nouvelles fonctions SQL (`delete_old_price_history_ah`,
  `delete_old_price_history_by_bucket_date`, même pattern LIMIT+boucle que
  `delete_old_price_history` déjà existante).

**🟡 Nettoyage code mort** : `debug-boss-kills` (reliquat de debug),
`refresh-variant-stats`/`backfill-variant-stats` (référencent une
RPC/table — `item_variant_price_stats` — qui n'existe plus, ancienne
architecture) — **3 routes supprimées**. Table `accessories` (0 ligne,
doublon structurel d'`accessory_powers`) — **supprimée**. 6 tables 0-ligne/
0-référence/0-cron remplacées par une architecture plus récente et réelle —
**supprimées** : `bazaar_5min`/`bazaar_aggregates` (→ `bazaar_1h`+agrégation
réelle), `game_context` (→ `get_full_context()`), `loot_tables` (→
`crystal_hollows_loot`/`sea_creature_pools`/etc.), `bestiary_milestones`
(→ `bestiary_mobs`/`bestiary_brackets`), `events_calendar` (→
`skyblock_news`/`skyblock_mayor_election`/`skyblock_bingo_events`).
**Gardées, décision explicite de l'utilisateur** : `claude_insights`,
`claude_predictions`, `craft_arbitrage`, `market_anomalies`, `player_builds`,
`reddit_signals` — 0 ligne aussi mais aucune remplaçante identifiée,
traitées comme des idées de roadmap jamais tranchées plutôt que du legacy.
`app/api/player/money-making` (route complète, jamais appelée par le
frontend, contredit la note "remplacé par Evolve Skills") — **gardée**,
décision explicite de l'utilisateur, redevient un vrai manque frontend à
documenter plutôt qu'à supprimer.

**✅ Pont mécanique — trou d'automatisation trouvé et fermé** :
`lib/pluton-mining.ts` (formules Ruby/Topaz/Jasper validées le 5 août)
n'était importé par AUCUNE route — le calcul initial avait été fait une fois
via une route de debug puis jamais rebranché. `pluton_setups`/
`pluton_rankings` (`activity_key='mining'`) n'avaient plus été recalculées
depuis 12 jours, `real_cost`/`coins_per_hour` figés sur des prix d'il y a
12 jours. Nouveau cron `pluton-mining-refresh` (quotidien 4h30) — rejoue
exactement `computeAndPersistAllMiningRankings()` déjà validée
(DELETE-puis-rebuild scopé à `activity_key='mining'`, aucune formule
modifiée). La généralisation complète du moteur de calcul (Phase C,
`PLUTON-ARCHITECTURE.md`) et les 5 autres activités (Farming/Foraging/
Fishing/Slayer/Dungeons) restent un chantier séparé, pas fait ici — ce
cron ferme uniquement le trou d'automatisation trouvé par l'audit.

**⚠️ Incident externe pendant cette phase** : panne partielle GitHub
(`githubstatus.com`, composants Webhooks/API Requests en `degraded_
performance`) le 17 août après-midi — les push `git` vers `master`
continuent de réussir mais le webhook GitHub→Vercel ne déclenche plus les
builds automatiquement. Commits `769b90d` (nettoyage pont pricing) et
`8af3894` (cron `pluton-mining-refresh`) poussés mais pas encore déployés
au moment de la rédaction — **routes de debug temporaires déjà en place**
(`trigger-update-catalog`, `trigger-data-retention`,
`trigger-pluton-mining-refresh`) pour vérifier les 3 fixes dès que le
déploiement reprend, à supprimer après vérification comme d'habitude.

## ✅ Calibrage crons + optimisation coûts (17 août, après Pluton)

Étapes 2 et 3 de la séquence actée par l'utilisateur le 17 août.

**Calibrage crons** — audit des 20 crons actifs via `sync_log` réel (7 jours) :
- **🔴 Bug réel trouvé+corrigé** : `wiki-referential-sync`/`trapper_pelts` en échec
  ("0 modificateurs extraits") — la page wiki "Pelts" a changé son gabarit d'item
  de `{{ID|...}}` vers `{{Item|...}}` entre le 10 et le 15 août (régression côté
  source, pas côté code, confirmé en lisant le contenu wiki caché réel). Regex
  élargi pour accepter les deux gabarits, vérifié en prod via route de debug
  temporaire (8 lignes, mêmes valeurs qu'avant la régression), route supprimée.
- `setup-generate-agent` partial (23/24) confirmé conforme au comportement
  intermittent déjà documenté, pas une régression.
- Pic `ah-collect` à 198.8s (7 jours) tracé à une fenêtre isolée le 11 août
  (coïncide avec le déploiement de l'optimisation ce jour-là) — base saine sur
  les dernières 24h (23.1s moyenne, 32.8s max, 0 erreur sur 1438 runs).
- Chevauchements notés mais non corrigés faute de vrai problème observé :
  `money-making-agent`/`patch-analysis-agent`/`skyhanni-repo-sync` à 6h lundi,
  `setup-generate-agent`/`radar-agent` à 7h lundi — durées modestes, aucune
  contention constatée.

**Optimisation coûts** — audit du prompt caching Claude API sur les 6 routes
faisant des appels directs à `api.anthropic.com` : `money-making-agent`,
`setup-generate-agent`, `radar-agent`, `evolve-skills` l'avaient déjà (`system`
en tableau + `cache_control:{type:'ephemeral'}`). **Vrai trou trouvé** :
`pluton-weekly-sync` (construit le jour même) ne l'avait pas sur ses 2 boucles
Haiku (`callHaikuB2`/`callHaikuClassify`, appelées une fois par page/lot de 25
pages avec le même system prompt statique à chaque fois) — corrigé, même
pattern. `patch-analysis-agent` vérifié SANS trou réel : ses 2 appels (Sonnet
live + Haiku alpha) ont des system prompts et modèles différents, aucun
préfixe partagé à mettre en cache.

Côté Vercel : `ah-collect` reste de très loin le premier poste de coût
(~55h/semaine même optimisé, contre <3h/semaine pour tout le reste combiné) —
structurel à la fréquence 60s voulue par l'utilisateur, pas un bug. Levier
restant identifié mais **délibérément pas touché** (risque jugé supérieur au
gain pour l'instant, décision utilisateur) : `decodeItemBytes` utilise
`gunzipSync` (bloquant CPU) au lieu d'un décodage async, refactor qui
toucherait plusieurs points d'appel partagés — laissé en dette technique
documentée plutôt que tenté à la légère sur le chemin le plus chaud du projet.

## ✅ Audit général — volet sécurité/performance Supabase (17 août, Pluton clos)

Première tranche de "audit général Vault+Pluton" (étape 4 de la séquence du 17
août) : advisors Supabase (`security`+`performance`) réels, pas devinés.

**Sécurité — 1 vraie faille corrigée** : `method_feedback_summary` (vue
`SECURITY DEFINER`, gap connu documenté depuis le 22 juillet) bypassait
toujours le RLS de `method_feedback` (0 policy dessus) — exploitable en direct
via l'API REST publique (clé anon) en contournant entièrement le gating
`requirePlan('pro')` de l'app Next.js, indépendamment de celle-ci. Sans impact
réel tant que la table reste vide (vérifié : toujours 0 ligne), mais aurait
fuité tout commentaire libre cross-user dès le premier vrai feedback. Corrigé
par `ALTER VIEW ... SET (security_invoker = true)` — les 2 vrais consommateurs
(`money-making-agent`, `/api/method/vote`) utilisent la service-role key donc
aucune régression (RLS toujours bypassé pour eux), seul l'accès direct anon
est maintenant bloqué comme prévu. Revérifié : `select * from
method_feedback_summary` toujours fonctionnel côté service-role.

**Vérifié et laissé tel quel (faux positifs / design intentionnel)** :
`ah_live_free_preview`/`bazaar_1h_free_preview` (`SECURITY DEFINER`
délibéré — c'est le mécanisme même du tier Free, exposent volontairement
top-5/colonnes réduites en bypassant le RLS des tables payantes) ;
`distinct_items` (expose seulement des `item_id`, déjà publics ailleurs,
aucun risque réel) ; `has_plan()` (scopé `auth.email()`, jamais de fuite
cross-user) ; `rls_auto_enable()` (event trigger — Postgres ne permet
structurellement pas de l'invoquer via RPC malgré la permission EXECUTE
listée par le linter).

**28 fonctions durcies** (`search_path` fixé, même pattern que
`pluton_rarity_to_tier`/`pluton_networth_to_tier` du 13 août) — migration
`harden_function_search_paths`, liste complète dans l'historique de
migrations Supabase.

**Performance — 2 fixes réels** : doublon d'index sur `price_history_ah`
(`idx_pah_bucket_date`, table à fort trafic — `ah-collect`/`ah-aggregate`
écrivent dessus quotidiennement) supprimé. RLS `auth.email()`/`auth.uid()`
non wrappés dans `(select ...)` sur `subscriptions`/`hypixel_account_links`
(réévalués ligne par ligne) corrigés en initplan. **Laissé tel quel** :
doublons d'index sur `kuudra_data`/`slayer_data` — tables stub Phase-0 déjà
mortes (voir audit de clôture du 4 août), pas de bénéfice réel à toucher
leurs contraintes UNIQUE ; 4 FK non indexées + 5 index jamais utilisés,
niveau INFO seulement, pas de signal de problème réel constaté.

**Reste hors SQL, action manuelle utilisateur** : `auth_leaked_password_
protection` (protection HaveIBeenPwned) désactivée — se règle dans le
dashboard Supabase (Authentication → Providers → Password), pas via
migration.

## Sessions du 22 juillet au 17 août — archivées (voir CLAUDE-archive.md, 2e vague, 23 août)

Construction complète Pluton architecture v2 (`pluton_elements`), Mining/Farming
validés (5 août), CLÔTURE/CHANTIER FINAL de la cartographie, extraction brute NEU-REPO/
wiki, cartographie exhaustive Hypixel Skyblock, computeMilestones étendu, Evolve Skills
SkillBar/SkinArmorRender (CSS 3D puis three.js), setup-generate-agent grounding, sécurité
compte/facturation. CLAUDE.md avait dépassé 212k caractères (limite 150k) — narratif
déplacé, état actuel du système inchangé et toujours documenté ci-dessus/ci-dessous.

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
12. **Pluton architecture v2 terminée (17 août)** — voir section dédiée plus haut.
    Reste à construire : le moteur de calcul SQL + le Haiku "instructeur"
    d'objectifs dashboard consommant `pluton_elements` (Money Making + Evolve).
    Puis, dans l'ordre acté par l'utilisateur le 17 août : calibrer les crons,
    optimiser à nouveau les coûts Vercel/Claude API (prompt caching pas encore
    implémenté sur les nouvelles routes), audit général Vault+Pluton, nettoyage
    complet + finalisation v1 prod, refonte frontend, 1 semaine de test réel sur
    le compte Hypixel de l'utilisateur, puis lancement.

## Ce que je ne veux PAS

- Repartir sur n8n / Google Sheets / SkyCrypt
- Reproposer une refonte Money Making sans demande explicite
- Reproposer l'ancien format Personal Money Making (table `player_money_making`,
  abandonné avant d'être codé le 22 juillet) — remplacé par Evolve Skills
- Fragmenter les appels Claude par sous-catégorie
- Repartir sur "NBT enchantements différé" — c'est fait, pipeline live
- Purge SQL sans vérifier le contenu réel de la table de référence
- Reconstruire l'ancien design Evolve du 13 juillet sans vérifier d'abord le repo
