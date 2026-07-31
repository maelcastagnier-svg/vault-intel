// Temp debug route -- Bloc 7 verification. player/sync's GET is auth-gated
// (real Vault session + plan check), too heavy to invoke directly for a
// field-level test -- instead calls the real extractBloc7Zones() (imported,
// not reimplemented) against a real live Hypixel fetch, and writes only the
// new Bloc 7 fields via a partial update (never touches any other column).
// Deleted after validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractBloc7Zones } from '../../player/sync/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

async function testProfile(uuid: string, profileId: string) {
  const res = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`, { headers: { 'API-Key': HYPIXEL_KEY } })
  const data = await res.json()
  if (!data.success) return { error: 'hypixel_fetch_failed', data }

  const profile = data.profiles.find((p: any) => p.profile_id === profileId)
  if (!profile) return { error: 'profile_not_found' }
  const member = profile.members?.[uuid.replace(/-/g, '')]
  if (!member) return { error: 'member_not_found' }

  const bloc7 = extractBloc7Zones(member)

  let museumValue = 0
  let museumDonatedItemIds: string[] = []
  try {
    const museumRes = await fetch(`https://api.hypixel.net/v2/skyblock/museum?profile=${profileId}`, { headers: { 'API-Key': HYPIXEL_KEY } })
    const museumData = await museumRes.json()
    const museumMember = museumData?.members?.[uuid.replace(/-/g, '')]
    if (museumData.success && museumMember) {
      museumValue = museumMember.value ?? 0
      museumDonatedItemIds = Object.keys(museumMember.items || {})
    }
  } catch (e) { console.error('museum fetch failed', e) }

  const update = {
    garden_copper:             bloc7.garden_copper,
    garden_greenhouse_crops:   bloc7.garden_greenhouse_crops,
    garden_chips:              bloc7.garden_chips,
    accessory_tuning:          bloc7.accessory_tuning,
    accessory_magical_power:   bloc7.accessory_magical_power,
    accessory_selected_power:  bloc7.accessory_selected_power,
    accessory_unlocked_powers: bloc7.accessory_unlocked_powers,
    autopet_rules:             bloc7.autopet_rules,
    hina_tree_gifts:           bloc7.hina_tree_gifts,
    hina_daily_gifts:          bloc7.hina_daily_gifts,
    museum_value:              museumValue,
    museum_donated_item_ids:   museumDonatedItemIds,
  }

  const { error } = await supabase.from('player_data').update(update)
    .eq('hypixel_uuid', uuid).eq('profile_id', profileId)

  return { persisted: !error, error: error?.message, written: update }
}

export async function GET() {
  const cucumber = await testProfile('74a06395-3a99-4796-95d0-9e392ba3da7e', 'b077f27a-60f7-46d9-be13-c4689a01dc3b')
  const orange = await testProfile('74a06395-3a99-4796-95d0-9e392ba3da7e', '35938937-7db6-4f5e-95c5-fecae9084be5')
  return NextResponse.json({ cucumber, orange })
}
