@AGENTS.md
# CLAUDE.md — Vault (contexte projet pour Claude Code)

> Basé sur la session la plus récente disponible. En cas de divergence avec une
> session antérieure sur le même sujet, cette version fait foi.

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

## ✅ Pluton — architecture v2 (element_type + gating), TERMINÉE (13-17 août)

**Remplace l'architecture 7-tiers ci-dessous** — l'utilisateur a jugé le modèle "tier
seul" trop mélangé (items/mécaniques/XP/mob data tous dans la même table, impossible
de naviguer pour un calcul Pluton précis). Nouvelle architecture validée par
l'utilisateur après plusieurs itérations de discussion :

**Principe** : deux axes orthogonaux au lieu d'un seul.
- `element_type` (navigation) : `item` | `progression_milestone` | `mechanic_formula` |
  `mob_zone_data` | `cosmetic` | `event_seasonal` | `admin_excluded` | `general_mechanic`.
- `tier` (progression, un seul champ, sémantique CUMULATIVE) : `NULL` si l'élément n'est
  **pas réellement débloquable** (règle universelle vraie pour tout joueur dès le début,
  ex: vitesse de cassage de bloc vanilla, définition d'une stat — **jamais** un tier par
  défaut pour ce genre de contenu). Sinon 1-7, où `tier=N` veut dire "présent dans le
  profil du joueur à partir du tier N, jusqu'au 100%". Tier 7 = l'ancrage absolu = tout
  ce qui est gated par construction (pas un jugement à part) — profil Master =
  `WHERE tier <= 7` (= tout), profil Amateur = `WHERE tier <= 2`, etc.
- Paramètres de gating par type, cascade priorisée : `item` → prix réel AH/Bazaar mappé
  sur les bornes `milestone_tier_totals` (jamais la rareté seule, testée et rejetée —
  un Legendary peut être early game, un Rare peut être endgame) → sinon prérequis
  documenté → sinon hérité d'une source déjà classée → sinon Haiku dernier recours.
  `progression_milestone` → ratio XP réel cumulé (`cumulative_xp/xp_total_max`, pas le
  ratio de niveau brut). `mechanic_formula`/`cosmetic`/`event_seasonal`/`admin_excluded`
  → `tier=NULL` structurel, pas de jugement.

**Schéma créé et déployé** : `pluton_elements` (migration `create_pluton_elements_v2`) —
une seule table (remplace les 7 `pluton_tier_*`), colonnes `element_type`/`activity`/
`tier`/`gate_type`/`gate_reference`/+ mêmes colonnes de traçabilité qu'avant
(`source_table`/`source_row_id`/`raw_data`/`classification_method`/
`classification_confidence`/`classification_reason`), `unique(source_table,
source_row_id)`, RLS + policy lecture publique. Élimine structurellement la classe de
bug de doublon cross-table d'hier — une seule table de destination.

**Route de classification** : `app/api/debug/trigger-elements-classify-ref/route.ts`,
même pattern que la veille (jugement Haiku par table de référence NEU-REPO/API, batch de
15, upsert dès le départ, invoquer avec `curl -m 310` strictement supérieur à
`maxDuration=300`). **2 vrais bugs de schéma trouvés et corrigés en route** : Anthropic
structured output rejette un `enum` combiné à un `type` nullable (`['string','null']`),
peu importe si `null` est dans l'enum ou non — contourné avec une valeur sentinelle
`'none'` (mappée vers `null` côté code, jamais écrite en base) plutôt qu'un type nullable.

**✅ Tables de référence NEU-REPO/API terminées (14 août)** : 150/150 tables classées,
35 783 lignes, 0 doublon, 0 erreur. Distribution `element_type` cohérente
(`mechanic_formula` 12 712 dont 46% gated, `item` 12 711 dont 34% gated — taux bas
justifié, les tables de type "relation"/"upgrade path" documentent des liens entre items
déjà classés ailleurs plutôt que des items autonomes, pas un bug —, `progression_milestone`
3 565 = 100% gated par définition, `mob_zone_data` 3 324, `general_mechanic` 1 881,
`cosmetic` 1 180, `event_seasonal` 410). `skills` (612 lignes, migrées avec le vrai ratio
XP cumulé `cumulative_xp/xp_total_max`, pas le ratio niveau brut utilisé par erreur en v1)
et `game_drops` (203 lignes, zone-based) migrées aussi — total post-référence : 36 598
lignes, 152 source_table distinctes, 0 doublon.

**✅ Contenu wiki terminé (17 août)** — `wiki_table_extract` : route
`trigger-elements-classify-wte` (jugement Haiku par PAGE, appliqué à toutes ses lignes
résiduelles). **1 vrai bug de perf trouvé et corrigé en route** : la boucle faisait un
`upsert()` individuel par ligne (potentiellement des centaines de round-trips DB par
page) — sur 137 641 lignes au total ça aurait pris des dizaines d'heures cumulées.
Corrigé en upsert par lots de 500 (même garantie `ON CONFLICT ignoreDuplicates`), gain de
vitesse énorme confirmé (de ~1700-1900 lignes/round à 400 pages/round sans timeout).
**Terminé à 137 641/137 641 lignes (100%)** — 2 pages géantes (`Necromancy/List of Souls`
3216 lignes, `SkyBlock Levels/Tasks` 3120 lignes) bloquaient le fetch par lot Haiku
(`.in()` avec 3000+ ids) : classées manuellement en SQL direct plutôt que forcées dans le
pipeline (raisonnement transparent, `classification_method='manual_v2'`).

`wiki_haiku_extract` : route `trigger-elements-classify-whe`, même principe mais sur les
`entries[]` déjà structurées par B2 (`source_label`/`stat_name_guess`/`bonus_raw`/
`condition_note`) — moins cher, pas besoin de relire la page. **Terminé** (1157 pages
résiduelles traitées, `remaining_after_this_run: 0`).

**État final vérifié en base** : **178 715 éléments dans `pluton_elements`**, 0 doublon
(`distinct_keys = total`), **154 `source_table` distinctes** couvertes (150 tables de
référence + `skills` + `game_drops` + `wiki_table_extract` + `wiki_haiku_extract`).
Distribution `element_type` cohérente sur les 8 catégories — `item` 48 302 (24% gated),
`mechanic_formula` 37 965 (27% gated), `mob_zone_data` 23 311 (24% gated),
`progression_milestone` 19 043 (67% gated — logique, une milestone est presque toujours
un vrai palier), `cosmetic` 18 817 (10% gated), `event_seasonal` 17 644 (14% gated),
`general_mechanic` 12 897 (11% gated), `admin_excluded` 736 (**0% gated par construction**,
vérifié). Total : 45 727 éléments gated (un vrai tier 1-7) / 132 988 non-gated (`NULL`,
contenu universel/cosmétique/admin correctement exclu du modèle de progression plutôt que
forcé par défaut).

**Nettoyage effectué** : les 7 tables `pluton_tier_1_starter`..`_7_master` (v1)
supprimées, les 3 routes de debug (`trigger-elements-classify-ref`/`-wte`/`-whe`)
supprimées après vérification finale.

**🔴 Bug de corruption tier trouvé+corrigé (17 août, avant clôture)** : 2670 lignes
avaient un `tier` hors de l'échelle [1,7] (jusqu'à 500) — Haiku recopiait parfois une
échelle brute du jeu présente dans le contenu source (SkyBlock Level 500+, niveau HOTM
10+, niveau Carpentry 200+) au lieu de la convertir vers l'échelle Pluton 1-7. Corrigé
par (1) prompt renforcé avec règle explicite + exemple de conversion + interdiction
littérale de copier un nombre brut, (2) `clampTier()` côté code
(`Math.max(1, Math.min(7, Math.round(n)))`) en filet de sécurité permanent, jamais
confié uniquement à la sortie structurée du modèle. 2670 lignes supprimées et
reclassifiées, vérifié après : `min_tier=1, max_tier=7` exactement.

**✅ Cron permanent d'auto-alimentation construit et vérifié (`pluton-weekly-sync`,
17 août)** : `app/api/cron/pluton-weekly-sync/route.ts`, programmé lundi 5h15
(`vercel.json`). Chaîne 2 phases dans la même invocation (demande explicite
utilisateur — "quand la cartographie est finie on lance extract dans la foulée") :
- **Phase 1 extraction** : watermark sur `game_mechanics_misc.created_at` (même
  mécanisme que `discovery-scan`), B1 (`extractStructuredTables`, gratuit) puis Haiku B2
  en dernier recours si B1 ne trouve rien → `wiki_table_extract`/`wiki_haiku_extract`.
- **Phase 2 classification** : tout le résidu non encore dans `pluton_elements`, même
  jugement Haiku element_type+gating (prompt renforcé + `clampTier()`). Scope
  volontairement limité au wiki (symétrique de `discovery-scan`) — les ~150 tables de
  référence NEU-REPO/SkyHanni-REPO reçoivent rarement de nouvelles lignes, pas couvertes
  ici pour garder le cron simple (documenté en commentaire dans la route, avec la requête
  SQL à lancer si un vrai résidu s'y accumule un jour).

**2 vrais bugs trouvés en testant, corrigés avant clôture** :
1. `insert()` nu sur `wiki_table_extract`/`wiki_haiku_extract` → tout retry rescanant
   une page déjà extraite aurait fait remonter des 23505 en boucle (pas de risque de
   duplication réelle, contraintes uniques déjà en place, mais calcul/logs gaspillés).
   Corrigé en `upsert(ignoreDuplicates)`.
2. Le watermark d'extraction n'avance que sur un succès complet (`finishSync`) — or
   `maxDuration=300` tue l'invocation avant d'y arriver dès qu'un run dépasse le budget
   (observé sur le premier test réel, backlog de 273 pages). Filet indépendant ajouté :
   skip explicite de toute page déjà présente dans `wiki_table_extract`/
   `wiki_haiku_extract` avant même de tenter B1/B2 — résumable par construction, peu
   importe l'état du watermark.
3. **`select()` sans `.range()` sur les deux fonctions de classification résiduelle**
   (`classifyWikiTableExtractResidual`/`classifyWikiHaikuExtractResidual`) — plafond
   silencieux ~1000 lignes côté PostgREST, invisible sur `wiki_table_extract` (~140k
   lignes)/`wiki_haiku_extract` (~5200 lignes). Trouvé concrètement : un run a rendu
   `wte_rows:0` alors qu'un résidu réel de 2307 lignes existait (confirmé par requête
   SQL directe). Même piège de troncature déjà rencontré ailleurs sur ce projet —
   corrigé en paginant par lots de 1000 comme `runClassificationPhase` le fait déjà pour
   `pluton_elements`. Reverifié après fix : run suivant a traité `wte_rows:3545` (preuve
   que le résidu était bien invisible avant, pas absent).

**État final vérifié en base après tous les fixes (17 août)** : **183 384 éléments dans
`pluton_elements`**, 0 doublon (`distinct_keys = total`), 0 tier hors [1,7], 0 résidu non
classé sur `wiki_table_extract`/`wiki_haiku_extract`. Chantier Pluton (cartographie +
extraction + classification + auto-alimentation) considéré **complet**.

**Prochaine étape actée par l'utilisateur** : Pluton consomme `pluton_elements`
pour Money Making (`WHERE tier<=N AND element_type='item'/'mechanic_formula'` + prix
LIVE de `price_history_ah` recroisé au moment du calcul, jamais le prix figé dans
`gate_reference`) et pour Evolve (diff données réelles joueur vs profil théorique
`WHERE tier <= tier_joueur+1` → gap analysis) — le moteur de calcul SQL + le Haiku
"instructeur" d'objectifs dashboard ne sont pas encore construits, prochaine étape
réelle de Pluton. Puis, dans l'ordre acté par l'utilisateur le 17 août : ~~calibrer les
crons~~ ✅, ~~optimiser à nouveau les coûts~~ ✅ (voir section dédiée juste au-dessus),
audit général Vault+Pluton (en cours), nettoyage complet + finalisation v1 prod, refonte
frontend, 1 semaine de test réel sur le compte Hypixel de l'utilisateur, puis lancement.

**✅ `ah-collect` optimisé côté coûts (17 août)** — identifié via données réelles
(`mcp__vercel__get_runtime_logs` + `sync_log`, jamais deviné) comme le vrai poste de
coût Vercel du projet : ~51h de compute cumulé sur 5 jours contre <3h pour tous les
autres crons réguliers combinés. Fréquence délibérément **inchangée** (1 min, demande
explicite utilisateur — "on reste à 60 sec pour ah live"), 3 optimisations internes
sans changement de comportement/données : (1) `fetchSoldAuctions()` lancé en parallèle
du buffer-upsert au lieu de séquentiellement après, (2) les 2 boucles d'historique
(`price_history_ah_variants`+`price_history_ah_variant_base`) fusionnées en un seul
`Promise.all`, (3) taille de lot d'insert `ah_live` 50→500. Vérifié en prod via
`sync_log` réel : durée moyenne ~22-25s → **13.3s**, `rows_written` inchangé (~6800),
0 erreur. Architecture `ah-collect` (pagination Hypixel, décodage NBT, buffer par
variante exacte avec moyenne glissante, agrégation quotidienne base/blended par
`ah-aggregate`, top 25 flips/catégorie dans `ah_live`) confirmée conforme à la
description de l'utilisateur — en réalité plus efficace que décrit littéralement (la
variante "blended" a déjà été retirée du live le 11 août pour coût, calculée une fois/
jour par `ah-aggregate` à la place, pas un bug).

## ✅ Pluton — architecture 7-tiers de classification, SUPERSÉDÉE par l'architecture v2 ci-dessus, tables supprimées (13 août, remplacée le 17 août)

Classification de toutes les sources référentielles (wiki + NEU-REPO/API) en 7 tables
`pluton_tier_1_starter` → `pluton_tier_7_master`, mêmes bornes networth que
`milestone_tier_totals` (0-5M/5M-50M/50M-150M/150M-500M/500M-1.5B/1.5B-5B/5B+).
Classification en cascade : règle rareté (gratuite) → règle prix réel AH/Bazaar
(gratuite) → jugement Haiku en dernier recours — par page pour le wiki, par table
pour les référentiels NEU-REPO/API.

**État final vérifié en base** : 174 131 lignes classées au total, 0 doublon
croisé entre tiers, 0 valeur nulle, RLS + policies publiques en lecture sur les 7
tables, 2 fonctions helper (`pluton_rarity_to_tier`, `pluton_networth_to_tier`)
avec `search_path` fixé après un avis de sécurité Supabase.

**🔴 Incident réel trouvé et corrigé pendant cette clôture, piège à ne pas
reproduire** : plusieurs routes de debug de classification Haiku par lots,
invoquées via des `curl` répétés avec un timeout client de 280s alors que
`maxDuration=300` côté Vercel, ont chevauché leurs invocations — le client
abandonnait avant que le serveur ait fini, la requête suivante était relancée
pendant que la précédente tournait encore, recalculant le même résidu et tentant
d'insérer les mêmes lignes deux fois. Deux bugs en cascade :
1. Les premiers `insert()` n'avaient pas de `ON CONFLICT` — chaque collision
   remontait comme une erreur Postgres brute (23505) au lieu d'être ignorée,
   des milliers d'erreurs sont apparues dans les logs Supabase.
2. Même après correction en `upsert(ignoreDuplicates)`, une vraie corruption de
   données existait déjà : la contrainte unique de chaque table ne protège que
   PAR TABLE — la même ligne source a pu être classée dans DEUX tiers adjacents
   différents par deux invocations concurrentes (ex : une ligne dans tier_2 ET
   tier_3). **12 319 lignes dupliquées entre tiers** (1817 + 10 502, deux vagues
   de nettoyage, touchant aussi bien le lot de référence que des lots antérieurs
   `wiki_table_extract`/`wiki_haiku_extract` déjà crus terminés proprement)
   trouvées et supprimées via une requête cross-table (`row_number() over
   (partition by source_table, source_row_id order by created_at)`, garde la
   plus ancienne classification, supprime les autres) — 0 doublon restant après.

**Règle retenue pour toute future route de debug chaînant des appels Claude par
polling HTTP répété** : soit utiliser un `curl -m` légèrement SUPÉRIEUR au
`maxDuration` de la route pour ne jamais chevaucher deux invocations, soit
vérifier un vrai statut de fin côté serveur (type `sync_log`) avant de relancer —
et toujours `upsert(ON CONFLICT DO NOTHING/ignoreDuplicates)` plutôt que
`insert()` simple sur toute écriture idempotente candidate à un retry, ET
vérifier l'unicité CROSS-TABLE quand la même donnée source peut atterrir dans
plusieurs tables de destination différentes (l'unicité par table ne suffit pas).

**Prochaine étape actée par l'utilisateur** : lancer B3 (audit de couverture +
triangulation multi-source).

## ✅ Pluton Farming — construit et validé (5 août)

Généralisation demandée après validation de Mining, même rigueur ("n'omet rien,
n'invente rien"). Mécanique différente découverte en route : Farming n'a AUCUNE
stat de vitesse (contrairement à Mining) — après 2 forks soumis à l'utilisateur,
plafond retenu = moteur Minecraft réel (20 blocs/seconde, 20 TPS, donné par
l'utilisateur), appliqué comme débit fixe universel. Plafond Fortune END/LATE
réutilise la section "Theoretical Maximum" du wiki, PUIS corrigé après audit
demandé par l'utilisateur ("as-tu vraiment tout maxé ?") qui a trouvé 1 vrai trou
(Fly Shard, attribut "Fortunate Farmer", +25 Farming Fortune absent du build de
référence) : **+2037.7 Farming Fortune** + 472/484/509 Crop Fortune selon culture.

**3e passe** : l'utilisateur a signalé une méthode manquante (pest farming) — les
Pests sont un revenu ADDITIF à n'importe quelle culture, pas une méthode
concurrente. Bug de données trouvé : `garden_pest_rare_drops` donnait 33% pour le
Slug là où les 13 pages wiki individuelles disent 0.75% — recalculé depuis les
vraies pages, Beetle (Nether Wart) gagne (~76.8K coins/kill).

**4e passe** : l'utilisateur a challengé le chiffre ("le pest farming peut
rapporter 40M+/h, pourquoi si bas ?") — a fait remonter un 2e trou, "Bonus Pest
Chance" (jusqu'à 8 Pests simultanés par spawn au lieu d'1, plafond wiki 551.5 BPC
→ 6.515 Pests/cycle), qui nécessite de swapper Blossom (Farming Fortune) vers
Pesthunter's Set (0 FF mais BPC + cooldown réduit) — arbitrage par comparaison de
totaux, pas un calcul combinatoire complet.

**Résultat final (late)** : Mushroom 21.65M/h, Pumpkin 21.50M/h, Wheat 17.94M/h —
**toujours sous le repère 40M+/h cité par l'utilisateur**, écart non résolu et
documenté (hypothèses non vérifiées : arbitrage Pesthunter plus favorable, ou
"40M+" = un pic plutôt qu'une moyenne). Dépendance cross-activité ouverte : le
Mooshroom Cow Pet peut dépasser Rose Dragon (le pet retenu) si le joueur a >6 762
Strength, mais vérifier ce seuil demande le calculateur Combat/Slayer (pas
construit). **Aucun repère en jeu pour valider les cultures seules**
(contrairement à Mining) — chiffres sourcés/vérifiés mathématiquement, gap
Pest Farming documenté honnêtement. Détail complet dans `PLUTON-ARCHITECTURE.md`
section 3. **Prochaine étape actée** : Foraging, Fishing, Slayer/Combat, Dungeons
restent à construire.

## ✅ Pluton Mining — validé de bout en bout, setup 100% maxé (5 août)

Reprise de Pluton (Bloc 8) : Mining seul d'abord. Architecture
`stat_bonus_sources`/`activity_stat_weights`/`equip_slot_capacity` construite et
validée contre un repère en jeu réel (setup Divan's maxé : Ruby 15-20M/h, Topaz
30M/h, Jasper 60M/h). Résultat final (setup 100% maxé, late/end) : **Ruby
46.2M/h, Topaz 38.6M/h, Jasper 57.2M/h** — Jasper (repère le plus fiable) à
-4.7% de la cible réelle. Détail complet (setup exact, formules sourcées, 3 bugs
de persistance corrigés, gaps restants) dans `PLUTON-ARCHITECTURE.md` section 2.
Point de méthode retenu : le Pickaxe Ability "Mining Speed Boost" doit être
modélisé en moyenne pondérée par temps d'activité réel (durée/cooldown, ×1.556
au niveau max), pas "actif en continu" — une itération précédente always-on (×4)
surestimait de 2-3x, corrigé après écart signalé par l'utilisateur contre son
repère en jeu. **Prochaine étape actée à l'époque** : généraliser aux 5 autres
activités — Farming fait depuis (voir ci-dessus).

## ✅ CLÔTURE FINALE — 2 derniers points fermés, chantier de fondation clos (4 août)

Suite de "CHANTIER FINAL clos" ci-dessous : fermeture des 2 derniers points avant
de considérer tout le chantier de cartographie (wiki + NEU-REPO + SkyHanni-REPO +
collecte totale) vraiment terminé.

1. **`skyblock/garden` — reste bloqué, raison confirmée** : `403 Invalid API key`
   (`HYPIXEL_API_KEY` à nouveau expirée, cycle périodique). `extractBloc7Zones()`
   confirme que `garden_copper`/`garden_greenhouse_crops`/`garden_chips` viennent
   déjà du PROFILE (`member.garden_player_data`), pas de cet endpoint séparé — qui
   tiendrait un état différent (niveau garden, visiteur en file, milestones crop),
   toujours non capturé.
2. **SkyHanni-REPO (Source 4) épuisée** — 52 derniers fichiers criblés, **10
   nouvelles tables** (`garden_composter_items`, `garden_pest_rare_drops`,
   `garden_visitor_requests`, `anita_upgrade_costs`, `rift_effigy_locations`,
   `diana_sphinx_answers`, `mythological_ritual_mobs`, `skyblock_island_metadata`,
   `sea_creature_fishing_xp`, `kuudra_tier_prestige_costs`, `skyblock_bingo_ranks`,
   `dungeon_dance_room_sequence` — 12 en réalité, voir WIKI-MAPPING.md Checkpoint
   29), ajoutées à `skyhanni-repo-sync`. 113 fichiers `constants/` au total, tous
   inspectés — source épuisée. Bug de dédoublonnage trouvé+corrigé en prod
   (`garden_visitor_requests` : "Pest Wrangler"/"Pest Wrangler?" fusionnés avant
   upsert).
3. **Contamination Slayer T4/T5 régénérée et confirmée propre** — lot groupé
   (`money-making-agent`+`setup-generate-agent` filtrés mid/end/late, puis
   `runEvolveSkills` pour Cucumber). **Incident opérationnel** : boucle de
   sondage HTTP (curl, timeout client 280s) a relancé la route de debug avant
   fin d'exécution serveur — 3 exécutions complètes chevauchées au lieu d'une
   (sans risque de corruption, upserts idempotents, mais surcoût API évitable —
   règle retenue : vérifier `sync_log` avant de relancer, jamais un retry sur
   timeout client). Vérifié en base : `claude_analysis.money_making_{mid,end,late}`
   propres, `player_skill_cards` de Cucumber régénérée (`generated_at`
   2026-08-04). 3 lignes `method_setups` orphelines supprimées en SQL. Masquage
   retiré : `SLAYER_BUG_CONTAMINATED_METHOD_IDS`/`SLAYER_BUG_FIX_DEPLOYED_AT`/
   `stale_slayer_data` supprimés de `lib/money-making-constants.ts` et de leurs
   4 consommateurs.

**Signal de clôture** : seuls 2 vrais restes (`npc_locations` Bucket/HTML,
`dungeon_classes` sans source) — gaps honnêtes, pas des blocages. Chantier de
fondation considéré clos.

## ✅ CHANTIER FINAL clos — audit de fermeture (4 août)

Criblage brut du wiki (`game_mechanics_misc`/`game_wiki`, ~6395 pages) terminé,
parcouru en entier une première fois. Derniers lots fermés : `cosmetic_skins`
(497 pages), `fairy_soul_locations` (+19 coordonnées, 3 zones entières),
`skyblock_guide_tasks` (179 lignes, distinct de `milestone_tasks`),
`location_details` enrichie (271→286 lignes, colonne `mobs` neuve, 15 nouveaux
lieux) — 27 checkpoints détaillés dans `WIKI-MAPPING.md`. 2 bugs trouvés+corrigés :
`cosmetic_skins` ratait 18/497 pages (filtre par nom de clé peu fiable),
`cleanLocationCell` fuitait le pipe de `{{Zone|X|Y}}` à 2 arguments.

**Audit de fermeture demandé par l'utilisateur** — chiffres vérifiés en direct :
- **Automatisations** : 18 crons actifs, tous `success` sur leur dernier run réel
  sauf `setup-generate-agent` en `partial` (23/24, échec accepté, pas une
  régression).
- **Base de données** : 189 tables. Zéro-lignes classées : légitimement vides et
  documentées (`skyblock_fire_sales`, `mayors`, `method_feedback`), stubs Phase-0
  jamais nettoyés (`items`/`minions`/`pets`/`rift_items`/`dungeon_data`/
  `fishing_data`/`kuudra_data`/`slayer_data`/`subscription` singulier), reste
  (`claude_insights`/`claude_predictions`/`market_anomalies`/`reddit_signals`/
  `craft_arbitrage`/`bazaar_5min`/`bazaar_aggregates`/`events_calendar`/
  `game_context`/`loot_tables`/`bestiary_milestones`/`player_builds`/
  `vector_indexes`) non creusé — probablement des tables préparées pour une
  feature pas encore branchée.
- **Couverture par système** : Combat/Slayer, Farming, Foraging (+ Heart of the
  Forest), Fishing, Dungeons, Crimson Isle/Kuudra, Enchanting/Alchemy,
  Mining/HOTM/HOTF, Garden, Rift (mapping mécanique complet, données joueur
  bloquées faute de profil engagé), Économie/Événements réseau, cosmétiques,
  lieux, fairy souls, essence, minions, bestiary, musée, donjons, festivals —
  tous mappés avec au moins une table réelle sourcée. Carpentry/Taming/Social
  confirmés cosmétique/faible-enjeu, exclus par décision explicite.

**Gaps honnêtes restants à cette date** (2 fermés depuis par CLÔTURE FINALE
ci-dessus) : `npc_locations` (Bucket/HTML), `dungeon_classes` (source jamais
confirmée), `method_feedback_summary` (vue `SECURITY DEFINER` toujours lisible
par `anon`/`authenticated`, bypass RLS de `method_feedback` — impact nul tant
que la table est vide, voir Prochaines étapes #7), `HYPIXEL_API_KEY` (expiration
périodique ~4-6 jours), `sack_contents`/`weight_formulas` (one-shot par décision
explicite), `location_details` (4 paires "monde miroir" du Rift avec `mobs` non
fusionné, ambiguïté volontairement non résolue — WIKI-MAPPING.md checkpoint 27).

## ✅ Extraction brute wiki — premier lot, player_stats (3 août)

Premier lot de l'extraction brute (7724 pages cachées, 6280 dans un bucket
générique "game_wiki" jamais inspecté). Trouvé : système "Stats" jamais capturé —
16 pages individuelles (Health, Strength, Speed, Defense, True Defense,
Intelligence, Crit Chance, Crit Damage, Attack Speed, Ferocity, Ability Damage,
Mining Speed, Sea Creature Chance, Magic Find, Pet Luck, Mending), chacune un
`{{Infobox/Stat}}` uniforme — fondamental pour un futur calculateur de stats.
Nouvelle table `player_stats` (16 lignes).

**2 bugs de parsing trouvés en vérifiant le résultat réel en prod, corrigés** :
1. `ways_to_increase` — regex s'arrêtait au premier `|` d'un template imbriqué
   (`{{Skill|Enchanting}}`), retournait `null` sur 7/16 pages. Corrigé (capture
   jusqu'à fin de ligne).
2. `content.indexOf('}}', start)` pour la fin de l'infobox s'arrêtait au premier
   `}}` rencontré — presque toujours un template imbriqué DANS l'infobox
   (`{{SkyBlock Level}}`, `{{Skill|Farming}}`...), tronquant l'infobox avant
   `base_value`/`max_value` sur 9/16 pages. Corrigé avec un vrai suivi de
   profondeur d'accolades (`findTemplateEnd`).
3. Attack Speed a un typo wiki réel (`atke_value` au lieu de `base_value`) — géré
   comme fallback documenté.

Vérifié : 16/16 lignes, 0 valeur nulle sur base_value/max_value. Volontairement
pas fait : les tables "Increasing Base/Bonus X" (plus riches, structure
hétérogène par stat). Candidats forts repérés, non traités : "Necromancy/List of
Souls", "Traveling Zoo/Events", "Chocolate Rabbits/List", "Museum/Milestones UI",
"David Hunterborough/UI/Attribute Milestone", "Abiphones/ContactsTable",
"SkyBlock Levels/Tasks", "Crop Fortune/Tabber", "Mutations", "Quests".

## ✅ Correction méthodologique — extraction brute NEU-REPO, 7 tables + 2 automatisées (3 août)

Correction demandée après un biais de catégorisation présupposée (audit
précédent reparti sur un cadre "15 systèmes + Économie"). Méthode reprise sans
liste de référence : 17 fichiers NEU-REPO déjà fetchés mais jamais inspectés,
lus pour leur contenu réel, classés selon ce qu'ils contiennent — jamais par
correspondance de nom. NEU-REPO épuisé : 40/40 fichiers vérifiés par contenu.

**🔴 Bug réel trouvé+corrigé** : `lib/skill-xp.ts`'s `RUNECRAFTING_XP` avait un
index faux (15200 au lieu de 15300, niveau 24) ET 15 niveaux inventés
au-delà du vrai cap (`leveling_caps.runecrafting = 25` dans NEU-REPO, le tableau
en dur allait jusqu'à 40) — violation de la règle "jamais de constante de jeu
reconstituée de mémoire". Consommé par `player/sync`/`player/skills` ; aucune
tâche `milestone_tasks` ne vérifie Runecrafting ; les 2 profils de test réels
ont un XP bien en dessous du point de divergence — bug réel mais dormant,
corrigé avant impact.

**Sources déjà existantes, provenance confirmée+automatisée** :
- `npc_locations` (84 lignes, one-shot 10 juillet) — source réelle : `abiphone.json`
  (match exact). `call_names` (21/84 NPCs) jamais capturé, ajouté.
- `glacite_tunnel_waypoints` (20 lignes, one-shot) — source confirmée
  (`glacite_tunnel_waypoints.json`). Bug trouvé : upsert (au lieu de replaceAll)
  laissait une ligne orpheline par collecteur (24 au lieu de 20) — ancien
  chargement indexait `waypoint_order` à partir de 1, nouveau parseur à partir
  de 0. Aucun code applicatif ne lit cette table (zéro impact), corrigé
  (replaceAll).

**7 nouveaux jeux de données réels, automatisés via neu-sync** : `attribute_shards`
(189)+`attribute_shard_leveling_costs` (5×10) ; `bestiary_mobs` (203)+
`bestiary_brackets` (185) ; `level_bonus_stats` (53) ; `pet_score_magic_find`
(11)+`pet_rarity_value` (6) ; `essence_upgrade_costs` (3580)+
`essence_upgrade_extra_items` (3996, ~528 items) ; `carnival_shop_items` (24) ;
`pet_level_xp_curve` (119)+`pet_rarity_level_offset` (6)+`custom_pet_leveling`
(300, 5 pets spéciaux) ; `bazaar_stock_id_map` (954, backfill
`attribute_shards.bazaar_stock_id`). Confirmé cosmétique/sans valeur mécanique,
pas construit : `dyes.json`/`animatedskulls.json`/`legacyrainbownames.json`,
`calendar.json` (périmé 2024), `resource_pack.json` (vide).

Testé via harness local rejouant le code exact contre les vrais fichiers fetchés
avant tout déploiement. `neu-sync` refactorée en `runNeuSync()` exportée.
Vérifié : run complet 40/40 fichiers, 0 échec. Des 38 tables du backlog initial,
il ne restait plus que `dungeon_classes` (aucune source) et l'enrichissement
optionnel `accessory_powers` côté NEU-REPO/wiki simple.

## ✅ 3 anomalies cron réelles corrigées — trouvées par l'audit de clôture (3 août)

3 crons en prod montraient un statut anormal (`money-making-agent` partial,
`setup-generate-agent` bloqué en `running`, `radar-agent` en erreur 3/4 runs).
Diagnostiqués via logs Vercel réels + inspection directe du schéma Supabase.

**🔴 `money-making-agent` (priorité absolue)** — 2 bugs empilés :
1. `money_making_methods` était une table Phase-0 (`category`/`min_networth`/
   `coins_per_hour_min`/`requirements`/`setup`/`verified`) qui n'a jamais
   correspondu à ce que `saveToLibrary()` écrit (`tier`/`skill`/`coins_min`/
   `calculation`/`confidence`/`status`/`price_snapshot`) — chaque upsert
   échouait silencieusement depuis le début (log Vercel confirmé : `"Could not
   find the 'calculation' column..."`). Table reconstruite (0 ligne, aucune
   perte), contrainte unique corrigée en `(method_id, tier)`, RPC
   `increment_validation_count()` manquante créée (avalée par un try/catch
   silencieux jusque-là).
2. `get_full_context()` (utilisée par money-making-agent, setup-generate-agent
   ET evolve-skills) filtrait encore sur `source='fandom_wiki'` (abandonnée le
   22 juillet) — ~320 lignes périmées lues contre 9859+ vraies pages
   `hypixelskyblock_wiki` silencieusement ignorées. Corrigé : `wiki_kuudra`
   0→33 pages, `wiki_slayers` 7→37.
3. `max_tokens` 4000→16000 : 2 tiers/4 (mid/end) tronquaient en plein JSON,
   laissant `money_making_mid` périmé 7 jours et `money_making_end` **17
   jours** dans `claude_analysis` (table lue par le frontend). Vérifié en
   prod : 4 tiers réussissent, `money_making_methods` 0→24 lignes réelles.

**🔴 `setup-generate-agent` bloqué en `running`** — vrai timeout plateforme
(`"Vercel Runtime Timeout Error: Task timed out after 120 seconds"`), pas un
blocage applicatif. Cause : 4 tiers séquentiels, ~8 batches séquentiels de 3
méthodes, aller-retours DB sériels dans `applyPreciseCost()`. Parallélisé par
tier + `maxDuration` 120→300. Vérifié : run complet ~35s, 23/24 setups générés.

**🟡 `radar-agent` en erreur JSON (3/4 derniers runs)** — `max_tokens: 2000`
insuffisant pour `positive[]`/`negative[]` (~10 entrées chacune), relevé à
8000. Vérifié : JSON valide, 6 positifs + 7 négatifs. (Noté hors scope :
`long_term_pool_size` reste à 0, préexistant, pas creusé.)

## ✅ CHANTIER FINAL — extraction complète + automatisation résiliente (2 août)

Chantier distinct de la cartographie ci-dessous : Volet 1 (compléter données
partielles) + Volet 2 (automatiser tables one-shot), Volet 2 priorisé ("on ne
construit pas plus de contenu tant que ce qu'on a déjà n'est pas sécurisé"). 6
règles strictes (zéro donnée inventée, extraction 100%, `discovery_queue`
active, zéro doublon, cron résilient + `sync_log` par table externe, zéro appel
Claude). Détail dans WIKI-MAPPING.md, section "CHANTIER FINAL — Volet 2".

**État initial** : audit vs `list_tables` a trouvé 48 tables référentielles
chargées une seule fois par migration SQL, jamais reliées à un cron — `neu-sync`
ne couvrait que 4 tables.

**✅ Volet 2 — 9 tables automatisées (2 août)** : cron hebdo **`wiki-referential-
sync`** (lundi 5h45) reparse les pages déjà cachées par `wiki-auto-sync` —
`hotm_forge_durations`, `garden_pests`/`garden_pest_fortune_penalty`,
`time_pocket_upgrades`/`time_pocket_aging_items`/`minion_upgrade_items`,
`sack_tiers`/`trapper_pelt_rarities`/`trapper_pelt_modifiers` (construit d'abord
en 4 crons séparés, fusionnés le même jour — 7 sous-fonctions isolées par
try/catch individuel sous une seule entrée `sync_log`). Plus **`discovery-scan`**
(quotidien) : nouvelle colonne `game_mechanics_misc.created_at` détecte les
pages nouvelles et les logue automatiquement dans `discovery_queue`, zéro Claude.

**Obstacle contourné** : mur SSO Vercel jamais vu (`ssoProtection.enabled:true`)
— contourné en rejouant les parseurs en local (`npx tsx`) contre le vrai contenu
déjà en base. 2 bugs de parsing trouvés+corrigés avant déploiement (fuite de
lignes entre deux wikitables adjacentes, table sautée par erreur d'ancrage).

**🔴 Correction méthodologique (3 août)** — le plan "Groupe A" (15 tables
supposées wiki par proximité de nom) s'est révélé faux : 5/17 tables vérifiées
une par une (`sblevel_tasks`, `dungeon_rng_scores`, `gemstone_slot_costs`,
`island_warps`, `game_zones`) étaient en fait NEU-REPO, contenu sans rapport
avec la page wiki devinée par nom (ex : `dungeon_rng_scores` = poids de drop RNG
par donjon/item, rien à voir avec la page wiki "Dungeon Score"). **Root cause** :
matching par proximité de nom de page, jamais vérifié le contenu réel. **Méthode
corrigée** : toujours vérifier où la donnée EN BASE a été réellement chargée
(contenu, pas nom) avant de décider quel cron doit la couvrir.

**Conséquence** : sur les 38 tables restantes, ~29 se sont avérées NEU-REPO (pas
wiki) — `neu-sync` étendu de 4 à ~29 tables, chaque mapping vérifié ligne à
ligne (détail dans WIKI-MAPPING.md). 2 tables (`george_pet_prices`,
`pet_stat_progression`) découvertes faussement marquées bloquées, corrigées.

**🔴 Bug de données corrigé** : `magical_power_by_rarity` avait Mythic à tort à
20 (vraie valeur 22) et manquait Divine/Special/Very Special/Ultimate — corrigé
par SQL directe, cron de refresh ajouté à `wiki-referential-sync`.

**3 dernières tables du backlog fermées le même jour** : `player_base_stats`
(neu-sync, `misc.json.base_stats`), `forge_recipes` (étend
`syncHotmForgeDurations`, parsing Material Cost du wiki Forge),
`magical_power_by_rarity` (voir ci-dessus).

**✅ `hotm_hotf_powders` fermé (3 août)** — table n'avait que 4 lignes stub. 4
pages sources (Mithril/Gemstone/Glacite Powder + Forest Whispers, 4 devises pas
3 comme supposé) structure hétérogène : Mithril a 2 wikitables (Blocks/Mobs) ;
Forest Whispers en a 2 imbriquées différemment ; Gemstone/Glacite Powder
n'ont AUCUNE wikitable, seulement des listes en prose — capturées telles
quelles (`obtaining_notes`/`gain_boost_notes`). Fait sans Supabase MCP
(déconnecté) : pages fetchées via API MediaWiki brute. 3 bugs de parsing
trouvés+corrigés (`parseRowspanTable` ne gérait pas les cellules jointes
`|A || B`, template `{{Slot|X}}` non nettoyé, lien `[[Cible|Alias]]` affichait
la cible au lieu de l'alias).

**🟡 `npc_locations` — complexité confirmée pire que prévu, reste en
discovery_queue** : chaque page de zone (`NPC/List/<Zone>`, 21 zones) n'a
AUCUNE wikitable dans son wikitext — contenu généré côté serveur par
`{{#invoke:NPC|npcsInLocationTable}}` (`Module:NPC`), store propriétaire
(extension "Bucket", pas Cargo — confirmé). Deux voies futures possibles :
parser le HTML rendu (~400KB/zone) ou scraper chaque page NPC individuellement
— aucune n'est un ajout rapide, diagnostic complet dans `discovery_queue` #25.

**🟡 `accessory_powers`** — pas un gap strict (23 lignes réelles déjà présentes),
enrichissement optionnel (table wiki structurée "Power Stones/List") laissé de
côté, priorité basse.

**🔴 `dungeon_classes`** — aucune source trouvée (contenu a l'air écrit à la
main), aucune correspondance NEU-REPO ni wiki malgré recherche répétée.

Sur les 38 tables initialement supposées wiki, seuls `npc_locations` et
`dungeon_classes` restent de vrais gaps.

## 🚧 Cartographie exhaustive Hypixel Skyblock (31 juillet – 2 août)

Chantier séparé du Bloc 8/Pluton, déclenché par la rigueur exigée sur les
formules HOTM ("on avance trop au coup par coup"). Méthode : cartographier le
jeu depuis ses vraies sources (wiki officiel, NEU-REPO, API Hypixel, projets
communautaires) PUIS comparer la base à cette cartographie. Après une première
passe système-par-système biaisée (vérifiait une liste présupposée plutôt que
de laisser les sources révéler leur structure), méthode corrigée en 5 étapes :
A (découverte brute) → B (regroupement par les sources) → C (comparaison
Supabase) → D (plan de tables) → E (automatisation). Détail complet (15 159
pages wiki, 112 Nav réels, 32 endpoints API, 3 projets communautaires) dans
`WIKI-MAPPING.md`.

**Tier 1 (Économie/Événements réseau, 1er août)** : 5 nouvelles tables —
`discovery_queue`, `skyblock_mayor_election`, `skyblock_news` (9 lignes),
`skyblock_fire_sales` (0 ligne, vide en vrai), `skyblock_bingo_events`+
`skyblock_bingo_goals` (25 goals). Cron `network-events-sync` (`*/15 * * * *`,
4 fonctions groupées). Table `mayors` (colonnes inventées, jamais alignées sur
la vraie API) laissée non touchée, remplacée par `skyblock_mayor_election`.
`sack_contents` (677 lignes) et `rift_guide` (73 lignes) existaient déjà
réellement, marquage 🔴 précédent corrigé en 🟡.

**Tier 2 + 3 (2 août)** : `sack_tiers` (capacités réelles), Trapper (système
neuf : NPC Trevor, monnaie Pelts, `trapper_pelt_rarities`/
`trapper_pelt_modifiers`). Power Stones déjà 100% couvert par
`accessory_powers` — corrigé. Minion Modifiers (58 items) et Time Pocket/Aging
Items restés en `discovery_queue` à ce stade (fermés depuis, voir CHANTIER
FINAL ci-dessus). 10 événements saisonniers confirmés réels (Mining Fiesta
programmée par Mayor Cole, lien avec `skyblock_mayor_election` ; Shen's Auction
= enchère à gagnants multiples, pas de table, fréquence trop faible).

**Source 3 + discovery_queue vidée (2 août)** : Garden Pests chargé (`garden_pests`
15 lignes + `garden_pest_fortune_penalty` 15 lignes, triangulé SkyHanni/
Firmament/hypixel-api-reborn puis recroisé wiki). **Bug de prod trouvé via
discovery_queue #6** : `radar-agent` interrogeait encore l'ancienne table
`mayors` (0 ligne), contexte mayor silencieusement vide injecté dans le prompt
Claude depuis le lancement de Radar — corrigé pour lire
`skyblock_mayor_election`. `discovery_queue` finale : 12 resolved / 1 pending
(`/v2/skyblock/bingo`, bloqué `HYPIXEL_API_KEY`). Point noté : le wiki officiel
`wiki.hypixel.net` a fermé le 21 juillet 2026 — sans impact, projet déjà sur
`hypixelskyblock.minecraft.wiki` depuis le 22 juillet.

**🔴 Bug corrigé — Slayer max tiers Blaze/Spider inversés** : `leveling.json`
(NEU-REPO) donnait Blaze=T4/Spider=T5, l'inverse exact de `GAME_TRUTHS`
(`lib/money-making-constants.ts`, Money Making + Evolve Skills) qui affirmait
Blaze=T5/Spider=T4. Vérifié contre le wiki (page Inferno Demonlord = "Tier IV"
max, page Tarantula Broodfather = "Tier V" avec mécanique exclusive à ce
palier) — les deux sources s'accordent, `GAME_TRUTHS` avait les deux inversés.
Corrigé (+ duplication en dur trouvée dans `setup-generate-agent/route.ts`),
mergé sur master. **Contamination trouvée avant correction, masquée en code
puis régénérée le 4 août** (voir CLÔTURE FINALE plus haut) : 3 lignes
`claude_analysis`/`method_setups` (`spider_t4_slayer` mid, `blaze_t5_slayer_
grind` end, `blaze_t5_slayer_scorched_books_arbitrage` late) + 2 générations
`player_skill_cards` de Cucumber (l'une citait littéralement "T4 Tarantula
(max)").

**✅ `weight_formulas` reconstruite — Senither weight** : `weight.json`
(NEU-REPO) a révélé 2 formules concurrentes (Lily/Senither), aucune en base.
Senither validé par recherche de popularité (consensus forums + SkyCrypt
l'utilise). Table reconstruite (20 lignes) avec la vraie formule Senither
(skills : `(niveau×10)^(0.5+exponent+niveau/100)/1250` + overflow ; slayers :
`min(XP,1M)/divider` + overflow par palier ; donjons : `niveau^4.5×percentage_
modifier` + overflow), sourcée du code Python de `timnoot/senitherweight`.
Trou réel trouvé (pas deviné) : constantes slayer disponibles seulement pour
zombie/spider/wolf/enderman — Blaze et Vampire absents de la source, documenté
comme manquant plutôt qu'inventé.

**Source 2 (wiki officiel) — résumé par système** (détail complet dans
WIKI-MAPPING.md) : taxonomie de 681 catégories wiki confirmée, ~432 gameplay
réelles après filtrage. Faits marquants par système :
- **Combat/Slayer** : fix T4/T5 reconfirmé 5x indépendamment. Mécanique jamais
  mappée : Healing au kill d'un boss Slayer (ajoutée il y a 13 jours,
  2026-07-20). Chaîne de déblocage des 6 Slayers jamais vérifiée avant
  (Zombie→Spider via T2 Revenant→Wolf via T2 Tarantula→Enderman via T4 Sven→
  Blaze via T3 Voidgloom, Vampire séparé) — signal qu'Evolve Skills pourrait ne
  vérifier que l'accès zone (pas corrigé, hors scope).
- **Farming** : formule Crop Fortune jamais sourcée (1 point = 1% chance de
  +100% drops, garanti tous les 100 points). Cap Farming peut dépasser 60 via
  médailles Gold Jacob's Contest (+1/crop doré).
- **Foraging** : Heart of the Forest cartographié en entier (8 tiers/36 perks,
  0%→couvert). **Root cause du bug de formule HOTM du Bloc 8 identifiée** : le
  perk Sweep de HotF utilise `floor((NextLevel+1)^3)`, reproduit exactement le
  même total (1 758 267) que le nœud Mining Speed de HOTM — confirme que
  Pluton utilisait la mauvaise formule/indexation à l'époque.
- **Fishing** : Sea Creature Chance jamais sourcée (base 20%, cap 100%, **÷4
  sur Private Island/Garden**). Treasure Fishing : 89%/10%/1% (good/great/
  outstanding).
- **Dungeons** : formule complète de Dungeon Score trouvée (Skill+Explore+
  Speed+Bonus, 6 rangs D→S+, seuils 0/100/160/230/269.5/300) — répond au trou
  d'origine `dungeon_rng_scores`. Dungeonizing : +485% de stats multiplicatif
  max.
- **Crimson Isle/Kuudra** : 5 tiers, seuils de réputation faction (1000/3000/
  7000/12000). Boss fight à 5 phases (Crates→Ballista→Fuel→Stomach→Lair).
- **Enchanting/Alchemy** : XP Enchanting `3.5×X^1.5`, plafond 500k/jour.
  🟡 Alchemy plafonne à 50, pas 60 (contrairement à Combat/Farming/Enchanting).
- **Rift** : mapping mécanique fait, données joueur réelles bloquées (aucun
  profil de test engagé).
- **Carpentry/Taming/Social** : Carpentry cosmétique-only, plafonne aussi à 50
  (2e skill après Alchemy). Taming a le même pattern de cap extensible que
  Farming/Jacob's (pets donnés à George).

**Couverture honnête au moment de la correction méthodologique** : localisation
des sources ~80-90%, identification des systèmes ~70-75%, contenu réellement
lu ~3-5%, validation live ~0% — 15-25% honnête au global à ce moment-là (les
chantiers suivants ont fait progresser ce chiffre, voir sections plus haut).

## Blocs 1-7 (plan d'audit 8 blocs) — archivés (voir CLAUDE-archive.md)

Pipeline prix de vente AH (Bloc 1) → observability sync_log (Bloc 2) → scoring
AH (Bloc 3) → Milestones 69 tâches (Bloc 4) → Radar multi-timeframe (Bloc 5) →
item_owned Milestones (Bloc 6) → zones joueur (Bloc 7). Bloc 8 = Pluton
(sections ci-dessus).

## ✅ computeMilestones() étendu — 15 nouveaux requirement_type, zéro coût Claude (30 juillet)

Milestones avait déjà l'architecture (7 tiers) mais `computeMilestones()` ne
savait vérifier que `skill`/`collection`/`fairy_souls`. Branché en 3 lots
(JS pur sur données déjà en base, zéro appel Claude) :
- **Lot 1** : `boss_kill`, `bank_tier`, `fast_travel_count`, `essence_amount`,
  `minion_count`, `bestiary_milestone`.
- **Lot 2** : `slayer_claimed_level`, `slayer_tier_kills`, `jacob_contest_
  participation`, `jacob_medal_count`, `festival_participation`.
- **Lot 3** : `dungeon_floor_played`, `chocolate_factory_amount`, `auction_
  activity`, `fishing_activity`.

4 tâches vault placeholder flippées de `uncollected` vers un vrai type
computable ("Unlock Fast Travel Zones" → `fast_travel_count`, "Crimson Essence
Shop" → `essence_amount`, "Participate in Spooky Festival" → `festival_
participation`, "Participate in Jacob's Farming Contest" → `jacob_contest_
participation`). Vérifié après chaque lot sur Cucumber ET Orange (profil vide
reste à 0 partout, même garde-fou early-game).

**Reste hors scope** : tâches `uncollected` sans donnée collectée (Mining
Fiesta, Fishing Festival, Mythological Ritual) ou sans seuil cible vérifié
(les 3 "Activity") — pas de seuil inventé. Tâches `mobtype` (5 lignes,
catégories Bestiary larges) non calculables — nécessiteraient une table
mob→catégorie pas encore construite.

## ✅ Unification taxonomie tiers — progression_tiers fusionnée dans milestone_tier_totals (29 juillet)

`progression_tiers` (Phase 1) et les 7 tiers de Milestones utilisaient déjà
exactement les mêmes libellés (Starter→Master, vérifié caractère pour
caractère) et `progression_tiers` n'était consommée par aucun code applicatif
(grep confirmé) — supprimée, `milestone_tier_totals` devient la table unique
des 7 tiers (+colonnes `tier_order`/`networth_min`/`networth_max`/
`purse_reference`/`money_making_tier_key`/`calibration_note`, données migrées
par jointure sur `tier=label`). Vérifié après migration : 7 lignes intactes,
`tier_order` 1→7 correct, pont `TIER_CONFIG` de Money Making toujours
fonctionnel.

## ✅ Audit hypixel-api-reborn — 6 nouvelles zones collectées (29 juillet)

Nouvelle méthode d'audit : trouver une vraie source de référence documentant la
structure exhaustive d'un profil Skyblock plutôt que d'inspecter un seul
profil de test. `hypixel-api-reborn` (lib TS, ~150 fichiers de types) comme
référence, recoupée avec le code source de SkyCrypt sur un point (minions).

**🔴 Bug confirmé et non corrigé** (documenté, à faire) : `rift_motes` lit
`currencies.motes.current`, alors que le vrai champ Hypixel est
`currencies.motes_purse` (nombre plat, pas objet imbriqué) — les deux chemins
renvoient 0 par coïncidence sur Cucumber (elle n'a ni l'un ni l'autre), jamais
détecté. Pour tout joueur ayant réellement des Motes, retournerait
silencieusement 0. Fix trivial (`member.currencies?.motes_purse ?? 0`) à faire
dès que la Phase Rift sera retouchée.

**6 zones réelles trouvées et collectées** (toutes vérifiées en direct sur
Cucumber, zéro coût Claude) :
- **Donjons — détail par étage** (`dungeon_secrets`, `dungeon_unlocked_journals`,
  `catacombs_floors`, `master_catacombs_floors`) — étage 0-7 avec `times_played`/
  `best_score`/`mobs_killed`/`watcher_kills`/`fastest_time_ms`/`fastest_time_s_ms`/
  `fastest_time_s_plus_ms`.
- **Slayer — claimed_levels + détail par tier** (`slayer_detail`, additif) —
  `boss_kills_tier_0..4`/`boss_attempts_tier_0..4` (l'ancien mapping ne stockait
  que la somme).
- **Jacob's Farming Contests** (`jacob_medals`, `jacob_perks`, `jacob_unique_
  brackets`, `jacob_personal_bests`, `jacob_contests`).
- **Chocolate Factory** (`chocolate_factory`) — repéré au Long tail mais écarté
  à tort comme hors-scope, en fait un vrai système de progression complet.
- **Auctions** (`auction_stats`) — bids/won/gold dépensé-gagné/vendu-acheté par
  rareté.
- **Fishing** (`fishing_stats`) — `sea_creature_kills` + `items_fished`.

## ✅ Chantier collecte totale — Phase 2 complète : 8 zones mergées sur master (29 juillet)

Boss kills → Banque/Fast Travel → Essence → Minions → Bestiary → Rift → Long
tail, chacune testée en direct sur Cucumber (jamais devinée), mergées via
`feat/collecte-totale-boss-kills` puis `feat/collecte-totale-bank-fasttravel`
(2 conflits texte résolus par concaténation). Zéro coût API Claude sur tout le
chantier.

**Boss kills** (`player_data.boss_kills`) — `member.nether_island_player_data.
kuudra_completed_tiers` est un objet PLAT mélangeant nom de tier (=complétions)
et `highest_wave_<tier>` (=meilleure vague), séparés en `completed_tiers`/
`highest_wave`. Arachne : `objectives.defeat_arachne_keeper.status===
'COMPLETE'`. Ender Dragon : `player_stats.end_island.dragon_fight.fastest_kill`
n'a pas de compteur réel, seulement un meilleur temps par variante — clé
`"best"` (record toutes variantes) exclue explicitement pour ne pas gonfler
`killed_types`.

**Fiable, prêt à consommer** : Boss kills, **Banque+Fast Travel** (`bank_tier`,
`fast_travel_zones` — 152 zones réelles), **Essence** (8 boutiques réelles),
**Minions** (`crafted_generators`, par-membre pas partagé coop), **Bestiary**
(`bestiary_kills`, 252 compteurs).

**Partiel/honnêtement incomplet** : **Rift** (`rift_motes` seul mappé, les 11
sous-systèmes réels tous vides sur le profil de test, forme non vérifiée) ;
**Festivals** (`festival_candy`, seul Spooky Festival a de la donnée réelle) ;
**Dojo** (seul le statut de quête d'unlock mappé) ; **"Community shop"**
(`community_upgrades` = Community Center, terme le plus proche) ; **Harp**
(`harp_songs`, structure confirmée mais vide chez Cucumber).

**Non mappé, noté pour ne pas être redécouvert** : `bestiary.deaths`,
`member.attributes.stacks.*_essence` (fusion Attribute Shards, distinct de la
monnaie Essence), `member.player_data.visited_modes`, objectifs warp
individuels.

## ✅ Phase 1 — base de connaissances jeu partagée (activity_gear_categories + progression_tiers) (29 juillet)

Deux tables : **`activity_gear_categories`** — promeut `SKILL_GEAR_CATEGORIES`
(le fix du bug Ragnarok Axe) en vraie table partagée
(`lib/activity-gear.ts`/`lib/gear-pricing.ts`), Evolve Skills ET Money Making
(`setup-generate-agent`) lisent maintenant la même table. **`progression_
tiers`** — depuis supprimée/fusionnée (voir "Unification taxonomie tiers"
ci-dessus).

**3 bugs trouvés en testant** :
1. `parseJSON` (evolve-skills) ne récupérait pas quand Claude préfixait sa
   réponse de prose — fallback ajouté (découpe premier `{` au dernier `}`).
2. `max_tokens` 16000→24000 (profil riche en gear tronquait le JSON).
3. `loadActivityGearCategories` loggait un échec de requête en carte vide
   silencieusement — `gear_name` retombait à `null` partout sans signal.

**Vérifié** : Orange (vide) 0 violation sur ses 2 items ; Cucumber (le plus
chargé) run complet réussi, 4 items `target.gear_name` vérifiés, 0 violation,
`current.armor_set_used` varie bien par carte ; 3/3 échantillon Money Making
Haiku réussi, 0 violation détectée.

## ✅ Evolve Skills — SkillBar + SkillProgressOverlay, current = setup optimal possédé (29 juillet)

Remplace les panneaux plats `SkillCard` des 8 skills non-Slayer par une barre
XP (`SkillBar.tsx`) ouvrant un overlay 2 colonnes (`SkillProgressOverlay.tsx`) —
gauche : vrai setup actuel via `SkinArmorRender`/`SetupCharacterPanel.tsx` ;
droite : gear cible de Claude. Accordéon 6 boss Slayer reste sur l'ancien
`SkillCard` (chantier séparé).

**2 bugs trouvés en testant** :
1. `current` affichait l'équipement littéralement porté (set Foraging sur la
   carte Farming) — `lib/skill-setup-adapter.ts` réécrit pour scanner tout
   l'équipement possédé (équipé + inventaire + ender chest + backpacks +
   Personal Vault + wardrobe), choisi par Claude via `armor_set_used`.
2. `target` pouvait nommer un item réel dans la mauvaise catégorie
   fonctionnelle (épée de combat recommandée en outil Foraging car nom
   contient "Axe") — catalogue filtré par catégorie (`SKILL_GEAR_CATEGORIES`)
   + vérification serveur `verifyGearName`.

Bug latent trouvé au passage : ancien code lisait `stars` (n'existe pas,
vrai champ `total_stars`) mettant `armor_stars` à 0 silencieusement ; glyphe
Unicode Private Use Area dans les noms d'items cassait les lookups par nom
exact. Validé sur Cucumber/Orange : `current` varie correctement par skill,
`target.gear_name` ne contamine jamais une autre activité.

## 🔴 Régression prod critique + résilience skin — corrigées (28 juillet)

**Signalé par l'utilisateur** : cliquer sur un setup Money Making plantait
toute la page en prod. **Root cause** : `useLoader(THREE.TextureLoader,
skinUrl)` lève une exception non capturée par `Suspense` — ce projet n'avait
zéro Error Boundary React, une erreur non capturée démonte tout l'arbre React.
**Déclencheur confirmé** : `crafatar.com` retournait un vrai `521` au moment
du test — l'ancienne version CSS (`background-image`) dégradait silencieusement,
la migration WebGL a supprimé cette dégradation gracieuse.

**Fix** : `SceneErrorBoundary` (classe React) enveloppe le `Canvas` — panne 3D
dégrade vers un placeholder texte. **Résilience complète** : `/api/player/status`
résout aussi `mojang_skin_url` via `sessionserver.mojang.com` (2e source live,
CORS permissif confirmé) — `SkinArmorRender` essaie `[crafatar, mojang-direct]`
en séquence via `useResilientTexture()` (remplace `useLoader()`). Dernier
recours : `public/images/skin-placeholder.svg` (asset statique généré, pas une
copie Mojang). Vérifié avant merge : résolution Mojang testée en direct
(~2.1s), build Vercel `READY`.

## ✅ SkinArmorRender migré de CSS 3D vers three.js/@react-three/fiber (28 juillet)

**Pourquoi** : `filter:drop-shadow`/`backdrop-filter` sur les calques
ancêtres et `ArmorLayer` sans `preserve-3d` aplatissaient silencieusement la
scène CSS 3D — 3 symptômes du même problème de fond (piège documenté dans la
spec CSS elle-même). Migration vers three.js pour éliminer cette classe de bug
structurellement. Toute la donnée métier déjà validée reste inchangée
(`BODY_PARTS`, `inflate`, couleurs réelles, contenu tooltips) — seule la
couche de rendu change, transform CSS→three.js vérifié deux fois
indépendamment (même négation, normales sortantes correctes pour les 6 faces).

**Éclairage** : `DirectionalLight`+`MeshStandardMaterial` calcule l'ombrage
depuis la géométrie réelle (remplace 6 `brightness()` réglés à la main),
appliqué skin+armure de façon cohérente. **Interaction** : événements pointeur
natifs R3F (raycasting) remplacent `mouseenter`/`mouseleave` DOM.

**Nouvelles dépendances** : `three`, `@react-three/fiber`, `@types/three`
(pas de `drei`). Vérifié avant merge : build Vercel `READY`, Artifact de
preuve autonome (bug trouvé et corrigé dans l'Artifact lui-même : import
relatif `three.core.min.js` ne résolvait pas contre une URL `blob:`, sans
rapport avec le composant livré), confirmé visuellement par l'utilisateur.
Point de repère vérifié comme comportement attendu (pas un bug) : un set
d'armure complet enveloppe géométriquement 100% du skin — pas de concept de
couverture partielle côté données (Money Making génère toujours un
`armor_set` atomique 4 pièces).

## ✅ Money Making — SetupOverlay en prod : 3 colonnes, couleurs d'armure réelles, tooltips riches (28 juillet)

**Couleur cuir réelle par pièce** — NEU-REPO `items/` (jamais fetché par
neu-sync) contient la vraie couleur de teinture Hypixel (`nbttag.display:
{color:NNNNN}`) par `LEATHER_*`, confirmée contre une valeur déjà documentée
(Necron's Chestplate : `15155516` = `#E7413C`, match exact). Échantillonnage
des 649 fichiers d'armure : 62% leather avec couleur, 19% tête de joueur
reskinnée, 17% autre matériau (zéro donnée couleur). Cron hebdo `armor-color-
sync` (lundi 5h30), nouvelle colonne `item_stats.default_color`, retombe sur
placeholder vanilla (`#A06540`) si `null`.

**Layout loadout 3 colonnes** (LEFT stats/CENTER personnage 3D/reste en bas),
nouveau `GearSlot` (tooltip riche coloré par vraie rareté). **Bug de rendu
plat trouvé en 3 couches empilées** (chaque fix nécessaire mais pas
suffisant) : `filter:drop-shadow` sur le panneau modal (corrigé en
`box-shadow`) → `backdrop-filter` sur le calque de flou extérieur (sorti sur
un `<div>` frère) → `ArmorLayer` sans `preserve-3d` sur lui-même (vrai
dernier bug, invisible tant que le personnage est en armure complète).
**Leçon retenue** : un artifact de preuve isolé ne valide qu'UNE hypothèse à
la fois — seule la vérification contre le composant réel intégré a fini par
attraper les 3 bugs.

**Tooltips riches par pièce au survol** (casque/plastron/bras/jambes/bottes),
état du skin distingué (`'loading'|'linked'|'unlinked'|'error'`).
Explicitement pas inclus : vraie texture Minecraft cuir/armure (question
légale sur l'asset externe non tranchée) — les couleurs mergées ici sont des
valeurs RGB Hypixel elles-mêmes, dissociées de cette question.

## ✅ Audit complet architecture cible + 4 correctifs mergés (28 juillet)

**🔴 `ah_live` vide à chaque run** (urgence, corrigée avant l'audit lui-même) —
2 bugs empilés : (1) requête ciblait encore `price_history_ah` filtré
`granularity='DAILY_EXACT'`, alors que `ah-aggregate` avait migré le
per-variante exact vers `price_history_ah_variants` — un consommateur oublié
lors du renommage. (2) `.in('base_item_id', ...)` avec 2300+ valeurs
dépassait silencieusement la limite d'URL PostgREST, erreur jamais vérifiée.
Batché par 200 + logging réel. Vérifié : `ah_live` 0→300 lignes cohérentes.

**🔴 Même famille de bug dans Radar** — `RadarSection.tsx` interrogeait aussi
`price_history_ah.variant_key`, qui ne contient plus que le placeholder
blended. Corrigé vers `price_history_ah_variants`. Vérifié sur HYPERION : 108
vraies variantes distinctes (contre 1 placeholder avant).

**🟡 `evolve-skills`** — audité comme "cron manquant", en fait retrait
volontaire (23 juillet) pour respecter l'interdiction Hypixel de polling
continu — appel synchrone par-profil depuis `player/sync` après un sync
réellement demandé. Pas rajouté au cron.

**✅ Free — tier réel, 5 tabs verrouillés ajoutés** : `TABS` n'avait aucune
entrée `free` alors que l'infra dégradée existait déjà
(`ah_live_free_preview`/`bazaar_1h_free_preview`, filtres de contenu du 23
juillet). Patch Analysis : juste ajouté `'free'` à `TABS` (composant déjà
défensif). Flash Alerts : nouveau composant `FreeFlashPreview.tsx` (les vues
preview sont trop pauvres pour réutiliser les cartes payantes existantes).
Vérifié : RLS intacte (`ah_live`/`bazaar_1h` toujours bloquées pour anon).

**✅ Radar — count réel** : libellés codés en dur (`"4781 ITEMS"` etc.)
remplacés par des comptes réels dérivés du catalogue déjà chargé +
`count:'exact', head:true` sur `price_history_ah_variants`. Piège trouvé :
cette table est gated par `has_plan()` — un client anon SANS session y voit
toujours 0, corrigé en testant avec un vrai compte connecté. Revalidé :
`"65.2K variant price points tracked"`, `"1475 Bazaar · 3738 AH"`, `"5213
ITEMS"`.

**✅ Patch Analysis — dimension mécanique/gameplay ajoutée** : prompt
100% économique élargi à `mechanics_impact`/`gameplay_changes` (2 nouvelles
colonnes `insight_patch`), instruit de ne jamais forcer un angle gameplay non
pertinent. Validé sur 2 runs réels (Berserk revert, Lotus Atoll gating) +
garde-fou "ne pas forcer" confirmé (2 patches économiques ont bien
`mechanics_impact: null`). Gating revérifié (Free exclu, Alert+ inclus).

**Trouvé, non lié, pas touché** : `insight_patch.gameplay_impact` (colonne
orpheline, `null` partout, zéro référence) — dans la liste de nettoyage,
pas fusionnée pour éviter une migration supplémentaire à un chantier déjà
validé. **Reste à faire** : `debug-boss-kills` mal placé dans
`app/api/cron/`, `refresh-variant-stats`/`backfill-variant-stats` à évaluer
(probables reliquats legacy).

## ✅ Gear précis+justifié, pricing par variante exacte, rareté réelle (28 juillet)

Au lieu d'un nom de set générique, Vault définit une spec PRÉCISE
(étoiles/reforge/hot potato/ultimate enchant) recréable, coût calculé sur
cette spec exacte. `armor_reforge`/`weapon_reforge` copiés verbatim depuis la
vraie liste REFORGES ; `ultimate_enchant` doit être un vrai ID ou `null` ;
nouveau champ `gear_justification`.

**Coût par variante réelle — cascade à 3 paliers** (via `buildVariantKeys`,
jamais réimplémentée en parallèle) : (1) `price_history_ah_variants` match
exact spec complète ; (2) `price_history_ah_variant_base` match exact sans
reforge ; (3) **palier "broad"** nouveau — LIKE sur préfixe étoiles+recomb
seul, moyenne pondérée par `data_points`. Nécessaire car les vrais
exemplaires AH portent quasi toujours un ultimate enchant signature même
quand la spec l'omet — validé sur `INFERNAL_CRIMSON_HELMET` : palier 3 trouve
894 313 653 (`precision:"broad"`), pas un fallback blended déguisé.

**Bug réel trouvé+corrigé** : le matcher `armor_set` (règle "≥2 mots
restants" ajoutée pour éviter les faux positifs type "Crimson Helmet")
rejetait aussi les vrais sets à un seul mot distinctif ("Sorrow Armor" → 0
pièce matchée). Remplacé par un concours de spécificité par catégorie de
pièce (`bestArmorPiecesForSet`) — corrige les deux problèmes avec le même
mécanisme.

**Rareté réelle** — `item.tier` déjà dans `/v2/resources/skyblock/items`
mais jamais mappé, nouvelle colonne `item_stats.rarity`. **`GearSlot`** —
arme/outil/canne en case cliquable avec tooltip NBT (rareté/étoiles/stats/
enchants/reforge). **Apparence** : toute armure Skyblock est soit cuir teinté
soit tête reskinnée (aucune texture de base unique côté serveur, vérifié) —
couleur cuir vanilla par défaut en attendant un vrai pack de texture Vault
(chantier futur, pas commencé). Testé end-to-end sur preview, plusieurs
passes de correction guidées par de vrais bugs (0 exact variants → fallback
"broad" ajouté → revalidé).

## ✅ Skin + armure réels dans SetupOverlay — première version CSS 3D (28 juillet)

Remplace la grille d'inventaire emoji par le vrai skin Minecraft rendu en
cuboïdes CSS 3D (`components/SkinArmorRender.tsx`, `lib/skin-uv-map.ts`,
format UV public non-Mojang). Proportions vérifiées contre le vrai modèle
Mojang après plusieurs passes : `perspective` CSS (vrai point de fuite)
retiré (une vue isométrique n'a pas de point de fuite) ; géométrie d'armure
corrigée (casque+plastron+bottes = couche "outer" inflate 1.0, legging =
"inner" inflate 0.5, toujours invisible sous plastron+bottes — vrai en jeu
aussi). Item tenu en main abandonné après 2 passes ratées (pas d'outil pour
vérifier visuellement) — stats affichées en texte à la place. Migré vers
three.js le même jour (voir section dédiée plus haut) suite aux bugs
d'aplatissement CSS découverts juste après.

## ✅ setup-generate-agent — grounding sur données réelles (28 juillet)

Bug concret signalé : suggérait du Mithril Armor pour du gemstone mining
late-game au lieu de Divan's. **Catalogue de gear réel, prix réel**
(`loadPricedItems`/`gearCatalogForBudget`) — jointure `item_stats`+dernier
prix `price_history_ah`, filtrée par bande de budget réelle du tier — corrige
le bug structurellement (le prix réel du Mithril tombe sous le plancher
LATE, il n'apparaît plus dans le catalogue).

**Bug trouvé en testant** : `item_stats.health/defense/...` est réellement à
0 en base pour la plupart des items endgame (stats venant des étoiles/reforge/
génération, pas de colonnes plates) — catalogue simplifié à
item_id/nom/catégorie/prix uniquement, trié par prix.

**Coût calculé en code, jamais par Claude** — testé 2 fois : même avec une
règle de prompt explicite, Haiku sort un chiffre habituel proche de
`coins_display` au lieu de sommer le catalogue réel (ex: "95-110M" au lieu de
1,86Md pour Divan's Drill seul). `computeRealCost`/`applyRealCost`
post-traite : matche `armor_set`/`weapon_name`/`tool`/`rod` contre le
catalogue, écrase `cost_budget`/`cost_optimal`/`cost_endgame`.

**Bug réel dans le matcher lui-même** : la 1ère version matchait par
sous-chaîne après avoir retiré "le dernier mot" — un mot générique partagé
("Crimson", "Magma") suffisait à matcher un item complètement différent
("Infernal Crimson Armor" matchait à tort "Crimson Helmet" T1 Kuudra en plus
du bon T5 Infernal Crimson Helmet). Corrigé avec `matchesArmorSet` (vraie
`category` de l'item, ≥2 mots restants) et `matchesExact` (mots entiers,
jamais une sous-chaîne). Revalidé : faux positifs 14-19→exactement 6 items
matchés, ~4,8B cohérent avec le catalogue.

**Preuve concrète (LATE, Gemstone Mining)** : `armor_set:"Infernal Crimson
Armor"`, `weapon_name:"Hyperion"`, `tool:"Divan's Drill + ..."`,
`cost_optimal:"~4.8B"` (6 items matchés, somme exacte). `pet_name`/
`gemstones` restent ancrés wiki-only (pas de table de prix dédiée à joindre).

## ✅ Sécurité compte/facturation — audit complet + failles corrigées (22 juillet)

Audit de sécurité exhaustif avant tests utilisateurs. **🔴 Chaîne d'attaque
complète trouvée+corrigée** :
- `subscriptions` avait une policy RLS `USING (true)` — lecture publique
  totale (`email`/`stripe_customer_id`/`plan`/`status`...) via clé anon.
  Corrigé : scopée `email = auth.email()`, `TO authenticated`.
- `/api/get-email-by-username` (zéro auth, zéro rate-limit) — oracle
  d'énumération complet. Supprimée entièrement, login refait côté serveur.
- `/api/update-username`, `/api/cancel-subscription`, `/api/subscription`
  prenaient un `email` en paramètre client sans vérifier la session —
  n'importe qui pouvait renommer/résilier le compte de quelqu'un d'autre.
  Corrigé : les 3 routes utilisent `auth.getUser()` via un client Supabase
  serveur lié aux cookies (nouveau `lib/supabase-server.ts`), ignorent tout
  email client.

`/api/login` (nouvelle route) résout le username en interne, ne renvoie
jamais l'email au client, pose la session via cookies. Erreur générique
"Invalid credentials" (corrige un 2e oracle qui distinguait username inconnu
vs mot de passe faux).

**Suite corrigée le même jour** : `player_missions`/`player_progress`
verrouillées (RLS service-role uniquement, mêmes policies publiques que
`subscriptions` trouvées). 4 routes `player/*` exigent une vraie session
Vault. **Flux de liaison Vault↔Hypixel construit** : `hypixel_account_links`
(1er arrivant 1er servi — assumé, le vrai risque était le spam d'écriture,
pas la fuite de données déjà publiques via l'API Hypixel), route
`POST /api/link-hypixel-account`. Testé end-to-end sur comptes jetables
(créés/supprimés) : login email+username, 3 routes corrigées (session réelle
OK, sans session 401, email injecté ignoré), liaison Hypixel + rejets 400/409.

**🟡 Toujours pas corrigé** : `method_feedback_summary` (vue `SECURITY
DEFINER`) bypasse le RLS de `method_feedback`, impact nul tant que la table
est vide (voir Prochaines étapes #7).

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
