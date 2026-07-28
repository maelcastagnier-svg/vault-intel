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

## ✅ Audit complet architecture cible + 4 correctifs mergés en prod (28 juillet)

Audit demandé point par point contre l'architecture produit cible (dashboard 4 tiers, 
Flash Alerts, Money Making, Patch Analysis, Radar, Evolve, pipeline de collecte) — chaque 
point vérifié dans le code/DB réel, jamais depuis la mémoire de CLAUDE.md. Deux agents 
Explore dépêchés en parallèle pour Patch Analysis/Radar/Evolve/Money Making (comptes de 
méthodes, bouton Rate) pendant que les points nécessitant un accès DB direct étaient 
vérifiés via des routes de debug temporaires, même méthode que d'habitude.

**🔴 Urgence trouvée en premier et corrigée avant l'audit lui-même — `ah_live` vide à 
chaque run, deux vrais bugs empilés** : le buffer (`ah_scan_buffer`) se remplissait 
normalement chaque minute (cron actif, endpoint Hypixel sain, aucun lock bloqué), mais 
la comparaison "buffer vs historique réel" pour trouver les flips sous-évalués ne trouvait 
jamais rien.
1. La requête ciblait encore `price_history_ah` filtré sur `granularity='DAILY_EXACT'` — 
   or `ah-aggregate` (reconstruit plus tôt cette semaine) n'écrit plus jamais cette 
   combinaison dans cette table (le per-variante exact a migré vers 
   `price_history_ah_variants`, `price_history_ah` ne reçoit plus que `DAILY` blended). 
   Un consommateur de l'ancien schéma oublié lors de la passe de renommage (seuls 
   `item-history/route.ts` et `RadarSection.tsx` avaient été vérifiés à l'époque).
2. Une fois requêté sur la bonne table, toujours 0 résultat : un seul `.in('base_item_id', 
   ...)` avec 2300+ valeurs dépassait silencieusement la limite de longueur d'URL de 
   PostgREST (requête GET), et l'erreur n'était jamais vérifiée — `historical` retombait 
   à vide sans throw ni log. Batché par 200 avec logging d'erreur réel.

Vérifié en direct avant merge (`runAhCollect()` extrait en fonction plain, même pattern 
que `runAhAggregate()`, appelée directement par une route de debug) : `ah_live` passé de 
0 à 300 lignes réelles et cohérentes (Crown of Avarice, variantes Hyperion, Necron's 
Helmet, avec discount/profit réels). Mergé sur master via une branche hotfix dédiée 
(`hotfix/ah-collect-empty-live`), isolée du reste du travail preview en cours.

**🔴 Même famille de bug trouvée indépendamment dans Radar pendant l'audit** — 
`RadarSection.tsx` interrogeait aussi `price_history_ah.variant_key` pour lister/tracer les 
variantes NBT d'un item, alors que cette colonne ne contient plus que le placeholder 
blended (`__all_variants_blended__`) depuis la même refonte. Corrigé (branche 
`fix/evolve-skills-cron-and-radar-variants`, mergée) : la liste de variantes et la série 
par variante précise pointent maintenant vers `price_history_ah_variants` (le général/
blended reste sur `price_history_ah`, toujours correct pour ce cas). Vérifié en direct sur 
HYPERION : 108 vraies variantes distinctes remontent désormais (étoiles/reforge/ultimate 
enchant/gemmes/Art of War réels), contre une seule (le placeholder) avant.

**🟡 `evolve-skills` — audité comme "cron manquant dans vercel.json", en fait un choix 
volontaire de conformité API Hypixel** : proposé dans un premier temps de le rajouter au 
planning cron, mais son propre commentaire d'en-tête documente qu'il a été retiré de 
`vercel.json` le 23 juillet précisément pour respecter l'interdiction Hypixel de polling 
périodique continu des données joueur. Remplacé par un appel synchrone par-profil depuis 
`app/api/player/sync/route.ts` juste après un sync réellement demandé par le joueur — 
confirmé réel et fonctionnel (`runEvolveSkills([profile.profile_id])`, jamais sur 
l'ensemble des profils, jamais sur un timer). **Pas rajouté au cron** — l'aurait 
recassé exactement ce que ce retrait avait corrigé.

**✅ Free — tier réel, plus 5 tabs verrouillés** : Free était annoncé comme un vrai palier 
mais n'avait aucun accès réel — `TABS` (`app/dashboard/page.tsx`) n'avait aucune entrée 
`free` sur les 5 tabs, alors que le backend avait déjà l'infra dégradée prête et jamais 
utilisée (`ah_live_free_preview`/`bazaar_1h_free_preview`, `filterPatchAnalysisContent`/
`filterPatchInsight`, tout ça du chantier gating du 23 juillet). Patch Analysis n'a demandé 
aucun changement de composant : `PatchSection.tsx` protège déjà chaque champ 
défensivement (`a()`/`s()`, longueur vérifiée avant de rendre une section), donc la 
dégradation serveur existante (titre + 1 phrase d'impact, Live seulement) s'affiche 
correctement dès que le tab est atteignable — juste ajouté `'free'` à son entrée `TABS`. 
Flash Alerts a demandé un vrai nouveau chemin : les vues de preview se sont révélées bien 
plus pauvres que prévu (`ah_live_free_preview` n'a que `item_name`/`category`/
`discount_pct` — aucun prix, aucun UUID d'enchère ; `bazaar_1h_free_preview` n'a pas de nom 
d'item) — forcer ça dans les cartes `LiveRankedFeed` existantes aurait demandé des branches 
conditionnelles sur presque chaque champ. Nouveau composant séparé `FreeFlashPreview.tsx` 
à la place : un vrai teaser top-5 honnête avec une incitation à upgrade, pas une version 
appauvrie du feed payant. Vérifié avant de câbler que la clé anon (celle du frontend) peut 
bien lire les deux vues (5 lignes chacune) et que les vraies tables `ah_live`/`bazaar_1h` 
restent bien bloquées pour anon (la frontière RLS de l'audit sécurité du 23 juillet est 
intacte). Confirmé visuellement de bout en bout sur un vrai compte Vault jetable (aucune 
ligne `subscriptions` → résout à `free` par construction, voir `lib/get-plan.ts`), compte 
supprimé après test.

**✅ Radar — count réel, testé sur un vrai compte Elite jetable** : les trois libellés 
codés en dur (`"4781 ITEMS"`, `"2119 Bazaar · 2662 AH · 1429 variants tracked"`) avaient 
dérivé d'un comptage manuel ancien — `items_catalog` est réellement à 5213 lignes 
aujourd'hui. L'hypothèse de l'audit ("pagination manquante") s'est révélée fausse en 
testant : `loadCatalog()` retourne déjà la table anon complète (5213/5213, aucune 
troncature). Comptes total/Bazaar/AH dérivés du catalogue déjà chargé pour la recherche 
(zéro requête supplémentaire), plus un `count:'exact', head:true` sur 
`price_history_ah_variants` pour le stat de variantes, relabellé honnêtement "variant 
price points tracked" (un compte de lignes, pas d'items distincts — aucun chemin de 
comptage distinct bon marché via le client anon sans nouvelle infra serveur). **Piège 
trouvé en testant** : `price_history_ah_variants` fait partie des 5 tables gated par 
`has_plan()` (audit sécurité du 23 juillet) — un client anon SANS session authentifiée 
y voit toujours 0 lignes, peu importe le vrai volume de données. Le premier passage de 
vérification (client anon nu) montrait donc `— variant price points tracked` ; corrigé 
en se connectant réellement comme le compte de test avant de rejouer les mêmes requêtes 
(reproduit fidèlement ce qu'un vrai utilisateur Pro/Elite connecté verrait dans son 
navigateur). Revalidé : `65 168` lignes réelles → `"65.2K variant price points tracked"`, 
`"1475 Bazaar · 3738 AH"`, `"5213 ITEMS"`. Compte test Elite jetable créé (résolution 
`getUserPlan()` confirmée à `elite`, tab Radar bien atteignable), supprimé après test.

**Reste à faire, dans l'ordre validé** : Patch Analysis — étendre le prompt/
schéma pour couvrir l'impact mécanique/gameplay, pas seulement économique ; nettoyage 
(`debug-boss-kills` mal placé dans `app/api/cron/`, `refresh-variant-stats`/
`backfill-variant-stats` à évaluer — probablement des reliquats d'une architecture 
legacy jamais nettoyés).

## ✅ Gear précis+justifié, pricing par variante exacte, rareté réelle, tooltips arme/outil/canne — testé en prod (28 juillet)

Évolution du chantier grounding `setup-generate-agent` : au lieu de recommander un nom 
de set générique ("Infernal Crimson Armor"), Vault définit maintenant une spec PRÉCISE 
et JUSTIFIÉE (étoiles/reforge/hot potato/ultimate enchant) que le joueur peut littéralement 
recréer, avec un coût calculé sur cette spec exacte plutôt qu'une moyenne toutes-variantes.

**Prompt enrichi** (`buildUserPrompt`) : `armor_reforge`/`weapon_reforge` doivent être 
copiés verbatim depuis la vraie liste REFORGES déjà dans le contexte (jamais inventés) ; 
`armor_ultimate_enchant`/`weapon_ultimate_enchant` doivent être un des vrais IDs 
(`ULTIMATE_ENCHANTS`, exporté du décodeur) ou `null` ; `armor_hot_potato_count` 0/5/10 ; 
nouveau champ `gear_justification` expliquant pourquoi ce choix précis sert la stat 
cible du tier — pas une reformulation générique du nom de l'item.

**Coût calculé par variante réelle, pas par moyenne toutes-variantes** — cascade à 3 
paliers avant le fallback blended déjà existant, tous appuyés sur `buildVariantKeys` 
(exportée de `lib/skyblock-item-decoder.ts`, jamais réimplémentée en parallèle pour ne 
jamais diverger de la logique déjà validée sur les vraies données AH) :
1. `price_history_ah_variants` — match exact sur la clé de variante complète construite 
   depuis la spec de Claude (étoiles+recomb+reforge+ultimate+hot potato).
2. `price_history_ah_variant_base` — match exact sur la clé de groupe (sans le reforge).
3. **Nouveau palier "broad"** — `price_history_ah_variant_base` avec un LIKE sur le 
   préfixe étoiles+recomb uniquement (ignore reforge/ultimate/hot potato), moyenne 
   pondérée par `data_points` sur toutes les lignes qui matchent. Trouvé nécessaire en 
   testant en vrai (Infernal Crimson Helmet) : les vrais exemplaires listés sur l'AH 
   portent quasi toujours un ultimate enchant (`habanero_tactics`, signature du set 
   Wither) même quand la spec hypothétique en laisse volontairement (`ultimate_enchant: 
   null` pour "la plupart des setups") — les paliers 1 et 2 ne matchaient donc jamais 
   rien pour ce type d'item, pas par bug (`buildVariantKeys` confirmée correcte contre 
   les vraies clés stockées) mais parce que ce variant précis n'existe simplement pas 
   en pratique. Validé en isolant le test sur `INFERNAL_CRIMSON_HELMET` : palier 3 
   trouve un vrai prix pondéré de 894 313 653 (`precision: "broad"`), pas un fallback 
   blended déguisé.

**Bug réel trouvé et corrigé pendant le test** : le matcher `armor_set` (règle "au 
moins 2 mots restants" ajoutée lors du chantier grounding précédent pour éviter que 
"Crimson Helmet" matche à tort "Infernal Crimson Armor") rejetait aussi les vrais sets 
à un seul mot distinctif — "Sorrow Armor" (confirmé réel et pricé : `SORROW_HELMET/
CHESTPLATE/LEGGINGS/BOOTS`, LEGENDARY, ~17M chacun) tombait à 0 pièce matchée. Remplacé 
par un concours de spécificité par catégorie de pièce (`bestArmorPiecesForSet`) : parmi 
tous les items dont le préfixe est un sous-ensemble de mots du texte cible, ne garder 
que celui au préfixe le plus long par catégorie — "Infernal Crimson Helmet" (2 mots) 
bat "Crimson Helmet" (1 mot) quand les deux matchent, "Sorrow Helmet" (1 mot) gagne par 
défaut quand c'est le seul candidat réel. Corrige les deux problèmes avec le même 
mécanisme plutôt qu'un seuil arbitraire.

**Rareté réelle** — `item.tier` existe dans `/v2/resources/skyblock/items` (déjà fetché 
par `skyblock-resources-sync`) mais n'était jamais mappé. Nouvelle colonne 
`item_stats.rarity` (migration manuelle, `ALTER TABLE`), mappée dans `syncItemStats`, 
attachée au setup pendant la génération (`armor_rarity`/`weapon_rarity`/`tool_rarity`/
`rod_rarity`). Validé en re-déclenchant un vrai sync sur preview : `DIVAN_DRILL: 
MYTHIC`, `HYPERION: LEGENDARY`, `INFERNAL_CRIMSON_CHESTPLATE: LEGENDARY` — vraies 
valeurs Hypixel, pas approximées.

**Arme/outil/canne en cases cliquables avec tooltip NBT** (`GearSlot` dans 
`SetupOverlay.tsx`) — remplace la ligne de texte brut par le même traitement visuel que 
les slots accessoires déjà en place (case biseautée + libellé), mais avec un hover panel 
riche : nom coloré par la vraie rareté (`RARITY_COLORS`, convention standard Hypixel/
Minecraft §-codes, pas une palette inventée), étoiles, stats, enchants, reforge — tout 
tracé directement depuis le même objet setup, rien d'inventé côté frontend. 
`gear_justification` affiché dans le panneau droit (nouveau bloc "🛡️ GEAR CHOICE").

**Apparence de l'armure — placeholder assumé, chantier texture différé** : discussion 
avec l'utilisateur sur un pack de texture custom par set (Necron's, Storm's, Divan's...) 
a été résolue par une vérification réelle plutôt qu'une estimation — aucune armure 
Skyblock n'a de texture de base unique côté serveur : chaque pièce est soit du cuir 
teinté (`LEATHER_*` + tag `color`, confirmé même pour Necron's Chestplate : `#E7413C` 
en dur) soit une tête de joueur reskinnée (`SKULL_ITEM` + `skin.value`, pour certains 
casques) — le "look custom" que les joueurs associent à ces sets vient entièrement de 
resource packs tiers optionnels, jamais des données Hypixel elles-mêmes. `SkinArmorRender` 
utilise donc la vraie couleur cuir vanilla par défaut (`#A06540`, RGB 160,101,64, 
vérifiée par recherche, pas approximée) pour toute pièce d'armure, en attendant un vrai 
pack de texture Vault (cuir teinté par la vraie couleur RGB retournée par l'API Hypixel 
via multiply/destination-in ; casques via la vraie skin décodée depuis `skin.value` et 
récupérée sur `textures.minecraft.net`) — **chantier futur, pas commencé, pas bloquant**.

**Testé end-to-end sur preview avant merge** (pas juste relecture de code), plusieurs 
passes de correction guidées par de vrais bugs trouvés en testant :
- 1ère passe : `armor_set: "Sorrow Armor"` matchait 0 pièce (bug matcher ci-dessus).
- 2e passe (fix matcher) : 5 items matchés, rareté réelle attachée, mais 
  `cost_optimal` montrait "0 exact variants" à chaque run.
- Diagnostic isolé sur `INFERNAL_CRIMSON_HELMET` : confirmé que les vraies clés de 
  variante stockées portent quasi toutes un ultimate enchant, d'où le palier "broad" 
  ajouté (3e passe) — revalidé : palier "broad" trouve bien un vrai prix (894 313 653) 
  pour ce même item une fois le fallback ajouté.
- Reforges vérifiées réelles à chaque run (`Pure`, `Epic`, `Brilliant`, `Excellent` — 
  tous confirmés présents dans la table `reforges`, jamais inventés par Claude malgré 
  la liberté du prompt).

## ✅ Skin + armure réels dans SetupOverlay (Money Making) — testé en prod (28 juillet)

Remplace la grille d'inventaire à icônes emoji de `SetupOverlay.tsx` par le vrai skin 
Minecraft du joueur rendu en cuboïdes CSS 3D (`components/SkinArmorRender.tsx`, pas de 
WebGL/skinview3d), avec l'armure équipée en couches gonflées par-dessus, hover = tooltip 
avec les vraies stats du setup généré. Nouveau `lib/skin-uv-map.ts` (format UV skin 
Minecraft standard 64×64, format public, pas un asset Mojang copyrighté).

**Proportions et géométrie d'armure vérifiées contre le vrai modèle Mojang**, pas 
approximées — plusieurs passes de correction avec l'utilisateur avant validation :
- Dimensions du modèle (tête 8×8×8, torse 8×12×4, bras/jambes 4×12×4 chacun) correctes 
  dès le départ, confirmées par recherche web.
- Bug de projection trouvé : `perspective` CSS (un vrai point de fuite) faussait les 
  pièces excentrées (bras en parallélogramme) et écrasait les proportions selon la 
  profondeur. Une vraie vue isométrique n'a pas de point de fuite — `perspective` retiré 
  entièrement (garde `preserve-3d`/`rotateX`/`rotateY`/`translateZ`, devient orthographique).
- Géométrie d'armure incomplète : le plastron ne couvrait jamais les bras, les jambes 
  étaient coupées en haut/bas (legging vs boots) sur une proportion inventée. Vérifié 
  contre le vrai split Mojang outer_armor/inner_armor : casque+plastron+bottes partagent 
  le modèle "outer" (inflate 1.0) sur tête/torse+bras/jambes ; le legging utilise "inner" 
  (inflate 0.5) sur les MÊMES parties du corps — comme outer > inner sur la même boîte, 
  la couche legging est toujours entièrement invisible sous un plastron+bottes portés 
  (vrai en jeu aussi). Une seule couche outer (1.0) par partie couverte, jambe entière.
- Item tenu en main (arme/outil visible dans la main) tenté sur 2 passes de positionnement 
  sans jamais retomber juste (aucun outil pour vérifier visuellement le rendu CSS 3D) — 
  abandonné à la demande de l'utilisateur, pas assez de valeur pour continuer à itérer à 
  l'aveugle. weapon_name/tool/rod/stats/ability affichés en texte simple dans SetupOverlay 
  à la place, pour ne pas perdre l'info.
- Vérification visuelle faite via un Artifact autonome répliquant exactement la même 
  logique de transform (CSP de l'Artifact bloque les images distantes — skin inliné en 
  data URI pour un vrai test de texture, crafatar.com étant tombé en 521 au moment du test, 
  contourné via le CDN de textures Mojang directement, même source que Crafatar utilise).

**`app/api/player/status/route.ts`** renvoie maintenant aussi `hypixel_uuid` (déjà 
sélectionné en base mais jamais renvoyé) pour que `SetupOverlay` puisse construire 
l'URL du skin réel du joueur connecté ; fallback sur le skin Steve par défaut si aucun 
compte Hypixel lié. Armure toujours en overlay teinté stylisé, jamais de vraie texture 
Mojang/Hypixel (même limite légale que la grille emoji qu'elle remplace).

**Testé end-to-end sur preview avant merge, avec un vrai compte et un vrai setup 
généré** (pas juste relecture de code) : compte Vault jetable créé + plan Pro inséré 
en base (contourne Stripe pour le test, même pattern que les comptes jetables déjà 
utilisés cette semaine) + lié à un vrai compte Hypixel (CUCUMBER, résolution Mojang 
réelle) → UUID réel `cec3ccc8-b31d-4cae-862f-6841a35e9686` → URL skin réelle 
`crafatar.com/skins/cec3ccc8-...`. Setup LATE Gemstone Mining regénéré via le pipeline 
groundé actuel : `armor_set: "Infernal Crimson"`, `weapon_name: "Hyperion"`, 
`tool: "Divan's Drill + ..."`, `cost_optimal: "~4.8B (6 items matched)"` — cohérent 
avec la validation du chantier grounding précédent. Contenu du tooltip d'armure dérivé 
du même objet setup : `title: "Infernal Crimson ✪✪✪✪✪"`, 
`lines: ["HP 2100+ | DEF 2200+ | STR 500+ | CD 150%+", "Set bonus: +50% Mining Speed in Crystal Hollows"]` 
— tracé directement depuis `armor_stats`/`armor_bonus`, rien d'inventé. Compte jetable 
et son lien Hypixel supprimés en fin de test (route de debug supprimée après validation).

## ✅ setup-generate-agent — grounding sur données réelles, testé en prod (28 juillet)

Remplace la dépendance à la mémoire brute de Haiku pour nommer du gear précis — 
bug concret signalé : suggérait du Mithril Armor pour du gemstone mining en late game 
au lieu de Divan's Armor. Deux volets, tous les deux validés par test réel sur preview 
Vercel (pas juste relecture de code) avant merge, méthode identique à l'arc 
`price_history_ah_variant_base` (branche preview, route de debug temporaire important 
directement les fonctions exportées — jamais de self-fetch HTTP, même contournement du 
mur SSO Vercel Deployment Protection).

**Catalogue de gear réel, prix réel** (`loadPricedItems`/`gearCatalogForBudget` dans 
`app/api/cron/setup-generate-agent/route.ts`) — jointure en JS entre `item_stats` 
(vrais stat blocks Hypixel, déjà collectés) et le dernier prix connu de 
`price_history_ah` (`__all_variants_blended__`, DAILY), filtrée par tier sur une bande 
de budget réelle (`max_gear_cost/25` → `max_gear_cost×3` depuis `TIER_CONFIG`). C'est 
le mécanisme qui corrige le bug Mithril/Divan's : le prix réel du Mithril tombe bien en 
dessous du plancher de budget LATE, donc il n'apparaît structurellement jamais dans ce 
catalogue-là — aucune règle "utilise Divan's en late game" codée en dur, ça sort 
directement des prix réels.

**Bug trouvé en testant, pas en relisant le code** : `item_stats.health/defense/...` 
est réellement à 0 en base pour la plupart des items endgame (Crown of Avarice, 
Hyperion, Infernal Crimson Chestplate confirmés à 0 par requête directe) — l'API 
Hypixel ne remplit ce champ que pour des items à stats plates simples, pas ceux dont le 
vrai stat vient des étoiles/reforge/génération. Afficher ces zéros au modèle aurait été 
une fausse information. Catalogue simplifié pour n'afficher que item_id/nom/catégorie/prix 
(la seule colonne fiable), trié par prix décroissant plutôt que par un score de 
puissance construit sur des colonnes creuses.

**Coût du setup calculé en code, jamais laissé à Claude** — testé et confirmé 2 fois de 
suite : même avec une règle de prompt explicite demandant de sommer les prix du 
catalogue, Haiku continue de sortir un chiffre habituel proche de `coins_display` (ex: 
"95-110M" alors que Divan's Drill seul vaut 1,86 milliard dans le catalogue qui lui est 
montré). Un modèle rapide/pas cher ne fait pas fiablement cette arithmétique en texte 
libre. `computeRealCost`/`applyRealCost` post-traite la réponse de Claude : matche 
`armor_set`/`weapon_name`/`tool`/`rod` contre le catalogue de prix réels, additionne les 
prix trouvés, écrase `cost_budget`/`cost_optimal`/`cost_endgame` avec ce total (± 
multiplicateurs simples) — Claude ne touche plus jamais ce chiffre.

**Bug réel trouvé dans le matcher lui-même, via un dump de debug pendant le test** : la 
première version du matcher matchait par sous-chaîne après avoir deviné/retiré "le 
dernier mot" — un mot générique partagé (Crimson, Magma, Hyper) suffisait à matcher un 
item complètement différent d'un tier totalement différent. Concrètement : "Infernal 
Crimson Armor" matchait à tort le vrai mais sans rapport "Crimson Helmet" (T1 Kuudra, 
~4M) en plus du bon "Infernal Crimson Helmet" (T5, ~500M) ; le texte inventé par Claude 
"Divan's Drill + Magma Fuel Tank..." matchait "Magma Rod"/"Magma Bow"/"Magma Necklace" — 
trois items réels mais sans aucun rapport, juste parce qu'ils partagent le mot "Magma". 
Corrigé avec deux matchers dédiés : `matchesArmorSet` utilise la vraie `category` de 
l'item (pas un mot deviné) pour retirer le mot de type Helmet/Chestplate/Leggings/Boots, 
et exige au moins 2 mots restants (un seul adjectif générique partagé ne suffit plus) ; 
`matchesExact` (weapon/tool/rod) exige que tous les mots significatifs de l'item 
apparaissent comme mots entiers, jamais une sous-chaîne. Revalidé sur le même exemple 
réel après fix : le nombre d'items matchés est tombé de 14-19 (faux positifs) à 
exactement 6 (4 pièces Infernal Crimson + Hyperion + Divan's Drill), total ~4,8B, 
cohérent avec les prix affichés dans le catalogue.

**Preuve concrète — LATE tier, Gemstone Mining (Crystal Hollows), testée en prod sur 
preview Vercel** : `armor_set: "Infernal Crimson Armor"`, `weapon_name: "Hyperion"`, 
`tool: "Divan's Drill + ..."` — plus aucune trace de gear bas-tier hors budget. 
`cost_optimal: "~4.8B — real current AH price of the named gear (6 items matched)"`, 
match exact avec la somme réelle des 6 items dans le catalogue affiché au modèle.

**Pas retouché** : `pet_name`/`gemstones` restent uniquement ancrés sur le texte wiki 
(pas de table de prix pet/gemstone dédiée à joindre pour l'instant) — documenté 
explicitement dans `GROUNDING_RULES` pour que Claude reste qualitatif dessus plutôt que 
d'inventer un nom d'item précis non vérifié.

## ✅ price_history_ah_variant_base — 3e palier d'agrégation AH, reconstruit après perte accidentelle, testé en prod (28 juillet)

**Contexte de la perte** : une modification non commitée de `ah-aggregate/route.ts` 
existait déjà en local avant cette session (visible dès le premier `git status`). En 
corrigeant une erreur de branche (un lot de commits parti par erreur directement sur 
`master` au lieu d'une branche preview), un `git reset --hard origin/master` a 
accidentellement écrasé cette modification jamais commitée. Recherche de récupération 
exhaustive avant d'abandonner : historique local VS Code (`%APPDATA%\Code\User\History`) 
— le fichier y était bien suivi, mais le dernier snapshot datait du 21 juillet et était 
identique au commit déjà en base, donc rien de plus récent capturé (probablement parce que 
la modification perdue avait été faite par Claude Code directement, pas par une sauvegarde 
dans l'éditeur VS Code, seul déclencheur de cet historique) ; aucun fichier `.swp`/`~`/`.bak` 
nulle part dans le repo ; le projet n'est pas dans le dossier synchronisé OneDrive donc pas 
d'historique de versions de ce côté non plus. Confirmé irrécupérable par ces moyens — 
**l'utilisateur a retrouvé la spec exacte dans une conversation précédente** (table SQL + 
méthode de calcul + seuil de fiabilité) et l'a recollée intégralement pour reconstruction 
verbatim. Leçon opérationnelle retenue : toujours vérifier l'état du repo (`git status`) 
avant un `reset --hard`, y compris quand l'opération vise à corriger une erreur sans rapport 
avec les fichiers concernés.

**Ce qui a été reconstruit** — 3e palier d'agrégation dans `ah-aggregate/route.ts`, entre 
l'exact (`price_history_ah_variants`, 1 ligne par `variant_key_full`) et le blended toutes-
variantes (`price_history_ah`, 1 ligne par item) :
- Nouvelle table `price_history_ah_variant_base` — 1 ligne par 
  `(base_item_id, variant_key_base, bucket_date)`, regroupe les mêmes lignes fiables du 
  buffer (`scan_count >= 3`) que la table exacte. `avg_price` pondéré par `scan_count` 
  (fiabilité), `min_price`/`max_price` = extrêmes du groupe, `volume`/`data_points` sommés, 
  `contributing_variants` = nombre de `variant_key_full` distincts dans le groupe. Écrite 
  uniquement si `data_points >= 10` OU `contributing_variants >= 2`.
- **Renommage du placeholder blended** sur `price_history_ah` (table 2) : 
  `nostar_norecomb_noreforge` → `__all_variants_blended__`. L'ancien nom collidait avec le 
  VRAI `variant_key` du plain item (0 star/no recomb/no reforge) utilisé ailleurs 
  (`RadarSection`, `SetupOverlay`) pour dire "Base item" — un flip pouvait silencieusement 
  se faire comparer à la moyenne blended en croyant comparer contre le plain item réel. 
  Deux consommateurs actifs corrigés en même temps pour rester cohérents avec le nouveau nom 
  (`item-history/route.ts` ligne ~105, `RadarSection.tsx` × 4 occurrences — toutes confirmées 
  lire exclusivement `price_history_ah`, jamais `price_history_ah_variants` où la même chaîne 
  signifie autre chose et n'a jamais été touchée). Renommage historique des lignes déjà en 
  base **volontairement différé** (SQL par lots fourni à l'utilisateur, timeout sur un 
  `UPDATE` direct vu les 3,3M lignes de la table) — sans dépendance fonctionnelle sur le 3e 
  palier, qui ne lit jamais `price_history_ah`.

**Validé en conditions réelles sur preview Vercel** : `vercel crons run` ne fonctionne que 
sur la prod (confirmé via la doc Vercel), et un self-fetch HTTP vers `/api/cron/ah-aggregate` 
depuis une autre route du même déploiement se heurte au mur SSO de Vercel Deployment 
Protection (confirmé : 200 avec un corps non-JSON au lieu du vrai JSON de la route — le 
`CRON_SECRET` n'atteignait jamais le handler). Contournement définitif : logique extraite en 
fonction exportée `runAhAggregate()`, appelée par import direct depuis une route de debug 
temporaire (server-side sur le déploiement, lit `CRON_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` 
depuis l'env Vercel — aucun secret n'a besoin de transiter par la conversation). Route de 
debug supprimée après validation (`app/api/debug/test-variant-base/`), au passage un autre 
résidu de debug oublié depuis le 18 juillet (`app/api/debug/nbt-test/`, test de décodage NBT, 
zéro référence ailleurs dans le repo) a aussi été nettoyé.

**Preuve concrète** — run réel sur données de production (buffer de 10 000 lignes) : 
`base_inserted: 5402` sur `5529` groupes vus (127 exclus à raison, sous le seuil de 
fiabilité). Exemple `POWER_WITHER_CHESTPLATE` (Necron's Chestplate — confirme au passage que 
le préfixe `POWER_WITHER_*` couvre tout le set, pas juste les boots déjà notées) : 
`variant_key_base` = `5star_recomb_fuming`, `contributing_variants: 5`, `data_points: 6413`, 
`avg_price: 80 986 268`, `min_price: 25 000 000`, `max_price: 1 300 000 000`. La moyenne 
pondérée reste proche du bas de la fourchette malgré un `max_price` clairement aberrant 
(enchère isolée à un prix absurde, bruit habituel de l'AH) — preuve que la pondération par 
`scan_count` dilue bien les groupes à faible fiabilité plutôt que de les laisser fausser la 
moyenne, cohérent avec l'intention de la spec.

**Pas encore fait** : renommage historique des lignes `price_history_ah` déjà en base (SQL 
par lots fourni, à exécuter par l'utilisateur quand il le souhaite — cosmétique, ne bloque 
rien).

## ✅ Landing page — hero verrouillé pour le lancement de cette semaine (27 juillet)

Après plusieurs semaines d'itération sur l'identité visuelle Vault (coffre-fort + clé, 
esthétique mi-Wakfu/Dofus mi-Minecraft) explorée à travers de nombreux prototypes en 
Claude Artifacts (rendu code pur WebGL, génération d'image via Pollinations.ai, tentative 
Hugging Face Inference API, géométrie 3D réelle via Three.js) — la direction artistique 
retenue et **intégrée dans le vrai code de production** (`app/page.tsx`, pas un mockup) 
est une image générée de type Minecraft Dungeons/Story Mode : coffre-fort doré au centre, 
clé flottante éclairée par un faisceau de lumière descendant du plafond, salle des coffres 
dans la pénombre en arrière-plan, texte "VAULT" en blocs dorés au sol (sert de signature 
visuelle de la scène, pas de logo dupliqué par-dessus).

**Ce qui a été fait, dans l'ordre** :
- Image source fournie par l'utilisateur (`Desktop/Image Vault/HeroBackground.png.png`), 
  netteté renforcée via `sharp().sharpen({ sigma: 1.1, m1: 1.0, m2: 0.6, ... })` (unsharp 
  mask) pour corriger le flou sur les détails fins (coffres empilés en arrière-plan, 
  bijoux au sol, bords du texte "VAULT") — validé par comparaison avant/après zoomée sur 
  la zone la plus critique avant d'appliquer au fichier final.
- Convertie en JPEG qualité 90 (2,4 Mo en PNG → 293 Ko), déplacée vers 
  `public/images/hero-background.jpg`.
- `.hero` dans `app/page.tsx` restructuré : `.hero-bg` (image de fond, `background-size: 
  cover`, `background-position: center 22%`) + `.hero-copy` (panneau de texte superposé — 
  fond semi-transparent sombre en dégradé, fine bordure dorée, 4 coins ornementaux en 
  coin-bracket, `backdrop-filter: blur`) — même traitement de panneau déjà validé sur les 
  prototypes Artifact précédents.
- Panneau positionné en haut de la section (dans la zone du faisceau lumineux/arche, 
  au-dessus du coffre et de la clé) pour ne jamais cacher les deux éléments visuels 
  centraux de la composition.
- Titre/sous-titre/CTA du hero remplacés : "Unlock the vault of your Skyblock economy" 
  + sous-titre intelligence de marché + boutons "Sign in" (`/login`) / "View pricing" 
  (`#pricing`) — remplace l'ancien texte générique "The edge YouTube will never give you" 
  qui n'avait aucun lien avec l'identité visuelle travaillée.
- Testé en local (`npm run dev`) avant validation : page 200, image servie correctement 
  à `/images/hero-background.jpg` (293 Ko confirmés), texte du hero présent dans le HTML 
  rendu.

**Verrouillé pour le lancement** : on arrête d'itérer sur la composition/le contenu de 
cette image hero — elle ne doit plus être régénérée ni recomposée sans demande explicite. 
Ce verrouillage concerne uniquement l'image (le fond visuel) — le TEXTE de la page hero 
et des pages `/features`/`/about` reste vivant et doit suivre le dashboard réel à chaque 
évolution, voir la règle 8 de la Philosophie de développement plus bas.

**Suite du même jour — retouche image + site complet + corrections de fidélité** :
- Image : logo/watermark en bas à droite supprimé (flou local + composite feathered plutôt 
  que clone-stamp, évite toute couture visible), vignette horizontale ajoutée pour plonger 
  les piles de coffres flous en arrière-plan dans la pénombre sans toucher la colonne 
  centrale nette (clé/coffre/texte VAULT), passe de netteté renforcée une fois les zones 
  bruitées assombries.
- `background-position` corrigé de `22%` à `85%` : le texte "VAULT" intégré à l'image se 
  trouve à ~78-91% de la hauteur de la source, et une position à 22% (biaisée vers le haut) 
  pouvait le faire sortir du cadre sur les viewports larges/courts. Le panneau de texte 
  opaque avec bordure/coins dorés a aussi été retiré (demande explicite : "enlever le gros 
  cadre") — la lisibilité vient maintenant uniquement de `text-shadow` par élément.
- `app/globals.css` (jusque-là vide, reste du template Next.js par défaut, `<title>` encore 
  "Create Next App") peuplé avec le système de design partagé (polices, tokens couleur, 
  `.vault-card` coin-bracket, nav, boutons, typographie de page) — toutes les pages 
  héritent maintenant de la DA du hero au lieu de dupliquer leurs propres styles. Nouveaux 
  `components/SiteNav.tsx`/`SiteFooter.tsx`, nouvelles pages `/about` et `/features`, 
  `/privacy` et `/terms` restylées (contenu légal inchangé, juste l'habillage).
- Stats du bandeau (`/api/homepage-stats`) vérifiées réellement live sur la prod (pas 
  juste testées localement) : `priceDataPoints` a incrémenté entre deux appels à quelques 
  minutes d'écart (5 074 872 → 5 074 880), confirmant une vraie lecture DB à chaque requête, 
  pas une valeur mise en cache ou statique.
- Places premium plafonnées par palier plutôt qu'un chiffre global : 1000 Alert / 500 Pro / 
  250 Elite (1750 places premium au total), reflété sur la page pricing et dans les Terms.
- Legal : ajout du droit de rétractation UE/UK à 14 jours (avec la clause standard de 
  renonciation pour accès immédiat au contenu numérique), base légale RGPD, cookies, 
  transferts internationaux, sécurité des données, confidentialité des mineurs, propriété 
  intellectuelle, limitation de responsabilité, force majeure — juridiction de gouvernance 
  laissée en placeholder explicite (pas d'entité juridique enregistrée connue, mieux vaut 
  un vide visible qu'une fausse info).
- **Deux erreurs de fidélité trouvées et corrigées après audit demandé par l'utilisateur** 
  (voir règle 8 de la Philosophie de développement) : "#ah-sniper" n'a jamais existé comme 
  onglet réel (`app/dashboard/page.tsx` n'a que 5 tabs, AH Sniper a été absorbé par Radar), 
  et Money Making décrit comme "flips Bazaar/AH" alors que le vrai composant n'a que deux 
  catégories (Active Grind / Vault Exclusive), aucun rapport avec du flip. Corrigé partout 
  (hero, `/features`, bullets de pricing) après vérification directe du code des composants 
  réels, pas de mémoire.

**Amélioration possible en V2, pas bloquant pour ce lancement** : décliner d'autres 
visuels de la même famille (même moteur de génération, même traitement de netteté) pour 
les autres sections du site (dashboard, About/How it works, pages de fonctionnalités) — 
pas commencé, aucune demande actuelle en ce sens.

## ✅ Gating par tier d'abonnement (Free/Alert/Pro/Elite) — implémenté et corrigé une faille réelle (23 juillet)

Plans validés : **Free** (0$, Flash Alerts dégradé top-5 + Patch Analysis Live résumé 
seulement, aucune liaison Hypixel possible) → **Alert** (4,99$, Flash Alerts + Patch 
Analysis complets) → **Pro** (19,99$, +Radar +Money Making Active +Evolve Skills/
Milestones complets) → **Elite** (39,99$, +Money Making Vault Exclusive +Evolve Daily 
Missions +accès anticipé).

**🔴 Trouvé en auditant l'architecture avant de coder — faille réelle, pas juste une 
lacune** : `/api/market-data` n'avait **aucune vérification d'auth**, servait déjà tout 
le contenu payant (Money Making 4 tiers + Vault Exclusive, Patch Analysis complet, Radar) 
à n'importe quelle requête anonyme. `ah_live`, `bazaar_1h`, `price_history`, 
`price_history_ah`, `price_history_ah_variants` avaient des policies RLS `USING(true)` — 
lisibles par n'importe qui avec la clé anon, interrogées **directement depuis le 
navigateur** (`FlashAlertsPage.tsx`/`LiveRankedFeed.tsx`/`RadarSection.tsx`), donc aucune 
route Next.js ne pouvait jamais les protéger. Les 4 routes `player/*` vérifiaient l'auth 
et la liaison Hypixel mais jamais le plan — un compte Free qui liait un Hypixel avait déjà 
accès complet à Evolve.

**Deux couches, un seul point de vérité chacune** :
- `lib/get-plan.ts` (`getUserPlan`/`requirePlan`) — lit `subscriptions` par l'email de la 
  session authentifiée réelle, jamais un paramètre client. Vérifié à **chaque appel**, 
  pas seulement à la liaison du compte Hypixel (un downgrade après coup ne laisse pas 
  l'accès ouvert).
- `has_plan(min_plan)` fonction SQL + nouvelles policies RLS sur les 5 tables interrogées 
  directement par le navigateur — même principe côté DB, là où aucune route Next.js ne 
  peut intervenir.
- `lib/gate-content.ts` — filtrage de contenu partagé (`filterMoneyMaking` retire Vault 
  Exclusive sauf Elite, `filterPatchInsight`/`filterPatchAnalysisContent` réduit à 
  titre+`direct_impact` pour Free, Live uniquement — vérifié contre le vrai schéma 
  `insight_patch` avant de coder).

**Aperçu Free sans nouvelle infra de délai** : vues `ah_live_free_preview`/
`bazaar_1h_free_preview` (top 5, jamais `best_auction_uuid`) — possédées par `postgres`, 
contournent volontairement le RLS désormais restreint de `ah_live`/`bazaar_1h` pour cet 
aperçu précis et rien d'autre. Même mécanisme que les vues `SECURITY DEFINER` déjà notées 
comme risque sur `method_feedback_summary`/`distinct_items` (toujours pas corrigées, 
tables vides), mais cette fois scopé et documenté sciemment plutôt que subi.

**Pas encore fait** : les tabs Flash/Patches du dashboard restent `['alert','pro','elite']` 
— le frontend ne sait pas encore afficher l'aperçu Free dégradé (backend prêt : vues + 
`/api/market-data` filtré). Tab Evolve corrigé `['elite']` → `['pro','elite']` (Skills/
Milestones sont Pro, pas Elite).

## ✅ Sécurité compte/facturation — audit complet + failles corrigées (22 juillet)

Audit de sécurité exhaustif demandé avant les tests utilisateurs (RLS toutes tables, 
routes `player/*`, vues `SECURITY DEFINER`, routes cron, secrets côté client). Rien de 
critique trouvé côté `player/*` au-delà de ce qui était déjà documenté (voir section 
Sécurité Evolve plus bas) — mais l'audit a débordé vers les routes compte/abonnement, 
jamais vérifiées avant, et c'est là qu'étaient les vraies failles.

**🔴 Trouvé et corrigé — chaîne d'attaque complète sur le compte/facturation :**
- `subscriptions` avait une policy RLS nommée *"Users can read own subscription"* mais 
  `USING (true)` — en réalité lecture publique totale de `email`/`username`/
  `stripe_customer_id`/`stripe_subscription_id`/`plan`/`status` pour tout le monde via 
  la clé anon. **Corrigé** : policy scopée sur `email = auth.email()`, `TO authenticated` 
  seulement. `user_id` existe comme colonne mais n'est rempli par aucun chemin d'écriture 
  actuel (webhook, update-username) — scoping fait sur `email`, pas `user_id` (dette 
  notée, pas bloquante : migrer vers `auth.uid() = user_id` plus tard si `user_id` est 
  un jour rempli proprement).
- `/api/get-email-by-username` prenait un `username` et retournait l'`email` associé, 
  zéro auth, zéro rate-limit — oracle d'énumération complet. **Supprimée entièrement** 
  (pas de rate-limiting : pas d'infra existante, et l'alternative "token temporaire" 
  demande de toute façon la même plomberie serveur). Le login par username est refait 
  entièrement côté serveur à la place (voir ci-dessous).
- `/api/update-username`, `/api/cancel-subscription`, `/api/subscription` prenaient tous 
  un `email` en paramètre client, zéro vérification de session — n'importe qui connaissant 
  (ou énumérant via le point précédent) un email pouvait renommer le compte de quelqu'un 
  d'autre, résilier son vrai abonnement Stripe, ou lire son plan. **Corrigé** : les 3 
  routes appellent maintenant `auth.getUser()` via un client Supabase serveur lié aux 
  cookies, n'agissent que sur l'email de la session réelle, ignorent tout email fourni 
  par le client.

**Infrastructure ajoutée** : `lib/supabase-server.ts` (`createServerClient` de 
`@supabase/ssr`, lié aux cookies via `next/headers`) — première utilisation dans ce 
projet, jusqu'ici seul `createBrowserClient` existait. Réutilisable pour le chantier 
`player/*` à venir (même pattern d'auth serveur nécessaire).

**`/api/login`** (nouvelle route) remplace le flux "résoudre username → email côté 
client → `signInWithPassword`" : résout maintenant le username en interne, ne renvoie 
jamais l'email au client, pose la session directement via les cookies de la réponse. 
Corrige au passage un second petit oracle (le login distinguait "Username not found" 
d'un mot de passe faux — une seule erreur générique "Invalid credentials" maintenant).

**Testé end-to-end sur un vrai compte jetable** (créé/supprimé à chaque fois, jamais 
laissé en base) : login par email et par username, erreurs génériques sur mauvais 
mot de passe/username inconnu, et sur les 3 routes corrigées — appel avec la session 
réelle (fonctionne, agit sur le bon compte), sans session (401), et avec un email 
différent injecté dans le body (complètement ignoré, prouvé en observant que la réponse 
reste scopée à la session réelle).

**✅ Suite corrigée le même jour — `player/*` + liaison de compte :**
- `player_missions` et `player_progress` avaient les mêmes policies RLS 
  SELECT/INSERT/UPDATE totalement publiques que `subscriptions`. Ni l'une ni l'autre 
  n'a de colonne `user_id` pour scoper une policy par utilisateur — verrouillées à zéro 
  policy (service role uniquement), même posture que `player_data`/`player_skill_cards`.
- Les 4 routes `player/*` (`sync`, `missions`, `milestones`, `money-making`) exigent 
  maintenant une vraie session Vault (`auth.getUser()` via `lib/supabase-server.ts`).
- **Flux de liaison Vault ↔ Hypixel construit** : nouvelle table `hypixel_account_links` 
  (`user_id` clé primaire, `hypixel_uuid` `UNIQUE`, RLS scopée à `user_id = auth.uid()`). 
  "Premier arrivant, premier servi" — pas de preuve cryptographique d'appartenance, 
  choix assumé et proportionné : les données de jeu exposées ensuite (skills, slayers, 
  collections...) sont déjà publiques via l'API Hypixel officielle pour quiconque connaît 
  le pseudo, le vrai risque à couvrir était le spam d'écriture (déclencher sync/missions 
  sur un compte qui n'est pas le sien), pas une fuite de données déjà publiques. Nouvelle 
  route `POST /api/link-hypixel-account` (résout le pseudo via Mojang, refuse si déjà 
  lié à un autre compte Vault), UI minimale à `/link-hypixel` (pas stylée, à reprendre 
  avec le reste du design plus tard). Les 4 routes `player/*` n'acceptent plus aucun 
  `username`/`uuid` client — uniquement le compte réellement lié à la session.
- **Testé end-to-end sur 2 vrais comptes jetables** (créés/supprimés à chaque fois) : 
  liaison réussie sur un vrai pseudo Hypixel (Voxui09), `sync`/`milestones`/
  `money-making`/`missions` fonctionnels à travers le lien avec de vraies données 
  (Cucumber), un second compte sans lien correctement rejeté (400), une tentative de 
  lier un pseudo déjà revendiqué par un autre compte Vault correctement rejetée (409).

**🟡 Trouvé, toujours pas corrigé** :
- `method_feedback_summary` (vue `SECURITY DEFINER`) — `anon`/`authenticated` ont SELECT 
  dessus, bypass le RLS de `method_feedback` (RLS actif, zéro policy). Table vide 
  aujourd'hui donc impact nul, mais fuira tout commentaire/vote communautaire dès qu'elle 
  aura des données. `distinct_items` (l'autre vue `SECURITY DEFINER`) : risque nul, lit 
  `price_history` déjà publique légitimement.

**Aparté sans rapport à la sécurité** : `.env.local` contient une clé anon Supabase 
legacy désactivée depuis le 8 juillet — la prod utilise la nouvelle clé 
`sb_publishable_...`. `npm run dev` local est probablement cassé tant que ce fichier 
n'est pas mis à jour (fichier local, pas dans le dépôt, à corriger côté développeur).

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
- `price_history_ah_variants` — table séparée pour les données NBT de variantes, 
  c'est la source fiable pour pricer une variante précise (voir bug networth ci-dessous).
- **Bug scan_count → confirmé résolu (22 juillet)** : vérifié en base, `scan_count` monte 
  correctement au-delà de 1000 sur les variantes liquides. La fonction était déjà correcte, 
  ce n'était pas un bug de code — juste jamais reconfirmé en prod avant cette session.

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

## ✅ Infra collecte — 3 bugs corrigés (22 juillet, audit complet du pipeline)

Audit demandé suite à un soupçon (infondé) d'absence de données AH 5★ sur Necron's Armor 
— les données existaient déjà, c'était le bug networth documenté plus haut. L'audit a 
en revanche fait remonter 3 vrais bugs actifs, tous corrigés et déployés le jour même :

1. **`historic-import` — crash loop de 10+ jours, supprimé de `vercel.json`.** Planifié 
   `*/2 * * * *` en continu alors que c'est un job de rattrapage ponctuel (SkyCofl → 
   `price_history`/`price_history_ah`). Chaque invocation timeout à 60s depuis au moins 
   le 11 juillet (308 timeouts sur 7 jours, confirmé via `mcp__vercel__get_runtime_errors`) 
   — ne terminait jamais un batch, pur gaspillage d'invocations Vercel + quota SkyCofl/
   Hypixel. Route laissée intacte (`app/api/cron/historic-import/route.ts`) pour une 
   refonte future (déclenchement manuel ou pagination avec état persisté), juste retirée 
   du cron.
2. **`ah-collect` — `TODAY` figé au cold start, corrigé.** `const TODAY = new Date()...` 
   était calculé au niveau module, pas dans le handler. Sur une instance serverless qui 
   reste chaude (cron chaque minute), cette date ne se recalculait jamais tant que 
   l'instance ne redémarrait pas → `scan_date` dérivait silencieusement vers la veille 
   après minuit UTC. Confirmé en base : des lignes `scan_date` d'hier absorbaient encore 
   des scans d'aujourd'hui (`scan_count` > 1000). Fix : `TODAY` recalculé à chaque requête, 
   à l'intérieur du handler `GET`.
3. **`bazaar-collect` — ne scannait que le top 25 par spread%, corrigé.** Hypixel renvoie 
   déjà tout le catalogue Bazaar en un seul fetch (pas de pagination comme l'AH), mais le 
   code ne gardait que le top 25 (`spread_pct` 10-80%) avant d'écrire dans `price_history` 
   — tout item avec un spread durablement hors de cette bande n'avait jamais aucun point 
   quotidien. Découplé en deux usages de la même donnée déjà en mémoire : `bazaar_1h` 
   (feature Bazaar Flip) garde le filtre top 25/spread inchangé ; `price_history` reçoit 
   maintenant tout le catalogue (`buy > 0 && sell > 0` uniquement, aucun plancher de 
   volume/prix — un item peu liquide doit quand même avoir son point du jour) via une 
   nouvelle fonction batchée `upsert_bazaar_price_bucket_batch`. Testé sur un run réel en 
   prod : items couverts passés de 46 à 1544 en un seul cycle de cron.

**⚠️ Point en attente, pas urgent** : pas de filtrage d'outlier sur les variantes AH à 
faible `data_points` (seuil de fiabilité minimum = 3). Trouvé en passant : une variante 
avec seulement 3 data_points à un prix ~40x supérieur aux variantes voisines équivalentes 
— 2-3 enchères aberrantes suffisent à polluer durablement le prix d'une variante rare. 
À traiter si ça devient un problème visible, pas bloquant aujourd'hui.

### Audit complémentaire (22 juillet, suite) — vérification post-fix

- **`game_mechanics_misc` — RLS était désactivé, corrigé immédiatement** (trouvé par 
  l'advisory Supabase automatique lors de l'audit) : table de 8615 lignes lisible ET 
  **écrivable** par n'importe qui via la clé anon publique, contrairement au trou d'auth 
  Evolve documenté plus haut qui était sans conséquence (rien ne l'appelait). RLS activé + 
  policy SELECT publique (contenu de jeu, lecture publique voulue), aucune policy 
  d'écriture (INSERT/UPDATE/DELETE bloqués pour anon/authenticated ; le service role des 
  crons bypass RLS de toute façon, donc `wiki-auto-sync` continue de fonctionner). Audit 
  élargi à toutes les tables publiques : c'était la seule avec RLS désactivé.
  - Trouvé au passage (pas corrigé, hors scope de cette session) : 2 vues `SECURITY 
    DEFINER` (`distinct_items`, `method_feedback_summary`) remontées en ERROR par le 
    linter Supabase — s'exécutent avec les droits du créateur plutôt que de l'appelant, 
    contournant potentiellement RLS. À investiguer avant de toucher au RLS d'autres tables.
- **`price_history_ah` — résidus `historic-import` du 21 juillet (59 lignes/53 items 
  mélangeant reforges réelles et placeholder)** : historique figé, sans risque, ne se 
  reproduira plus maintenant que le cron est coupé. Pas d'action nécessaire.
- **`variant_key_base` sur `price_history_ah_variants` — pas de vraie moyenne agrégée** : 
  confirmé que c'est une fonctionnalité jamais construite (le fallback JS prend le prix 
  de la ligne exacte la plus récente partageant la même base, pas une moyenne pondérée du 
  groupe), pas un bug. À revisiter seulement si le pricing par variante exacte manque 
  trop souvent de données en pratique.

## 🚧 Chantier en cours — Collecte totale (données de référence + progression joueur)

Démarré le 23 juillet, suite logique du "pipeline données mécaniques à reconstruire" 
identifié le 22 (voir historique ci-dessous) mais élargi : reconstruire aussi bien le 
référentiel de jeu (Volet 1) que la progression joueur (Volet 2, `player/sync`) qui 
manque encore pour que Milestones/Money Making personnalisé calculent sur du réel. 
Ordre validé : organisation **par zone verticale** (référence + progression du même 
système ensemble), pas par volet séquentiel — un mob_wiki sans compteur joueur ou 
l'inverse ne sert à rien seul. Zones dans l'ordre d'impact : Phase 0 (infra) → 
Classes de donjon → Boss kills → Banque/Fast travel → Essence → Minions → Bestiary → 
Rift → Long tail misc (dojo/harp/abiphone/community shop/festivals).

**✅ Phase 0 — infra commune — TERMINÉ et validé en prod (23 juillet) :**
- **`sync_log`** (nouvelle table, service-role only) — chaque cron y log 
  `started_at/finished_at/status/rows_written/details/error`. Objectif direct : un job 
  cassé ou muet doit être visible en une requête, plus le pattern `historic-import`/
  `ah-collect TODAY` (bug silencieux des jours durant, trouvé seulement par audit manuel).
- **`neu-sync`** reconstruit (`app/api/cron/neu-sync/route.ts`, hebdo lundi 5h) — liste 
  des 40 fichiers confirmée par appel réel à l'API GitHub (pas supposée). Cache brut 
  systématique dans `neu_constants_raw` pour les 40 fichiers. 3 mappings dérivés vérifiés 
  champ par champ contre le JSON réel avant codage (`reforges.json`→`reforges`, structure 
  imbriquée par rareté — pas le format plat que devinait l'ancien code supprimé le 
  16 juillet ; `trophyfish.json`→`trophy_fish_thresholds` ; `essenceshops.json`→
  `essence_shop_upgrades`). Les autres fichiers (pets, gemstones, attribute_shards, 
  bestiary, reforgestones, rift_guide, leveling...) restent en cache brut seulement — 
  mapping repris zone par zone, pas deviné ici pour gagner du temps.
- **`skyblock-resources-sync`** reconstruit (quotidien 1h) — skills (ladder complet 
  1→cap depuis l'API officielle), collections (refresh), item_stats (nouveau, items 
  avec un champ `stats` réel).
- **`wiki-auto-sync`** migré de `hypixel-skyblock.fandom.com` vers le wiki officiel 
  `hypixelskyblock.minecraft.wiki` (même API MediaWiki, vérifié par appel réel), 
  troncature à 8000 caractères levée (limite auto-imposée, jamais une contrainte 
  réelle), état de pagination réinitialisé proprement (nouvelle source = nouveau 
  page set, l'ancien continue_token Fandom n'avait plus de sens).
- **Validé en prod sur 2 runs réels consécutifs** (route debug temporaire, supprimée 
  après validation) : neu-sync 40/40 fichiers, 683 lignes dérivées (300 reforges + 
  365 essence_shop_upgrades + 18 trophy_fish_thresholds — **comptes identiques** aux 
  données déjà chargées manuellement, confirme les mappings corrects). 
  skyblock-resources-sync : `skills` passé de 25 lignes (quelques niveaux repères 
  chargés à la main) à 587 (ladder complet officiel) ; `item_stats` de 0 à 1363 ; 
  `collections` refresh à 87 (stable). wiki-auto-sync confirmé fonctionnel sur le 
  nouveau domaine, contenu complet stocké. Les 2 runs ont produit des comptes 
  identiques (683/2029), confirmant que les upserts sont stables/idempotents.
  `vercel.json` mis à jour avec les 2 nouveaux crons.

**Historique — pourquoi ce chantier existe** : audit du 22 juillet ayant trouvé 
**30 tables de mécaniques de jeu sur 44 sans provenance traçable** dans le code ni 
l'historique git (`sblevel_tasks`, `fairy_soul_locations`, `sack_contents`, 
`museum_sets`, `museum_item_xp`, `item_upgrade_chains`, les 7 tables `garden_*`, 
`gemstone_slot_costs`, `essence_shop_upgrades`, `pet_stat_progression`, 
`george_pet_prices`, `npc_locations`, `dungeon_classes`, `dungeon_rng_scores`, 
`slayer_rng_scores`, `hotm_perks`, `hotf_perks`, `skills`, `forge_recipes`, 
`accessory_powers`, `magical_power_by_rarity`, `rift_guide`, `trophy_fish_thresholds`, 
`skymart_shop`, `hoppity_prestige`, `island_warps`, `minion_tier_xp`, 
`glacite_tunnel_waypoints`, `hotm_hotf_powders`, `player_base_stats`, `game_zones`, 
`accessory_upgrade_paths`) — peuplées par un processus hors dépôt (SQL manuel), sans 
mécanisme de mise à jour. Les 2 seuls pipelines qui en alimentaient une partie avaient 
été supprimés le 16 juillet (commit `7df1fa4`) sans jamais être reconstruits jusqu'à 
maintenant.

**✅ Phase 1 — Classes de donjon — TERMINÉ et validé sur Cucumber (23 juillet) :**
- `dungeon_classes` (table de référence, 15 lignes) **jugée fiable, gardée telle 
  quelle** — pas un résidu à refaire. Ce n'est pas une table de seuils numériques mais 
  un guide descriptif (3 paliers par classe : niveau 1/20/50, `key_ability`/
  `scaling_stat`/`notes`) — contenu vérifié cohérent avec les mécaniques Skyblock 
  connues (Berserk/Strength, Healer+Mage/Intelligence, Tank/Defense, Archer/Crit 
  Damage). Utile comme contenu explicatif, pas pour du calcul de progression.
- `member.dungeons.player_classes` vérifié sur le vrai profil Cucumber avant codage : 
  objet `{healer/mage/berserk/archer/tank: {experience}}`, **aucun champ "level" fourni 
  par l'API**. Catacombs et les classes utilisent chacun leur propre courbe XP→niveau, 
  distincte des skills classiques — aucune source vérifiée en interne (ni 
  `/v2/resources/skyblock/skills`, ni table interne), donc **XP brute stockée sans 
  niveau dérivé**, même principe que `hotm_progress`. Bonus trouvé au passage : 
  `member.dungeons.selected_dungeon_class` (classe actuellement équipée) — capturé 
  aussi (`dungeons.selected_class`).
- Ajouté dans `player/sync`, nesté dans la colonne `dungeons` existante (`dungeons.classes` 
  + `dungeons.selected_class`) — pas de migration, pas de nouvelle colonne nécessaire.
- Validé sur Cucumber via une route debug temporaire (supprimée après validation) 
  reproduisant exactement le mapping : `berserk` 354 564 XP (classe sélectionnée, 
  cohérent avec 220 runs Catacombs), `archer` 158 641, `tank` 53 541, `mage` 42 470, 
  `healer` 21 165.

**Prochaine étape** : Phase 2 (Boss kills — Kuudra tiers, Arachne, Dragons de l'End). 
Pas commencé — structure brute à vérifier sur un vrai profil avant codage.

## Evolve — état réel (mis à jour session du 22 juillet, source de vérité actuelle)

**Pipeline mort supprimé** : `api/evolve` (register + webhook n8n) et `cron/evolve-sync` 
(jamais présent dans `vercel.json`, donc jamais actif en prod malgré du code fonctionnel) 
ont été supprimés, avec les tables orphelines `weight_formulas` (18 lignes, coefficients 
Senither) et `skill_unlocks` (vide). `game_stage` uniformisé en MAJUSCULES 
(EARLY/MID/END/LATE) sur `player_data`, y compris le default en base.

**Backend fonctionnel (nouveau pipeline, remplace l'ancien) :**
- `api/player/sync` — sync GET on-demand (UUID via Mojang, profil via Hypixel), écrit 
  skills/slayers/dungeons/collections/pets/fairy_souls/game_stage/networth dans 
  `player_data`. `networth` est le **vrai total** (purse+bank+items décodés, voir 
  chantier NBT + networth ci-dessous), plus `networth_breakdown` (jsonb, détail par 
  catégorie). Pas de cron automatique, re-sync manuel côté frontend.
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

**✅ Frontend branché (23 juillet).** L'ancien `EvolveSection.tsx` (design "Improvement/
Route/Skills/Money" du 13 juillet, appelait `/api/evolve` qui n'existe plus) remplacé 
entièrement. Structure : `app/dashboard/EvolveSection.tsx` (orchestrateur — lien Hypixel ? 
sinon 3 sous-tabs lazy-load) + `app/dashboard/evolve/{LinkPrompt,SkillCard,SkillsTab,
MilestonesTab,MissionsTab,types}.tsx`. Deux routes manquantes découvertes et construites 
au passage : `GET /api/player/skills` (`evolve-skills` écrivait `player_skill_cards`, 
rien ne le lisait pour le frontend) et `GET /api/player/status` (bootstrap — 
`hypixel_account_links` et `player_data` ont zéro policy RLS publique, le navigateur ne 
peut pas savoir "compte lié ?"/"quel profile_id ?" sans une route dédiée). Pas de sync 
automatique au montage (jusqu'à 300s) — bouton "Sync now" explicite. Gating non dupliqué 
— le tab Evolve est déjà `['pro','elite']`, les 5 routes appelées vérifient déjà 
`requirePlan()` server-side.

**Validé de bout en bout** (Cucumber + Orange en lecture directe des 3 sources de 
données, puis un vrai compte jetable avec abonnement Elite inséré en base, lié à Voxui09, 
session réelle testée sur les 4 routes) : la détection "déjà possédé" (free_swap) 
atteint bien l'UI — la carte Farming de Cucumber recommande d'équiper un set Mantid 
Cropie déjà présent dans son Large Backpack plutôt qu'un achat, même chose pour son set 
Shadow Assassin + Livid Dagger sur Zombie Slayer. Orange confirme le garde-fou early-game 
(target `unlock_access`, objectif ~100 coins). `player_missions` confirmé avec un vrai 
aller-retour DB via la route réelle (pas seulement la logique de sélection des 
candidats). **`GET /api/player/sync` reste bloqué par la même clé `HYPIXEL_API_KEY` 
morte trouvée en Phase 2 du chantier collecte totale** (toujours pas résolue) — les 3 
routes de lecture (skills/milestones/missions) ne l'appellent pas, donc fonctionnent 
normalement sur des données déjà synced, mais un vrai joueur ne peut pas rafraîchir son 
profil tant que la clé n'est pas vérifiée/régénérée côté `developer.hypixel.net`.

## ✅ Sécurité Evolve — TODO résolu (trouvé 22 juillet, corrigé le même jour)

Les deux points bloquants identifiés dans l'investigation initiale sont maintenant faits, 
voir la section "Sécurité compte/facturation" tout en haut de ce document pour le détail 
complet (audit, fixes, tests end-to-end) :
1. Les 4 routes `player/*` vérifient `supabase.auth.getUser()` côté serveur.
2. Flux de liaison Vault ↔ Hypixel construit (`hypixel_account_links` + 
   `/api/link-hypixel-account` + UI minimale `/link-hypixel`).

Toujours pas fait avant de rebrancher `EvolveSection.tsx` dans `page.tsx` : reconstruire 
le frontend lui-même (l'ancien design du 13 juillet ne correspond plus à l'architecture 
Skills/Milestones/Daily Missions) — c'est un chantier produit, plus un chantier sécurité.

**Personal Money Making — absorbé par la section Skills, voir ci-dessous.** Ancien plan 
(table `player_money_making`, 5 méthodes actives + 5 futures) abandonné avant d'être codé : 
remplacé par une architecture plus large et plus granulaire (par système de progression, 
pas par méthode globale). Ne pas reproposer l'ancien format.

## ✅ Evolve — nouvelle architecture à 3 sections (22 juillet, remplace l'ancien plan à 4 onglets)

Evolve devient **Skills / Milestones / Daily Missions**. Une 4e section premium sera 
définie plus tard (piste probable : progression globale/networth dans le temps, une fois 
qu'on aura un historique de snapshots — voir Prochaines étapes).

### ✅ Section Skills — TERMINÉ et testé (22 juillet)

Le cœur du produit. Fusionne l'ancien "Skills" et "Personal Money Making" en une seule 
logique : pour chaque système de progression actionnable, une carte à deux volets — 
**état actuel réel** (setup réellement possédé + coins/h dérivé de ce setup, jamais un 
chiffre générique de tier) vs **target atteignable** (le prochain pas concret, calibré sur 
le `purse` réel du joueur, pas juste son `game_stage`/networth global).

**9 systèmes actionnables** : Farming, Mining, Combat, Foraging, Fishing, Alchemy, 
Enchanting, Dungeoneering (Catacombs), Slayer (1 carte, 6 sous-cartes par boss : 
Zombie/Spider/Wolf/Enderman/Blaze/Vampire — pas 5, corrigé lors du design).

**Exclus, avec justification** (à ne pas reproposer sans nouvelle donnée) :
- **Carpentry** : aucun produit revendable, débloque juste des slots de minions.
- **Taming** : booste l'XP des pets, ne génère pas de coins directement. Angle 
  money-making réel adjacent (élever/revendre des pets, `george_pet_prices` existe déjà) 
  mais structurellement différent (flip, pas rendement/heure) — carte séparée éventuelle, 
  pas "Taming".
- **Hunting** : multiplicateur du taux de drop de Combat, pas une boucle de farm 
  indépendante.
- **Social** : aucun lien avec le rendement économique.

**Garde-fou principal (le point le plus important du design)** : jamais halluciner un item 
que le joueur ne possède pas — `current` grounded strictly sur `equipped_armor`/
`equipped_accessories`/`hotm_progress`/slayers/dungeons décodés. Pour un joueur sans setup 
(early game), la target ne doit jamais viser un objectif hors de portée — calibrée sur le 
`purse` réel, pas un objectif générique de fin de jeu. Si un système n'est pas encore 
débloqué (ex : Catacombs jamais entré), `target.type = "unlock_access"` plutôt qu'optimiser 
un rendement qui n'existe pas.

**Validé sur 2 profils réels avant merge** (Voxui09) :
- **Cucumber** (MID, purse 154.8M, networth 749M) — révèle un vrai cas "moyens mais skill 
  négligé" : carte Dungeoneering a correctement identifié 220 runs Catacombs / Floor 7 
  (vraie progression) mais armure **Groovy Fig** équipée (un set Foraging, aucun stat 
  donjon) — a recommandé Maxor's/Necron's comme achat le plus rentable disponible plutôt 
  que d'inventer un problème ailleurs. Carte Mining a honnêtement marqué `confidence: LOW` 
  faute de donnée d'outil fiable, au lieu d'inventer un chiffre précis.
- **Orange** (EARLY, purse 8 100, networth 8 100, tous skills niveau 0) — profil quasi-vide 
  réel de Voxui09, synced explicitement via `profile_id` pour valider le garde-fou early-
  game. Résultat correct : targets Farming/Mining = outil de base ~100 coins (dans le 
  budget), Slayer a correctement séparé Zombie (accessible maintenant) d'Enderman/Blaze/
  Vampire (correctement marqués hors de portée, zones non débloquées) plutôt que de 
  proposer un objectif générique de fin de jeu.

**Implémentation :**
- `member.skill_tree` (PAS `member.mining_core`, qui ne contient que powder/crystals/
  forge) décodé dans `player/sync` → `player_data.hotm_progress` (jsonb : nodes bruts 
  mining+foraging, ex `mining_speed: 9`, pas de tier dérivé — aucune table XP→tier vérifiée 
  en interne, donc pas codée en dur). Vérifié contre le code source de `hypixel-api-reborn` 
  avant codage (les perks HOTM ne vivent pas où on l'aurait supposé).
- `lib/money-making-constants.ts` — `TIER_CONFIG`/`GAME_TRUTHS` extraits de 
  `money-making-agent`, partagés par les deux crons (plus de dérive entre les benchmarks 
  coins/h généraux et personnalisés).
- `app/api/cron/evolve-skills/route.ts` — cron hebdomadaire (lundi 6h30, 30 min après 
  `money-making-agent` pour lire sa bibliothèque déjà fraîche comme référence/inspiration, 
  jamais copiée telle quelle). 1 appel Claude par profil synced (`claude-sonnet-4-6`, 
  `max_tokens: 16000`, `maxDuration: 300` — 120s/8000 tokens insuffisants pour la sortie 
  structurée des 9 cartes + 6 sous-cartes slayer, les deux relevés après un vrai échec 
  en prod, pas en anticipant).
- Table `player_skill_cards` (1 ligne par joueur par profil, upsert hebdomadaire, pas de 
  log quotidien — la boucle de progression est un effet de la fraîcheur des données 
  recalculées à chaque run, pas une logique "target atteinte" à tracker séparément). RLS 
  activé, **zéro policy** (verrouillé service-role uniquement, comme `player_data` — pas 
  la policy lecture publique utilisée pour le contenu de jeu générique comme 
  `game_mechanics_misc`, ce sont des données personnelles par joueur).
- Rendu visuel 3D du setup (skin + armure superposée) : chantier séparé, pas fait, 
  structure de données uniquement pour l'instant.

**⚠️ Bug trouvé et corrigé après le premier test (22 juillet, même jour)** : le prompt ne 
regardait que `equipped_armor`/`equipped_accessories` pour construire `current` — jamais 
`inventory_items`, `ender_chest_items`, `backpacks`, `personal_vault_items`, ni 
`wardrobe_slots`. Conséquence réelle constatée sur Cucumber : la carte Dungeoneering 
recommandait d'**acheter** un set Necron's/Maxor's (80-150M) alors qu'un set Ancient 
Necron's ✪✪✪✪✪ complet dormait déjà en Wardrobe slot 2, et qu'un set Ancient Crimson 
✪✪✪✪✪, un set Ancient Shadow Assassin ✪✪✪✪✪ complet, et un Livid Dagger ✪✪✪✪✪ dormaient 
dans le Jumbo Backpack — tous des swaps gratuits. Corrigé par `collectOwnedButUnequipped()` 
qui scanne les 5 emplacements non couverts et les envoie taggés par localisation, plus un 
nouveau `target.type: "free_swap"` (`budget_estimate: 0`, nomme l'item exact + son 
emplacement) distinct de `"upgrade"`. Le prompt marque maintenant explicitement 
"recommander un achat pour un item déjà possédé" comme le pire échec possible de la 
fonctionnalité — pire qu'une target hors de portée, parce que ça fait dépenser de l'argent 
réel pour rien. Revalidé sur Cucumber après fix : la carte propose bien le swap gratuit 
en nommant l'emplacement exact.

**⚠️ Trouvé en marge, pas corrigé** : `player_missions` a des policies RLS totalement 
publiques (SELECT/INSERT/UPDATE, `USING (true)`) — n'importe qui peut lire/modifier les 
missions de n'importe quel joueur via la clé anon. Même famille de problème que le bug 
`game_mechanics_misc` déjà corrigé, mais sur des données personnelles cette fois. Pas 
traité cette session (hors scope de la demande), à corriger avec la même logique que 
`player_skill_cards`/`player_data` (RLS verrouillé, service role uniquement) quand le 
chantier sécurité auth sera fait.

## ✅ Chantier NBT joueur + networth réel — TERMINÉ (22 juillet)

Remplace l'ancienne limite "networth = purse+bank uniquement". Statut final :

1. **Décodage NBT complet joueur** — ✅ **fait et en prod**, les 7 catégories exposées 
   par l'API Hypixel côté inventaire joueur, chacune sa colonne jsonb sur `player_data` : 
   armure équipée (`equipped_armor`), accessory bag (`equipped_accessories`), inventaire 
   principal (`inventory_items`), enderchest (`ender_chest_items`), backpacks 
   (`backpacks`), Personal Vault (`personal_vault_items`), wardrobe (`wardrobe_slots`). 
   Tout validé sur un vrai joueur (Voxui09/Cucumber) avant merge, routes de debug 
   temporaires supprimées après validation à chaque fois.
   - Même format binaire base64-gzip que `ah-collect`, mais le décodeur ne pouvait pas 
     être appelé tel quel : `decodeItemBytes` (AH) suppose un seul item par blob 
     (`items[0]`), alors qu'un blob d'inventaire joueur encode une liste de plusieurs 
     items. `lib/skyblock-item-decoder.ts` refactorisé : logique par-item extraite dans 
     `decodeItemNBT`, réutilisée par `decodeItemBytes` (inchangé, AH) et la nouvelle 
     `decodeItemListBytes` (multi-items, joueur).
   - Backpacks : `backpack_icons` et `backpack_contents` sont deux objets indexés par la 
     **même clé slot** (vérifié explicitement contre le code source de `hypixel-api-reborn`, 
     pas supposé par ordre de tableau) — 8 sacs / 116 items confirmés sur Cucumber.
   - Personal Vault (`member.inventory.personal_vault_contents`) — c'est la feature nommée 
     "Vault" du jeu, **différente** des coffres posés sur l'île ou des items dans le monde 
     de l'île (voir limite API ci-dessous). Même format simple que inv_contents/enderchest.
   - **⚠️ Limite API confirmée (pas un chantier en attente, une vraie impossibilité)** : 
     les coffres posés sur l'île et les items présents dans le monde de l'île **ne sont 
     pas exposés par l'API Hypixel publique**, à aucun endroit. Recherche exhaustive faite 
     dans tout l'arbre de structures de `hypixel-api-reborn` (lib TS activement maintenue, 
     modélise le schéma complet de l'API) — aucun champ de ce type n'existe. L'API expose 
     des données de profil/inventaire joueur, jamais l'état du monde/des chunks. Ce n'est 
     pas une question de permission ou de setting à activer, la donnée n'existe simplement 
     pas dans la réponse JSON de Hypixel.
   - **Wardrobe (tenues sauvegardées, `member.loadout.armor`, objet indexé par slot "1".."27" 
     × 4 pièces)** ✅ **fait et en prod**. Confirmé **PAS des doublons** de l'armure déjà 
     comptée : le wardrobe permute avec `inv_armor` (l'armure équipée), donc toute tenue 
     stockée dans un slot non porté est invisible ailleurs (pas dans `inv_armor`, pas dans 
     l'inventaire/enderchest/backpacks). Validé sur Cucumber : 5 slots débloqués, 3 pleins 
     avec de vrais sets complets (Wise Yog, Ancient Necron's ✪✪✪✪✪, Necrotic Aurora ✪✪✪✪✪).
   - **Découverte notée, pas creusée** : chaque item NBT (armure au moins) porte un champ 
     `extra.donated_museum` (+ `timestamp`, `boosters`) absent des items d'AH — probablement 
     un flag/timestamp indiquant si une copie de cet item a été donnée au musée. Pourrait 
     donner un raccourci pour le blocage Musée (évite l'appel `/v2/skyblock/museum` séparé) 
     mais à valider avant d'en dépendre — pas urgent.
2. **Vrai networth** — ✅ **fait, en prod, validé sur Cucumber** (748 978 005 vs 164 935 046 
   avant le fix ci-dessous, cohérent avec purse 154M + plusieurs sets ✪✪✪✪✪ complets). 
   Calculé depuis les items réels décodés × prix marché déjà collecté en interne, plus 
   purse+bank. Breakdown détaillé par catégorie stocké dans `player_data.networth_breakdown` 
   (jsonb : purse, bank, items_total, et par catégorie value/items_priced/items_unpriced), 
   `networth` est le vrai total. Chaque item décodé porte `variant_key_full`/
   `variant_key_base`/`item_count` (sans ça, impossible de matcher un prix).
   - **Bug critique trouvé et corrigé** : `calculateNetworth` interrogeait `price_history_ah` 
     pour le matching par variante — mais cette table (granularité DAILY) est une **moyenne 
     par item toutes variantes confondues**, écrite avec un `variant_key` placeholder 
     (`'nostar_norecomb_noreforge'`) qui ne correspond à l'état réel d'aucun item. Résultat : 
     armure/accessoires/wardrobe pricés à 0 quel que soit le tier. La vraie source par-variante 
     est `price_history_ah_variants` (déjà filtrée `scan_count >= 3` à l'écriture) — 
     `calculateNetworth` pointe maintenant dessus. `price_history_ah` reste utilisée ailleurs 
     (vue item agrégée) mais **ne doit jamais servir à pricer une variante précise**.
   - **`detectGameStage` recalibré en même temps** : les seuils networth actuels 
     (5M/100M/1B) datent de l'époque "networth = purse+bank uniquement" et sous-comptaient 
     largement les joueurs bien équipés. Alignés sur les bandes déjà validées de Money 
     Making (0-50M / 50M-500M / 500M-5B / 5B+) plutôt que d'inventer de nouveaux seuils — 
     élimine aussi l'incohérence entre les deux définitions de EARLY/MID/END/LATE qui 
     coexistaient dans le code. Le gate est un OR sur networth ET avg skill (le plus 
     restrictif des deux fixe le stage) — validé sur Cucumber : networth 748M (> seuil END) 
     mais avg skill ~23 (< 25) → reste bloqué en MID, comportement voulu.
   - **⚠️ Amélioration future notée, pas la version finale** : `game_stage` ne devrait à 
     terme pas se baser sur le networth (un item cher hérité/acheté ne reflète pas 
     l'avancement réel du joueur), mais sur un score composite de puissance/avancement 
     global — skills, niveaux catacombs/slayer, qualité réelle de l'équipement (étoiles/
     reforge/enchants présents) — avec le networth comme un signal parmi d'autres, pas 
     dominant. Le recalibrage actuel (seuils Money Making) est une amélioration 
     incrémentale sur la même logique existante, pas cette refonte.
3. **Skyblock Level + XP Guide** comme référentiel de tiers/milestones, en remplacement 
   ou complément du découpage EARLY/MID/END/LATE actuel (basé sur networth + avg skill).
4. **Historique de progression par snapshots** — mesurer la vitesse de progression 
   early→mid→end→late d'un joueur dans le temps, et permettre la comparaison entre joueurs.

## ✅ Evolve — Milestones — REFONTE COMPLÈTE TERMINÉE ET VALIDÉE (23 juillet, 2 passes)

Remplace intégralement l'ancien système (paliers codés en dur : skill levels/slayer 
XP/dungeon floors/fairy souls/top-10 collections, un flat array) par le vrai guide de 
complétion à 7 tiers (Starter→Amateur→Intermediate→Skilled→Expert→Professional→Master).

**Source des tâches — hybride, décidé après audit de ce qui existait déjà en base :**
- **Tâches "wiki"** — scrapées en direct depuis le wiki officiel 
  (`hypixelskyblock.minecraft.wiki`, page `SkyBlock Guide/Tasks/<Tier>`), jamais l'ancien 
  scrape Fandom tronqué à 8000 caractères. Parser dédié dans `milestones-sync` qui décode 
  les templates `{{Skl|Skill|Numeral}}` et `{{Coll|Item Numeral}}` (chiffres romains → 
  arabe, ex: `LX`→60 — cohérent avec le cap skill 60 déjà vérifié ailleurs).
- **Tâches "vault"** — Fairy Souls (échelle déjà vérifiée `[50,100,150,200,255]`) + 12 
  catégories `sblevel_tasks` confirmées absentes du guide wiki (réconciliation des 53 
  tâches réelles sblevel_tasks contre les tâches wiki) : `fast_travel_unlocked`, 
  `essence_crimson_shop`, les 4 tâches d'event (`mining_fiesta`/`spooky_festival`/
  `fishing_festival`/`jacob_farming_contest`), `unlocking_relays`, `mythological_kills`, 
  `complete_objectives`, et les 3 `skill_related_task` (activité brute farming/mining/
  fishing). Requirement type `uncollected`, toujours `data_available:false` — montrées 
  comme roadmap en attente plutôt que masquées.

**⚠️ 2e passe (même jour) — écart massif découvert et corrigé.** La 1ère version stockait 
1 ligne `milestone_tasks` par catégorie composite du wikitable (ex: "Collections" = 1 
ligne regroupant 18 requirements), donnant 179-196 lignes pour 7 tiers. Or la page 
overview `SkyBlock Guide` (tableau "Stages", vérifié par fetch direct) annonce 
**2237 tâches individuelles** au total : Starter 120, Amateur 247, Intermediate 448, 
Skilled 507, Expert 479, Professional 294, Master 142. Restructuration complète : 
**chaque requirement individuelle est maintenant sa propre ligne** `milestone_tasks` 
(même granularité que ce que Daily Missions utilisait déjà en interne) — 1616 tâches wiki 
+ 17 vault = 1633 lignes au total après restructuration, contre 289 avant.

**Honnêteté sur l'écart restant** : même après restructuration, on reste sous les 2237 
annoncés (1633 vs 2237, ~73%). Cause confirmée, pas un bug de notre côté : la page 
overview marque elle-même sa section "Tasks" `{{Outdated|section=yes}}`, et les 
sous-pages par tier sont démontrées incomplètes au-delà de Starter/Master — validé par 
deux méthodes indépendantes (somme des requirements sur le wikitext ET comptage `<li>` 
sur le HTML rendu, qui s'accordent à quelques unités près). Nouvelle table 
`milestone_tier_totals` stocke le total annoncé par tier (scrapé automatiquement depuis 
la même page overview à chaque run de `milestones-sync`), exposée dans l'API 
(`tasks_known` vs `tasks_announced`) pour que Milestones affiche honnêtement "X tâches 
connues sur ~Y annoncées" plutôt que de laisser croire que le compte scrapé est le vrai 
total du jeu. Répartition connue/annoncée par tier (23 juillet) : Starter 134/120, 
Amateur 148/247, Intermediate 279/448, Skilled 392/507, Expert 310/479, 
Professional 217/294, Master 136/142 — cohérent avec "Starter et Master quasi complets 
(les tiers les plus édités), le grind du milieu délaissé par les contributeurs wiki".

**Calcul de progression — strictement limité à ce qui est vérifiable aujourd'hui :** une 
tâche individuelle n'affiche une progression que si sa requirement est d'un type qu'on 
sait vérifier avec certitude : `skill` (niveau déjà calculé dans `player_data.skills`, 
pas de reconversion XP) et `collection` (via `player_data.collections` + la table 
`collections` déjà vérifiée). Tout le reste (`item`/`mobtype`/`uncollected` — accessoires 
précis, minions, musée, essence, dojo...) reste `data_available: false` jusqu'à ce que le 
chantier de collecte totale étende `player/sync` à ces zones.

**2 bugs réels trouvés et corrigés pendant la validation :**
1. La colonne `tiers` de la table `collections` utilise la clé JSON `amountRequired` 
   (camelCase), pas `amount_required` — l'ancien `milestones/route.ts` faisait déjà 
   cette même erreur silencieusement, donc son "top 10 collections" ne fonctionnait 
   probablement jamais correctement.
2. Postgres rejette un batch `ON CONFLICT DO UPDATE` contenant deux fois la même clé de 
   conflit ("cannot affect row a second time") — le wiki liste réellement certains items 
   deux fois dans une même catégorie (ex: "Pyrochaos Dagger" apparaît deux fois dans le 
   musée de Master). Dédupliqué avant upsert (garde la première occurrence, même tâche 
   réelle, aucune perte).

**Infra** : `milestone_tasks` (granularité individuelle) + `milestone_tier_totals` 
(totaux annoncés) + cron `milestones-sync` (mensuel, le 1er à 6h). 
`player/milestones/route.ts` restructuré autour de `computeMilestones(uuid, profileId)`, 
exportée et réutilisable (même pattern que `runEvolveSkills`).

**Validé sur Cucumber et Orange, les deux passes (23 juillet)** :
- **Cucumber** (MID, 220 runs Catacombs) : progression réelle et cohérente, décroissante 
  avec la difficulté des tiers — complétion (tâches calculables) 19/28 (Starter) → 
  31/51 (Amateur) → 26/55 (Intermediate) → 16/56 (Skilled) → 5/43 (Expert) → 2/21 
  (Professional) → 0/10 (Master).
- **Orange** (EARLY, profil quasi-vide, tous skills niveau 0) : 0 complétion strictement 
  partout, sur les 7 tiers — confirme le même garde-fou early-game déjà validé pour 
  Skills (jamais de progression fictive sur un profil vide).

## ✅ Evolve — Daily Missions — RECONSTRUITE, dépend enfin réellement de Milestones (23 juillet, révisée le même jour : 10 quêtes, mélange tiers débloqués)

Remplace l'ancien générateur indépendant (`generateMissions()`, if/else codés en dur sur 
skills/slayers/dungeons, aucun lien avec Milestones). Logique actuelle 
(`buildMissionCandidates()`, exportée et testable) :
1. Trouve le **tier actuel** du joueur : le premier tier (Starter→Master) qui a encore au 
   moins une tâche `data_available:true` non complétée. Un tier avec zéro tâche 
   calculable, ou dont toutes les tâches calculables sont déjà faites, est sauté (transparent, 
   ni bloquant ni "actuel" en soi).
2. Pioche dans **ce tier ET tous les tiers avant lui** (déjà débloqués par construction) — 
   jamais un tier après le tier actuel, qui reste non débloqué. Depuis la restructuration de 
   `milestone_tasks` en granularité individuelle (voir section Milestones), chaque ligne 
   EST déjà une requirement individuelle, plus besoin de casser une tâche composite ici.
3. Classe l'ensemble combiné par ratio `current/target` décroissant (le plus proche de la 
   complétion en premier — vraie victoire rapide dérivée de données réelles, jamais un temps 
   estimé inventé), garde les **10** premières (relevé de 5 à 10 le 23 juillet).

**Aucune récompense inventée** : `coins_reward`/`xp_reward` mis à 0 sur chaque mission 
(l'ancien système avait des valeurs codées en dur sans base réelle — pas reconduit).

**Validé sur Cucumber et Orange (23 juillet, après la révision à 10)** — via route debug 
temporaire appelant directement `buildMissionCandidates()`, supprimée après validation :
- **Cucumber** (MID) : 9 candidats retournés, tous du tier Starter (`Alchemy level 4 3/4`, 
  `Cobblestone/Coal/Leather/Raw Chicken/Raw Mutton/Gravel Collection`, `Carpentry level 4`, 
  `Hunting level 4`) — Starter n'est pas encore fini pour ce joueur (skills annexes 
  négligés malgré son avancement général), donc `currentTierIndex = 0` et il n'y a aucun 
  tier "avant" à mélanger. Comportement correct, pas un bug — le mélange multi-tier ne 
  s'active que quand un joueur a un tier antérieur fini mais avec des restes calculables 
  encore incomplets, cas non rencontré sur ces deux profils de test.
- **Orange** (EARLY, profil vide) : 10 candidats, tous Starter niveau 4 (tous les skills à 
  0/4) + 1 collection — jamais de mission hors de portée, même garde-fou early-game que 
  Skills et Milestones.

**Limite connue, mineure, inchangée** : parmi des candidats strictement à égalité (ratio 
0/0 par exemple), l'ordre de sélection n'est pas garanti stable d'un run à l'autre (dépend 
de l'ordre de retour Postgres, pas de tri secondaire). Toutes les valeurs affichées 
restent réelles et honnêtes — juste l'ensemble exact des 10 peut varier entre deux 
requêtes le même jour pour un joueur avec beaucoup de candidats à zéro. Pas bloquant, 
amélioration possible plus tard (tri secondaire déterministe).

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
8. **La landing page (hero + `/features` + `/about`) doit refléter fidèlement 
   ce qui existe réellement dans le dashboard — jamais une fonctionnalité 
   aspirationnelle, renommée ou obsolète.** Vérifier contre le vrai code des 
   composants (`app/dashboard/*`, `components/*`) avant d'écrire une 
   description marketing, jamais de mémoire ni de supposition — même règle 
   que le point 7, appliquée au contenu marketing plutôt qu'aux mécaniques de 
   jeu. Trouvé en pratique (27 juillet) : la copie annonçait un "#ah-sniper" 
   qui n'a jamais existé comme onglet (`app/dashboard/page.tsx` n'a que 5 
   tabs : Flash/Money/Patches/Radar/Evolve, AH Sniper a été absorbé par 
   Radar), et décrivait Money Making comme des "flips Bazaar/AH" alors que 
   le composant réel (`MoneyMakingSection.tsx`) n'a que deux catégories : 
   Active Grind et Vault Exclusive — zéro rapport avec du flip. **Corollaire 
   permanent : à chaque modification majeure du dashboard ou nouvelle 
   mécanique ajoutée (nouvel onglet, nouvelle catégorie, renommage, feature 
   retirée), le hero et les pages de features doivent être mis à jour dans 
   la même session, pas laissés dériver.** Le hero n'est jamais "verrouillé" 
   au sens de figé indéfiniment — seule sa composition visuelle (image de 
   fond) l'est pour l'instant ; son contenu textuel doit rester vivant et 
   suivre le produit réel en continu, exactement comme le reste du dashboard 
   (voir Philosophie d'évolution continue ci-dessous).

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

1. **✅ `HYPIXEL_API_KEY` — rechargée manuellement, fonctionnelle (23 juillet).** Après le 
   `403 Invalid API key` confirmé en Phase 2 puis reconfirmé sur `/api/player/sync` avec 
   un vrai compte, la clé a été rechargée manuellement côté Vercel — revérifiée en direct 
   (`200`, `success:true`, profils réels renvoyés). **C'est une clé de dev qui expire 
   régulièrement** (prochaine échéance ~25/07) — rechargement manuel à refaire à chaque 
   expiration tant que le produit n'est pas passé en clé de production (démarche de 
   validation officielle auprès de Hypixel, prévue une fois le produit terminé). 
   **`player/sync` détecte maintenant explicitement ce cas** : un `401`/`403`/
   `success:false` de l'API Hypixel est loggé dans `sync_log` avec un message clair 
   ("HYPIXEL_API_KEY invalide ou expirée — à régénérer sur developer.hypixel.net") au lieu 
   de se traduire silencieusement en 404 "No matching Skyblock profile found" — c'est 
   exactement comme ça que la panne Phase 2 était passée inaperçue jusqu'à l'audit manuel. 
   Phase 0 (infra) et Phase 1 (Classes de donjon) du chantier collecte totale restent 
   terminées et validées ; Phase 2 (Boss kills) peut reprendre.
2. Étendre la couverture `data_available:true` de Milestones/Daily Missions au fur et à 
   mesure que le chantier collecte totale avance (essence, musée, minions, accessoires 
   précis...) — les 12 catégories `uncollected` ajoutées le 23 juillet passeront à 
   calculable une par une
3. Historique de progression par snapshots (vitesse early→mid→end→late, 
   comparaison entre joueurs) — piste pour la 4e section Evolve premium
4. Rendu visuel 3D du setup (skin + armure superposée) pour la section Skills — chantier 
   séparé, pas commencé
5. Migration vers `item_variant_hourly_buckets` (conçu, pas branché)
6. Filtrage outlier sur variantes AH à faible `data_points` (voir section infra collecte)
7. `method_feedback_summary` (vue `SECURITY DEFINER`) à corriger avant que 
   `method_feedback` ait de vraies données (voir section sécurité)
8. Câbler le frontend Free pour Flash Alerts/Patch Analysis dégradés (backend prêt : 
   vues preview + `/api/market-data` filtré, voir section gating) — pas fait

## Ce que je ne veux PAS

- Repartir sur n8n / Google Sheets / SkyCrypt
- Reproposer une refonte Money Making sans demande explicite
- Fragmenter les appels Claude par sous-catégorie
- Repartir sur "NBT enchantements différé" — c'est fait, pipeline live
- Purge SQL sans vérifier le contenu réel de la table de référence
- Reconstruire l'ancien design Evolve du 13 juillet sans vérifier d'abord le repo