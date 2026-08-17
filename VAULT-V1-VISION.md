# Vault v1 — vision finale (figée, 17 août 2026)

> Vision complète dictée par l'utilisateur le 17 août 2026, à considérer comme
> la cible définitive de la v1. **Aucun système ne doit être modifié sans
> accord explicite préalable de l'utilisateur** — toute évolution vers cette
> vision doit être proposée (avec option d'optimisation) et validée avant
> exécution. Ce document sert de référence pour tout audit futur de
> complétude ("qu'est-ce qu'il reste à construire pour atteindre cette
> vision").

## Supabase — deux ponts logiques

### Pont Pricing

- `ah-collect` scanne l'intégralité de l'AH par pagination, **BIN only**
  (Buy It Now), jusqu'à épuisement, toutes les 60 secondes.
- Pour chaque item : décode le NBT, maintient **deux prix distincts** —
  prix de **listing** (mise en vente) et prix de **vente** (transaction
  conclue) — chacun en **3 moyennes glissantes distinctes** dans un buffer :
  - **raw** : l'item + toutes ses variantes confondues
  - **variante base** : l'item + ses variantes similaires à réel impact prix
    (étoiles/recomb, sans reforge)
  - **variante exacte** : l'item + son semblable exact (spec complète)
- Ces moyennes produisent **1 point de donnée journalier** par item raw,
  par variante base, par variante exacte, dans leur table dédiée.
- La table raw a une **continuité avec l'historique SkyCofl sur 6 ans** —
  sans rupture entre l'import historique et les points produits en live.
  SkyCofl ne couvre que le raw (pas les variantes) sur 6 ans — les
  variantes base/exacte n'ont d'historique que depuis le début de la
  collecte live.
- Sert : Flash Alert, propositions de flips, Radar (graphiques
  multi-timeframe), et tout calcul Pluton (Money Making/Evolve) qui a
  besoin de vérifier un prix (exact ou général).

### Pont Mécanique

1. **Cartographie** — toutes les sources fiables (API Hypixel, repos
   communautaires NEU-REPO/SkyHanni-REPO, wiki officiel).
2. **Extraction** — Haiku + parseur maison, complétude informationnelle du
   jeu de 0% à 100%.
3. **Pluton** (le moteur) — répond aux objectifs dashboard **Money Making
   et Evolve Skills uniquement** (Milestones et Daily Quest n'ont PAS
   besoin de Pluton) via calcul SQL déterministe + proposition Haiku par
   recherche intelligente intra-tables quand le calcul seul ne suffit pas.

Les deux ponts sont alimentés par des crons Vercel — automatisation,
optimisation et mise à jour des tâches/données, dans toute leur forme.

## Structure du produit

**Page d'accueil** — Vault n'est pas exclusivement Hypixel Skyblock : une
page d'accueil Vault générale (DA propre) précède la section Hypixel
Skyblock (mix DA Vault + jeu), accessible en cliquant pour entrer dans le
produit dédié au jeu.

**Page Hypixel Skyblock** — hero expliquant le contenu de Vault, pricing
connecté à Stripe, page de détail complet des fonctionnalités, pages légales
(mentions légales/confidentialité). **100% conforme à la législation
française et aux règles d'usage de l'API Hypixel** (usage légal des
données).

## Dashboard

### Flash Alert
Déjà décrit précédemment (alertes de marché temps réel).

### Money Making
7 sections (Starter → Master), chacune avec **3 méthodes "active money
making"** (meilleures méthodes actives au global) et **3 méthodes
"exclusives Vault"** (innovantes, créées par croisement multi-sources).
Onglet **rating** — note + commentaire texte par méthode proposée par
Pluton, stocké dans une table mémoire, alimentant une amélioration continue
des propositions. Clic sur une méthode → setup complet affiché avec le
visuel style SkyCrypt du skin du joueur équipé (armure/armes/loadout).

### Patch
Analyses patch live ET alpha, stockées et réutilisées dans les calculs
Pluton pour du prévisionnel (insights, prédiction d'impacts). Onglet **deep**
— analyse approfondie des derniers patchs alpha/live.

### Radar
Barre de recherche par item raw (ex: "Hyperion") → graphique de l'historique
raw en daily jusqu'à years. En dessous, toutes les variantes trackées —
clic sur une variante → graphique de suivi daily dédié à cette variante.
Pour les items Bazaar : même principe mais plus simple (items raw sans
variantes).

### Evolve
Trois onglets :
- **Skills** — visuel par skill (barre d'XP). Clic → setup actuel du joueur
  (scan NBT réel de ce qu'il possède/porte) à gauche (même visuel que Money
  Making), avec mention des coins/heure espérés et la méthode associée ;
  à droite, le prochain setup à obtenir pour progresser + la prochaine
  méthode Money Making à viser. Progression par palier setup/skill/jeu.
- **Milestones** — 7 tiers avec jalons mineurs/intermédiaires/majeurs,
  classés dans un ordre logique de complétude 0→100% du jeu. **70% des
  objectifs d'un palier minimum requis pour passer au suivant.** Tier 7 à
  100% = profil maxé, 100% informationnel.
- **Daily Quest** — objectifs journaliers optimaux complétant Milestones,
  pour la progression la plus efficiente possible.

Le re-sync du profil joueur reste **manuel** (jamais de polling continu —
conformité API Hypixel). La progression est une comparaison directe du
profil joueur réel contre la table de référence 0→100% du jeu.

## Exigences transversales

- **100% légal** (droit français + conditions d'usage API Hypixel).
- **100% fiable**.
- **Architecture en béton** : fonctionnelle, compacte, organisée, bien
  huilée — pas de fragmentation, pas de duplication, chaque système
  automatisé de bout en bout (collecte ET mise à jour).
