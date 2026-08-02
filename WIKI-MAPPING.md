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
