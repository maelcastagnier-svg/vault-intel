# WIKI-MAPPING.md — Vault (détail Source 2, cartographie exhaustive Hypixel Skyblock)

> Détail complet par système de la Source 2 (wiki officiel `hypixelskyblock.minecraft.wiki`)
> du chantier "Cartographie exhaustive Hypixel Skyblock" — voir CLAUDE.md pour le résumé
> court par système (3-4 lignes, bugs/gaps réels trouvés) et le contexte du chantier
> (méthode Étape 1→2→3, règle 7, pourquoi ce chantier existe). Ce fichier existe pour ne
> jamais refaire dépasser CLAUDE.md la limite de 150k caractères de contexte auto-chargé
> — mêmes standards de rigueur que CLAUDE.md (jamais de constante devinée, toujours
> sourcé), juste séparé physiquement. En cas de divergence, CLAUDE.md fait foi.

Systèmes couverts, dans l'ordre où ils ont été traités :
- Combat/Slayer (1er août)
- Farming (1er août)
- Foraging (1er août) — inclut Heart of the Forest (2e arbre HOTM-like demandé)
- Fishing (1er août)
- Dungeons (1er août)
- Crimson Isle/Kuudra (1er août)
- Enchanting/Alchemy (1er août)
- Rift (1er août) — mapping mécanique seul, reste bloqué en données réelles (voir Bloc 7)

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
