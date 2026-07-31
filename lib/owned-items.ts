// lib/owned-items.ts
// Bloc 6 (audit 8 blocs), 31 juillet -- possession d'item par nom, pour
// computeMilestones()'s requirement_type 'item_owned'. Match directement
// contre l'inventaire RÉEL du joueur (pas item_stats/items_catalog, qui ne
// sont scopés qu'aux items actifs sur le marché AH/Bazaar -- vérifié en
// base : seulement 22-33% des 1302 tâches "item" y matchaient exactement,
// contre des items réels absents des deux catalogues comme des pets ou des
// pièces de musée jamais tradées). Décidé avec l'utilisateur après un test
// d'échantillon sur Cucumber.
export type OwnedItemNames = { generalNames: Set<string>; petNames: Set<string> }

// Formats réels confirmés sur l'inventaire décodé de Cucumber : étoiles en
// caractères ✪ littéraux en fin de nom ("Moonglade Figstone Splitter ✪✪✪✪✪"),
// pets préfixés "[Lvl N] " ("[Lvl 1] Frog"). Pas de texte de reforge intégré
// au nom dans l'échantillon vérifié (champ séparé).
export function normalizeItemName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .replace(/\s*✪+\s*$/, '')
    .replace(/^\[Lvl \d+\]\s*/i, '')
    .trim()
    .toLowerCase()
}

// Rassemble tous les vrais noms d'items possédés par le joueur, tous
// emplacements confondus -- même liste de sources que
// collectOwnedButUnequipped() (evolve-skills/route.ts) + equipped_armor/
// equipped_accessories (déjà couverts ailleurs dans ce fichier via
// current réel, mais absents de collectOwnedButUnequipped puisque c'est
// justement la liste des items NON équipés). Sortie différente
// (Set de noms normalisés, pas du texte pour un prompt Claude) donc pas
// une factorisation directe de cette fonction-là, même source de données.
export function collectOwnedItemNames(player: any): OwnedItemNames {
  const generalNames = new Set<string>()
  const add = (item: any) => { if (item?.item_name) generalNames.add(normalizeItemName(item.item_name)) }

  for (const item of Object.values(player.equipped_armor || {})) add(item)
  for (const item of (player.equipped_accessories || [])) add(item)
  for (const item of (player.inventory_items || [])) add(item)
  for (const item of (player.ender_chest_items || [])) add(item)
  for (const bp of (player.backpacks || [])) for (const item of (bp.items || [])) add(item)
  for (const item of (player.personal_vault_items || [])) add(item)
  for (const slot of (player.wardrobe_slots || [])) for (const piece of ['helmet', 'chestplate', 'leggings', 'boots']) add(slot[piece])

  // player_data.pets est un champ SÉPARÉ (roster complet actif+inactifs,
  // {type,tier,level,active,heldItem}) -- absent de tous les tableaux NBT
  // ci-dessus. Bug réel trouvé en testant (31 juillet) : sans cet ajout,
  // un pet réellement possédé (BEE, GRANDMA_WOLF confirmés sur Cucumber)
  // remontait "non possédé".
  const petNames = new Set<string>()
  for (const pet of (player.pets || [])) {
    if (pet?.type) petNames.add(String(pet.type).replace(/_/g, ' ').toLowerCase())
  }

  return { generalNames, petNames }
}

// item_name côté wiki porte un suffixe " Pet" ("Bee Pet") que le vrai champ
// pets[].type n'a jamais ("BEE") -- retiré avant comparaison pour cette
// catégorie précise uniquement.
export function isItemOwned(owned: OwnedItemNames, itemName: string, category: string): boolean {
  const target = normalizeItemName(itemName)
  if (owned.generalNames.has(target)) return true
  if (category === 'Pets') return owned.petNames.has(target.replace(/\s*pet\s*$/, '').trim())
  return false
}
