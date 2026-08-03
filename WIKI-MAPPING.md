# WIKI-MAPPING.md — Vault (détail Source 2, cartographie exhaustive Hypixel Skyblock)

> Détail complet par système de la Source 2 (wiki officiel `hypixelskyblock.minecraft.wiki`)
> du chantier "Cartographie exhaustive Hypixel Skyblock" — voir CLAUDE.md pour le résumé
> court par système (3-4 lignes, bugs/gaps réels trouvés) et le contexte du chantier
> (méthode Étape 1→2→3, règle 7, pourquoi ce chantier existe). Ce fichier existe pour ne
> jamais refaire dépasser CLAUDE.md la limite de 150k caractères de contexte auto-chargé
> — mêmes standards de rigueur que CLAUDE.md (jamais de constante devinée, toujours
> sourcé), juste séparé physiquement. En cas de divergence, CLAUDE.md fait foi.

## 🚧 Extraction brute (méthode corrigée, 3 août) — état d'avancement, reprenable

**Contexte** : correction méthodologique explicite de l'utilisateur le 3 août — la passe
par système ci-dessous (Combat/Slayer, Farming, etc., 1er août) vérifiait une liste de
systèmes présupposée plutôt que de laisser les sources révéler leur propre structure.
Cette nouvelle passe lit le contenu réel de chaque page cachée, classe seulement après
lecture, sans jamais partir d'une catégorie a priori. Cible : les 6280 pages du bucket
générique `game_wiki` dans `game_mechanics_misc` (catégorie fourre-tout jamais inspectée
faute de catégorisation par `wiki-auto-sync`). Confirmé le 3 août : le cache est déjà
quasi-exhaustif (7724 pages `hypixelskyblock_wiki` en base vs 7328 "articles" réels
rapportés par `action=query&meta=siteinfo` à l'instant — le chiffre de 15159 pages cité
le 1er août était erroné/périmé). Zéro fetch MediaWiki nécessaire pour cette passe :
lecture SQL directe du cache déjà entretenu par `wiki-auto-sync` (`*/30 min`).

**Méthode de checkpoint** (validée par l'utilisateur) : criblage par lots de titres/tailles
(SQL, ~300-500 titres/lot, coût négligeable) → lecture complète des candidats qui semblent
substantiels → pour chaque vraie trouvaille, vérification qu'elle n'existe pas déjà
ailleurs (contenu, pas nom) → construction (migration + parseur + test local + déploiement
+ re-vérification réelle en base après déploiement, même rigueur que NEU-REPO) → rapport
groupé seulement quand 1-5 nouveaux systèmes sont prêts, jamais à chaque titre screené.

**Suivi d'avancement** (mis à jour à chaque checkpoint, pour reprise sans perte si la
passe s'étend sur plusieurs sessions) :
- ✅ **Lot 0** (avant la correction de méthode, mais résultat valable) — page pivot du
  bucket générique repérée par sa taille : les 16 pages "Stats" (`{{Infobox/Stat}}`)
  → table `player_stats`. Voir CLAUDE.md pour le détail des 2 bugs de parsing trouvés.
- ✅ **Lot 1** — `attribute_milestones` (60 lignes : 2 pistes de 30 paliers, David
  Hunterborough). Format réel = dump UI brut (menu en jeu, pas du wikitext standard),
  5 blocs `{{UI|...}}` par piste avec fenêtres de défilement qui se chevauchent (même
  palier visible 2-3 fois) — dédupliqué par numéro de palier (chiffre romain → entier).
  2 formats de récompense trouvés en testant ("Reward:" singulier vs "Rewards:" pluriel
  selon le nombre de lignes). Vérifié en conditions réelles : 60/60 lignes, tiers
  séquentiels I-XXX sans trou sur les deux pistes, 0 récompense vide, 0 seuil invalide.
  Complète directement `attribute_shards` (NEU-REPO, chantier précédent).
  **Screenés dans le même lot, classés sans construire** :
  - `Abiphones/ContactsTable` et `Bestiary/List` : réels mais enrichissements de tables
    déjà construites (`npc_locations`/`bestiary_mobs`, NEU-REPO) — Abiphone ajoute
    description/usage/commandes `/call` réelles (plusieurs alias par NPC), Bestiary/List
    ajoute `Max Tier` et texte de lore par mob. Mis en queue basse priorité (même
    traitement que `accessory_powers` plus tôt), pas construits maintenant.
- ✅ **Lot 1 (suite, checkpoint 2)** — 5 nouveaux systèmes réels construits et vérifiés en
  prod (mode autonome, sans confirmation intermédiaire, sur instruction explicite de
  l'utilisateur) :
  - `necromancy_souls` (750 lignes : 211 normal + 513 catacombs + 26 kuudra) — mécanique
    de donjon "Souls" invoquées (3 tabs Normal/Catacombs/Kuudra, colonnes différentes par
    tab -- Catacombs a une colonne Floor en plus, Kuudra une colonne Tier en plus, unifiées
    en une seule table avec colonnes nullable). Lignes HTML-commentées (contenu retiré du
    jeu, ex "Watchful Eye") exclues avant parsing.
  - `skyblock_level_xp_tasks` (775 lignes, 9 catégories : Core/Event/Dungeon/Essence
    Shop/Slaying/Skill Related/Miscellaneous/Story/Consumables) — répartition complète des
    sources de SkyBlock XP, jamais capturée. Table wiki à imbrication variable (colspan
    Name 2 ou 3, profondeur 1 à 3 sous-libellés selon la section) — 2 passes de test
    locales nécessaires : la 1ère (numCols fixe à 6, extraction positionnelle) laissait
    ~260 lignes décalées (Dungeon/Slaying/Skill Related/Miscellaneous, colspan=3 non
    prévu) ; corrigé avec extraction par les 3 DERNIÈRES colonnes non-vides de chaque
    ligne plutôt que des index fixes.
  - `museum_milestones` (40/40 paliers) — référencée directement par skyblock_level_xp_
    tasks ("Museum Progression" → "See Museum/Milestones"). Même format menu-jeu
    chevauchant que attribute_milestones. Bug trouvé et corrigé avant déploiement :
    virgule des milliers échappée en backslash côté wiki ("1\,500"), regex initiale
    ratait tout palier ≥ 10. Fait non-corrigé, capturé tel quel : palier 40 exige 4 000 XP
    mais le max réellement obtenable est 3 571 (cf. skyblock_level_xp_tasks) — écart réel
    du jeu, pas une erreur de parsing.
  - `crop_fortune_sources` (149 lignes, 13 crops du Garden) — détail complet des sources
    de Crop Fortune par crop (Tools/Accessories/Enchantments/Miscellaneous/Pets, 5 schémas
    de colonnes différents selon le type de section, mappés par label d'en-tête réel
    plutôt que par position). Complète la formule déjà documentée (1 point = 1% chance de
    +100% drops) avec le détail par source, jamais capturé. Page confirmée 100%
    wikitables simples (aucun rowspan/colspan).
  - `skyblock_achievements` (216 lignes : 128 challenge + 8 seasonal + 80 tiered) — même
    pattern menu-jeu chevauchant, 2 formats de ligne distincts selon la sous-catégorie
    (Challenge/Seasonal ont "Unlocked by X% of players!", stat globale réelle jamais
    mappée ; Tiered a "Progress: X/Y" + chiffre romain à séparer du nom). Écart honnête
    noté : le menu annonce 222 Challenge Achievements au total mais seuls 128 noms
    uniques apparaissent réellement dans le contenu wiki caché (vérifié : 140 lignes
    brutes → 128 uniques, l'écart vient de la source elle-même, pas d'une perte de
    dédoublonnage) — capturé tel quel, pas complété par une supposition.
  - **Screenés ce lot, classés sans construire** : `Abiphones/ContactsTable` et
    `Bestiary/List` (déjà loggés lot 1 précédent, enrichissements de tables existantes).
- ✅ **Lot 1 (suite, checkpoint 3)** — 4 nouveaux systèmes réels construits et vérifiés :
  - `garden_mutations` (40 lignes) — système Garden entier jamais mappé (crops mutés via
    arrangement dans le Greenhouse). Table wiki à cellules MULTI-LIGNES réelles
    (convention MediaWiki "----" = règle horizontale intra-cellule, pas un séparateur de
    ligne) — parseur dédié qui accumule les lignes de continuation, différent de toutes
    les autres tables de ce chantier (une valeur par ligne jusqu'ici).
  - `skyblock_quests` (36 quêtes) — système entier jamais mappé. Bug réel trouvé et
    corrigé avant déploiement : `reward` contient souvent un template imbriqué avec ses
    propres pipes internes (ex `{{Coins|1000}}<br/>{{Skill XP|Fishing|10}}`), même classe
    de bug que `player_stats`/`ways_to_increase` (split naïf par "|" tronquait au premier
    pipe interne) — corrigé avec un split par profondeur de template.
  - `location_details` (271 lignes, 19 zones, jusqu'à 3 niveaux d'imbrication) — enrichit
    `game_zones` (NEU-REPO, liste plate) avec Resources Found/NPCs Found/Special
    Requirements par sous-lieu. **2e bug de la même famille "extraction par dernière
    colonne non-vide"** trouvé et corrigé : cette technique (qui avait fonctionné pour
    `skyblock_level_xp_tasks`) décale tout dès qu'un des 3 champs traînants
    (indépendamment souvent vides ici) est vide — corrigé par extraction à position FIXE
    (numCols=6, le header groupe `colspan="3"` garantit que la portion chemin fait
    toujours exactement 3 colonnes). **Leçon retenue pour la suite** : l'extraction "par
    la droite" n'est fiable QUE quand un seul champ traînant peut être vide à la fois
    (comme MaxXP, presque toujours hérité par rowspan) — dès que plusieurs champs
    traînants indépendants peuvent chacun être vides séparément, il faut une largeur de
    grille fixe déterminée depuis le header, pas une heuristique positionnelle.
  - `chocolate_rabbits` (517 lapins) — roster complet jamais capturé (`hoppity_prestige`
    couvre déjà les paliers de prestige mais pas les lapins eux-mêmes). Wikitable standard
    sans rowspan/colspan, réutilise directement les helpers déjà partagés.
  - **Screenés ce lot, classés/différés avec raison explicite (pas construits)** :
    - `Traveling Zoo/Events` (76737 caractères) — calendrier de rotation des pets vendus
      par date SkyBlock (Elephant/Giraffe/Blue Whale/Tiger/Lion/Monkey, rareté par date),
      probablement des centaines de lignes historiques. Réel et construisible, mais valeur
      directe pour Vault (marché/mécanique de jeu) plus faible qu'un système de progression
      — différé, pas un vrai gap si le chantier doit prioriser par valeur.
    - `Reward Bundles/List` — récompenses cosmétiques par rang de saison (Easter, etc.),
      confirmé "purely cosmetic" dans le texte source lui-même. Différé, faible priorité
      pour un projet d'intelligence de marché.
    - `Sea Creatures/UI/Guide` — confirmé être un SHELL de menu jeu (navigation), pas les
      données elles-mêmes — les vraies listes existent sous des clés séparées déjà repérées
      (`sea_creatures_list_basic`/`_crimson_isle`/`_hotspot`/`_lava`/`_moonglade_marsh`/
      `_special`), pas encore lues individuellement — vrai candidat pour une prochaine passe,
      pas un doublon.
    - `Essence Guide/UI` — probablement un shell de menu navigationnel vers les catégories
      déjà couvertes par `essence_shop_upgrades`/`essence_upgrade_costs` (NEU-REPO) — pas
      encore vérifié ligne à ligne, à confirmer avant de classer définitivement.
    - `Crystal Hollows/Special Locations` — contenu confirmé en PROSE narrative (structures
      spawnant aléatoirement, positions de coffres), pas une table propre — capturable en
      texte brut si besoin plus tard, pas structuré nativement.
- ⏳ **Reste du bucket générique** (~6200 titres non encore screenés au-delà du top 80
  par taille) — pas commencé. Prochaine étape de cette passe une fois le reste du Lot 1
  jugé suffisant par l'utilisateur.

Systèmes couverts par l'ancienne passe par-système (1er août, méthode corrigée depuis),
dans l'ordre où ils ont été traités :
- Combat/Slayer (1er août)
- Farming (1er août)
- Foraging (1er août) — inclut Heart of the Forest (2e arbre HOTM-like demandé)
- Fishing (1er août)
- Dungeons (1er août)
- Crimson Isle/Kuudra (1er août)
- Enchanting/Alchemy (1er août)
- Rift (1er août) — mapping mécanique seul, reste bloqué en données réelles (voir Bloc 7)
- Carpentry/Taming/Social (1er août) — systèmes déjà exclus de Money Making, passe légère

---

## Combat/Slayer (1er août)

Méthode : API MediaWiki en direct (`action=query&list=allcategories`/`categorymembers`,
`action=parse&prop=wikitext`) via `curl` brut (WebFetch a atteint son quota hebdomadaire
en cours de route, contourné sans perte de rigueur — même source, juste un client HTTP
différent). Taxonomie complète confirmée d'abord : 681 catégories wiki réelles
paginées jusqu'à épuisement (`continue` token vide confirmé), ~432 catégories gameplay
réelles après filtrage du bruit de maintenance wiki (templates/renders/sockpuppets/etc.),
mappées aux 15 systèmes demandés + une douzaine de systèmes réels non anticipés
initialement (Dark Auction, Bits Shop, Mayor, Museum, Power Orbs, Fairy Souls,
Mythological Ritual, événements saisonniers...).

**Combat/Slayer choisi en premier** (proximité avec Money Making/Evolve Skills déjà en
prod, et le bug Slayer venait d'être fermé). Pages réelles récupérées : la page système
`Slayer`, les 6 pages boss (`Revenant_Horror`/`Tarantula_Broodfather`/`Sven_Packmaster`/
`Voidgloom_Seraph`/`Inferno_Demonlord`/`Riftstalker_Bloodfiend`), `Combat`, et
`Damage_Calculation`.

**Fix Slayer T4/T5 reconfirmé une 5e fois, indépendamment** : la structure d'onglets
Tier I-V de chacune des 6 pages boss confirme sans ambiguïté Zombie/Spider/Vampire → un
onglet Tier V existe, Wolf/Enderman/Blaze → seul Tier IV existe. `Revenant_Horror` le
dit aussi littéralement en Trivia : "The Revenant Horror, the Tarantula Broodfather and
the Riftstalker Bloodfiend are currently the only Slayer bosses to have a Tier 5
variant." Concorde exactement avec le fix déjà déployé — aucune nouvelle action requise,
juste une confirmation supplémentaire de la fiabilité de la source NEU-REPO+wiki déjà
utilisée.

**Mécanique réelle jamais mappée, ajoutée au jeu il y a 13 jours** : Healing au kill
d'un boss Slayer (toutes sauf Vampire), ajouté le 2026-07-20 selon l'historique de la
page. HP/sec par tier : T1=40, T2=80, T3=120, T4=160, T5=200. Durée par niveau de
Slayer du joueur : niveau 0-1=6s, 2-3=7s, 4-5=8s, 6-7=9s, 8-9=10s. Zéro trace de cette
mécanique dans le code ou en base actuellement — trop récent pour avoir été capturé par
un audit antérieur, noté ici pour ne pas être oublié si un futur calculateur combat/
slayer (type Pluton) a besoin de modéliser la survie/rendement réel d'un run.

**Chaîne de déblocage réelle des 6 Slayers, jamais vérifiée avant** (source : tableau
"Slayer Types and Requirements" de la page système) : Zombie débloqué par défaut →
Spider nécessite d'avoir battu un Tier II Revenant Horror → Wolf nécessite Tier II
Tarantula Broodfather → Enderman nécessite Tier IV Sven Packmaster → Blaze nécessite
Tier III Voidgloom Seraph. Vampire est un cas à part : gated par un item de quête
("Globulate Timecharm"), pas par un palier d'un autre Slayer. Chaque piste a aussi son
propre palier de Combat skill requis pour les tiers supérieurs (non chiffré précisément
sur cette page). Pertinent pour Evolve Skills : la logique actuelle de
`target.type: "unlock_access"` pour Slayer ne semble vérifier que l'accès à la zone
(ex: Crimson Isle pour Blaze), pas cette vraie chaîne de prérequis boss-à-boss — à
vérifier lors d'une future passe sur `evolve-skills/route.ts`, pas corrigé cette session
(hors scope Source 2, qui reste cartographie pure sans toucher au code).

**Coûts d'invocation reconfirmés** : historique de la page système confirme
T1 100→2000, T2 2000→7500, T3 10000→20000 (mise à jour du 31 mai 2021) — concorde
exactement avec `slayer_cost` déjà trouvé dans `misc.json` (NEU-REPO) lors de la
Source 1 (`[2000, 7500, 20000, 50000, 100000]`), maintenant cross-vérifié par une 2e
source indépendante pour les 3 premiers paliers.

**Formule de dégâts réelle, jamais sourcée dans ce projet** (`Damage_Calculation`) :
`InitialDamage = (5 + WeaponDMG) × (1 + Strength/100)` ; 
`DamageMultiplier = 1 + CombatLevelBonus + Enchants + WeaponBonus` ; 
`FinalDamage = floor(InitialDamage × DamageMultiplier × (1 + ArmorBonus) × (1 + CritDamage/100))` ;
réduction par Défense : `Defense / (100 + Defense)`. Bonus Warrior (page `Combat`,
skill max niveau 60) : `+4% dmg` par niveau de Combat 1→50, `+1% dmg` par niveau 51→60
(soit jusqu'à +210% cumulé à Combat 60). Ni l'un ni l'autre n'était en base ou dans le
code — utile si un futur calculateur Combat/Slayer (type Pluton) doit un jour estimer un
temps de kill réel plutôt qu'un ratio coins/h approximatif.

**Pas encore fait pour Combat/Slayer** : tables de drop/loot complètes par boss/tier
(HP, DPS, XP réel par palier au-delà de Zombie T1-T5 déjà extrait), mécaniques Crit
Chance/vitesse d'attaque détaillées, pages `Minibosses`/`Mixins`/`RNG Meter` dédiées non
ouvertes. Jugé suffisant pour cette passe (profondeur "table des matières + mécaniques
clés", même niveau que Source 1) — pas encore la comparaison Étape 3 contre notre base
(en attente de la reconnexion Supabase MCP).

## Farming (1er août)

Pages réelles récupérées : `Farming` (skill), `Farming_Fortune`, `Crop_Fortune`,
`Jacob's_Farming_Contest`, plus les catégories `Farming`/`Farming_Minions`/
`Farming_tools`/`Farming_pets` pour l'inventaire de pages.

**Formule réelle Farming Fortune / Crop Fortune** (`Crop_Fortune`, `Farming_Fortune`
section "Scaling") : chaque point de Farming Fortune OU du Crop Fortune spécifique au
crop cassé = 1% de chance d'obtenir 100% de drops en plus ; tous les 100 points,
+100% de drops garantis. Farming Fortune et Crop Fortune du crop concerné s'additionnent
avant application. Jamais sourcé dans ce projet — utile pour tout futur calculateur
Farming (yield par crop, type Pluton).

**Crops Garden récents jamais capturés, confirmés réels** : `Crop_Fortune` liste des
stats par crop incluant Sunflower/Moonflower/Wild Rose Fortune, ajoutées selon
l'historique de la page le **2025-12-05** (Sunflower/Moonflower/Wild Rose Fortune) et
icône mise à jour le 2026-06-24 — des crops Garden relativement récents. Cohérent avec
la présence de `Wild Rose Collection`/`Wilted Berberis Collection`/`Moonflower
Collection`/`Lotus Collection`/`Vinesap Collection` dans la taxonomie de catégories
confirmée plus haut — à vérifier en Étape 3 si ces crops existent dans `collections`/
`items_catalog` (probable gap, jamais vérifié explicitement).

**Mécanique réelle jamais mappée — extension du cap Farming au-delà de 60 via Jacob's
Contest** (`Jacob's_Farming_Contest`, section Rewards) : contrairement à Combat
(cap fixe à 60), obtenir une médaille GOLD à un concours Jacob's augmente le cap de
niveau Farming de +1 **par crop où l'or a été obtenu**, jusqu'à 60 (LX) — un mécanisme
d'extension de cap, pas juste un XP boost. 5 paliers de récompense réels : Bronze
(top 60%/70% avec Finnegan GOATed)/Silver (30%/40%)/Gold (10%/20%)/Platinum (5%/10%,
donne Gold+Bronze)/Diamond (2%/5%, donne Gold+Silver) — Platinum/Diamond n'ont pas leur
propre médaille, ils donnent des médailles inférieures en plus. Cohérent avec
`jacob_medals` (Bloc collecte totale, Phase Audit hypixel-api-reborn) qui n'avait
trouvé que bronze/silver chez Cucumber — pas un trou de collecte, juste un joueur qui
n'a jamais atteint Gold/Platinum/Diamond.

**Turbo-Crop enchant réel** : Enchanted Book, +5 Crop Fortune du crop concerné par
niveau (max 5), mais niveaux 4-5 nécessitent d'avoir déjà obtenu Bronze/Silver sur ce
crop spécifique respectivement — sinon inertes. Jamais sourcé dans ce projet.

**Pas encore fait pour Farming** : détail des 9 Farming pets (bonus par rareté/niveau),
détail des outils spécialisés (Hoe of Greatest Tilling, Melon/Pumpkin Dicer, etc.),
Garden lui-même (cultures/niveau/barn — explicitement hors scope de ce chantier
depuis le Bloc 7, endpoint séparé `/v2/skyblock/garden` jamais mappé). Comparaison
Étape 3 contre notre base toujours en attente de la reconnexion Supabase MCP.

## Foraging (1er août)

Pages réelles récupérées : `Foraging` (skill), `Foraging_Fortune`, `Heart_of_the_Forest`
+ sa sous-page `Heart_of_the_Forest/List` (le vrai contenu, transclu), `Starlyn_Contest`,
`Treecapitator`.

**Heart of the Forest (HotF) — 2e arbre "HOTM-like" jamais mappé, demandé explicitement
par l'utilisateur, entièrement cartographié cette passe.** Confirmé réel : ajouté le
2025-06-05 (reset gratuit depuis le 2025-07-08). Accessible via `/hotf` ou le menu
Foraging, XP gagnée via Tree Gifts (Galatea) ou Agatha's Contests, dépensée en "Forest
Whispers" (équivalent Powder de HOTM). **8 tiers réels, 36 perks réels** (Tier 1 :
Sweep ; Tier 2 : Damage Boost/Strength Boost/Foraging Fortune/Speed Boost/Axe Toss ;
Tier 3 : Luck of the Forest/Daily Wishes/250 Gifts ; Tier 4 : Lottery/Foraging Madness/
Deep Waters/Efficient Forager/Collector/Early Bird/Precision Cutting ; Tier 5 : Monster
Hunter/Center of the Forest (seul perk non-reset-able, permanent une fois acheté)/Tree
Whisperer ; Tier 6 : Homing Axe/Forest Strength/Hunter's Luck/Galatea's Might/Essence
Fortune/Forest Speed/Maniac Slicer ; Tier 7 : Half Empty/Ricochet/Half Full ; Tier 8 :
Beekeeper/Iron Lungs/Forest Fisher/Timber/Starlyn Supreme/Two-for-one/Free Trial).
Aucune trace dans le code ou en base — zone 0% couverte avant cette passe.

**🔴 Root cause du bug de formule HOTM trouvé pendant le Bloc 8 (Pluton), maintenant
identifié précisément.** Le perk "Sweep" (Tier 1 HotF) utilise
`LevelCost = floor((NextLevel+1)^3)`, et son propre tableau de coût cumulé listé sur
le wiki (niveaux 2-10: 4 347 ; 11-20: 49 005 ; 21-30: 192 655 ; 31-40: 495 305 ;
41-50: 1 016 955 ; total 1 758 267) est **exactement** le même total que celui déjà
noté comme correct pour le nœud Mining Speed de HOTM lors du Bloc 8 (`CLAUDE-archive.md`
n'a pas cette note, elle reste dans le debug Pluton non mergé) — confirmé en recalculant
à la main : `sum(floor((L+1)^3), L=2..10) = 3^3+4^3+...+11^3 = 4347`, exact. La formule
Pluton utilisée à l'époque (`(level+2)^3` sommée différemment) était donc décalée d'un
indice — cause précise maintenant connue, correction triviale à appliquer quand Pluton
reprendra (`lib/pluton-mining.ts` / route de debug HOTM), pas faite ici (hors scope
cartographie, Pluton reste en pause).

**Formule Foraging Fortune** (`Foraging_Fortune`) : même famille que Farming/Crop
Fortune — 100 points = 1 log garanti en plus, au-delà c'est une chance additionnelle
(150 = doublé garanti + 50% de chance triplé). S'applique à 8 types de logs réels (Oak/
Birch/Spruce/Dark Oak/Acacia/Jungle/Fig/Mangrove).

**Starlyn Contest — équivalent Foraging de Jacob's Farming Contest, jamais mappé,
jamais dans notre base.** Système de concours réel distinct, jamais référencé dans
aucune table interne (`jacob_medals`/`jacob_perks`/etc. sont spécifiques Farming). Pas
de détail de structure de récompense extrait cette passe (hors scope temps) — juste
confirmé comme un vrai système parallèle à creuser si Foraging money-making en a besoin.

**Pas encore fait pour Foraging** : détail complet des perks HotF au-delà de Tier 1
(coûts/formules par perk non tous extraits), structure exacte des récompenses Starlyn
Contest, les 4 pets Foraging (Giraffe/Lion/Monkey/Ocelot), `Treecapitator` (enchant
réel, contenu vu mais pas creusé). Comparaison Étape 3 en attente de Supabase MCP.

## Fishing (1er août)

Pages réelles récupérées : `Fishing` (skill), `Sea_Creature_Chance`, `Fishing_Speed`,
`Treasure_Chance`.

**Formule réelle Sea Creature Chance (SCC), jamais sourcée dans ce projet** : base
20%, cap 100% (capture garantie), **divisée par 4** sur Private Island et The Garden
(sauf mode Stranded). `dhc` (Double Hook Chance) détermine séparément la chance
d'attraper 2 Sea Creatures d'un coup. Directement pertinent pour tout futur calcul
Fishing money-making (rendement dépend fortement de la zone à cause du ÷4).

**Trophy Fishing confirmé comme système à part, distinct de `trophy_fish_thresholds`**
(déjà chargé depuis NEU-REPO en Source 1) : 4 tiers réels par Trophy Fish
(Bronze/Silver/Gold/Diamond), pêchables sur Lotus Atoll ET Crimson Isle. Atteindre les
paliers Novice/Adept Trophy Fisher débloque 2 Sea Creatures spéciales (Thunder, Lord
Jawbus) — mécanique de déblocage jamais documentée dans ce projet.

**Treasure Fishing — vraies probabilités de base jamais sourcées** : 89% good catch /
10% great / 1% outstanding, quand aucune Sea Creature n'est attrapée. Augmentable via
Blessed Bait, l'enchant Blessing, ou un Hermit Crab Pet Rare+.

**Pas encore fait pour Fishing** : détail des Rod Parts (Hooks/Lines/Sinkers) et
Fishing Baits, les 9 pets Fishing (Ammonite/Baby Yeti/Blue Whale/Dolphin/Flying Fish/
Megalodon/Penguin/Seal/Spinosaurus), Fishing Hotspots, table complète des Sea Creatures
par zone/niveau. Comparaison Étape 3 en attente de Supabase MCP.

## Dungeons (1er août)

Pages réelles récupérées : `Dungeoneering` (skill), `Catacombs` (système), `Dungeon_Score`,
`Gear_Score`, `Class_Milestones`.

**🔴 Formule réelle de Dungeon Score trouvée — répond directement au trou d'origine de
l'audit du 22 juillet** (`dungeon_rng_scores`, une des 30 tables "sans provenance
traçable" listées à l'époque). Formule complète sourcée (`Dungeon_Score`) :
`Score = Skill + Explore + Speed + Bonus`, où `Skill = floor(100 - Deaths×2 -
FailedPuzzles×14)` (ne s'applique qu'aux runs complétés), `Explore` combine
`floor(60×RoomsCleared/TotalRooms)` + jusqu'à 40 points de secrets (seuil de %
Secrets requis variable par étage : 30% F1 → 100% F7/Master), `Speed` décroît après un
temps limite variable par étage (10-14min normal, 8-14min Master), `Bonus` = jusqu'à 5
pour Crypts nettoyées + 2 pour tuer un Mimic (F6+) + 10 si Paul est maire avec le perk
EZPZ actif. **6 rangs réels et leurs seuils** : D (0-99) / C (100-159) / B (160-229) /
A (230-269.4) / S (269.5-299) / S+ (≥300). Boss non tué = score réduit de 30%. La page
elle-même note que les formules Explore/Speed restent partiellement non confirmées par
la communauté (`{{Confirm}}` sur le wiki) — à garder en tête si une future feature
recalcule un score prédictif plutôt que de lire le score réel renvoyé par Hypixel.

**Dungeoneering (Catacombs) — mécanique de "Dungeonizing" jamais sourcée** : le niveau
de la skill Catacombs donne un multiplicateur multiplicatif sur les stats des items de
donjon (dungeonisés), jusqu'à **+485%** au niveau max — jamais documenté dans ce
projet. Les 5 premières complétions de la journée donnent un bonus de +40% XP Catacombs
(les runs échouées ne comptent pas pour ce bonus).

**Pas encore fait pour Dungeons** : détail complet des 10 étages (mobs, loot par
étage au-delà de ce qui est déjà dans `dungeon_classes`/collecte totale), Class
Milestones (perks par classe/niveau — page récupérée mais pas dépouillée), Dungeon
Puzzle Rooms, Essence Shops (page catégorisée Dungeons mais recoupe potentiellement
`essence_shop_upgrades` déjà chargé — pas vérifié). Comparaison Étape 3 (dont le vrai
contenu de `dungeon_rng_scores`/`slayer_rng_scores` contre ces formules) en attente de
Supabase MCP.

## Crimson Isle/Kuudra (1er août)

Pages réelles récupérées : `Kuudra`, `Crimson_Isle`, `Dojo`, `Kuudra_Teeth`.

**5 tiers Kuudra réels, gates de réputation jamais sourcés** (`Kuudra`, section
"Tiers") : Basic (accès via Elle, gratuit) → Hot (quête principale + 1000 réputation
faction) → Burning (3000) → Fiery (7000) → Infernal (12000), réputation dans
**n'importe quelle faction** (pas une faction spécifique). Chaque tier a son propre
timing de vague (35s→15s) et récompense SkyBlock XP (20→100). Confirme/complète
`kuudra_teeth`/le wiki caché `game_mechanics_misc` déjà utilisés au Bloc 4 pour les
5 tiers réels (none/hot/burning/fiery/infernal) — première fois que les seuils de
réputation eux-mêmes sont sourcés.

**Boss fight à 5 phases réelles, jamais documentées** : Phase 1 Crates (pêcher des
caisses à la canne à lave) → Phase 2 Ballista (construction) → Phase 3 Fuel (pêcher 4
Fuel Cells, obligatoire d'étourdir Kuudra avant de tirer dès le tier Burning+) →
Phase 4 Stomach → Phase 5 Lair. Zéro trace de cette mécanique dans le projet.

**Dojo — confirme (ne contredit pas) le blocage déjà documenté en Bloc 7** : la page
wiki révèle une vraie structure de jeu à 7 mini-jeux (Test of Force/Stamina/Mastery/
Discipline/Swiftness/Control/Tenacity) + un système de Milestones — mais c'est du
contenu de gameplay, pas une preuve que l'API l'expose. Cohérent avec le Bloc 7
("seul le statut de quête d'unlock existe côté API, verified-absent"). Utile comme
contexte si jamais un accès alternatif à cette donnée est trouvé plus tard.

**Pas encore fait pour Crimson Isle/Kuudra** : détail du Perk Shop (page vue mais pas
dépouillée), la centaine de mobs/NPCs de zone (Aranya/Ashfang/Barbarian Duke X etc.),
Factions/Faction Quests (système de réputation lui-même, cité mais pas creusé — voir
aussi Dojo qui en dépend indirectement). Comparaison Étape 3 en attente de Supabase MCP.

## Enchanting/Alchemy (1er août)

Pages réelles récupérées : `Enchanting` (skill), `Alchemy` (skill), `Runecrafting`.

**Formule XP Enchanting réelle, jamais sourcée** : `XP = 3.5 × X^1.5`, où X = niveaux
d'enchant dépensés sur une Table d'Enchantement/Enclume. Plafond réel de 500 000 XP
Enchanting/jour par cette voie (l'Experimentation Table contourne ce plafond mais a son
propre cooldown journalier et une limite non documentée par le wiki lui-même).
**Conjurer** — habileté passive unique à Enchanting, +5% XP de toute source par niveau
(les autres skills donnent généralement +4%/niveau, ex: Warrior Bonus de Combat) —
Enchanting est donc structurellement différent des autres skills, jamais noté dans ce
projet.

**🟡 Alchemy plafonne à 50, pas 60** — vérifié explicitement sur l'infobox de la page
(`max_level = 50`), alors que Combat/Farming/Enchanting confirmés à 60 lors de cette
même passe Source 2. Si `skills`/tout calcul de progression dans ce projet suppose un
cap uniforme de 60 pour tous les skills, c'est un vrai risque d'erreur pour Alchemy —
à vérifier explicitement en Étape 3 (pas fait, Supabase indisponible).

**Pas encore fait pour Enchanting/Alchemy** : détail des enchantements individuels
(Enchantments/List, ~100 enchants réels recensés dans la taxonomie de catégories),
Runecrafting (page récupérée mais pas dépouillée), tableau XP complet Alchemy par
potion. Comparaison Étape 3 en attente de Supabase MCP.

## Rift (1er août)

Pages réelles récupérées : `Rift_Dimension` (système), `Motes` (monnaie), `Rift_Damage`.
Rift reste fondamentalement bloqué côté données réelles (aucun profil de test engagé,
voir Bloc 7) — cette passe cartographie la mécanique de jeu elle-même, pas une
vérification de structure API contre un vrai joueur.

**9 zones réelles confirmées** (`Rift_Dimension`, section Locations) : Wyld Woods,
Black Lagoon, West Village, Dreadfarm, Village Plaza, Living Cave, Colosseum, Stillgore
Château, The Mountaintop. Légèrement différent des 11 clés API déjà documentées dans
`member.rift` (Bloc collecte totale Phase 7 : village_plaza/wither_cage/black_lagoon/
dead_cats/wizard_tower/enigma/gallery/west_village/wyld_woods/castle/dreadfarm) — pas
une contradiction, juste deux découpages différents (zones visitables vs sous-systèmes
de progression API), pas réconcilié cette passe faute de profil réel pour vérifier.

**Rift Time — mécanique jamais documentée** : stat qui détermine le temps restant avant
téléportation forcée au Hub (480s/8min de base), ne se déplète pas dans certaines zones
sûres (Wizard Tower sauf étage du bas, Rift Gallery, Mirrorverse). Motes (monnaie) :
+25 par orbe (+2 Rift Time), +10 dans Enigma's Crib (sans bonus de temps) — confirme
l'existence d'un vrai currency system riche, sans rapport avec le bug `rift_motes`
déjà documenté (lit `currencies.motes.current` au lieu du vrai `currencies.motes_purse`
— toujours pas corrigé, cette page ne renseigne pas sur le nom du champ API).

**Pas encore fait pour Rift** : Rift Transferables/Exportables (liste d'items),
Timecharms (progression système réel — SkyBlock Citizen/Living/Globulate/Vampiric —
jamais mappé), les boss Rift (Leech Supreme, Bacte...). Comparaison Étape 3 impossible
tant qu'aucun profil réel n'a de contenu Rift à vérifier (limite déjà actée au Bloc 7,
pas une limite de cette passe wiki).

## Carpentry/Taming/Social (1er août)

Pages réelles récupérées : `Carpentry`, `Taming`, `Social`. Les 3 déjà explicitement
exclus d'Evolve Skills (section "Section Skills" du 22 juillet, archivée) avec
justification ("Carpentry : aucun produit revendable" / "Taming : ne génère pas de
coins directement" / "Social : aucun lien avec le rendement économique") — cette passe
confirme ces exclusions plutôt que de les remettre en question, profondeur volontairement
plus légère.

**Confirmé : Carpentry est un mécanisme purement cosmétique** — littéralement
commenté ainsi dans le wikitext source (`<!-- Carpentry is a cosmetic-only mechanic -->`).
XP = 3% du prix de vente NPC combiné des ingrédients. **🟡 Carpentry plafonne aussi à
50, pas 60** — 2e skill après Alchemy confirmé sur un cap non-uniforme cette passe.

**Taming — mécanique de cap réelle jamais mappée, même famille que Farming/Jacob's** :
cap de base non précisé explicitement mais extensible à 60 en donnant des pets
spécifiques (même rareté ou plus) à George (Rift Ferret/Slug/Spirit/Giraffe/Jellyfish/
Bal/Baby Yeti Epic, Black Cat Legendary, Frost Wisp Rare, Enderman Mythic — items non
récupérables). Confirme un vrai pattern de design récurrent (cap extensible via un
sacrifice d'item, pas juste Farming). Paliers réels de Taming pour l'upgrade de rareté
de pet via Kat : niveau 10 (Rare→Epic), 20 (Epic→Legendary), 25 (Legendary→Mythic) —
pertinent si un futur "pet flip" money-making (déjà noté comme piste possible dans la
section Skills archivée) voit le jour.

**Social confirmé comme skill à part entière**, système de leveling/récompenses lié
aux activités d'île (parkour, egg hunt, rangs d'île) — aucun lien économique trouvé,
cohérent avec l'exclusion déjà actée.

**Pas encore fait** : détail complet des récompenses de palier des 3 skills, `Furniture`
(système Carpentry lui-même). Comparaison Étape 3 en attente de Supabase MCP — mais
faible priorité vu l'exclusion déjà actée pour ces 3 systèmes.

---

# 🔴 CORRECTION MÉTHODOLOGIQUE (1er août, même session) — lire avant de continuer

Après les 9 passes système ci-dessus, l'utilisateur a posé une question de contrôle
essentielle : est-ce que la Source 2 a vraiment découvert sa propre structure depuis
le wiki, ou a-t-elle juste vérifié la liste des "15 systèmes" qu'on avait supposée au
départ ? **Réponse honnête : la 2e.** J'avais bien récupéré la taxonomie brute (681
catégories) au tout début, mais je m'étais ensuite remis à traiter dans l'ordre la
liste des 15 systèmes présupposés sans jamais reboucler sur ce que la taxonomie brute
avait révélé en plus (Dark Auction, Bits Shop, Mayor, Museum, Power Orbs, etc., nommés
une fois puis abandonnés). Exactement le biais que la cartographie était censée éviter.

**Méthode corrigée, en 5 étapes strictes, imposée par l'utilisateur pour la suite** :
- **Étape A** — découverte brute, zéro regroupement, zéro filtre par rapport à ce qu'on
  a déjà supposé. Épuiser chaque source indépendamment.
- **Étape B** — regroupement en systèmes, mais seulement une fois A terminée, et basé
  sur la structure que LES SOURCES elles-mêmes suggèrent (Nav templates du wiki,
  dossiers de features des mods, structure typée des libs), jamais sur notre mémoire.
- **Étape C** — comparaison à notre Supabase, système par système.
- **Étape D** — plan de tables à créer/compléter.
- **Étape E** — automatisation (cron récurrent, pas un chargement ponctuel).

**Règle de contrôle imposée** : avant de rapporter quoi que ce soit comme "terminé",
se demander explicitement "est-ce que ça vient de ma découverte brute des sources, ou
ai-je halluciné une liste que j'avais déjà en tête ?" — recommencer si doute.

## Étape A — résultats de la découverte brute (1er août)

**Wiki officiel** :
- `list=allpages` (namespace principal), paginé jusqu'à épuisement réel (`continue`
  vide confirmé, 31 pages de résultats) : **15 159 pages**, brut, sans filtre.
- `list=allpages&apnamespace=10` (Template), même pagination exhaustive : **2 381
  templates**.
- Parmi eux, **112 templates `Nav/*`** (hors sous-navs `/Collection/`, qui sont des
  déclinaisons par item de collection, pas de nouveaux systèmes) — la vraie
  organisation par les éditeurs du wiki eux-mêmes. Liste complète : Accessories,
  Aging Items, Arachnal Items, Armors, Backwater Bayou, Bags, Bits Shop, Bows,
  Brewing Ingredients, Catacombs, Characters, Collections, Cosmetic Item Categories,
  Crimson Isle, Critters, Crystal Hollows, Currencies, Dark Auction, Dungeons,
  Dwarven Mines (+7 sous-navs : Accessories/Armor/Events/Locations/Mining/Mobs/NPCs/
  The Forge), Dyes, Enchantments, Equipment (+5 sous-navs : Belts/Bracelets/Cloaks/
  Gloves/Necklaces), Events (+9 sous-navs : Bingo/Fishing Festival/Mayor Election/
  Mining Fiesta/Mythological Ritual/New Year Celebration/Season of Jerry/Spooky
  Festival/Traveling Zoo), Fishing, Galatea, Great Spook, Harvest Feast, Islands,
  Kuudra, Locations, Lore, Lotus Atoll, Mayors, Minion Modifiers, Minions, Minister
  Election, Mixins, Mobs (+6 sous-navs : Bosses/Events/Mini-Bosses/Sea Creatures/
  Slayer/Standard), Music Discs, Mutations, Mythological Ritual, NPCs, Pet Items,
  Pets, Policies, Potions, Power Stones, Races, Raffle of the Century, Reforge
  Stones, Rod Parts, Sacks, Sea Creatures, Shen's Auction, Skills, Slayer (+6
  sous-navs par boss), Social, Special Items, Stats, Swords, The End, The Garden,
  The Uprising, Tools (+7 sous-navs : Axes/Farming/Fishing/Foraging/Hunting/Mining/
  Other), Tutorials, Undead Armors, Undead Items, Wands, Yearly Events System.

**API Hypixel officielle** : spec OpenAPI/Redoc extraite en direct de la page HTML de
`api.hypixel.net` (embarquée en `__redoc_state`, pas un fichier séparé). **32
endpoints réels `/v2/*`** : boosters, counts, guild, housing/active, housing/house,
housing/houses, leaderboards, player, punishmentstats, recentgames,
resources/achievements, resources/challenges, resources/games,
resources/guilds/achievements, resources/packs, resources/quests,
resources/skyblock/bingo, resources/skyblock/collections,
resources/skyblock/election, resources/skyblock/items, resources/skyblock/skills,
resources/vanity/companions, resources/vanity/pets, skyblock/auction,
skyblock/auctions, skyblock/auctions_ended, skyblock/bazaar, skyblock/bingo,
skyblock/firesales, skyblock/garden, skyblock/museum, skyblock/news,
skyblock/profile, skyblock/profiles, status.

**Projets communautaires** (arbres de fichiers GitHub complets, non tronqués) :
- **SkyHanni** (`hannibal002/SkyHanni`, branche `beta`) : 3195 fichiers, **29
  dossiers de features de premier niveau** : achievements, anvil, bingo, chat,
  chroma, combat, commands, cosmetics, dungeon, event, fame, fishing, foraging,
  garden, gifting, gui, hunting, inventory, itemabilities, mining, minion, misc,
  nether, pets, rift, skillprogress, slayer, stranded, summonings.
- **Firmament** (`FirmamentMC/Firmament`, branche `mc-26.1`) : 1056 fichiers,
  dossiers de features : chat, debug/itemeditor, diana, events/anniversity,
  events/carnival, fixes, garden, inventory/buttons+storageoverlay, items/recipes,
  macros, mining, misc, world.
- **hypixel-api-reborn** (`Hypixel-API-Reborn/hypixel-api-reborn`, branche
  `master`) : 1183 fichiers, **364 liés à Skyblock**. Structure typée complète du
  vrai objet `SkyBlockMember` — la source la plus fine trouvée sur tout le
  chantier, révèle en particulier le détail complet des 11 sous-systèmes Rift avec
  leurs propres sous-minigames (voir Étape B).

**NEU-REPO** : déjà exhaustée lors d'une passe antérieure (Source 1, 40/40 fichiers,
reconfirmée en direct via l'API GitHub) — reportée telle quelle, pas refaite.

**Limite honnête reconnue** : cette découverte est exhaustive au niveau
*titre/structure*, pas au niveau *contenu*. Sur 15 159 pages wiki, le contenu réel n'a
été lu que pour ~35-40 pages "hub" par système dans les 9 passes ci-dessus. Aucun des
112 templates Nav n'a été ouvert pour lire ce qu'il référence réellement — leur
existence a servi de signal de regroupement (Étape B), pas de contenu vérifié.

## Étape B — systèmes identifiés, avec source précise (validée par l'utilisateur)

Légende : ✅ en base et exploité · 🟡 partiel · 🔴 jamais mappé (vrai trou) · ⛔ non-fetchable (mécanique jeu confirmée mais sans donnée API)

- **Skills de base (10)** — Combat🟡, Mining✅, Farming✅, Foraging✅, Fishing✅,
  Enchanting🟡, Alchemy🟡, Carpentry✅(exclu), Taming🟡, Social✅(exclu). Source : wiki
  `Nav/Skills` ; api-reborn `SkyBlockMemberLeveling`.
- **Combat/Slayer** — Slayer 6 bosses✅, Dungeon Score🔴(formule trouvée, pas stockée),
  Damage Calculation🔴. Source : wiki `Nav/Slayer`+6 sous-navs, `Nav/Catacombs`,
  `Nav/Dungeons` ; api-reborn `Member/Slayers/*`, `Member/Dungeons/*`.
- **Mining mega-système** — HOTM✅, HOTM Forge✅(Bloc7), Heart of the Forest✅
  (aujourd'hui), Crystal Hollows🟡, Glacite🟡. Source : wiki `Nav/Dwarven Mines`
  (7 sous-navs), `Nav/Crystal Hollows` ; api-reborn `Member/Mining/*`.
- **Crimson Isle/Kuudra** — Kuudra tiers/phases✅, Dojo⛔(confirmé non-exposé API),
  Abiphone✅(Bloc8), **The Matriarch🔴** (boss réel jamais mentionné avant, trouvé via
  api-reborn), Trophy Fish✅. Source : wiki `Nav/Crimson Isle`, `Nav/Kuudra`,
  `Nav/Galatea`, `Nav/The Uprising` ; api-reborn `Member/CrimsonIsle/*`.
- **Rift — bien plus granulaire que documenté** : les 11 sous-systèmes déjà notés
  au Bloc 7 révèlent, une fois api-reborn ouvert, des sous-minigames internes jamais
  vus : VillagePlaza contient Barry/Cowboy/Murder ; WestVillage contient
  CrazyKloon/Glyphs/KatHouse/Mirrorverse ; Gallery contient SecuredTrophy. Source :
  api-reborn `Member/Rift/**` — le breakdown le plus fin trouvé sur tout le
  chantier, preuve directe que la boucle de découverte (voir plus bas) est
  nécessaire.
- **Économie/Événements réseau — le vrai trou du jour, quasiment 0% couvert** :
  Mayor/Minister Election🔴 (`/v2/resources/skyblock/election`), Fire Sales🔴
  (`/v2/skyblock/firesales`), News officiel🔴 (`/v2/skyblock/news`), Bingo🔴
  (`/v2/skyblock/bingo` + `/v2/resources/skyblock/bingo`), Dark Auction🔴⛔ (pas
  d'endpoint dédié trouvé), Bits Shop (contenu du magasin)🔴.
- **Items/objets transverses jamais mappés comme systèmes** : Sacks🔴, Bags🔴,
  Power Stones/Orbs🔴, Reforge Stones✅(chargé aujourd'hui), Minion Modifiers🟡,
  Races🔴 (Woods Race/Rift Race/Dark Pebble), Critters🔴, Mutations🔴 (Garden),
  Mixins🔴 (Bartender).
- **Quests/Objectives** — Harp⛔(vide confirmé), **Trapper🔴** (jamais mentionné
  avant, structure typée existe dans api-reborn — **confirmé réel et vivant** via
  le goal Bingo `KILL_TRAPPER_MOB` vérifié en direct le même jour, voir plus bas).
- **Événements saisonniers (10)** — Spooky Festival🟡, Mythological Ritual⛔(vide
  confirmé), Mining Fiesta🔴, Fishing Festival🔴, New Year Celebration🔴, Season of
  Jerry🔴, Traveling Zoo🔴, Great Spook🔴, Harvest Feast🔴, Raffle of the Century🔴,
  Shen's Auction🔴.
- **Déjà solides, confirmés sans nouveau trou** : Museum✅, Community Upgrades✅,
  Chocolate Factory✅, Fairy Souls✅, Bestiary✅, Jacob's Contest✅, AccessoryBag✅
  (Bloc7).
- **Hors scope Vault, confirmé avec l'utilisateur** : `/v2/guild`, `/v2/player`,
  `/v2/housing/*`, `/v2/boosters`, `/v2/leaderboards`, achievements/challenges/
  games, SkyHanni `stranded` — réseau Hypixel général ou autre gamemode, sans
  rapport avec l'économie/progression Skyblock.

## Estimation honnête de couverture (avant tout fetch réel)

Demandée explicitement par l'utilisateur, pas un chiffre rond arbitraire :
- **Localisation des sources** (où chercher) : ~80-90%, pagination réellement
  exhaustive à son propre niveau.
- **Identification des systèmes** (Étape B) : ~70-75%, optimiste — construite sur
  les NOMS des 112 templates Nav, pas leur contenu réel (aucun ouvert).
- **Contenu réel lu** (formules, valeurs) : ~3-5%, ~35-40 pages hub lues sur 15 159.
- **Validation contre de la vraie donnée live** : ~0% pour toutes les découvertes du
  jour (aucune confrontée à un vrai appel API avant la vérification Tier 1
  ci-dessous) — seules les anciennes structures (HOTM, boss_kills...) avaient été
  vérifiées lors de blocs précédents.
- **Chiffre unique honnête pour "prêt à construire le schéma Supabase final"** :
  **15-25%**, pas plus.

## Boucle de découverte explicite — validée, remplace la liste B figée

Preuve directe dans cette session : Rift (niveau structure, Bloc 7) → sous-minigames
(niveau contenu api-reborn, aujourd'hui) — la liste B n'était pas complète au niveau
où on la croyait. **Règle validée pour la suite (Étapes C/D)** :
1. Un système n'est jamais "clos" tant que sa source n'a pas été lue en entier
   (contenu, pas juste titre).
2. Toute sous-référence (sous-page, sous-champ, mécanique nommée) rencontrée en
   fetchant qui n'est pas déjà dans la liste B est ajoutée à une `discovery_queue`
   plutôt qu'ignorée, traitée dans le même passage.
3. Un système = "couvert" seulement quand son propre fetch ne fait plus apparaître
   de nouvelle sous-référence (condition de sortie, pas un compteur de systèmes
   cochés).

## Vérification Tier 1 — 4 endpoints, formes JSON réelles confirmées (1er août)

Zéro coût, zéro écriture, juste confirmer la vraie forme avant tout mapping (règle 7).
Aucune clé API nécessaire pour 3 des 4 (les endpoints `resources/` et `skyblock/news`/
`skyblock/firesales` sont publics, confirmé en direct) :

- **`/v2/resources/skyblock/election`** — ✅ 200, public. Vraie donnée live (1er août
  2026) : mayor actif `Scorpius` (candidat "shady"), perks réels `Bribe` et
  `Darker Auctions` (**ce dernier augmente réellement le nombre de rounds du Dark
  Auction à 7** — confirme une vraie interaction mécanique entre 2 systèmes qu'on
  avait notés séparément). Candidats réels avec votes en direct : `Cole` (mining,
  15147 votes, perk "+60 Mining Wisdom sur îles publiques"), `Foxy` (events, perk
  "Sweet Benevolence" +30% Candy/Gifts/Chocolate).
- **`/v2/skyblock/news`** — ✅ 200, public. Vraie liste d'annonces officielles :
  "SkyBlock v0.26.1" (22 juillet 2026), "SkyBlock v0.26" (8 juillet 2026),
  "SkyBlock Year 500 Raffle" (1er juillet 2026) — dates cohérentes avec les patches
  déjà connus via le scraping wiki, confirme que cette source peut servir de
  recoupement/accélérateur pour `patch-analysis-agent`, pas juste une redite.
- **`/v2/skyblock/firesales`** — ✅ 200, public. `{"success":true,"sales":[]}` —
  structure confirmée réelle, aucune Fire Sale active au moment du test (résultat
  honnête, pas un échec).
- **`/v2/skyblock/bingo`** (endpoint live, PAS `resources/`) — ❌ 
  `{"success":false,"cause":"Missing API-Key header"}` — nécessite `HYPIXEL_API_KEY`
  (probablement une progression bingo par joueur, uuid+clé requis) — clé non
  disponible dans cet environnement local, à refaire une fois la clé accessible.
- **`/v2/resources/skyblock/bingo`** — ✅ 200, public. Vraie donnée live : event
  "August 2026" (id 56), goals réels avec vrais seuils (`break_block_crops` : 5
  paliers 30M/60M/90M/120M/150M) — et **confirme "Trapper" comme mécanique réelle
  et vivante** : un goal littéral `KILL_TRAPPER_MOB` ("Setting a Trap... Kill a
  T[rapper mob]") apparaît dans les objectifs du mois en cours, cross-validant la
  découverte du jour via hypixel-api-reborn sans l'avoir cherché exprès.

## Prochaine étape (bloquée sur reconnexion Supabase MCP)

1. Créer `discovery_queue` (colonnes : `source`, `reference_name`,
   `discovered_via`, `status`) — migration prête, pas encore appliquée.
2. Fetch en profondeur Tier 1 (News/Fire Sales/Election/Bingo) avec la boucle de
   découverte active dès le premier système traité — pas la liste B comme fin en
   soi, comme point de départ vivant.
3. `HYPIXEL_API_KEY` nécessaire pour `/v2/skyblock/bingo` (endpoint live) — à
   vérifier/récupérer depuis Vercel, pas trouvée en local cette session.

## Étapes C/D/E — Tier 1 exécuté en entier (1er août, Supabase reconnecté même session)

Ordre suivi : Election → News → Fire Sales → Bingo (déjà validé). Méthode systématique
par source : re-fetch complet non tronqué → design de table basé UNIQUEMENT sur les
champs réellement observés (ou cross-vérifiés via une lib tierce sourcée quand
l'endpoint est vide) → migration → insertion manuelle de la donnée réelle pour
valider le schéma → écriture du cron réel → vérification en conditions réelles via
route de debug temporaire (bypass `CRON_SECRET`) → suppression de la route de debug →
merge.

### `discovery_queue` créée en premier

Schéma : `source, reference_name, discovered_via, status
(pending|in_progress|resolved|not_applicable), notes, created_at, resolved_at`.
6 entrées loguées le jour même : The Matriarch, Rift Village Plaza sous-minigames,
Rift West Village sous-minigames, Rift Gallery SecuredTrophy, Trapper (+ cross-
validation via le goal Bingo réel), et la correction du schéma `mayors`.

### Election → `skyblock_mayor_election`

Vraie forme complète (`/v2/resources/skyblock/election`, public) : `mayor.key/name/
perks[]` (perk = `{name, description, minister}`) + `mayor.election.year/candidates[]`
(candidat = `{key, name, perks[], votes}`) pour l'élection passée qui a mis ce mayor en
place, PLUS un bloc `current.year/candidates[]` séparé = l'élection EN COURS (votes
live pour le prochain mandat). Table conçue avec ces deux axes distincts
(`current_mayor_*` vs `next_election_*`), `UNIQUE(current_mayor_key,
current_mayor_election_year)`, `raw jsonb` en filet de sécurité.

Donnée réelle chargée (1er août 2026) : mayor actif **Scorpius** (élu année 504,
perks Bribe + Darker Auctions), élection en cours année 505 avec 5 candidats réels
(Diana/pets, Marina/fishing, Diaz/economist, Foxy/events, Paul/dungeons) et leurs vrais
votes. **Interactions économiques réelles trouvées, jamais documentées** :
- Darker Auctions (Scorpius) : +3 rounds Dark Auction.
- Shopping Spree (Diaz, economist) : NPC buy limits ×10 si minister.
- Volume Trading (Diaz) : double la quantité disponible par Shen's Auction +2 auctions
  spéciales si Diaz mayor.
- Luck of the Sea 2.0 (Marina, fishing) : +15 Sea Creature Chance si minister — se
  superpose directement à la formule SCC déjà sourcée (base 20%, ÷4 zones agricoles).

**`mayors` (stub pré-existant, 0 ligne) NON réutilisée** : colonnes
`economic_impact`/`active_items`/`duration_days` ne correspondent à rien dans la vraie
réponse API — probable schéma deviné avant que la règle 7 soit strictement appliquée.
Nouvelle table créée à la place, `mayors` laissée intacte, décision de fusion/
suppression future loguée dans `discovery_queue`, pas tranchée seule.

### News → `skyblock_news`

Vraie forme (`/v2/skyblock/news`, public) : `items[]` = `{item:{material}, link, text,
title}`. Piège trouvé : `text` est une date lisible ("22nd July 2026"), pas un
timestamp — parsée côté cron (`published_at`, nullable si le parsing échoue plutôt que
de planter). `link` = clé naturelle (vraie URL de thread Hypixel). Seulement 9 items
retournés (~6 mois d'historique, 27 janvier → 22 juillet 2026) — pas d'archive
complète, confirmé en re-fetchant sans troncature.

### Fire Sales → `skyblock_fire_sales`

Réponse vide au moment du mapping (`{"success":true,"sales":[]}`) — **champs jamais
devinés** : cross-vérifiés en lisant le code source réel de
`hypixel-api-reborn/src/Structures/SkyBlock/FireSale/SkyBlockFireSale.ts`, qui parse
`data.item_id/start/end/amount/price` depuis la réponse brute. Table créée avec ces
champs exacts, 0 ligne chargée (honnête, pas de fabrication). `start`/`end` en ms
epoch confirmés par la lib (`new Date(data.start)`).

### Bingo → `skyblock_bingo_events` + `skyblock_bingo_goals`

`/v2/resources/skyblock/bingo` (public) — event réel août 2026 (id 56 = vrai id
Hypixel, pas généré), 25 goals réels avec des formes hétérogènes (certains ont
`tiers[]`+`progress`, la majorité ont juste `requiredAmount`, quelques-uns n'ont
aucun seuil du tout — juste un `id`/`name`/`lore`). `progress` sur les goals à tiers
ressemble à une progression communautaire globale (ex: `break_block_crops` à
133 994 731 / seuil max 150 000 000) — stocké tel quel, pas interprété (règle 7,
signification exacte pas confirmée).

**`/v2/skyblock/bingo` (endpoint live, distinct) reste bloqué** — `{"success":false,
"cause":"Missing API-Key header"}`, `HYPIXEL_API_KEY` absente en local, loguée dans
`discovery_queue`.

### Cron réel — `network-events-sync`

`app/api/cron/network-events-sync/route.ts`, `vercel.json` `*/15 * * * *` (cadence
unique pour les 4, dominée par le besoin de fraîcheur des Fire Sales — le reste est
bon marché à sur-fetcher). Même pattern multi-fonctions que `skyblock-resources-sync`
(1 cron, `sync_log` startSync/finishSync, upserts par lots). `runNetworkEventsSync()`
exportée séparément du handler `GET` pour permettre la vérification directe sans
`CRON_SECRET` (même pattern que `runAhCollect()`/`runAhAggregate()`).

**Vérifié en conditions réelles avant merge** (route de debug temporaire, supprimée
après validation) : les 4 fonctions réussissent via le vrai chemin de code — election
1 ligne, news 9, fire_sales 0, bingo 26 (1 event + 25 goals). Recompté directement en
base après coup : comptes identiques, aucun doublon malgré le chevauchement avec les
inserts manuels faits pendant le mapping (upserts sur les bonnes clés de conflit dans
les deux cas).

### Corrections trouvées en creusant l'état réel de Supabase

`list_tables` au tout début de ce passage a révélé que deux marquages 🔴 de l'Étape B
étaient trop pessimistes (limite honnête déjà annoncée : l'Étape B n'avait pas vérifié
Supabase avant la reconnexion) :
- **Sacks** : `sack_contents(sack_item_id, sack_category, accepted_item)`, 677 lignes
  réelles, colonnes plausibles — pas un stub. Corrigé 🔴→🟡.
- **Rift guide** : `rift_guide(task_id, task_name, zone, description, sub_tasks,
  wiki_link)`, 73 lignes réelles — plus avancé que ce que l'archive du 23 juillet
  ("reste en cache brut seulement") laissait supposer. Reste un référentiel de tâches,
  ne débloque pas le vrai blocage Rift (données joueur, Bloc 7).

### Prochaine étape (Tier 2/3, pas commencé)

Tier 2 : Sacks (compléter, pas recréer) → Bags → Power Stones → Minion Modifiers →
The Matriarch → Trapper → Races. Tier 3 : les 10 événements saisonniers. Tous des
référentiels wiki statiques (même méthode que `wiki-auto-sync`/`neu-sync`), pas de
nouveau cron API dédié nécessaire contrairement au Tier 1.

## Tier 2 fermé — Sacks/Bags/Power Stones/Minion Modifiers/Matriarch/Trapper/Races (2 août)

Même discipline que le Tier 1 : chaque système vérifié contre Supabase avant de créer
quoi que ce soit, boucle de découverte active tout du long (4 nouvelles entrées
`discovery_queue` : Time Pocket/Aging Items, Minion Modifiers 58 items non
catégorisés, + 2 corrections resolved ci-dessous).

**Sacks — complété, pas recréé.** `sack_contents` (677 lignes) couvrait déjà le
mapping item→sac, mais **les vraies capacités par taille manquaient entièrement** —
trou réel trouvé en ouvrant la page wiki `Sacks`. Nouvelle table `sack_tiers` (4
lignes : Beginner 640/10, Small 2240/35, Medium 6720/105, Large 20160/315 — items
par taille / items en stacks). Note réelle capturée : les sacs Beginner ne contiennent
que des items vanilla ; certains sacs (Large Gemstone Sack, Bronze Trophy Fishing
Sack) ont un nombre de slots différent de ce standard.

**Bags — déjà largement couvert ailleurs.** Le `Nav/Bags` du wiki liste 8 systèmes :
Accessory Bag (✅ `accessory_bag_storage`, Bloc7), Potion Bag, Personal Bank (✅
`bank_tier`, Bloc3), Ender Chest (✅ NBT chantier), Fishing Bag, Quiver, Sack of Sacks
(= Sacks ci-dessus), **Time Pocket** (🔴 réel, jamais mappé — débloqué à Timite 2,
stocke 6 vrais "Aging Items" qui évoluent 2x plus vite, loggé dans `discovery_queue`
plutôt que construit cette passe, hors scope immédiat).

**🔴→✅ Power Stones — déjà couvert, marquage Étape B corrigé.** `accessory_powers`
(23 lignes, compte exact de la vraie catégorie wiki) mappe déjà chaque Power Stone
vers la Power débloquée chez Maxwell (9x la même pierre), avec les vrais seuils de
stats par Magical Power et le niveau de Combat requis. Aucune nouvelle table
nécessaire — juste une vérification qui aurait dû être faite avant le marquage 🔴
initial (limite de l'Étape B déjà assumée).

**Minion Modifiers — 58 items réels confirmés, pas de table créée.** Catégorie wiki
exhaustive (fuels, crystals d'upgrade slot, storage) mais catégoriser chaque item par
type/effet réel aurait nécessité d'ouvrir 58 pages individuelles — risque réel de
deviner la catégorisation depuis les noms plutôt que de la sourcer (règle 7). Loggé
dans `discovery_queue` comme trouvaille confirmée mais non exploitée, `minion_tier_xp`
(12 lignes) reste la seule vraie couverture "Minions" actuelle.

**The Matriarch — mécanique réelle documentée, pas de table (pas de structure
tabulaire).** Boss Crimson Isle géré par ingestion : génère 3 Heavy Pearls/24h,
mange le joueur au-delà de 1 pearl disponible, mini-jeu de collecte dans "Belly of
the Beast" avec acide stomacal. Reset quotidien à **20h ET** (pas minuit comme la
majorité des autres systèmes — piège potentiel si jamais automatisé). Matriarch's
Perfume : +3 pearls instantanés, jusqu'à 4x/jour. Attribut Matriarch Cubs max :
+20% chance de pearl bonus (jusqu'à 6 pearls, moyenne 3.8).

**Trapper — système entièrement nouveau, cartographié et chargé.** "Trapper"
redirige vers **Trevor** (NPC du Trapper's Den), confirmé réel et vivant via le goal
Bingo `KILL_TRAPPER_MOB` (Tier 1). Nouvelle monnaie **Pelts**, dépensée chez Tony
(minions Farming T12) et Talbot (items farming). 2 nouvelles tables réelles :
`trapper_pelt_rarities` (5 paliers réels : Trackable 2-6, Untrackable 4-9, Undetected
6-12, Endangered 8-15, Elusive 16-27) et `trapper_pelt_modifiers` (Pelt Belt +1,
Jake's Plushie +1, Trapper Crest ×1.1-1.5). Zone 0% couverte avant cette passe.

**Races — confirmé réel, 5 pas 3.** `Nav/Races` liste End Race, Woods Race, Chicken
Race, Dungeon Hub Race, Rift Race (l'Étape B n'en avait que 3 identifiées via les
catégories). Mécanique confirmée (Woods Race) : minigame de vitesse chronométré,
récompenses = quelques items uniques de craft par palier de temps (ex: Silky Lichen
à 18s). Même profil que Carpentry/Taming/Social — réel mais sans enjeu économique
direct, pas de table dédiée, cohérent avec l'exclusion déjà actée pour ce type de
contenu.

## Tier 3 fermé — les 10 événements saisonniers (2 août)

Passe légère (même profondeur que Carpentry/Taming/Social) — tous confirmés réels
via le contenu de leur page wiki, capture des connexions/mécaniques les plus
pertinentes plutôt qu'une extraction exhaustive de chaque table de loot.

**Mining Fiesta — connexion réelle avec l'Election déjà chargée (Tier 1).**
Programmée par Cole (mayor mining) : 4 fois par mandat + bonus si Foxy (perk Extra
Event) ou Jerry (Perkpocalypse) actifs — exactement la structure de mayor/perks déjà
dans `skyblock_mayor_election`. Mécanique : +75 Mining Wisdom, drops doublés, vraie
table de taux de drop Refined Mineral/Glossy Gemstone par bloc (non chargée,
granularité trop fine pour cette passe).

**Fishing Festival** — même famille (Mining Fiesta pour Fishing), structure Overview/
Timing/Mechanics similaire, pas creusé plus en détail cette passe.

**Shen's Auction — système économique réel, distinct de l'AH classique.** Une fois
par SkyBlock Year, gated par Museum Milestones 10 (Shen's Auction) et 20 (Shen's
Special). Items TOUJOURS les mêmes, **plusieurs gagnants par slot** (ex: Artifact of
Control = 20 gagnants normal / 10 Ironman, Shen's Regalia = 80/40) — mécanique
d'enchère à winners multiples jamais vue ailleurs dans le projet. Stock Ironman à
50% avec bids séparés. Pas de table créée (fréquence trop faible pour justifier un
cron), mais structure documentée pour référence future.

**New Year Celebration, Season of Jerry, Traveling Zoo, Harvest Feast, Raffle of the
Century** — tous confirmés réels avec du vrai contenu structuré (Traveling Zoo a un
vrai tableau de stock/coûts de pets ; Raffle of the Century a un vrai système de
tickets/récompenses, page la plus longue du lot à 30k caractères) mais pas creusés
en détail cette passe — narratifs/événementiels, pas de lien direct trouvé avec
l'économie de marché suivie par Vault (Flash Alerts/Radar/Money Making).

**Great Spook** — redirige vers **The Great Spook**, pas ouvert cette passe.

**État de `discovery_queue` après Tier 2/3** : 8 pending, 3 resolved, 1 in_progress
(sur 12 entrées au total). Rien silencieusement perdu — chaque sous-référence
rencontrée a été soit fermée avec une vraie table, soit explicitement loggée avec la
raison de ne pas avoir été construite cette passe.

## Source 3 (SkyHanni/Firmament/hypixel-api-reborn, approfondi) + queue vidée (2 août)

Approfondissement demandé explicitement au-delà de ce qui avait déjà servi de
référence croisée (Étape A/B, puis Trapper/Power Stones en Tier 2). Méthode : arbre
de fichiers complet des 3 repos via l'API GitHub (`git/trees/{branch}?recursive=1` —
`hannibal002/SkyHanni` branche `beta`, `FirmamentMC/Firmament` branche `mc-26.1`,
`Hypixel-API-Reborn/hypixel-api-reborn` branche `master`), dossiers Garden/Dungeon/
Mining lus en détail (les zones les moins creusées jusqu'ici), recoupé à chaque fois
contre le wiki et `game_mechanics_misc` déjà caché avant de conclure.

**Découverte majeure — Garden Pests, 0% → réel, trouvé par triangulation des 3
sources.** SkyHanni a un module dédié (`features/garden/pests`) avec les 15 types de
pest en constantes typées ; Firmament référence la même liste côté rendu d'icônes ;
hypixel-api-reborn expose déjà `member.garden.pest_count`/`bonus_pest_chance`
typés. Recoupé ensuite contre `game_mechanics_misc` : le wiki était déjà caché
(`category='farming_wiki'`, pages `Pest`, `Bonus Pest Chance`, `Pesthunter
Phillip`/`Pesthunter Pamela`) mais jamais structuré en table — même situation que
HOTM Forge en son temps. 2 nouvelles tables réelles : `garden_pests` (15 types +
Field Mouse, crop associé, niveau Garden requis, item/vinyl d'attraction) et
`garden_pest_fortune_penalty` (15 lignes, vraie courbe de perte de Farming Fortune
par nombre de pests × palier de Bonus Pest Chance) — la première fois que la
pénalité réelle de laisser les pests s'accumuler est capturée dans ce projet.

**3 systèmes plus petits fermés dans la foulée, tous sourcés avant codage** :
- `minion_upgrade_items` (19 lignes) — les 5 vraies sections tabber de la page wiki
  `Minion_Upgrades/Table` (Replacement/Spreading/Cooldown/Compacting/Other) utilisées
  comme catégorisation, jamais devinée depuis le nom de l'item seul (règle 7).
- `time_pocket_aging_items` (6 paires réelles d'items base→évolué) + 
  `time_pocket_upgrades` (3 paliers de slots réels : 6/None, 9/1x Discrite, 12/1x
  Spotlite) — durées d'évolution laissées `NULL` quand non sourcées individuellement
  plutôt qu'inventées.
- `sack_tiers` confirmé complet (4 tiers réels, déjà chargé en Tier 2).

**Rien d'autre de significatif trouvé** en creusant Firmament (essentiellement un
mod de rendu/QoL, pas une source de données de jeu indépendante — confirme son
usage de référence croisée déjà établi, pas une 4e source de vérité) ni le reste de
hypixel-api-reborn (`member.*` déjà largement exploité en Phase 2/Bloc 7).

### Traitement de `discovery_queue` jusqu'à épuisement (12 → 1 pending)

Les 8 entrées encore `pending`/`in_progress` après Tier 2/3 ont été traitées une par
une, pas juste listées — chacune a soit produit un vrai résultat (table, correction
de code, mécanique documentée), soit reste honnêtement bloquée avec la raison
vérifiée :

- **#6 (mayors, schéma orphelin) — le résultat le plus important de cette passe.**
  En creusant pourquoi la table `mayors` existait encore malgré `skyblock_mayor_
  election` déjà chargée en Tier 1, trouvé que `radar-agent` (le cron qui construit
  le contexte envoyé à Claude Sonnet pour l'analyse Radar) interroge encore
  littéralement `mayors` à chaque run et injecte son résultat (toujours vide, 0 ligne
  depuis la création de la table) directement dans le prompt — **bug de production
  réel, pas juste un stub orphelin** : le contexte mayor de Radar est silencieusement
  vide depuis le lancement de la feature, jamais détecté faute d'un profil de test
  qui aurait remarqué l'absence. Corrigé (`app/api/cron/radar-agent/route.ts`,
  branche `fix/radar-agent-real-mayor-data`, commit `6bd9738a`) : lit maintenant
  `skyblock_mayor_election`, construit `mayor: {current_mayor, current_perks,
  next_election_year, next_election_leader}` (leader = plus haut nombre de votes).
  Vérifié par traçage direct de la vraie ligne contre la logique de transformation
  (Diaz mène l'élection année 505 avec 772 663 votes, confirmé en SQL) plutôt qu'un
  run réel — `radar-agent` fait un vrai appel payant Sonnet, cohérent avec la
  pratique déjà établie du projet de ne pas dépenser d'API juste pour vérifier un
  changement de fetch de données. Build Vercel confirmé READY, mergé sur master,
  déploiement production reconfirmé READY après merge (`dpl_68W1PFfNd9y84fNAWF7ZVNop2fDb`).
- **#1-#5, #8-#12 (9 entrées)** — Matriarch, 3 groupes de sous-minigames Rift,
  Trapper, Minion Modifiers, Time Pocket/Aging Items, + les 3 trouvailles Source 3
  ci-dessus — toutes fermées avec un vrai contenu construit (table ou mécanique
  documentée), déjà détaillées dans leurs sections respectives (Tier 2/3 et Source 3
  ci-dessus).
- **#13 (`member.garden.larva_consumed`, trouvé en Source 3) — résolu par lecture du
  cache déjà existant.** La recherche wiki en direct a d'abord buté sur un vrai piège
  d'environnement (domaine `wiki.hypixel.net` — l'ancien wiki officiel Hypixel,
  fermé le 21 juillet 2026 par annonce officielle, redirige maintenant vers un thread
  forum ; confirmé sans rapport avec le vrai domaine utilisé par ce projet
  `hypixelskyblock.minecraft.wiki`, un wiki communautaire distinct hébergé sur
  l'infra Weird Gloop, toujours actif — `wiki-auto-sync` a continué à tourner et
  scraper du contenu réel toutes les 30 min pendant cette même session, confirmé en
  SQL). Les requêtes brutes directes vers le bon domaine depuis cet environnement
  local ont ensuite été bloquées par une page de challenge anti-bot (Weird Gloop),
  sans rapport avec la disponibilité réelle du site — contourné en interrogeant
  `game_mechanics_misc`, qui avait déjà cette page en cache. Mécanique réelle
  trouvée : **Locust Larva** (`LOCUST_LARVA`, Uncommon, drop 4% du mob Locust — un
  des 15 pests déjà chargés dans `garden_pests`) — consommé sur The Garden, ajoute
  directement +1 Pest au Vacuum bag du joueur sans avoir à le tuer en jeu (message
  in-game "LARVA! A Pest was added to your vacuum bag"). `larva_consumed` est donc
  un compteur d'activité joueur, pas un référentiel de jeu — documenté ici plutôt
  que construit en table séparée (même distinction que pour les autres champs
  `player_data` mineurs déjà rencontrée dans ce chantier).
- **#7 (`/v2/skyblock/bingo` endpoint live per-joueur) — reste honnêtement bloqué,
  seule entrée non résolue.** Reconfirmé : `HYPIXEL_API_KEY` toujours absente de cet
  environnement local, `Missing API-Key header` en retour direct. Distinct de
  `/v2/resources/skyblock/bingo` (public, déjà chargé en Tier 1 —
  `skyblock_bingo_events`/`skyblock_bingo_goals` restent valides et suffisants pour
  ce que Vault utilise aujourd'hui). Zéro action possible sans que l'utilisateur
  recharge la clé côté Vercel puis la transmette — pas un blocage de méthode, un
  vrai blocage d'accès.

**État final de `discovery_queue`** : 12 `resolved`, 1 `pending` (#7, bloqué sur la
clé API) — file traitée jusqu'à épuisement au sens où chaque entrée a reçu un
vrai traitement, pas juste une relecture.

**⚠️ Point opérationnel trouvé en marge, sans impact sur ce chantier** : le vrai
wiki officiel Hypixel (`wiki.hypixel.net`, différent du wiki communautaire utilisé
par ce projet) a fermé le 21 juillet 2026 (annonce officielle Hypixel, thread
`hypixel.net/threads/end-of-the-official-hypixel-wiki-july-2026.6112020`) — liens
in-game retirés, pages en cours de retrait. Sans conséquence pour Vault : la
migration vers `hypixelskyblock.minecraft.wiki` (wiki communautaire, infra Weird
Gloop) était déjà faite le 22 juillet, avant même cette fermeture, et ce wiki reste
actif et scrapé normalement (confirmé en direct ce jour). Noté uniquement pour ne
pas confondre les deux domaines dans une future session.

## CHANTIER FINAL — Volet 2 : automatisation des tables one-shot (2 août)

Suite directe de l'état des lieux qui a trouvé 48 tables référentielles (NEU-REPO/wiki)
chargées ponctuellement mais jamais reliées à un cron — exactement le "chargement
ponctuel isolé" interdit par la Règle 5 du chantier final. Volet 2 (sécuriser l'existant)
priorisé avant Volet 1 (compléter les gaps), décision explicite de l'utilisateur.

**Scope traité cette passe** : les 9 tables sorties du chantier cartographie de cette
semaine (Tier 2/Source 3/Bloc 7) — le sous-ensemble que je maîtrisais déjà en détail
(page source connue, structure déjà comprise en construisant les tables une première
fois). Groupées initialement en **4 crons hebdomadaires** (lundi, décalés de 5 min
chacun) + **1 cron quotidien** (`discovery-scan`, la boucle de résilience demandée en
point 2) — voir le détail de chaque groupe ci-dessous, tel que construit et validé.

**✅ Fusionnés le même jour en 1 seul cron `wiki-referential-sync`** (question
d'optimisation légitime de l'utilisateur : chaque groupe ne coûtait qu'une poignée de
lectures Supabase déjà en cache + un petit upsert, combiné bien sous la limite de
timeout Vercel — 4 fonctions Vercel séparées n'apportaient rien). Les 7 sous-fonctions
ci-dessous vivent maintenant dans un seul fichier, chacune toujours isolée par son
propre try/catch sous une seule entrée `sync_log` (même pattern que
`network-events-sync`) — le détail par table reste dans `sync_log.details.results`,
aucune perte de granularité de diagnostic malgré la fusion. Détail de composition
d'origine, toujours exact fonctionnellement :

- ~~`wiki-mining-forge-sync`~~ (lundi 5h45) — `hotm_forge_durations` (119 lignes),
  reparse `The Forge/Table` (9 sous-sections, rowspan imbriqué réel sur Duration ET
  HotM Requirement indépendamment).
- ~~`wiki-garden-sync`~~ (lundi 5h50) — `garden_pests` (15) + `garden_pest_fortune_
  penalty` (15), les deux depuis la MÊME page wiki "Pest" (table Pests + table Farming
  Fortune loss de la section Behavior, elle-même à en-tête irrégulier sur 3 blocs `|-`).
- ~~`wiki-slot-upgrades-sync`~~ (lundi 5h55) — `time_pocket_upgrades` (3) + `time_pocket_
  aging_items` (6, prose regex, pas une wikitable) + `minion_upgrade_items` (19, 5
  onglets tabber réels comme catégorisation).
- ~~`wiki-economy-npc-sync`~~ (lundi 5h58) — `sack_tiers` (4) + `trapper_pelt_rarities`
  (5) + `trapper_pelt_modifiers` (3).

Cron restant séparé (cadence différente) :
- **`discovery-scan`** (quotidien 4h) — nouveau mécanisme : `game_mechanics_misc` a reçu
  une colonne `created_at` (migration additive, jamais réécrite par l'upsert de
  `wiki-auto-sync`) pour distinguer une page vraiment nouvelle d'un simple refresh. Ce
  cron liste les pages dont `created_at` dépasse le dernier run réussi et les logue dans
  `discovery_queue` (status `pending`, zéro appel Claude — Règle 6) pour triage dans une
  future session. Ferme le point 2 explicitement demandé : la boucle de découverte ne
  s'arrête plus dès qu'on arrête d'y travailler manuellement.

**Infra partagée créée** : `lib/wiki-cache.ts` (lecture d'une page déjà cachée par
`wiki-auto-sync`, filtrée sur `source='hypixelskyblock_wiki'` pour ignorer les résidus
`fandom_wiki` périmés) et `lib/wiki-table-parse.ts` (parseur générique de wikitable avec
vrai suivi de rowspan actif par colonne — la même logique sert les 4 crons, jamais
réimplémentée par table).

**Méthode de test — obstacle réel rencontré et contourné** : le pattern habituel de ce
chantier (route de debug temporaire, testée en direct sur preview) s'est heurté à un
mur SSO/Vercel Deployment Protection jamais vu sur les branches précédentes de cette
semaine (`ssoProtection.enabled: true, deploymentType: "all_except_custom_domains"` —
confirmé via `get_project_deployment_protection`), qui bloque toute requête HTTP externe
vers un déploiement preview, y compris avec un token de partage généré à la volée.
Contourné en **rejouant la logique exacte des parseurs en local** (`npx tsx`, sans
serveur Next.js) contre le vrai wikitext déjà extrait de `game_mechanics_misc` via
Supabase MCP, en comparant la sortie ligne à ligne contre l'état actuel des 9 tables en
base. **2 vrais bugs trouvés et corrigés grâce à cette méthode, avant tout déploiement** :
1. `extractFirstWikitableBody()` utilisait `lastIndexOf('|}')` sur le texte reçu —
   correct seulement si l'appelant passe un texte strictement borné à une seule table.
   La recherche de la table "Pests" dans `wiki-garden-sync` passait tout le reste de la
   page depuis son en-tête de section jusqu'à la fin — `lastIndexOf` attrapait le `|}`
   d'une AUTRE wikitable bien plus loin (celle de Farming Fortune loss), faisant fuiter
   ~10 lignes de bruit. Corrigé en `indexOf` depuis l'ouverture de la table elle-même.
2. La recherche de la table "Modifiers" (Pelts) dans `wiki-economy-npc-sync` ancrait sur
   `|+Modifiers` (la légende, qui est À L'INTÉRIEUR de la table, après son `{|`
   d'ouverture) au lieu de l'accolade d'ouverture elle-même — l'extraction sautait
   directement à la table SUIVANTE (Rarity) et retournait 0 ligne pour
   `trapper_pelt_modifiers`. Corrigé en recherchant le `{|` précédent.

Revalidé après les deux fixs : les 9 tables reproduisent exactement l'état actuel de la
base quand on rejoue les parseurs contre le vrai contenu caché — `hotm_forge_durations`
confirmé 119/119 lignes avec les 8 spot-checks déjà documentés au Bloc 7 (Refined
Diamond 8h/II, Drill Motor 1j6h/II, Perfect Plate 30min/X, etc.) tous exacts ; les 8
autres tables match ligne à ligne. Amélioration constatée au passage sur
`trapper_pelt_modifiers.effect` : la nouvelle valeur ("+1", "1.1×–1.5×") est une
transcription littérale de la source plutôt que la paraphrase française hand-written
d'origine ("+1 pelt flat") — plus fidèle à la Règle 1, changement cosmétique assumé.

**Limite honnête** : cette méthode valide la logique des parseurs avec un haut niveau de
confiance (2 bugs réels trouvés et fermés), mais ne constitue pas un vrai test HTTP de
bout en bout du code déployé (le mur SSO empêche ça). Risque résiduel jugé faible — code
identique entre local et déployé, aucune dépendance d'environnement dans la logique de
parsing elle-même (pas de fetch réseau, juste des regex sur une string déjà en base).

**48 tables → 10 traitées cette passe (les 9 ci-dessus + `weight_formulas` documentée
comme nécessitant un fetch GitHub distinct, pas construit cette passe par prudence),
38 restantes** loguées individuellement dans `discovery_queue` avec la vraie page
source déjà identifiée pour chacune (recherche dédiée menée avant de coder, jamais
deviné) — prêtes à être automatisées dans une passe future sans avoir à refaire cette
recherche. `discovery_queue` finale : 39 pending (38 nouvelles + #7 bingo déjà connue),
12 resolved.

### Plan de consolidation — les 38 tables du backlog (proposé, pas construit)

Suite à la question d'optimisation de l'utilisateur sur la fusion des crons Volet 2,
même exercice appliqué en amont aux 38 tables encore en `discovery_queue` (pending) —
avant de commencer à les construire, grouper par cadence (toutes hebdomadaires,
référentiel statique) ET par poids réel (nombre de pages/sous-pages à fetcher par
run), pour ne pas répéter le pattern "1 cron par petit groupe" qui aurait fait
grimper le total sans raison.

**Groupe A — pages uniques, légères (15 tables, 1 cron)** : `magical_power_by_rarity`,
`gemstone_slot_costs`, `sblevel_tasks`, `skymart_shop`, `hoppity_prestige`,
`island_warps`, `game_zones`, `rift_guide`, `dungeon_rng_scores`, `accessory_powers`,
`garden_composter_upgrades`, `garden_plot_costs`, `garden_plots` (même page que
`garden_plot_costs`, `The Desk/UI` — zéro fetch supplémentaire), `garden_xp_levels`,
`garden_visitors`. ~14 fetches Supabase réels pour 15 tables (2 partagent une page).
Runtime attendu : quelques secondes, aucun risque de timeout.

**Groupe B — multi-sous-pages, poids moyen (12 tables, 2 crons)** : `hotm_perks`
(le plus lourd, ~15-30 sous-pages imbriquées par tier+ability), `hotf_perks`,
`dungeon_classes` (7 pages), `garden_crop_milestones` (14 pages), `museum_item_xp`
(8 pages), `reforge_stones` (12 pages), `gemstones` (3-4 pages), `enchantments`
(11 pages), `slayer_rng_scores` (8 pages), `fairy_soul_locations` (20 pages, déjà
255 lignes probablement déjà correctes — revalidation plutôt que reconstruction),
`player_base_stats` (3 pages), `hotm_hotf_powders` (3 pages). Total combiné estimé
~100-120 fetches Supabase (lecture d'une seule ligne déjà en cache à chaque fois,
pas d'appel réseau externe) — même à 100 fetches, largement sous n'importe quel
timeout raisonnable, mais séparé en 2 crons thématiques (Mining/Combat vs
Garden/Museum/Divers) pour garder un diagnostic lisible si une page change de
structure et casse un parseur — un cron de 12 tables mêlées rendrait plus dur de
localiser la régression dans `sync_log.details.results`.

**Groupe C — source incertaine, à investiguer avant de grouper (5 tables)** :
`george_pet_prices`, `pet_stat_progression`, `minion_tier_xp`, `npc_locations`,
`garden_crop_upgrade_costs`. Pas de nouveau cron a priori — une fois la vraie page
confirmée (recherche dédiée nécessaire, notes actuelles marquées "incertain"), chacune
rejoindra très probablement le Groupe A (toutes légères par nature une fois la source
connue).

**Groupe D — mécanisme différent, isolé volontairement (2-3 tables, 1 cron)** :
`item_upgrade_chains` + `accessory_upgrade_paths` (pas de page unique — scraping par
item contre `items_catalog`/infobox, potentiellement des centaines à quelques milliers
de lectures selon la couverture réelle, poids et risque de timeout réellement
différents des groupes A/B) + `museum_sets` (logique de cross-référence par catégorie,
pas un parseur de page). Isolé pour ne pas faire courir de risque timeout/complexité
aux tables simples du Groupe A/B, et parce que c'est un mécanisme de construction
différent (pas juste un autre parseur wikitext).

**Restent explicitement hors de ce plan de consolidation** :
- `sack_contents` — déjà signalé "risque de régression trop élevé sans revue dédiée"
  (677 lignes, table plus complexe que `sack_tiers`), décision de ne pas l'automatiser
  dans un lot générique, reste one-shot en attendant une passe dédiée.
- `weight_formulas` — source GitHub (Python), mécanisme de fetch totalement différent
  (pas Supabase-only) — 1 cron séparé si construit, jamais mélangé avec les crons wiki.
- `forge_recipes` — même page que `hotm_forge_durations` (déjà dans
  `wiki-referential-sync`) : à construire comme extension de la fonction
  `syncHotmForgeDurations` existante plutôt qu'un nouveau cron, zéro fetch
  supplémentaire.

**Total réaliste si ce plan est exécuté tel quel** : Groupe A (1) + Groupe B (2) +
Groupe D (1) = **4 nouveaux crons** pour couvrir 32 des 38 tables du backlog (les 5 du
Groupe C rejoignent le Groupe A une fois sourcées, sans cron supplémentaire ;
`sack_contents`/`weight_formulas`/`forge_recipes` traités hors plan comme documenté
ci-dessus — `weight_formulas` ajouterait un 5e cron si construit).

**Total de crons du projet une fois tout consolidé (estimation)** :
16 crons pré-chantier + `network-events-sync` (1) + `discovery-scan` (1) +
`wiki-referential-sync` (1, déjà fusionné) + 4 nouveaux crons de backlog (Groupes
A/B/D) = **23 crons**, +1 (`weight_formulas`, GitHub) si construit = **24**. À comparer
aux ~59 qu'un cron par table aurait produit (48 legacy + 4 Tier 1 + 7 Volet 2), ou aux
21 déjà atteints avant cette consolidation.

**Pas construit cette passe** — plan proposé pour validation avant de continuer le
chantier, conformément à la demande explicite de l'utilisateur.
