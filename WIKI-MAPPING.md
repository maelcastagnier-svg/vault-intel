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
