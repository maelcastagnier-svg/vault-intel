// TEMP debug route -- dump raw item_name char codes for any decoded item
// matching "Shadow Assassin" across all owned-item locations for Cucumber,
// to find the exact character causing a persistent lookup mismatch in
// resolveOwnedArmorSet even after trimming both sides. Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function codes(name: string) {
  return Array.from(name).map(ch => ({ ch, code: ch.codePointAt(0) }))
}

export async function GET() {
  const { data } = await supabase
    .from('player_data')
    .select('equipped_armor, inventory_items, ender_chest_items, backpacks, personal_vault_items, wardrobe_slots')
    .eq('profile_id', 'b077f27a-60f7-46d9-be13-c4689a01dc3b')
    .single()

  const matches: any[] = []
  const check = (item: any, location: string) => {
    const n = item?.item_name || ''
    if (n.toLowerCase().includes('shadow assassin')) {
      matches.push({ location, item_id: item.item_id, item_name: n, length: n.length, codes: codes(n) })
    }
  }

  for (const item of Object.values(data?.equipped_armor || {})) check(item, 'Equipped')
  for (const item of (data?.inventory_items || [])) check(item, 'Inventory')
  for (const item of (data?.ender_chest_items || [])) check(item, 'Ender Chest')
  for (const bp of (data?.backpacks || [])) for (const item of (bp.items || [])) check(item, bp.icon_item_name || 'Backpack')
  for (const item of (data?.personal_vault_items || [])) check(item, 'Personal Vault')
  for (const slot of (data?.wardrobe_slots || [])) for (const p of ['helmet','chestplate','leggings','boots']) check(slot[p], `Wardrobe slot ${slot.slot}`)

  const { data: savedCards } = await supabase
    .from('player_skill_cards')
    .select('cards')
    .eq('profile_id', 'b077f27a-60f7-46d9-be13-c4689a01dc3b')
    .single()
  const combatCard = (savedCards?.cards || []).find((c: any) => c.skill_key === 'combat')
  const claudeName: string = combatCard?.current?.armor_set_used || ''

  return NextResponse.json({ matches, claudeName, claudeNameLength: claudeName.length, claudeNameCodes: codes(claudeName) })
}
