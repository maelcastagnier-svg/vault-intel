@AGENTS.md
# CLAUDE.md — Vault (contexte projet pour Claude Code)

> Basé sur la session la plus récente disponible. En cas de divergence avec une
> session antérieure sur le même sujet, cette version fait foi.

## 🌙 Nuit 31 août → 1er septembre (jusqu'à 10h) — mandat "boucler Pluton au plus vite", en cours

Mandat : *"travail en full autonomie, avance un grand coup dans la pipeline
pluton... finis de peupler les activités, verifie qu'on utilise 100% des
extract pour pluton et 100% des elements pour tout les skills... audit
complet a partir de 10h demain sur tout le produit vault hypixel."*

### ✅ Dungeons — Boss Armor craft margin fermé (Goldor/Storm/Maxor/Necron, 16 pièces)

Ferme le backlog `dungeons_boss_armor_craft` documenté depuis le 27 août
("marge crafting déjà confirmée réelle et positive, bloquée par l'absence
de cadence de vente AH sourcée"). **Nouvelle méthodologie, réutilisable
ailleurs** : `price_history_ah.sold_count` (déjà collecté quotidiennement,
jamais exploité comme cadence avant) donne le nombre RÉEL de ventes AH
complétées par jour — moyenne historique de marché sur 90 jours glissants,
jamais une supposition. C'est le bottleneck réel (l'achat Bazaar des 8
fragments + le craft à la Table 3x3 sont quasi-instantanés), donc
`actions_per_hour` = taux de vente réel observé.

Mapping item_id confirmé via `items_catalog` (pas deviné depuis le nom
d'affichage) : Goldor's (`TANK_WITHER_*`) ← 8x `GIANT_FRAGMENT_BOULDER`
("Jolly Pink Rock") ; Storm's (`WISE_WITHER_*`) ← `GIANT_FRAGMENT_LASER`
("L.A.S.R.'s Eye") ; Maxor's (`SPEED_WITHER_*`) ← `GIANT_FRAGMENT_BIGFOOT`
("Bigfoot's Bola") ; Necron's (`POWER_WITHER_*`) ← `GIANT_FRAGMENT_DIAMOND`
("Diamante's Handle"). Coût = fragments (Bazaar buy_price) + pièce Wither
de base (AH avg_sold_price 90j, pas un buy_price de listing isolé
potentiellement outlier) ; revenu = pièce finale (même métrique AH 90j,
cohérence méthodologique). Nouveau fichier `lib/pluton-dungeons-boss-armor.
ts`, cron `pluton-dungeons-boss-armor-refresh` (5h27). **Vérifié en prod** :
16/16 pièces, coins/h sains 185K→25,7M à master (aucune valeur aberrante,
contrairement aux artefacts TTK déjà documentés sur Combat/Slayer/Kuudra).

### ✅ Fishing — Salmon Armor ajoutée (gate Fishing niveau 13), Challenger's Armor recorrigée

Trouvaille en creusant `fishing_armor_uncatalogued` (16 items) : deux sets
distincts y étaient mélangés. **Salmon Armor** confirmée réelle (SCC+1,5%/
pièce=6% total, gate `{{Skill|Fishing|13}}`, source `game_mechanics_misc
key=salmon_armor`) — ajoutée à `pluton_fishing_armor_stats` (id=9), aucune
modification du moteur nécessaire (compétition déjà budget-based). **Perd
honnêtement** face à Backwater/Abyssal (SCC inférieure) sur les 7 tiers —
résultat attendu d'une vraie recherche, pas un échec. **Challenger's
Armor** (8 pièces) était mal classée Fishing — c'est en réalité un set
Combat/Diana (Mythological Ritual, craft Enchanted Gold Ingot/Ancient
Claw/Griffin Feather, bonus "2x stats dans The Hub pendant le rituel") —
recatégorisée `mythological_ritual_armor`, backlog réel documenté (nature
d'activité différente, situationnelle, nécessiterait son propre
calculateur), pas fermée.

### 🔎 Réévaluation Phase A (classement 7-tiers) — le vrai gap est 53 204 lignes, pas 135 887

En creusant pour "vérifier qu'on utilise 100% des éléments par skill",
échantillonnage de chaque grand type de contenu non-tiéré (au lieu de
prendre le chiffre `tier IS NULL`=135 887/184 416 au pied de la lettre).
**Trouvaille structurante** : 82 683 de ces lignes (61%) ont
`activity='__none__'` — déjà confirmées non-skill (cosmétique/événementiel/
dialogue NPC/musique) par le travail de classification du 24-25 août,
et RESTENT correctement sans tier (un item cosmétique ou un texte de
dialogue n'a pas de "palier de progression"). Ce n'est PAS un gap, c'est
la classification faisant exactement ce qu'elle doit faire. **Le vrai
résidu à traiter est 53 204 lignes** classées dans un skill réel mais sans
tier : items (17 958), mécaniques formula/general (17 010, majoritairement
des tables de référence cross-tier déjà consommées via `stat_bonus_
sources`/`pluton_mechanic_coverage`, pas des gates single-tier), mob_zone_
data (16 128, tiérable par zone), progression_milestone (1 894).
**Décision explicite prise cette nuit** : ne pas sacrifier le reste du
mandat (peuplement d'activités, audit produit 10h) à un chantier Phase A
qui reste — même réduit à 53k lignes — un gros chantier à faible ROI produit
immédiat (les vues `pluton_tier_*` ont 0 consommateur de code, confirmé 25
août, toujours vrai). Documenté honnêtement plutôt que forcé ou ignoré.

### ✅ Kuudra — pool RNG étendu : tier Infernal + 39 items résidus fermés

Les 2 agents de recherche sont revenus avec des trouvailles majeures.
**Le blocage Infernal documenté le 27 août était un problème de PARSING**,
pas une absence de source : le wikitext brut (`game_mechanics_misc`
id=2834, relu directement plutôt que via `pluton_elements` dont
l'extraction automatique avait cassé le tabber imbriqué) donne la MÊME
sémantique poids/total que les 4 autres tiers — vérifié par recalcul
manuel exact (Bezal Shard slot1 Infernal = 4.5/97.2 = 4.63%, identique à
la valeur publiée par le wiki). `lib/pluton-kuudra.ts` réécrit : Infernal
n'est plus exclu, et 19 items résidus (Basic→Fiery, déjà documentés comme
non intégrés) sont fermés au passage — Wheel of Fate, Tentacle Dye, Aurora
Staff (item_id réel `RUNIC_STAFF`, le nom d'affichage ≠ item_id était la
cause du blocage initial), 20 Enchanted Books "Vitality" (alias wiki
historique de Ferocious/Hardened/Mana Vampire/Strong Mana, confirmé via
`enchantments`+`price_history`), Fatal Tempo/Inferno I, 11 Attribute
Shards (Bezal/Magma Slug/Kada Knight/Wither Spectre/Matcho/Lava Flame/
Fire Eel/Flare/Barbarian Duke X/Hellwisp/XYZ, item_id réels confirmés via
`attribute_shards.bazaar_name`). **Vérifié en prod** : 35/35 combos (7
tiers joueur × 5 tiers Kuudra) avec EV réelle, EV/run 1,1M→14,6M coins
selon tier — cohérent. 39 lignes `pluton_item_coverage_audit` fermées.
Résidu documenté, pas fermé : ~10 items Infernal-only du 2e tableau
(Ananke Shard/Feather, Hellstorm Wand, Tormentor, Daemon/Lord Jawbus/
Moltenfish/Cinderbat/Taurus Shard, Dusty Travel Scroll, Kuudra Mandible)
nécessiteraient une vérification de prix individuelle non faite ce soir.

### 🔎 6 backlogs audités par le 2e agent — 1 recatégorisation, 2 reconfirmations, 1 arbitrage, 2 gaps réels confirmés

- **`spooky_festival_event_drop` (56) → recatégorisé `dungeons_mob_drop_
  unmodeled`** : mal étiqueté depuis le début — ce sont en réalité des
  drops de mobs de Donjons (Zombie Soldier/Skeleton Grunt, Catacombs Floor
  III+, HP+taux de drop % réels sourcés), pas Spooky Festival. Même gap
  structurel déjà connu (Dungeons ne modélise que le score de clear).
- **`ender_dragon_armor_drop` (48) — reconfirmé non-fermable**, avec une
  découverte au passage : Holy Dragon Fragment (la 8e variante putative)
  n'a rien à voir avec l'Ender Dragon — c'est un drop du mob "Lost
  Adventurer" en Donjons. Mécanique multi-joueurs à contribution partagée
  (Dragon Weight), structurellement hors du modèle HP/DPS solo actuel.
- **`pet_equipment_accessory` (41) — reconfirmé correct**, rien à construire.
- **`gemstone_quality_flip` (48) — arbitrage documenté, pas une certitude
  absolue** : 2 nouvelles sources croisées (NEU-REPO, page Gemstone Mixture)
  confirment que la table structurée "16" (36 occurrences identiques) est
  plus fiable que la prose "80" (résidu d'un mécanisme retiré en 2021,
  remplacé par le Forge). Décision : retenir 16 si construit un jour, avec
  cette réserve explicite (aucune ligne d'historique "réduit de 80 à 16"
  trouvée).
- **`dungeons_perfect_armor_progression` (46) — GAP FERMABLE, pas encore
  construit** : Perfect Armor n'est pas un drop, c'est un craft 100%
  déterministe (Tier I=24 Enchanted Diamond Block, +4/tier jusqu'à XII,
  puis Perfectly Cut Diamond). Même famille que Forge/Composter — backlog
  prioritaire pour la suite de la nuit si le temps le permet.
- **`cosmetic_dye_unsourced` (66) — catégorie hétérogène, pas un bloc
  homogène** : ~8/15 échantillonnés sont du cash-shop pur (Fire Sale,
  aucun mécanisme de farm), ~6/15 ont une vraie source RNG chiffrée
  (Celeste Dye — drop Sven Packmaster, rentre directement dans le moteur
  Wolf Slayer déjà construit ; Pelt/Periwinkle/Celadon/Nyanza Dye — mobs/
  mécaniques non encore modélisés). Re-triage nécessaire, pas fait ce soir.

## 🌇 Après-midi 27 août (jusqu'à 20h15) — audit vision + pont Pluton→Money Making construit

Mandat : *"prend la vision finale pluton dans son ensemble audit generale du
produit complet tu dois me dire si on respcete cette vision et ce qu'il
manque, travail sur ce qu'il manque jusqu'a 20h15"*.

**Verdict d'audit livré à l'utilisateur avant de construire quoi que ce soit**
(vérifié en base, pas supposé) : Pilier 1 (cartographie) ✅ respecté. Pilier 2
(classement 7-tiers) 🔴 cassé — `pluton_elements` toujours 135 887/184 416
lignes (73,7%) sans `tier`, `pluton_tier_rules` toujours 0 ligne (Phase A du
plan jamais reprise depuis le 26 août). **Pilier 3 🔴 le vrai manque
produit** : le backend Pluton est solide (10 `activity_key`, 4 674 lignes
`pluton_rankings`, 19 330 `pluton_setups`, vérifié en direct) mais **zéro
consommateur frontend** (`grep` sur `app/` hors cron : 0 référence à
`pluton_rankings`/`pluton_setups`/`pluton_target_blocks`) — Money Making
tourne encore intégralement sur `app/api/cron/money-making-agent/route.ts`,
un agent Claude qui **invente** ses coins/h par raisonnement LLM et écrit
dans `claude_analysis` section `money_making_<tier>`, lu par
`app/api/market-data/route.ts` pour le dashboard réel. Evolve n'a aucun pont
vers Pluton (Phase C jamais commencée).

### ✅ Pont Pluton → Money Making construit, vérifié en prod, PAS fusionné au flux live

Nouveau `lib/pluton-money-making-bridge.ts`
(`computeAndPersistPlutonMoneyMakingSections()`) — **100% déterministe,
aucun appel LLM** (Pluton a déjà calculé les vrais coins/h, cohérent avec la
mémoire `feedback_budget_api_claude`). Lit `pluton_rankings` JOIN
`pluton_target_blocks`/`pluton_setups`, retient la meilleure méthode par
activité et par tier (évite qu'une activité à fort volume — Hunting 320
shards, Enchanting ~300 paires — monopolise le top N), formate dans le
**même schéma JSON** que `money-making-agent` (`active[]`/`vault[]`,
`vault` volontairement vide — Pluton calcule des méthodes réelles, il n'a
pas de couche "opportunités non-évidentes", nature de contenu différente,
pas un gap Pluton).

**Sécurité produit appliquée sans qu'on le demande** (mémoire
`feedback_approval_avant_modification`) : écrit dans une section **séparée**
`claude_analysis.pmm_<tier>`, jamais dans `money_making_<tier>` (flux LIVE
Pro+/Elite) — fusionner reste une décision produit à valider explicitement
avec l'utilisateur, pas prise ici.

**🔴 Bug réel trouvé et fermé, même classe que le 17 août** : le premier
déploiement retournait `{"success":true}` alors qu'aucune ligne n'était
écrite en base (`error` de l'upsert Supabase jamais vérifiée — même
signature que `update-catalog`/`data-retention` documentés le 17 août).
Corrigé (vérification explicite de `error`, `throw` si échec) — ce qui a
immédiatement révélé la **vraie cause racine, jamais visible avant** :
`claude_analysis.section` est `varchar(20)`, et `pluton_money_making_<tier>`
(28-33 caractères) dépassait la contrainte, rejeté silencieusement par
Postgres. Renommé en `pmm_<tier>` (17 caractères max sur `professional`),
colonne non touchée. **Vérifié en base** après un cycle debug-route
standard : 7/7 sections peuplées (`pmm_starter`...`pmm_master`, 4,5-4,9 Ko
de JSON chacune, contenu inspecté manuellement sur `pmm_master` — schéma
conforme, 10 méthodes réelles, ex. Forge Perfect Chisel ~8,3Md/h, Farming
Pumpkin ~25,9M/h). Route de debug supprimée après validation. Cron
`pluton-money-making-bridge-refresh` créé (quotidien 5h58, après tous les
`pluton-*-refresh`, `vercel.json`).

**🔴 Gap réel trouvé en vérifiant le contenu, documenté, PAS fermé** : 3 des
10 méthodes top `master` affichent des coins/h aberrants (Bestiary Zealot
~320Md/h, Slayer Zombie pool RNG ~145Md/h, Kuudra Fiery pool RNG ~51Md/h).
**Ce ne sont pas de nouveaux bugs du pont** — ce sont des artefacts déjà
documentés dans l'historique du projet sur les données sources elles-mêmes
(TTK quasi-nul sur Combat/Slayer déjà noté à plusieurs reprises, plafond
`runsPerHour=3600` sur Kuudra déjà documenté) : le pont ne fait que lire et
formater fidèlement `pluton_rankings`, il n'invente rien. **Mais c'est un
vrai point bloquant avant toute fusion avec le flux live** — un utilisateur
payant ne doit jamais voir "320 milliards coins/h" affiché comme méthode
recommandée. Pas corrigé ici (corriger nécessiterait de retravailler le
calcul TTK/cadence des activités Combat/Slayer/Kuudra elles-mêmes, hors
scope du pont) — documenté explicitement comme prérequis à trancher avant
toute décision de fusion.

**Décision explicite requise de l'utilisateur, pas prise ici** : fusionner
`pmm_<tier>` dans `money_making_<tier>` (remplacer ou augmenter le flux
live) — et si oui, comment traiter les 3 valeurs aberrantes ci-dessus
(filtre de sanity, exclusion de ces 3 activités du top N, ou correction en
amont des formules Combat/Slayer/Kuudra) avant toute mise en prod visible
utilisateur.

**Reste non traité cet après-midi** (backlog honnête, pas un oubli) : Phase
C (pont Evolve → Pluton, `milestone_optimal_setups`) — seulement une
reconnaissance préparatoire faite (`app/api/player/milestones/route.ts` lu
en partie, inventaire des primitives réutilisables de `lib/pluton-engine.ts`
confirmé) — pas commencée. Phase A (peuplement `pluton_tier_rules`, 0 ligne)
— pas touchée. Résidu `pluton_item_coverage_audit` (2 319 `pending`) — pas
retriage cet après-midi, priorité donnée au pont produit (le vrai manque
identifié par l'audit du jour).

## ☀️ Matinée 27 août (jusqu'à 13h) — 2 fermetures majeures, correction d'une fausse alerte

Suite directe de la nuit ci-dessous. Mandat : trouver la route la plus optimisée
pour avancer vite et bien sur la phase finale Pluton, 5h full autonomie.

**Kuudra pool RNG armure FERMÉ** (voir détail dans la nuit ci-dessous) — 80 combos
armure Aurora/Crimson/Fervor/Hollow/Terror + Molten + Hollow Wand, 28/28 vérifiés.

**Enchanted Books flip FERMÉ** (`lib/pluton-enchanting.ts`, nouvel `activity_key=
'enchanting'`) — agent de recherche dédié a confirmé le coût réel (0 coin/0 XP,
combine 2 livres niveau N → 1 niveau N+1 à l'Enclume, source `game_mechanics_misc
key='anvil'`). 303 paires candidates, 94 avec prix Bazaar frais des 2 niveaux
(filtre de fraîcheur strict — ~9% des candidats initiaux avaient un prix
périmé/nul). Cadence : plafond moteur 20 actions/seconde réutilisé (Farming/
Foraging) — légitime ici car le cycle achat+combine+vente est 100% Bazaar
instantané, contrairement à un flip AH qui attend un acheteur. **Piège
opérationnel rencontré et corrigé** : 1 insert par ligne (~3100 lignes) a
timeout systématiquement (même piège déjà documenté sur Dungeons le 18 août) —
corrigé en bulk insert par lots de 200.

**🔴 Correction majeure d'une fausse alerte de la nuit précédente** : `pluton_
dungeons_chest_loot` (déjà peuplée, ~230 lignes) EST déjà consommée par
`lib/pluton-dungeons.ts` avec fallback Bazaar+AH complet — la quasi-totalité des
items Wither/Necromancer Lord/Shadow Assassin/Adaptive/Bonzo (94 items) étaient
DÉJÀ pricés, contrairement à l'affirmation de la nuit ("Dungeons ne price aucun
loot"). Corrigé en base. Le vrai résidu confirmé (agent de recherche) : Goldor's/
Storm's/Maxor's/Necron's Armor ne sont PAS des drops RNG — ce sont des items
CRAFTÉS (1x Wither Armor base + 8x Giant Fragment spécifique, coût=0 coin) —
marge vérifiée réelle et positive sur les 4 sets, mais PAS construit en
`pluton_rankings` : aucune cadence de vente sourcée (sortie AH-only, attente
d'acheteur, contrairement à Enchanted Books). Backlog réel documenté (marge
confirmée, gap sur la seule dimension cadence), pas inventé.

**Gemstone quality flip — ambiguïté réelle non tranchée** : ratio de combinaison
trouvé dans la source elle-même (`game_mechanics_misc key='gemstone'`) mais
CONTRADICTOIRE (table structurée dit 16, prose de la même page dit 80) — aucune
3e source pour arbitrer. Pas construit (règle #7), backlog documenté avec
l'ambiguïté explicite plutôt qu'un choix deviné.

**État `pluton_item_coverage_audit` à 13h** : 1100 covered_confirmed, 766
gap_open (documenté par catégorie, résidu dominant : enchanted_book_flip 354
restants non-frais, cosmetic_dye_unsourced 66, spooky_festival_event_drop 56,
dungeons_boss_armor_drop 51, gemstone_quality_flip 48, ender_dragon_armor_drop
48, dungeons_perfect_armor_progression 46, pet_equipment_accessory 41), 601
excluded_noise, 2319 pending (résidu très majoritairement cosmétique/matériel
crafté à faible valeur, confirmé par échantillonnage répété).

## 🌙 Nuit 26-27 août — audit exhaustif 7000+ items, mandat "full autonomie jusqu'à 7h"

Mandat utilisateur explicite : vérifier qu'aucune activité n'est laissée au
hasard (tout item priced = activité potentielle, regroupé intelligemment),
auditer toute la pipeline (cartographie→tiers→activités→setup→pricing→prod),
corriger directement tout trou trouvé (jamais inventer, règle #7), avec
relance automatique en cas de limite de session, compte rendu à 7h.

**Table d'audit persistante créée** : `pluton_item_coverage_audit` (4786
items réellement pricés Bazaar+AH recensés, colonnes status/category/notes,
rejouable/inspectable comme `pluton_classification_rules`). État à 7h :
**723 covered_confirmed**, **784 gap_open** (backlog réel documenté par
catégorie, raison précise), **520 excluded_noise** (cosmétique/hors-scope
skill, justifié), **2759 pending** (résidu majoritairement cosmétique/
matériel crafté à faible valeur, confirmé par échantillonnage aléatoire
répété — pas un trou de rigueur, une limite de temps).

**3 fermetures réelles déployées et vérifiées en prod cette nuit** :
1. **Fishing — bug structurel** : `computeLootTableEV` ne consultait QUE
   `price_history` (Bazaar), jamais l'AH — tout item de loot uniquement
   tradeable AH contribuait 0 sur les 7 zones Fishing. Corrigé via
   `loadPriceCache()` (fallback déjà validé ailleurs). 49/49 combos vérifiés.
2. **Fishing/Sea Creatures — 3 items jamais pricés** : Bone Dye (Sea Archer,
   documenté "aucun prix trouvé" le 21 août, réellement ~92M AH aujourd'hui),
   Enchanted Tropical Fish (`ENCHANTED_CLOWNFISH`, jamais cherché), Squid Pet
   5 raretés (nouvelle `loadGeorgePetPriceCache()` dans `lib/pluton-engine.ts`,
   table `george_pet_prices` — prix plancher NPC George par espèce×rareté,
   jamais consommée par Pluton avant, piste réutilisable pour d'autres drops
   de pet ailleurs). 77/77 combos Sea Creatures vérifiés.
3. **Kuudra — pool RNG armure** (le plus gros gain de la nuit) : découverte
   de la page `Kuudra/Loot` (296 lignes pluton_elements, jamais consommée)
   donnant la table de loot RNG complète par tier avec vrais %. Item_id
   tier-préfixé (Basic=""/Hot=HOT_/Burning=BURNING_/Fiery=FIERY_) confirmé
   réel (pas un artefact d'extraction — `base_item_id=item_id` brut Hypixel
   dans `ah-collect`) et réellement pricé. Intégré : armure Aurora/Crimson/
   Fervor/Hollow/Terror (80 combos) + Molten necklace/cloak/belt/bracelet +
   Hollow Wand — de loin la plus grosse part de l'EV. **Infernal exclu
   explicitement** (la page source bascule vers un format de table différent
   à la sémantique non confirmée — gap honnête plutôt que deviné). 28/28
   combos vérifiés, `lib/pluton-kuudra.ts:computeAndPersistKuudraRngPoolRankings`.

**Backlogs réels identifiés et documentés, pas fermés** (`pluton_mechanic_
coverage` + `pluton_item_coverage_audit`, par ordre de valeur estimée) :
- `enchanted_book_flip` (490 items) — couverture prix désormais large,
  backlog du 21 août ("Enchanted Books flip") à reconsidérer comme activité
  Forge-like si un ratio de craft niveau N→N+1 est trouvable.
- `cosmetic_dye_unsourced` (66) — teintures avec probablement une vraie
  source de drop liée à un skill (ex. Dye Fossil/Mining), nécessite sourcing
  individuel.
- `spooky_festival_event_drop` (56) — armures/accessoires cosmétiques
  Zombie/Skeleton/Spider, probablement drops de mobs Spooky Festival, mobs/
  taux non sourcés.
- `gemstone_quality_flip` (48) — Fine/Flawed/Flawless/Perfect gemstones,
  ratio de combinaison Rough→Perfect (NPC Amelia/Kat) pas encore sourcé.
- `ender_dragon_armor_drop` (48) — 8 variantes réelles confirmées (Strong/
  Wise/Young/Old/Unstable/Protector/Superior/Holy), Ender Dragon jamais
  modélisé dans Pluton (mécanique à phases distincte du modèle HP/DPS).
- `pet_equipment_accessory` (41) — items d'équipement de pet (XP boost),
  analogue aux reforges, pas un output de farm autonome.
- `dungeons_boss_armor_drop` (17 restants + Music Discs) — armure Wither
  (Goldor's/Storm's) confirmée réelle (même mécanisme item_id que Kuudra),
  Dungeons ne modélise qu'un score de clear, jamais le loot de boss.

**Méthode de triage** : règles SQL bulk par cluster de préfixe (même
discipline que `discovery_queue_noise_patterns`), **toujours vérifié
l'échantillon avant un UPDATE bulk** — 1 faux positif trouvé et corrigé
en direct (pattern `%_FRAGMENT` trop large avait capturé des fragments de
craft Dungeons sans rapport avec Ender Dragon, revert immédiat avant
qu'aucune donnée ne soit publiée).

**Honnêteté sur le "100%"** : la table `pluton_item_coverage_audit` reste
la source de vérité vivante — 2759 items pending ne signifient pas 2759
gaps réels, l'échantillonnage aléatoire répété cette nuit n'a trouvé quasi
que du cosmétique/matériel crafté sans lien skill direct au-delà de ce qui
est déjà catégorisé. Continuer le tri (skill par skill, cluster par
cluster) reste la tâche de fond ouverte, pas un chantier neuf.

## ✅ Pluton — pipeline finale v3, Phase B terminée (26 août)

Suite du mandat du 26 août (reformulation stricte des 3 phases + distinction
"faisable"/"money-making", voir plan `joyful-shimmying-finch.md`). Phase A
(reparation classement 7-tiers, 73,7% de `pluton_elements` sans tier) reste
un chantier de fond multi-session (moteur `pluton_tier_rules`/
`runTierClassification()` construit, pas encore peuple -- exige un vrai
jugement page par page, pas une formule mecanique). **Phase B (2 vrais gaps
de cablage, pas des trous de donnee) terminee et verifiee en prod** :

- **Slayer — RNG Meter additif** (`lib/pluton-slayer.ts`) : verification
  live wiki (avant codage) a revele que le RNG Meter reset a zero apres
  chaque proc -- invalide l'hypothese initiale "meter au max". Ferme avec le
  plancher reel (`BaseDropRate% = 500×100/RequiredXP`, `slayer_rng_scores.
  rng_score` deja en base) plutot qu'une moyenne inventee, sous-estime le
  vrai revenu, documente. 154 combos verifies, 138 avec EV.
- **Farming — Composter** (`lib/pluton-farming.ts`) : marge crafting_margin
  (meme famille que Forge) sur la cadence 1 Compost/10min, cout 4000 Organic
  Matter (Box of Seeds, moins cher)/2000 Machine Fuel (Oil Barrel, moins
  cher -- colonne "Composter" de la table Machine Fuel corrompue a
  l'extraction `pluton_elements`, resourcee en direct). Speed/Cost
  Reduction interpoles sur 7 tiers (meme schema que Sharpness/Smite/
  Critical). 7/7 tiers verifies, 2 829→133 415 coins/h.

Prochaine etape actee (plan) : Phase C (pont vers Milestones/Evolve pour la
couche "faisable", pas un doublon de `milestone_tasks`) puis reprise de
Phase A/D.

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
  évaluée par le moteur de recherche DPS déjà existant. 2 gaps fermés le
  25 août (voir ci-dessous).

### ✅ Combat/Slayer — slot Gloves arbitré réellement (Manticore Claw vs Demonslayer Gauntlet), 25 août

Suite directe de la correction du 24 août ("fausse alerte de l'agent sur
le slot Gloves entièrement absent" — Manticore Claw l'occupait déjà,
Demonslayer Gauntlet en est un vrai concurrent, pas un ajout gratuit).
Plutôt que deviner lequel des deux est le meilleur, calcul DPS réel des
deux variantes sur les 5 paliers top master de `lib/pluton-slayer.ts`.

**Résultat MIXTE confirmé — pas de vainqueur universel** : ZOMBIE +24.9%
en faveur de Demonslayer, WOLF +0.03%, BLAZE +0.07% (quasi-tie côté
Demonslayer), SPIDER -0.36%, ENDERMAN -6.4% (Manticore gagne nettement) —
signature de la quantification par palier de `computeAttacksPerSecond`
(le +2.5% Attack Speed de Manticore ne franchit pas le même seuil de tick
selon l'Attack Speed de base propre à chaque Slayer). Conclusion honnête :
un seul "meilleur choix" global aurait été faux dans au moins 2 cas sur 5.

**Fermeture réelle, pas une simple substitution de constante** : le slot
Gloves est désormais **arbitré par Slayer/tier** par le moteur de
recherche DPS existant (`GLOVES_VARIANTS`, `lib/pluton-engine.ts` +
boucle dans `lib/pluton-slayer.ts`) — même discipline que l'arbitrage
par slot necklace/cloak/belt/bracelet déjà appliqué à Mining/Foraging/
Fishing la nuit précédente. **Bug réel trouvé et corrigé pendant
l'implémentation** : le premier refactor a fait disparaître le bonus
Bonus Attack Speed du Pet Griffin (+25%, universel) en le remplaçant par
erreur par le seul delta du slot Gloves — repéré en relisant le diff
avant déploiement, corrigé avant tout persist. `lib/pluton-combat.ts`
(Zombie Slayer v2)/`lib/pluton-bestiary.ts`/`lib/pluton-sea-creatures.ts`
gardent Manticore par défaut (non régressés, pas encore migrés vers cet
arbitrage réel — défaut raisonnable documenté puisque Manticore gagne ou
quasi-tie sur 4/5 Slayers).

**🔴 Incident opérationnel pendant la vérification, même famille que le
13/24 août (invocations HTTP chevauchées)** : une route de debug side-
effecting (delete-puis-insert) a été appelée en boucle par un poll
`until` en arrière-plan EN MÊME TEMPS qu'un appel bloquant manuel — 2+
invocations serveur concurrentes ont produit de vrais doublons
(`pluton_rankings` passé de 154 à 196 lignes, jusqu'à 2x sur plusieurs
combos) ET un persist partiel sur Wolf/Enderman/Blaze (5-6/7 tiers au
lieu de 7, la fonction ayant probablement dépassé son `maxDuration=120`
partagé entre les invocations concurrentes). Nettoyé (migration SQL,
garde la ligne la plus récente par `(target_block_id, tier)`, 0 doublon
restant), puis **une seule invocation propre et bloquante** (maxDuration
augmenté à 280, poll de préparation redirigé vers une route non-side-
effecting pour ne plus jamais interroger la route persistante elle-même)
a retrouvé exactement les 138/154 combos attendus. Vérifié en base :
master — Zombie/Wolf/Blaze→Demonslayer Gauntlet, Spider/Enderman→
Manticore Claw, DPS exacts recoupés contre le calcul isolé fait avant
persist. **Règle retenue** : ne jamais laisser un poll `until` en
arrière-plan cibler la même route side-effecting qu'un appel bloquant en
cours — rediriger le poll de préparation vers une route neutre (ex: page
d'accueil) ou vérifier l'état du déploiement via l'API Vercel directement
plutôt que de re-curler la route qui écrit en base.

1 gap mineur documenté, pas fermé : le bonus propre de Demonslayer
Gauntlet "+15% dégâts vs mobs Infernal" (Blaze uniquement, multiplicateur
mob-type distinct du bucket accessoire générique) n'est pas inclus dans
ce calcul — s'il l'était, il renforcerait encore le choix Demonslayer sur
Blaze spécifiquement, jamais un renversement en faveur de Manticore.

### ✅ Blaze Slayer — bug réel trouvé et fermé (25 août) : dagues alternatives confirmées non pertinentes

Suite directe du gap documenté ci-dessus ("3 dagues Blaze alternatives à
applicabilité Infernal non confirmée"). Contenu wiki complet relu pour
Deathripper Dagger (`HEARTMAW_DAGGER`, choix canonique BS6 actuel),
Twilight Dagger (BS2), et les 3 alternatives citées par l'agent
(Kindlebane/Mawdredge/Pyrochaos).

**🔴 Bug réel trouvé, pas un simple gap** : `pluton_slayer_weapon_stats.
base_attack_speed` = 0 pour Deathripper Dagger alors que son infobox
wiki réel confirme **+20% Attack Speed** (même valeur que Pyrochaos) —
jamais câblé depuis la construction Blaze Slayer. Corrigé par `UPDATE`
direct (source déjà en base, aucune valeur inventée) ; Twilight Dagger
revérifiée correcte au passage (aucune stat Attack Speed dans son infobox
réel, `base_attack_speed=0` déjà exact). Aucun changement de code
nécessaire — `lib/pluton-slayer.ts` lit déjà `weapon.base_attack_speed`
directement depuis la ligne DB.

**Conclusion sur les 3 alternatives** : une fois ce bug corrigé,
Deathripper (mob_type=3.5x vs Infernal, wiki confirme littéralement "Deal
3.5x damage to Infernal mobs") domine strictement Pyrochaos (2x),
Mawdredge (2.5x) et Kindlebane (1.5x vs Infernal) sur TOUTES les stats à
rareté égale — ces 3 dagues ne seraient jamais retenues par une vraie
recherche, ce n'était pas un gap à fermer par ajout de candidat, juste une
donnée manquante sur le choix déjà canonique. Vérifié en base (route de
debug temporaire) : master/BLAZE_T1 — arme=Deathripper Dagger (inchangé),
DPS=263 149.558056 (en hausse par rapport à avant le fix, cohérent avec le
+20% Attack Speed désormais appliqué). Route de debug supprimée après
vérification.
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

### ✅ Fishing — Rod Parts (Hooks/Lines/Sinkers) audité en entier, 1 fermeture réelle (25 août)

Suite de l'investigation du gap "Junk Ring" (Treasure Chance, mal attribué
à Foraging dans `pluton_mechanic_coverage` — corrigé au passage, c'est un
item Fishing). En creusant le mécanisme réel de Junk Sinker ("replaces all
caught Treasures with Junk while in the Backwater Bayou"), découverte
d'une couche NBT entière jamais consommée par `lib/pluton-fishing.ts` :
les **Rod Parts** (table `rod_parts`, 18 pièces réelles réparties en
3 slots — Hooks/Lines/Sinkers), un système d'attachement de canne distinct
des armures/rods eux-mêmes.

**Slot Lines audité en entier (4 pièces)** : **Speedy Line** (+10 Fishing
Speed, Fishing 5, aucune restriction de zone) — seule pièce avec une stat
directement computable dans le modèle actuel, ajoutée à tous les tiers
(`SPEEDY_LINE_FISHING_SPEED`). Les 3 autres écartées avec raison précise,
pas ignorées : Shredded Line (Damage+250/Ferocity+50) ne s'applique pas —
`lib/pluton-sea-creatures.ts` réutilise le gear Zombie Slayer pour le
combat, pas la rod elle-même ; Titan Line (Double Hook Chance +2) n'a
aucune formule sourcée pour ce que "Double Hook Chance" fait mécaniquement ;
Trophy Line (Trophy Fish Chance +5) reste hors-scope (Trophy déjà exclu
depuis la construction Fishing du 17 août).

**Slot Sinkers audité en entier (8 pièces), rien fermé — gaps réels
documentés** : Chum/Icy/Prismarine/Sponge Sinkers "matérialisent" un item
gratuit à chaque capture, mais aucune quantité/formule n'est sourcée nulle
part (juste "materializes X into your inventory whenever you catch
something") — inventer une quantité violerait la règle #7. Junk/Hotspot/
Festive Sinkers confirmés zone/événement-gatés (Backwater Bayou/Hotspot/
Jerry's Workshop) — `WATER_POOL` (cible Fishing actuelle) est explicitement
générique HORS Backwater Bayou, même statut que les pools `event_gated`
déjà traitées ailleurs (pas fermé, nécessiterait une vraie activité Fishing
dédiée à Backwater Bayou pour être intégré correctement).

**Slot Hooks audité en entier (5 pièces), rien fermé** : toutes boostent
des chances de capture spécifiques à des Sea Creatures/zones déjà
hors-scope (Puddle Jumper déjà exclu du modèle HP/DPS standard, Hotspot/
Spooky zone/événement-gatés, Treasure Hook restreint aux items+Treasure
uniquement donc perd l'accès aux Fish/Sea Creature normaux — tradeoff non
modélisable sans formule de valeur relative sourcée).

Vérifié en base : master/WATER_POOL — Fishing Speed 210→220 (exact, +10),
coins/h 386 365→418 911 (+8.4%), cohérent sur les 7 tiers (7 combos).
5 nouvelles lignes `pluton_mechanic_coverage` (1 `wired` + 4 gaps
documentés par catégorie). Route de debug temporaire supprimée après
vérification.

### Ce qui reste, honnêtement, pour la suite

6 skills `built` non encore audités selon cette méthode cette nuit :
Enchanting/Alchemy/Taming/Necromancy/Carpentry/Runecrafting (déjà classés
`excluded_low_value` ou hors-scope money-making par décision utilisateur
antérieure — probablement pas prioritaires). Les gaps Kuudra/Dungeons
documentés ci-dessus restent à fermer (aucune source chiffrée trouvée,
pas une recherche insuffisante). Les gaps "dagues Blaze alternatives" et
"slot Gloves Manticore vs Demonslayer" sont fermés (voir sections dédiées
ci-dessus, 25 août).
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

## 🔎 Audit général complet — cartographie, système, démo, automatisation (25 août)

Mandat explicite de l'utilisateur après la continuation matinale : vérifier
l'exhaustivité réelle de la cartographie (100% des sources possibles),
auditer le système "en somme" pour savoir où aller, démontrer un skill au
hasard (activités par tier + setup complet), vérifier l'automatisation et
penser optimisation (SQL/cron pur vs Haiku), avec pour seule contrainte
20h le soir même. Travail en full autonomie, aucune limite de temps.

### 1. Cartographie — PAS 100%, un vrai gap trouvé et en partie fermé

**Le pipeline d'extraction est actuellement bloqué** : `pluton-weekly-sync`
(le seul job qui découvre et classe du contenu VRAIMENT nouveau) a échoué
le 24 août à 05h15 — `error: "Your credit balance is too low to access
the Anthropic API"`. Crédits Haiku épuisés, confirmé en base
(`sync_log.error`). Les crons `wiki-referential-sync`/`skyhanni-repo-sync`
tournent bien chaque semaine mais ne font que RE-vérifier des tables déjà
connues (mêmes row counts à chaque run depuis le 4 août) — ils ne
découvrent rien de neuf.

**🔴 Vrai trou trouvé** : table `discovery_queue` (alimentée par le cron
`discovery-scan`, quotidien, indépendant de Haiku) contenait **414 pages
wiki détectées comme nouvelles mais jamais triées** — le contenu existait
déjà dans `game_mechanics_misc` (donc déjà "cartographié" au sens brut)
mais jamais classé ni évalué pour savoir si c'est une vraie mécanique ou
du bruit. Triage fait manuellement (moi, zéro coût API, même discipline
que d'habitude) : **294 résolus** (bruit confirmé -- blocs/outils/teintures
vanilla Minecraft, changelogs, travel scrolls, ou déjà catalogués dans
attribute_shards/critters/sea_creature_pools), **126 encore en attente**
(majoritairement noms de créatures Fishing/Hunting obscurs ou items
cosmétiques probablement déjà couverts, pas encore vérifiés un par un).

**2 fermetures réelles issues de ce triage** :
- **Foraging Fortune Booster** (item Anvil, renommé 4 août 2026, jamais vu
  avant) — +20 FF Axe/+10 FF Armure/+5 FF Équipement, jamais câblé
  contrairement au Sweep Booster (déjà correct depuis le 17 août). Ajouté
  à `stat_bonus_sources`, vérifié en prod : +35 FF exact sur les 3 blocs
  Foraging master (823→858, 792→827, 682→717).
- **Drill Parts/Pesterminator/Hunting Fortune** re-vérifiés sur leur vraie
  page source (jamais lue directement avant, seulement via des pages
  dérivées) : Amber-Polished Drill Engine confirmé exact, Pesterminator
  confirmé déjà inclus (FF via FARMING_FORTUNE_MAX_PERMANENT, BPC via
  BONUS_PEST_CHANCE_MAX=551.5), Hunting Fortune reconfirmé bloqué (la page
  dédiée documente COMMENT gagner le stat mais jamais la formule
  stat→quantité de shards).

**3 backlogs réels identifiés, pas fermés** (documentés
`pluton_mechanic_coverage`) : **Bait** (19 items consommables Fishing,
économie coût/bénéfice par capture jamais modélisée, même famille que
Forge) ; **Critter Safari** (minigame de capture, 43 critters déjà
catalogués mais jamais évalués comme activité money-making) ; **Heart of
the Forest/List/Tier 1-8** (liste complète jamais relue en entier depuis
le fix Center of the Forest du 23 août, potentiellement d'autres perks
exploitables manqués).

**Conclusion honnête sur "100%"** : la cartographie brute (`game_mechanics_
misc`, ~184k `pluton_elements`) est large et le triage a confirmé qu'il
n'y avait PAS de mécanique majeure manquante parmi les 414 candidats
(surtout du bruit vanilla + du contenu déjà couvert) — mais le process
n'était PAS à 100% avant cet audit, et le mécanisme de découverte reste
bloqué tant que les crédits Haiku ne sont pas rechargés.

### 2. Démo skill aléatoire — Farming (sélection SQL `random()`)

Tiré au hasard parmi les 9 `activity_key` construits : **Farming**. Ce
qu'on verrait en prod aujourd'hui (`pluton_rankings`/`pluton_setups`,
13 cultures × 7 tiers) :

- **starter/amateur** : 0 ligne, volontairement -- Garden est interdit à
  ces 2 tiers (confirmé intentionnel, pas un bug, déjà documenté le 23 août).
- **intermediate/skilled** : setup réel différencié par tier (armure
  Tater→Squash, outil niveau 8→25, budget réel ~29M→83M), classement
  cohérent (Mushroom toujours en tête, Melon Slice toujours en queue).
- **expert/professional/master** : 🔴 **les 3 tiers donnent un résultat
  BYTE-POUR-BYTE IDENTIQUE** (même armure Helianthus, même FF=2392, même
  coins/h) -- seul `real_cost` diffère (300M/1B/9999999999), mais ce champ
  n'est qu'un plafond de config, pas un total pièce-par-pièce recalculé.
  Cause réelle : `farmingMaxLayerFor()` renvoie une constante UNIQUE
  (`FARMING_FORTUNE_MAX_PERMANENT`, le "Theoretical Maximum" du wiki) sans
  aucune différenciation par tier, alors que `INVESTMENT_MAX_TIERS`
  regroupe 3 tiers réels (expert/professional=ancien "end", master=ancien
  "late" -- voir doc `pluton-engine.ts`). Pas un bug introduit par la
  migration 7-tiers -- la source elle-même (page wiki "Achieving Maximum
  Farming Fortune") ne documente qu'UN SEUL maximum absolu, jamais de
  palier intermédiaire "end" vs "late" -- fidèle à ce qui existait déjà
  avant. Reste un vrai angle mort : 3 tiers Pluton sur 7 rendent le même
  résultat pour Farming, plus qu'aucun autre skill vérifié cette session.
- 🔴 **`accessories` toujours `[]` dans `pluton_setups`, à TOUS les
  tiers** -- contrairement à Mining/Foraging/Fishing/Slayer qui listent le
  détail (necklace/cloak/belt/bracelet/pet choisis), Farming ne stocke que
  les totaux agrégés (`total_mining_fortune`=FF, `armor_set_prefix`). Le
  code (`lib/pluton-farming.ts:693`) écrit `accessories: []` en dur. Un
  vrai gap si un dashboard veut un jour afficher "voici votre collier/
  cape/ceinture/bracelet optimal" pour Farming spécifiquement -- pas
  inventé, trouvé en tirant les vraies lignes persistées.

### 3. Audit système — le vrai goulot n'est plus le backend

**🔴 Constat le plus important de cette session** : `pluton_rankings` et
`pluton_setups` (9 activités, ~3600 lignes combinées, des semaines de
travail de fermeture de gaps) ne sont consommés par **AUCUNE route
frontend ni API produit** (`grep` sur tout `app/` hors `cron`/`debug` :
0 résultat). Le Money Making actuel (`app/api/cron/money-making-agent`)
et Evolve Skills (`app/api/cron/evolve-skills`) tournent en parallèle,
totalement indépendants de Pluton, sans jamais le référencer.

**Conséquence directe pour "conclure Pluton"** : le moteur de calcul est
maintenant mature et exhaustivement vérifié (bugs réels trouvés et
fermés à chaque skill, arbitrages réels par slot, découverte au-delà du
chemin canonique confirmée en pratique sur Combat). Continuer à chercher
des gaps isolés dans le backend a des rendements décroissants (confirmé
cette session : la plupart des candidats explorés étaient soit déjà
couverts, soit réellement bloqués faute de source). **Le vrai chantier
restant pour "conclure une bonne fois pour toute" n'est plus l'extraction
ni le calcul -- c'est le consommateur** : brancher `pluton_rankings`/
`pluton_setups` dans le dashboard réel (remplacer ou augmenter Money
Making + Evolve), exactement l'étape 3 de la Vision finale du 21 août
("comparaison interne pour proposer les meilleures money making
methods... pour Evolve, proposer le meilleur setup") jamais commencée.

### 4. Automatisation — état réel, optimisation Haiku

**11 des 12 crons `pluton-*-refresh` tournent quotidiennement à 100% de
succès** (10 derniers jours, `sync_log`) -- Mining a eu 1 échec isolé le
22 août (déjà documenté, incident chevauchement) puis 100% depuis.
`pluton-classification-sync` (nouveau, lundi 6h10) n'a pas encore eu sa
première fenêtre -- rien d'anormal. **Seul `pluton-weekly-sync` est cassé**,
et seulement à cause des crédits Haiku (voir section 1) -- le code
lui-même n'a pas de bug, il suffira de recharger les crédits.

**Optimisation réelle trouvée** : le triage manuel du `discovery_queue`
fait cette session (294/414 résolus par simple pattern SQL -- blocs
vanilla, changelogs, travel scrolls, doublons déjà catalogués) prouve
qu'une **grande partie du travail actuellement prévu pour Haiku
(`pluton-weekly-sync` classification) pourrait être pré-filtrée par des
règles SQL pures AVANT tout appel Haiku** -- exactement le même principe
que `pluton_classification_rules` (déjà en place pour `pluton_elements.
activity`), simplement pas encore étendu à `discovery_queue`. Recommandation
concrète : ajouter une table `discovery_queue_noise_patterns` (ou
réutiliser `pluton_classification_rules` avec un nouveau `rule_type`)
appliquée automatiquement par `discovery-scan`, pour que seuls les ~20-30%
de candidats VRAIMENT ambigus (comme "Brine Tonic"/"Bait" cette session)
arrivent devant Haiku (ou devant Claude Code) -- pas les 70%+ qui sont du
bruit vanilla reconnaissable par regex. Réduit le coût ET la charge de
triage manuel futur.

**Ce qui est déjà correctement pensé pour l'auto-entretien** (pas à
refaire) : chaque activité Pluton a son cron dédié, idempotent (delete-
puis-rebuild scopé), aucune dépendance croisée entre activités (confirmé
par les incidents de chevauchement déjà documentés -- toujours résolus en
isolant l'activité, jamais en introduisant un lock partagé fragile) ;
`pluton_classification_rules`/`pluton_mechanic_coverage` sont rejouables
et inspectables, pas des scripts one-shot.

### Prochaines étapes concrètes, dans l'ordre

1. Recharger les crédits Haiku -- débloque `pluton-weekly-sync` seul.
2. Étendre le pré-filtrage SQL du `discovery_queue` (voir section 4) avant
   de relancer une nouvelle vague de triage.
3. Fermer les 3 backlogs identifiés section 1 si prioritaires (Bait,
   Critter Safari, HOTF Tier List complet) -- sinon les laisser documentés.
4. **Chantier prioritaire réel** : brancher le frontend sur `pluton_
   rankings`/`pluton_setups` (section 3) -- c'est la seule chose qui
   empêche de dire "Pluton est fini".

## 🔴 2e passe d'audit — bug critique trouvé via les vrais setups, nettoyage, optimisation Haiku-zéro (25 août, suite)

Correction explicite de l'utilisateur sur l'audit précédent : *"cette audit
n'est pas ce que je te demande... je te demande TOI Claude Code pas Haiku,
de me fournir les setups pour verifier la veracite de nos propos... nettoyer
ce qui n'est pas necessaire... optimiser pour accueillir l'automatisation
Haiku plus tard... automatisation prioritaire sans credit si possible."*
Mandat : tout fait par moi directement, pas d'agent/Haiku délégué.

### 🔴 Bug critique réel trouvé en fournissant les setups demandés

En sortant le setup complet Mining (DIAMOND_ORE, 7 tiers) pour vérification,
découverte d'un bug structurel réel : **`applyPetsAndAccessories()` (pet +
necklace/cloak/belt/bracelet/accessory_bag) était appelée SANS AUCUNE
gate de tier** -- Divan Pendant/Sapphire Cloak/Jade Belt/Dwarven
Handwarmers + pet Scatha (items très haut de gamme, largement au-dessus du
budget d'un joueur starter) apparaissaient identiques bit-à-bit dans le
setup "optimal" à **tous les 7 tiers**, y compris starter. Vérifié : même
bug, même cause, présent dans **Foraging et Fishing** (mêmes 3 fichiers
construits avant la convention `INVESTMENT_MAX_TIERS` introduite par
Combat le 22-23 août, jamais rétro-adaptés). Combat/Bestiary/Sea Creatures/
Slayer étaient déjà corrects (vérifié directement dans leur code).

**Corrigé dans les 3 fichiers** (`lib/pluton-mining.ts`/`pluton-foraging.
ts`/`pluton-fishing.ts`) : la couche pets/accessoires est désormais gatée
à `INVESTMENT_MAX_TIERS` (expert/professional/master), exactement la même
convention déjà utilisée par la couche "investissement maximal" juste en
dessous dans ces mêmes fichiers (qui, elle, était déjà correcte). **Vérifié
en base** : starter/amateur/intermediate/skilled ont désormais 0
accessoire/pas de pet (Mining DIAMOND_ORE starter : 388 526→148 888
coins/h, une baisse, mais un chiffre enfin honnête) ; expert/professional/
master strictement inchangés (Mining 13 199 vitesse exacte, Foraging
FF=717 exact, Fishing fishing_speed=220 exact). C'est le bug le plus
significatif trouvé sur tout Pluton depuis le début du projet -- un
joueur starter n'aurait jamais eu accès à ces items, le "setup optimal"
affiché aux tiers bas n'avait jamais été réaliste jusqu'ici.

### Vérification système -- pas d'autre cas similaire trouvé

Kuudra (scaling cannon-perk par tier, formule progressive, pas de
convergence anormale vérifiée sur KUUDRA_BASIC : 2.4M→3.5M→16.2M→
34.2M→64.6M→121.7M→155.7M coins/h, 7 valeurs distinctes) et Dungeons
(2 paliers réels seulement -- `useMaxBonus` bascule entre `chance_max_
bonus_pct`/`chance_no_bonus_pct`, contrainte de la source elle-même qui
ne documente que 2 scénarios de Bonus Chest, pas un raccourci de code)
vérifiés sans anomalie structurelle du même type.

### Nettoyage réel effectué

- **1 route morte supprimée** : `historic-import` (backfill historique
  price_history/price_history_ah, confirmé 100% terminé --
  `historic_import_progress` : 6246/6246 lignes `status='done'`, 0
  référence de code restante).
- **8 tables mortes supprimées en base** : `dungeon_data`/`fishing_data`/
  `kuudra_data`/`mayors`/`rift_items`/`slayer_data`/`subscription`
  (singulier, doublon de `subscriptions`) -- 0 ligne, 0 référence de code,
  confirmé avant suppression (`kuudra_data`/`slayer_data` déjà notées
  "stub Phase-0 mortes" depuis le 4 août, jamais réellement supprimées) ;
  `dungeon_classes` -- décision de suppression déjà prise dans le code le
  24 août (`wiki-referential-sync` ne l'alimente plus, commentaire dans
  le code le confirme) mais jamais finalisée côté table, terminé ici.
- **1 dossier de debug vide résiduel supprimé** (`app/api/debug/trigger-
  pluton-dungeons-refresh`, artefact filesystem d'une session antérieure).
- **1 index dupliqué supprimé** (`price_history_ah` avait deux index
  strictement identiques sur `(granularity, bucket_date)` -- `get_
  advisors` niveau performance, seul item non-INFO trouvé).
- Advisors sécurité/performance repassés en entier : rien d'autre
  d'actionnable (uniquement des INFO deja acceptés lors de l'audit du 17
  août -- RLS sans policy sur tables service-role-only, FK non indexées à
  faible volume).

### Optimisation Haiku-zéro construite (pas juste recommandée)

Le triage manuel du `discovery_queue` (294/414 résolus par simple pattern
SQL cette session) a été transformé en automatisation réelle : nouvelle
table `discovery_queue_noise_patterns` (9 regex, extraits du triage
manuel) + `app/api/cron/discovery-scan/route.ts` modifié pour auto-
résoudre le bruit connu **à l'insertion**, avant tout jugement humain/
Claude Code/Haiku futur. **Vérifié en prod** : 3 nouvelles pages détectées
(Changelogs août), 3/3 auto-résolues, 0 restée pending. Zéro coût API,
extensible sans redéploiement (ajouter une ligne à la table suffit).
Réduit d'autant le volume qui nécessitera un jour un vrai jugement Haiku.

### Organisation de la cartographie -- vérifiée fonctionnelle mais non utilisée

Les 7 vues SQL `pluton_tier_starter`...`pluton_tier_master` (Phase 4 du
plan, créées le 21 août) existent toujours, requêtables, cohérentes.
**Mais `grep` confirme 0 référence de code nulle part** -- comme
`pluton_rankings`/`pluton_setups` (voir section précédente), cette couche
d'organisation existe et fonctionne mais n'est consommée par rien
actuellement. Cohérent avec la méthode retenue depuis le 24 août (peupler
les tables spécialisées déjà consommées par chaque calculateur, pas
brancher les calculateurs sur `pluton_elements` dynamiquement) -- pas un
bug, mais confirme que cette couche reste un potentiel dormant, pas un
maillon actif du pipeline.

### 🔴 Vérification directe contre le wiki live (pas juste discovery_queue) -- correction demandée par l'utilisateur

L'utilisateur a précisé que "cartographie complète" veut dire vérifier
contre le vrai internet, pas juste retrier notre propre queue interne.
Fait : requête directe à l'API MediaWiki du wiki officiel
(`hypixelskyblock.minecraft.wiki/api.php`, `action=query&list=allpages`,
paginée en entier) -- **8 146 pages non-redirect réelles** existent dans
l'espace de noms principal. Comparé aux **8 132 pages capturées** en base
(`game_mechanics_misc`, `source='hypixelskyblock_wiki'`) : **99,83% de
couverture réelle vérifiée**, pas supposée.

**78 pages réellement jamais vues, diffées et triées** : la découverte la
plus significative est `Damage Calculation/Multiplicative Sources`
(jamais cartographiée) qui révèle la chaîne complète Voidwalker→Voidedge→
**Vorpal Katana**→Atomsplit Katana pour Enderman Slayer -- **Vorpal Katana
était totalement absente de `pluton_slayer_weapon_stats`** alors que
Voidedge et Atomsplit (les paliers avant/après) y étaient déjà. Stats
sourcées directement depuis l'infobox wiki réelle (Damage+190/Force+80/
Crit Damage+30%/multiplicateur mob=250% vs Endermen, Enderman Slayer 5),
ajoutée comme candidat réel au palier intermediate/skilled. **Vérifié en
prod** : Vorpal Katana désormais sélectionnée sur les 4 paliers Enderman à
intermediate/skilled, Voidedge Katana correctement dominé/écarté par le
moteur de recherche -- exactement le genre de découverte "hors chemin
canonique" que la Vision Pluton demande depuis le 21 août.

Les 77 autres pages manquantes triées : majoritairement cosmétique/
événementiel (Fire Sale par année 2020-2026, Helmet/Pet Skins par année,
NPC/List par zone -- simples annuaires de lieu) ou vanilla Minecraft
(Comparator, Farmland, Dispenser, Daylight Detector). **5 candidats
documentés mais non fermés** : `Damage Calculation/Damage Cap` (bosses
événementiels type Apex Dragon, pas les 5 boss Slayer actuels) et
`Damage Calculation/Magic Resistance` (Dungeon Mobs -- non applicable au
score S+ déterministe actuel de Dungeons) confirmés non-pertinents pour
l'architecture actuelle ; `Glacial (Mob Type)` (mobs des Glacite
Mineshafts, endommageables uniquement au Pickaxe/Drill -- un vrai combat
pendant le minage jamais modélisé, Mining actuel = pur cassage de bloc)
documenté comme backlog réel, scope non mesuré ; `Skill Tree`/`Item
Types` confirmés être des pages méta/glossaire sans mécanique chiffrée
nouvelle.

**64 pages "en trop"** (capturées chez nous, plus trouvées sous ce nom
sur le wiki live) confirmées être des renommages déjà retrouvés sous leur
nouveau nom le même jour via le triage `discovery_queue` (Hunter Fortune→
Hunting Fortune, Fishing Bait→Bait, Sweep/Foraging Fortune Booster→
Common X Booster) -- pas une perte de contenu, juste des doublons sous
ancien nom pas encore nettoyés en base (pas fait, priorité basse).

**NEU-REPO/SkyHanni-REPO** (les 2 autres sources actives) reconfirmées
saines : dernière sync réussie 24 août, cadence hebdomadaire respectée,
aucun signe de staleness.

### 🔴 4e source vérifiée -- l'API officielle Hypixel, sous-exploitée, bug réel majeur trouvé et corrigé

Suite du mandat "vérifie qu'on a bien toutes les sources disponibles" --
recherche web confirme 4 sources actives (wiki + NEU-REPO + SkyHanni-REPO
+ **API officielle Hypixel** `/v2/resources/skyblock/*`), pas 3. L'endpoint
`/v2/resources/skyblock/items` (5 650 items, public, sans clé) expose des
stats structurées et officielles (DAMAGE/STRENGTH/FEROCITY/INTELLIGENCE/
CRITICAL_DAMAGE/...) pour chaque arme/armure -- une source strictement
plus fiable que le parsing de wikitext.

**Vérifié : cette source est déjà branchée (`skyblock-resources-sync`,
quotidien) mais était sous-exploitée d'une façon inattendue** --
`item_stats` (1 376 lignes) affichait **0 sur toutes les colonnes de
stats pour 79% des lignes (1 093/1 376)** depuis la création du cron. 🔴
**Cause réelle** : l'API Hypixel elle-même mélange des clés stats
MAJUSCULES et minuscules selon l'item (confirmé en inspectant les items
réels, pas une supposition) -- le code d'origine ne lisait que la casse
minuscule, donc chaque item exposant ses stats en MAJUSCULES (Hyperion,
Vorpal Katana, la plupart des armes/armures haut de gamme) recevait 0
silencieusement. Corrigé (`readStat()`, lit les deux casses) + colonnes
`damage`/`ferocity` ajoutées (absentes avant -- aucune arme n'avait jamais
son dégât de base capturé dans cette table). **Vérifié en prod** : Hyperion
Damage=260/Strength=150/Ferocity=30/Intelligence=350 exact ; Atomsplit
Katana et Vorpal Katana cross-vérifiés **exacts** contre
`pluton_slayer_weapon_stats` (source indépendante, wiki) -- confirmation
croisée à 2 sources du fix Vorpal Katana du jour même.

**Portée honnête** : `item_stats` reste aujourd'hui consommé UNIQUEMENT
pour `rarity`/`display_name`/`default_color` ailleurs dans le code (8
usages vérifiés, aucun ne lit les colonnes de stats numériques). Le
bug est corrigé et la table est désormais fiable, mais **pas encore
utilisée comme source de cross-vérification systématique** pour les
tables spécialisées par skill (`pluton_slayer_weapon_stats`,
`pluton_mining_tool_stats`, etc.) -- opportunité réelle et significative
pour une prochaine session (l'API couvre aussi Mining/Foraging/Fishing/
Farming Fortune, Sweep, Sea Creature/Treasure Chance, Bonus Pest Chance
et les fortunes par culture, pas seulement le Combat), documentée dans
`pluton_mechanic_coverage` plutôt que laissée implicite.

### NEU-REPO/SkyHanni-REPO -- extraction reelle vs disponible, exhaustivite jusqu'a epuisement (25 aout)

Mandat "exhaustivité jusqu'à épuisement des sources" -- audité les 2 repos
GitHub jusqu'au bout, pas juste confirmé leur cron actif.

**NEU-REPO : 17 771 fichiers réels, seulement `constants/` (40 fichiers)
synchronisé** -- `items/` (8755) et `itemsOverlay/` (8652) redondants avec
l'API officielle (déjà couverte) ; `mobs/` (279) vérifié être des données
de SKIN cosmétique pour le mod, pas des stats de combat -- confirmé sans
valeur, pas juste supposé. `mining/` (29 fichiers, `mining/blocks/*.json`,
breakingPower+blockStrength par bloc) **jamais consulté avant, cross-
vérifié bloc par bloc contre `pluton_target_blocks`** : Glacite/Sulphur/
Hard Stone confirmés exacts, **Tungsten et Umber (breakingPower=9/
blockStrength=5600 chacun) totalement absents comme cibles Mining
directes** malgré que leurs sorties Forge le soient déjà -- prix Bazaar
réels confirmés (~124/~135 coins), ajoutés et vérifiés en prod (0 doublon,
progression cohérente, même profil de tiers que Sulphur Ore).

**Découverte non fermée, documentée** : plusieurs ores ont de VRAIES
variantes multiples avec des block_strength différents -- Mithril a 3
paliers réels confirmés par 2 sources indépendantes (wiki + SkyHanni :
LOW=500/MID=800/HIGH=1500) ; les ores basiques ont un variant "Pure"
Crystal Hollows (block_strength=600) distinct du variant de surface (30).
**Vérifié que ce n'est PAS une nouvelle activité manquante** (les variantes
"Pure" ne sont pas des items tradeable séparés -- pas de PURE_COAL/
PURE_DIAMOND dans `items_catalog`, même drop que le variant normal) --
c'est une simplification de modèle déjà réelle (un seul variant assumé
par bloc), documentée dans `pluton_mechanic_coverage`, pas fermée (scope :
séparer chaque variante en target_block nécessiterait une pondération de
spawn-rate non sourcée).

**SkyHanni-REPO : 114 fichiers réels, 17/68 fichiers `constants/*.json`
synchronisés.** Échantillon des non-synchronisés : `Enchants.json` (juste
noms/niveaux max, pas de valeurs de bonus -- déjà couvert par la table
`enchantments`) et `Pets.json` (uniquement métadonnées de skins
cosmétiques) confirmés sans valeur. `Mining.json` a fourni la 3e source
indépendante confirmant Mithril LOW/MID/HIGH ci-dessus. Reste ~50
fichiers non échantillonnés individuellement (Bazaar/DianaDrops/
DragonProfitTrackerItems/CrimsonIsleReputation/HoppityEgg* etc.) --
majoritairement événementiel/cosmétique au vu des noms, pas vérifié un
par un faute de temps, honnêtement laissé en `not_yet_audited`.

**Bilan sources (4 confirmées, épuisées à un niveau raisonnable, pas à
100% fichier-par-fichier)** : Wiki 99,83% (8132/8146 pages), API
officielle Hypixel (bug majeur corrigé), NEU-REPO (`constants/`+`mining/`
audités, `items/`/`itemsOverlay/`/`mobs/` confirmés sans valeur
supplémentaire), SkyHanni-REPO (17/68 `constants/*.json` vérifiés
pertinents, ~50 non échantillonnés individuellement -- gap honnête, pas
un chantier fermé).

## ✅ Audit exhaustivité via l'API Collections officielle Hypixel + wiki.hypixel.net fermé (25-26 août)

**Mandat de l'utilisateur** (nuit du 25 au 26 août, full autonomie) : produire
un état des lieux de la progression vers Pluton final, puis construire tout ce
qui manque pour zéro trou/gap, activité par activité, avec pour exemple
explicite le reproche que Tungsten/Umber aient été ajoutés "à la dernière
minute" alors que la règle "toute ressource cartographiée sert directement aux
skills" était déjà actée.

**Méthode retenue** : la table `collections` (sync quotidien depuis l'API
officielle `/v2/resources/skyblock/collections`, déjà en base) donne pour
chaque skill la liste AUTHENTIQUE et complète des items collectionnables
(COMBAT=11, FARMING=20, FISHING=12, FORAGING=15, MINING=25, RIFT=7) — un
référentiel bien plus fiable que le parcours wiki ad hoc utilisé jusqu'ici pour
juger de l'exhaustivité. Chaque skill diffé contre `pluton_target_blocks`/
mécanique existante.

**🔴 Découverte majeure, non-Pluton mais structurante pour tout le projet** :
le wiki officiel Hypixel (`wiki.hypixel.net`) a fermé en juillet 2026 (redirige
vers un thread d'annonce Hypixel Forums). Le contenu a migré vers
`hypixelskyblock.minecraft.wiki` (Minecraft Wiki, confirmé actif via
recherche) — **nouvelle source de référence pour toute vérification wiki
future de ce projet**, `wiki.hypixel.net` ne doit plus être fetché en direct.

### Fermetures réelles, vérifiées en base

- **Mining (19/25 → 25/25)** : 6 blocs "Non reliant on Mining Speed" (wiki
  Block Strength) jamais ajoutés comme cibles — Ice/Sand/Red Sand/Gravel/
  Mycelium/Glowstone Dust. Mécanique vanilla (Efficiency/Haste), pas la stat
  Mining Speed — `block_strength=1`/`required_breaking_power=0` reproduisent
  fidèlement l'instamine réel via la formule existante, sans mécanisme
  parallèle inventé. 42/42 combos vérifiés en base (progression cohérente,
  plateau professional/master attendu — même Divan Drill aux 2 tiers).
- **Foraging (3/15 → 9/15)** : 🔴 **2 bugs réels trouvés**, pas seulement un
  gap de couverture. `computeLogsPerSwing()` retournait `1` fixe pour tout
  arbre Toughness≤0, ignorant Sweep entièrement — jamais déclenché avant car
  seuls Fig/Mangrove/Helix (Toughness>0) existaient. `computeForagingRanking()`
  avait `Number(block.block_strength) || 1`, un fallback qui aurait de toute
  façon confondu un vrai Toughness=0 avec une absence de donnée. Wiki
  "Sweep#Formula" section "Basic Trees" confirme une formule linéaire simple
  distincte (`1 + min(35, Sweep)`) pour les arbres de The Park/Forest — corrigé,
  6 bois de base ajoutés (Oak/Spruce/Birch/Jungle/Acacia/Dark Oak).
  **Correction du narratif du 23 août** : "Foraging 3/3 arbres réels" était
  vrai seulement pour les arbres Galatea (scope trop étroit), pas 3/15 réels.
  42/42 combos vérifiés (saut de Sweep 87→392 à `expert` confirmé cohérent —
  c'est le premier tier de `INVESTMENT_MAX_TIERS`, comportement déjà établi
  ailleurs, pas un bug).
- **Fishing (9/12 → 12/12)** : Raw Salmon/Tropical Fish/Pufferfish
  (`RAW_FISH:1/:2/:3`) documentés "aucun prix Bazaar/AH trouvé" depuis la
  construction du 17 août — faux, vérifié directement contre `price_history` :
  historique actif et complet pour les 3. Fishing était déjà substantiellement
  couvert (5 items via la table de loot normale, 4 via les drops garantis Sea
  Creature déjà ajoutés le 21 août) — ce fix ferme le seul résidu réel.
  7/7 combos WATER_POOL vérifiés (master ~418K coins/h, cohérent avec le
  dernier repère connu du 25 août).
- **Combat/Bestiary (2 lignes `zone_mob_stats` ajoutées)** : en creusant les 7
  items FARMING de la Collections API attribués à des mobs (pas des cultures),
  2 manquaient — Sheep (Raw Mutton/White Wool) et Rabbit (Raw Rabbit), format
  identique aux lignes Chicken/Cow/Pig déjà en base. 109 candidats (107+2),
  65 viables (63+2) — les 2 nouvelles lignes produisent bien un HP parseable
  + un drop garanti pricé, vérifié en base.

### Gaps réels trouvés, documentés (`pluton_mechanic_coverage`), PAS construits

- **Chili Pepper (Combat, 1/11 résiduel)** : n'est PAS un drop de mob (aucune
  ligne `zone_mob_stats` ne le mentionne) — recherche live confirme que c'est
  un produit d'**Inferno Minion + fuel Hypergolic-tier** (~0.735% chance par
  item généré, ~5-30/minion/jour). Mécanique réelle et sourcée, mais
  structurellement hors du modèle Bestiary/kill actuel — nécessiterait un
  calculateur "économie de minions" entièrement nouveau (tiers, coût fuel,
  slots), jamais construit dans Pluton. Pas forcé dans `zone_mob_stats`.
- **Hemovibe (Rift, 1/7)** : seul item Rift avec un vrai prix Bazaar actif
  (~16 000 coins) — les 6 autres confirmés hors-Bazaar (économie Motes isolée,
  cohérent avec le hors-scope Rift déjà établi). Mécanisme d'obtention pas
  encore recherché (Rift = dimension séparée jamais cartographiée pour
  Pluton) — décision utilisateur à prendre avant d'investir dans une
  cartographie Rift pour un seul item.
- **Moonglade Marsh (Foraging, 6/15 résiduels)** : Honeycomb/Lushlilac/Ruby
  Veilshroom/Sea Lumies/Tender Wood/Vinesap — 0 page wiki cachée. Recherche
  live sur Lushlilac confirme une mécanique de **buisson à repousse
  périodique** ("Harvesting grants 1x Lushlilac + 25 XP + 100 Forest
  Whispers"), structurellement différente du modèle Sweep/logs-par-swing
  actuel — aucun timer de repousse ni densité de buisson chiffrés trouvés.
  Gap réel documenté, pas inventé.

### maxDuration -- 2 crons ajustés par prudence (incident réel rencontré)

Une 1re tentative de vérification Mining (recalcul complet des 39 blocs via
`computeAndPersistAllMiningRankings()`) a **timeout à 300s**
(`FUNCTION_INVOCATION_TIMEOUT`) -- +18% de combos (33→39) après l'ajout des 6
nouveaux blocs. `pluton-mining-refresh` : 300→400. `pluton-foraging-refresh` :
180→240 (même prudence, +40% de blocs 15→21, pas de timeout observé mais
marge insuffisante jugée risquée). Vérification elle-même faite via des routes
de debug scopées aux seuls blocs nouveaux (delete+insert restreint, pas la
fonction complète) -- le cron nightly recalculera l'ensemble complet avec la
marge augmentée à son prochain passage.

### Bilan honnête

Les 6 skills à Collections officielles sont désormais audités contre la
source Hypixel authentique (pas seulement le wiki) : Mining 25/25, Fishing
12/12, Foraging 9/15 (6 restants = Moonglade Marsh, mécanique non sourcée),
Combat 10/11 (1 restant = Chili Pepper, mécanique minion hors-scope actuel),
Farming 20/20 (déjà complet, cultures + 7 byproducts animaux tous couverts
Combat/Bestiary), Rift 1/7 pertinent (6 hors-Bazaar par design du jeu). Aucun
trou de couverture n'a été laissé sans être soit fermé, soit documenté avec sa
raison réelle et sa source. Prochaine étape logique si l'utilisateur veut
continuer à zéro-gap absolu : Moonglade Marsh (nécessite de sourcer un timer
de repousse de buisson) et la décision Rift/Hemovibe/Chili Pepper (nouveaux
calculateurs hors du périmètre actuel, à cadrer avant de construire).

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
