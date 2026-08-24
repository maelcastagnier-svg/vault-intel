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

## 🔴 Constat majeur — le pipeline n'était PAS respecté à la lettre (24 août)

**Correction fondamentale demandée par l'utilisateur**, après plusieurs tours
d'audits ponctuels dans la même journée : *"on reprend tout, c'est bien de
s'en rendre compte, on respecte le plan a la lettre, meme si sa doit
modifier toute la methode de traitement, trouve une architecture qui
respecte le plan final."* Vérifié directement en base plutôt que supposé :

- **`pluton_elements` (184 416 lignes) — 69% jamais classé par skill**
  (`activity IS NULL` sur 127 160 lignes). Seul `element_type='item'`
  (49 628 lignes) a été classé en Phase 1 (21 août) — tout le reste
  (`mechanic_formula` 36 912, `mob_zone_data` 24 017, `progression_
  milestone` 15 578, `general_mechanic` 12 940) n'a jamais été rattaché à
  un skill.
- **Même les lignes déjà classées Mining (2 342) sont 63% sans tier**
  (`tier IS NULL` sur 1 466 lignes) — impossible de dire fiablement "voici
  100% de ce qu'un joueur tier N doit savoir sur Mining" avec ces trous.
- **Aucun calculateur (sauf `pluton-combat.ts`/Zombie Slayer) ne consulte
  `pluton_elements`** — le "Système A" (cartographie classée) et le
  "Système B" (calculateurs, tables dédiées + lookups wiki ponctuels)
  restent déconnectés, exactement le diagnostic du 21 août jamais refermé
  au-delà de Zombie Slayer. Conséquence directe : les setups ont été
  construits sur une petite liste de candidats choisis à la main
  (`pluton_mining_armor_stats` etc.), jamais sur l'inventaire exhaustif
  réellement cartographié — violation directe de la règle "setup optimal =
  recherche réelle, pas un chemin canonique."

**Architecture retenue pour corriger, sans tout réécrire à l'aveugle** :
le moteur de recherche (combos armure×outil, garde le meilleur réel) était
déjà correct dans son principe pour Mining — le vrai trou est la **taille
du pool de candidats**. Plutôt que de forcer une classification complète
des 127k lignes avant tout (des mois de travail, beaucoup de bruit réel —
recettes de craft, Bits Shop, rolls d'event — mélangé aux vrais candidats),
la méthode retenue : **auditer skill par skill, exhaustivement, l'inventaire
`pluton_elements` déjà classé pour ce skill** (agent dédié, lecture des 767
noms distincts pour Mining, triage bruit/réel, recoupement wiki+prix), puis
**peupler les tables de candidats déjà consommées par le moteur** (`stat_
bonus_sources`, `pluton_mining_armor_stats`, `pluton_mining_tool_stats`)
avec tout ce qui est réel — pas une réécriture du moteur de calcul lui-même.

### ✅ Mining — 1er skill traité selon cette méthode, vérifié en base

Agent dédié : 767 noms distincts `pluton_elements` (`activity='mining'`,
`element_type='item'`) triés intégralement (pas un échantillon), recoupés
contre `game_mechanics_misc`/`items_catalog`/`price_history`. **Trouvailles
réelles, toutes vérifiées et intégrées** :
- **Trou structurel confirmé** : `applyPetsAndAccessories()` (déjà générique,
  pilotée par `stat_bonus_sources`, pas hardcodée) sommait TOUS les candidats
  du même `equip_slot` au lieu d'en arbitrer 1 seul — aurait porté 2 colliers/
  2 capes simultanément dès qu'un 2e candidat existe dans le même slot
  (`equip_slot_capacity` confirme max_count=1 réel pour necklace/cloak/belt/
  bracelet). Corrigé : arbitrage par impact réel coins/h, même discipline que
  le fix Foraging du même jour.
- **22 lignes `stat_bonus_sources` réelles jamais insérées** : Amber Necklace,
  Amethyst Gauntlet, chaînes Mithril/Titanium Belt/Cloak/Necklace/Gauntlet,
  Glossy Mineral Talisman, Haste Ring.
- **Gemstone Gauntlet** (BP=8/Speed=800, prix AH réel ~125M) absent des
  candidats outil malgré une vraie donnée — ajouté.
- **Doublon mort supprimé** : `pluton_mining_armor_stats` id=1 (`EMBER_ASH`)
  pointait vers des item_id LEGACY non-tradeable, doublon exact de
  Flamebreaker Armor (id=8, item_id actuels) — supprimé.
- **Bingonimbus 2000** (Mining Fortune+100/Speed+1500, supérieur à Divan's
  Drill) confirmé et **exclu explicitement** : soulbound sur profil Bingo
  séparé, jamais transférable vers un profil normal — piège documenté, pas
  un oubli. Pickonimbus 2000 (déjà en base, HOTM IV, tradeable) est le vrai
  équivalent normal.
- **2 gaps réels documentés, pas fermés** (`pluton_mechanic_coverage`) :
  chaîne Drill Engine Mithril→Amber jamais scalée par tier (constante plate
  actuelle) ; set bonus True Dwarf (4 pièces Titanium, +50 speed/+40 MF)
  jamais modélisé (la recherche arbitre chaque slot indépendamment).

**🔴 Incident opérationnel pendant cette passe** : le premier redéploiement
a fait planter silencieusement `computeAndPersistAllMiningRankings()` aux
tiers professional/master (0 ligne minage brut persistée, seulement Forge)
— root cause confirmée après diagnostic isolé : la route de debug chaînait
Mining derrière 4 autres activités dans la même invocation, le budget
`maxDuration` partagé s'épuisait avant la fin de Mining (le plus lourd des
5). Vercel coupe l'exécution sans lever d'exception JS catchable. Corrigé
en isolant Mining dans sa propre invocation à budget plein — **196/196
combos recalculés, 160 avec setup réel, master/professional retrouvent
28/28 blocs bruts** (identique à intermediate/skilled/expert). Vérifié en
base : accessoires now 1 seul par slot (Divan Pendant/Sapphire Cloak/Jade
Belt/Dwarven Handwarmers à master, aucun doublon).

**Mise à jour (nuit du 24 au 25 août)** : la classification complète des
127k lignes a depuis été terminée (voir section dédiée ci-dessous,
`activity IS NULL` = 0/184 416) et 6 skills supplémentaires ont reçu le
même traitement "agent dédié + peuplement des tables candidates" que
Mining — voir "🌙 Nuit du 24 au 25 août" ci-dessous pour le détail complet.

## 🌙 Nuit du 24 au 25 août — travail en autonomie complète, mandat utilisateur

**Contexte** : après le constat ci-dessus, l'utilisateur a explicitement
mandaté un travail autonome nocturne (*"travail en full autonomie jusqu'a
demain matin... pas de demande d'accés a me faire... je veux un vrai
avancement sur le plan finale... architecture propre, automatisation
pensé pour plus tard, respect du plan"*), puis (*"crée un systeme pensé
pour etre automatisé avec haiku plus tard ou sans si tu peux, qui retrie
les données extraites et les classe dans chaque tier de chaque skills...
c'est necessaire pour avancer"*) et enfin (*"travail jusqu'a ta limite de
session et recommence... je veux un compte rendu de toute tes session de
cette nuit demain matin a 8h avec un vrai progrés"*).

### ✅ 1. Moteur de classification `pluton_elements.activity` — 100% terminé

Table `pluton_classification_rules` créée (rejouable, inspectable, 2
`rule_type` : `source_table` pour les tables dédiées déjà skill-connues,
`keyword` pour les préfixes de page wiki + marqueurs bulk
`__element_type_X__` appliqués uniquement après échantillonnage manuel
confirmant l'homogénéité du contenu). `lib/pluton-classification.ts`
(`runActivityClassification()`, idempotent) + cron hebdomadaire
`pluton-classification-sync` (lundi 6h10, après wiki-referential-sync/
skyhanni-repo-sync) pour automatisation future — voie Haiku laissée
ouverte (`sampleUnclassifiedPageTitles()`) mais pas utilisée cette nuit
(travail fait par Claude Code, coût nul, mémoire `feedback_budget_api_
claude`). **127 160 → 0 ligne `activity IS NULL` (100%)**, `__none__`
103 900 (56.3%, contenu confirmé non-skill : cosmétique/événementiel/
NPC dialogue/générique compte, échantillonné avant tout bulk), reste
réparti sur les 13 skills réels + zones spéciales. Expansion réelle par
skill vs avant cette nuit : combat 5459→25740 (+371%), dungeoneering
2349→8499 (+262%), mining 2342→8068 (+245%), fishing 2784→7853 (+182%),
farming 2364→5636 (+138%), foraging 1040→3186 (+206%), hunting 1417→2745
(+94%).

### ✅ 2. Audits exhaustifs "candidats réels" — 7 skills traités (agents dédiés)

Méthode Mining (voir "Constat majeur" ci-dessus) reproduite skill par
skill : agent dédié lit tout l'inventaire `pluton_elements` déjà classé
pour ce skill, trie bruit/réel, recoupe wiki+prix, rapport structuré —
puis fermeture directe (moi, pas l'agent) des trous confirmés dans le
code + les tables candidates déjà consommées par chaque moteur.

- **Foraging** — gap "Logger" (niveau skill Foraging, +4 FF/niveau,
  jusqu'à +228 à niveau 57 max) jamais modélisé, source à elle seule plus
  grosse que HOTF+Lumberjack+Citrine combinés — fermé. 2 items déjà en
  base avec une stat manquante corrigés (Honeycomb Necklace Sweep 5→2 réel
  + FF+25 absente, David's Cloak FF+50 absente), 1 doublon obsolète
  supprimé (Mangrove Vine, renommé Moonglade Belt).
- **Farming** — gap structurel majeur : les 4 slots équipement (necklace/
  cloak/belt/bracelet, chaîne Peony~16M/Blossom~64.5M) n'étaient JAMAIS
  achetés aux tiers MID (seulement absorbés dans la constante figée du
  tier MAX) — fermé, budget réel du tier MID désormais utilisé. 2e gap
  même famille : le revenu Pest Farming n'était calculé qu'au tier MAX
  alors que l'armure Cropie/Squash/Fermento déjà utilisée à MID porte un
  vrai Bonus Pest Chance (12.5/15/17.5 par pièce) jamais exploité — fermé
  pour ces 3 tiers d'armure.
- **Fishing** — 2 armures réelles jamais évaluées, toutes deux supérieures
  à Abyssal (SCC+8%, meilleur choix actuel) : Thunder Armor (SCC+16%,
  Fishing 36) et Magma Lord Armor (SCC+18%, Fishing 45) — ajoutées. Bug
  structurel confirmé (même famille que Mining/Foraging) : aucune
  compétition réelle par slot necklace/cloak/belt/bracelet, ne produisait
  pas encore de résultat faux uniquement parce qu'1 seul candidat existait
  par slot — corrigé avant d'ajouter 10 nouvelles lignes `stat_bonus_
  sources` (chaîne Angler/Backwater cheap-tier, Prismarine Necklace),
  sinon le bug se serait immédiatement révélé.
- **Mining** — voir section "Constat majeur" ci-dessus (fait avant le
  reste de la nuit).
- **Combat/Slayer** — 🔴 trouvaille principale : **Halberd of the
  Shredded** (`AXE_OF_THE_SHREDDED`, upgrade de Reaper Falchion, Zombie
  Slayer 8) bat Reaper Falchion d'environ +35% DPS (Damage+140/Force+115/
  +250% Undead contre 120/100/+200%, 2 emplacements gemme contre 1) —
  jamais considérée. Gate ZS8 vérifiée réelle et atteignable (contenu
  wiki complet récupéré, table "Leveling Rewards" montre un niveau IX
  au-delà). Ajoutée au palier "late" de `GEAR_BY_SLAYER_TIER.zombie`,
  évaluée par le moteur de recherche DPS déjà existant. 2 gaps
  supplémentaires documentés, pas fermés cette nuit (complexité/heure
  tardive) : slot "Gloves" entièrement absent des 4 fichiers Combat
  (candidat fort identifié : Demonslayer Gauntlet, CD+25% inconditionnel,
  Blaze Slayer 4) ; 3 dagues Blaze alternatives (Kindlebane/Mawdredge/
  Pyrochaos) à applicabilité "Infernal" non confirmée.
- **Hunting** — ré-audité en entier (2e passe indépendante), **0 nouveau
  gap trouvé** : les 5 paliers Huntrap confirmés exhaustifs, `stat_bonus_
  sources` confirmé structurellement vide (rien à câbler), Forest/Water/
  Combat Hunting et Charm Hunting reconfirmés bloqués (aucune formule de
  conversion sourcée, pas une recherche insuffisante). 1 nouveau gap
  documenté (Hunter Fortune→quantité de shards, jamais vu avant).
- **Kuudra** — ré-audité, **0 nouveau gap actionnable**, confirmations
  utiles : route Specialist/Bomberman toujours non-fermable (aucune base
  chiffrée), gear layer confirmé structurellement absent à raison (le
  loot Kuudra EST la sortie, pas une entrée de setup).
- **Dungeons** — ré-audité, **1 découverte réelle non-actionnable
  immédiatement** : formules de scaling par niveau chiffrées trouvées
  pour 3/5 Classes (Tank/Archer/Mage), jamais consommées — pertinent pour
  un futur "frag run" DPS-dépendant (Floor VI/Sadan), pas la méthode
  actuelle "clear complet S+" qui ne dépend pas du gear/classe. Gap
  floor-access-gate reconfirmé non-fermable (SkyBlock Guide donne une
  correspondance statique niveau↔tier mais aucun taux de progression).

### Ce qui reste, honnêtement, pour la suite

6 skills `built` non encore audités selon cette méthode cette nuit :
Enchanting/Alchemy/Taming/Necromancy/Carpentry/Runecrafting (déjà classés
`excluded_low_value` ou hors-scope money-making par décision utilisateur
antérieure — probablement pas prioritaires). Le slot "Gloves" Combat et
les 2 gaps Blaze/Kuudra/Dungeons documentés ci-dessus restent à fermer.
Toutes les fermetures de cette nuit vérifiées en base (persist réel,
combos recalculés), y compris Combat/Slayer : Halberd correctement
sélectionné par le moteur de recherche DPS aux 5 paliers Zombie du tier
master (`tool_item_id='AXE_OF_THE_SHREDDED'` confirmé en base). Note
honnête : `coins_per_hour_raw_block_only` reste négatif sur les 5 (encore
plus négatif qu'avant Halberd) — cohérent avec la limitation déjà
documentée le 18 août ("Zombie reste négatif sur les 20 combos, coût de
spawn > valeur de la chair garantie seule, honnête vu le gap RNG
documenté") : tuer plus vite un boss à EV négative sur le loot garanti
aggrave mathématiquement la perte/heure, pas un nouveau bug.

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

## ✅ Pluton — audit "tout à la fois" (5 agents parallèles) + 5 bugs réels fermés (24 août)

**Question directe de l'utilisateur** après le lot ci-dessus : *"tu utilise bien toute les ressources dispo pour les skills ? j'ai l'impression que tu fais que un peu a la fois et pas tout a la fois ?"* — réponse concrète : 6 agents `general-purpose` lancés en parallèle (arrière-plan), un par skill/ressource transversale (Farming, Kuudra, Dungeons, Hunting déjà traité avant compaction, `reforge_stones`/`star_upgrades` cross-skill, re-vérification pets Mining/Foraging/Fishing) plutôt qu'un audit séquentiel un skill à la fois. **5 bugs réels trouvés et fermés dans ce lot**, tous vérifiés contre une vraie table source avant correction (jamais une valeur devinée) :

1. **Hunting — formule Trapped fausse depuis la construction du 22 août** : additive plate (`trap%+trapped%`) au lieu du vrai 2-étages multiplicatif `(1-trap%)×(1-trapped%)` sourcé wiki — surestimait le coins/h de +5.6% à master (0% à starter/amateur, croissant avec le tier).
2. **Farming — "Rare Crop"/Overbloom jamais modélisé** : la page wiki source du "Theoretical Maximum" (base du calcul depuis le 5 août) porte désormais un bandeau `{{Outdated}}` — un patch a scindé ce mécanisme hors de Farming Fortune vers un stat "Overbloom" jamais intégré depuis. Fermé avec les 2 seules ancres réelles sourcées (chance base 2/4 et 4/4 pièces d'armure de progression par catégorie Cropie/Squash/Fermento/Helianthus, jamais un multiplicateur Overbloom inventé) — jusqu'à ~1.4M coins/h supplémentaires à master sur Helianthus, prix Bazaar réels vérifiés (Cropie≈24,3K, Squash≈73,7K, Fermento≈245,8K, Helianthus≈498,1K).
3. **Fishing — reforges rod (Salty/Treacherous/Stiff/Lucky) et armure (Submerged) appliqués en flat MYTHIC à TOUS les tiers** : la doc affirmait "pas de table par rareté sourcée" — faux, `reforge_stones` (jamais consultée directement avant, seulement la page wiki de l'item) a un vrai jsonb complet par rareté. Corrigé : scale désormais par la rareté RECOMBOBULÉE réelle de la rod/armure choisie (COMMON→MYTHIC, 1/2/2/3/5/7% SCC) — surestimait jusqu'à +4.5%pts de SCC aux tiers bas. Fishing Speed de Submerged (jamais capté avant) ajouté au passage ; son Crit Chance reste hors-scope (aucun combat modélisé dans ce fichier).
4. **Mining — reforge Jaded plafonné à LEGENDARY alors qu'un vrai palier MYTHIC existe** (60 vitesse/30 fortune par pièce, `reforge_stones`) — applicable à Divan's Armor (rareté de base Mythic confirmée ailleurs dans le fichier), jamais vu faute d'avoir consulté la table directement.
5. **Foraging — bug structurel réel, le plus gros du lot** : `applyForagingPetsAndAccessories()` ne lisait QUE `stat_name='sweep'` depuis sa construction (17 août) — le Foraging Fortune de TOUS les accessoires/pets (Torrhus Belt +10, Moonglade Belt +5, Veilshroom Bracelet +25, Mangrove Locket/Vine +5 chacun, pet JADE_DRAGON +50, pet MONKEY +60 — MONKEY n'était même jamais fetché, 0 ligne sweep) était silencieusement ignoré. Corrigé : chaque candidat par slot désormais retenu par son impact RÉEL en coins/h (Sweep+FF combinés), pas le Sweep seul — 3 lignes `stat_bonus_sources` manquantes ajoutées (Torrhus/Moonglade Belt, Veilshroom Bracelet FF, jamais saisies en base du tout).

**`reforge_stones` (84 lignes) et `star_upgrades` (4 lignes) audités en entier** (jamais consultés directement avant, seulement via les pages wiki individuelles des items) — confirme les 3 bugs reforge ci-dessus + inventaire complet des 84 reforges par catégorie (Combat/Farming/Dungeons niche documentés dans `pluton_mechanic_coverage`, rien câblé au-delà de ce qui est déjà pertinent aux calculateurs actuels). `star_upgrades` confirmé n'être PAS une table de bonus par item (juste une légende de symboles ✪) — aucun bonus d'étoile chiffré trouvé pour aucune chaîne Slayer/Dungeons/Mining/Foraging/Fishing sauf Master Star (+5%/palier cumulatif, **Master Mode uniquement**, hors-scope de tous les calculateurs actuels qui restent en Normal Mode) — rien à intégrer sans inventer.

**Kuudra ré-audité en entier** : les 4 stats Cannoneer (Cannon Proficiency/Multi-Shot/Rapid Fire/Steady Aim) recroisées exactes contre la vraie table `kuudra_perk_shop` (jamais relue en entier depuis la construction du 23 août) — 0 erreur trouvée. Loot garanti + coût Key recroisés ligne par ligne, également exacts. **3 gaps réels documentés, pas fermés** (`pluton_mechanic_coverage`) : Accelerated Shot (vitesse projectile, aucune formule reliant à une distance d'arène réelle) ; Blast Radius (AoE uniquement, hors-scope du modèle boss-HP-seul) ; route Specialist/Bomberman jamais comparée tête-à-tête avec Cannoneer (choisi par lecture directe, pas par vraie recherche comparative).

**Dungeons ré-audité en entier** : la formule de score (Skill/Explore/Speed/Bonus) confirmée déterministe à S+ indépendamment du gear — aucun facteur gear caché, les seuils `runSeconds` par étage revérifiés exacts sur la formule complète. **2 gaps réels trouvés, pas fermés** : (1) l'accès à chaque étage est gaté par un vrai niveau Catacombs (`reqs={{skl|cata|N}}` : Floor I=1, II=3, III=5, IV=9, V=14, VI=19, VII=24) jamais modélisé — starter et master obtiennent aujourd'hui le même accès Floor VII ; pas fermé faute d'un mapping sourcé niveau-Catacombs→tier-Pluton (inventer violerait la règle #7) ; (2) Class Milestone 2 requis pour ouvrir le moindre coffre Post-Boss (0 sinon) — seuils réels existent (`dungeon_class_milestones`, 630 lignes) mais probablement jamais bloquants pour un clear 100% déjà assumé par le modèle, priorité basse. **`dungeon_classes` (15 lignes, contenu prose sans source vérifiable, non référencée en code) supprimée** — `dungeon_class_milestones` couvre déjà tout ce qui est réellement exploitable.

**1 gap Foraging supplémentaire documenté, pas fermé** : Junk Artifact/Ring/Talisman (Treasure Chance, jusqu'à 37x le candidat actuel) trouvés mais conditionnés "while on Backwater Bayou" — même statut que les pools `event_gated` déjà traitées ailleurs (inclus avec label, pas exclu silencieusement), décision utilisateur à prendre avant d'intégrer.

**12 nouvelles lignes `pluton_mechanic_coverage`** (5 `wired` pour les bugs fermés + 7 gaps documentés `not_yet_audited`/`excluded_complex`/`excluded_not_relevant`). Vérifié en base (route de debug temporaire, un seul cycle pour les 5 fichiers touchés) avant suppression de la route.

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
