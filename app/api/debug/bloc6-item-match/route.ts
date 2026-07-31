// Temp debug route -- Bloc 6.2/6.3 sample test, verifies item_owned matching
// (target item_name normalized + compared against the PLAYER'S real owned
// NBT item_name values, not the global item_stats/items_catalog tables --
// confirmed with the user as the right approach after catalogs only
// exact-matched 22-33% of the 1302 "item" tasks). Deleted after validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CUCUMBER_UUID = '74a06395-3a99-4796-95d0-9e392ba3da7e'
const CUCUMBER_PROFILE = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'

// Real formats confirmed on Cucumber's actual decoded inventory: stars
// appended as literal ✪ characters ("Moonglade Figstone Splitter ✪✪✪✪✪"),
// pets prefixed "[Lvl N] " ("[Lvl 1] Frog"). No reforge text embedded in
// item_name (separate field) in the sample checked.
function normalizeItemName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .replace(/\s*✪+\s*$/, '')
    .replace(/^\[Lvl \d+\]\s*/i, '')
    .trim()
    .toLowerCase()
}

function collectOwnedNames(player: any): { generalNames: Set<string>; petNames: Set<string> } {
  const generalNames = new Set<string>()
  const add = (item: any) => { if (item?.item_name) generalNames.add(normalizeItemName(item.item_name)) }

  for (const item of Object.values(player.equipped_armor || {})) add(item)
  for (const item of (player.equipped_accessories || [])) add(item)
  for (const item of (player.inventory_items || [])) add(item)
  for (const item of (player.ender_chest_items || [])) add(item)
  for (const bp of (player.backpacks || [])) for (const item of (bp.items || [])) add(item)
  for (const item of (player.personal_vault_items || [])) add(item)
  for (const slot of (player.wardrobe_slots || [])) for (const piece of ['helmet','chestplate','leggings','boots']) add(slot[piece])

  // player_data.pets est un champ SÉPARÉ (roster complet actif+inactifs, real
  // field: type/tier/level/active/heldItem) -- absent de tous les tableaux
  // NBT ci-dessus. Bug réel trouvé en testant : Cucumber possède réellement
  // un pet BEE et un GRANDMA_WOLF (confirmés dans player_data.pets), tous
  // deux remontaient pourtant "non possédé" avant cet ajout.
  const petNames = new Set<string>()
  for (const pet of (player.pets || [])) {
    if (pet?.type) petNames.add(String(pet.type).replace(/_/g, ' ').toLowerCase())
  }

  return { generalNames, petNames }
}

// Catégories réelles (scrapées du wiki) confirmées correspondre à de vrais
// items possédables individuellement -- exclut volontairement Minions
// (mécanisme réel = crafted_generators, pas un item NBT tenu en
// inventaire -- déjà couvert par minion_count du Bloc 4), les catégories
// boss/slayer/essence/banque/HOTM/bestiary/dungeon (déjà couvertes par
// leurs vrais requirement_type dédiés du Bloc 4, pas des items), et les
// catégories "Consume X" (question réelle différente : consommation
// passée, pas possession actuelle -- item_owned ne peut pas y répondre
// honnêtement).
const ITEM_OWNED_CATEGORIES = new Set(['Museum Donations', 'Accessories', 'Pets'])

export async function GET() {
  const { data: player } = await supabase
    .from('player_data')
    .select('equipped_armor, equipped_accessories, inventory_items, ender_chest_items, backpacks, personal_vault_items, wardrobe_slots, pets')
    .eq('hypixel_uuid', CUCUMBER_UUID)
    .eq('profile_id', CUCUMBER_PROFILE)
    .single()

  const { generalNames, petNames } = collectOwnedNames(player)

  const { data: itemTasks } = await supabase
    .from('milestone_tasks')
    .select('tier, category, task_title, label, requirement')
    .eq('requirement->>type', 'item')
    .limit(1400)

  const inScope = (itemTasks || []).filter(t => ITEM_OWNED_CATEGORIES.has(t.category))

  const results = inScope.map(t => {
    const raw = (t.requirement as any).item_name as string
    const target = normalizeItemName(raw)
    let matched = generalNames.has(target)
    if (!matched && t.category === 'Pets') {
      matched = petNames.has(target.replace(/\s*pet\s*$/, '').trim())
    }
    return { tier: t.tier, category: t.category, item_name: raw, normalized: target, matched }
  })

  const matched = results.filter(r => r.matched)

  return NextResponse.json({
    owned_general_names_count: generalNames.size,
    owned_pet_names_count: petNames.size,
    total_item_tasks_all: (itemTasks || []).length,
    total_in_scope_categories: inScope.length,
    matched_count: matched.length,
    matched_sample: matched,
    unmatched_sample: results.filter(r => !r.matched).slice(0, 30),
  })
}
