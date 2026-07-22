// app/api/player/sync/route.ts
// Sync compte joueur Hypixel → player_data
// GET /api/player/sync?username=Steve
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { decodeItemListBytes } from '../../../../lib/skyblock-item-decoder'

export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

// ── Helpers ───────────────────────────────────────────────────
function calcSkillLevel(xp: number, caps: number[]): number {
  let level = 0
  let total = 0
  for (const cap of caps) {
    total += cap
    if (xp >= total) level++
    else break
  }
  return level
}

// XP requis par level pour les skills standards
const SKILL_XP = [50,125,200,300,500,750,1000,1500,2000,3500,5000,7500,10000,15000,20000,30000,50000,75000,100000,200000,300000,400000,500000,600000,700000,800000,900000,1000000,1100000,1200000,1300000,1400000,1500000,1600000,1700000,1800000,1900000,2000000,2100000,2200000,2300000,2400000,2500000,2600000,2750000,2900000,3100000,3400000,3700000,4000000,4300000,4600000,4900000,5200000,5500000,5800000,6100000,6400000,6700000,7000000]
const RUNECRAFTING_XP = [50,100,125,160,200,250,315,400,500,625,785,1000,1250,1600,2000,2465,3125,4000,5000,6200,7800,9800,12200,15200,19050,23750,30000,38000,48000,60000,75000,93500,116500,145000,181000,226000,282000,352000,440000,550000]

function getSkillLevel(skillName: string, xp: number): number {
  const xpTable = skillName === 'RUNECRAFTING' ? RUNECRAFTING_XP : SKILL_XP
  return calcSkillLevel(xp, xpTable)
}

// Decode un blob NBT multi-items en liste plate (inventaire, enderchest, accessory bag...)
function decodeItemList(bytesBase64: string | undefined) {
  if (!bytesBase64) return []
  return decodeItemListBytes(bytesBase64)
    .map((item, index) => item ? { slot: index, ...item } : null)
    .filter((item): item is NonNullable<typeof item> => !!item)
    .map(item => ({
      slot:         item.slot,
      item_id:      item.item_id,
      item_name:    item.item_name,
      item_count:   item.item_count,
      reforge:      item.reforge,
      stars:        item.total_stars,
      is_recomb:    item.is_recomb,
      enchantments: item.enchantments,
      gems:         item.gems,
    }))
}

function detectGameStage(skills: Record<string, number>, slayers: Record<string, number>, networth: number): string {
  const avgSkill  = Object.values(skills).reduce((s, v) => s + v, 0) / Object.keys(skills).length
  const maxSlayer = Math.max(...Object.values(slayers))

  if (networth < 5_000_000  || avgSkill < 10) return 'EARLY'
  if (networth < 100_000_000 || avgSkill < 25) return 'MID'
  if (networth < 1_000_000_000 || avgSkill < 40) return 'END'
  return 'LATE'
}

// ── Handler ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const username  = req.nextUrl.searchParams.get('username')
  const userId    = req.nextUrl.searchParams.get('user_id')
  const profileId = req.nextUrl.searchParams.get('profile_id')
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })

  try {
    // 1. UUID depuis Mojang API (pas Hypixel)
    const mojangRes  = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`
    )
    if (!mojangRes.ok) return NextResponse.json({ error: 'Player not found on Mojang' }, { status: 404 })
    const mojangData = await mojangRes.json()
    const uuid = mojangData.id
      ? `${mojangData.id.slice(0,8)}-${mojangData.id.slice(8,12)}-${mojangData.id.slice(12,16)}-${mojangData.id.slice(16,20)}-${mojangData.id.slice(20)}`
      : null
    if (!uuid) return NextResponse.json({ error: 'Invalid username' }, { status: 404 })
    if (!uuid) return NextResponse.json({ error: 'Invalid username' }, { status: 404 })

    // 2. Profil Skyblock
    const profileRes  = await fetch(
      `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`,
      { headers: { 'API-Key': HYPIXEL_KEY } }
    )
    const profileData = await profileRes.json()
    const profiles    = profileData.profiles || []

    // Un joueur a potentiellement plusieurs profils Skyblock (coop, iles abandonnees, etc.),
    // chacun avec sa propre progression stockee independamment (voir profile_id sur player_data).
    // Si profile_id est fourni explicitement, on cible ce profil precis. Sinon, on prend le profil
    // "selected" cote Hypixel — ca reflete le profil que le joueur a actuellement ouvert en jeu,
    // c'est le bon defaut, pas un fallback approximatif.
    const profile = profileId
      ? profiles.find((p: any) => p.profile_id === profileId)
      : profiles.find((p: any) => p.selected) || profiles[profiles.length - 1]
    if (!profile) return NextResponse.json({ error: 'No matching Skyblock profile found' }, { status: 404 })

    const member = profile.members?.[uuid.replace(/-/g, '')]
    if (!member) return NextResponse.json({ error: 'Player data not found in profile' }, { status: 404 })

    // 3. Extrait les skills
    const skillXP: Record<string, number> = {}
    const skillLevels: Record<string, number> = {}
    const SKILLS = ['FARMING','MINING','COMBAT','FORAGING','FISHING','ENCHANTING','ALCHEMY','CARPENTRY','RUNECRAFTING','SOCIAL','TAMING']
    for (const skill of SKILLS) {
      const xp = member.player_data?.experience?.[`SKILL_${skill}`] ?? 0
      skillXP[skill.toLowerCase()]     = xp
      skillLevels[skill.toLowerCase()] = getSkillLevel(skill, xp)
    }

    // 4. Extrait les slayers
    const slayers: Record<string, any> = {}
    const slayerData = member.slayer?.slayer_bosses || {}
    for (const [name, data] of Object.entries(slayerData as Record<string, any>)) {
      slayers[name.toLowerCase()] = {
        xp:    data.xp ?? 0,
        kills: Object.entries(data).filter(([k]) => k.startsWith('boss_kills_tier')).reduce((s, [, v]) => s + (v as number), 0)
      }
    }

    // 5. Extrait les dungeons
    const dungeons: Record<string, any> = {}
    const dungeonData = member.dungeons?.dungeon_types || {}
    for (const [type, data] of Object.entries(dungeonData as Record<string, any>)) {
      dungeons[type] = {
        highest_floor: Math.max(-1, ...Object.keys(data.highest_tier_completed ? { [data.highest_tier_completed]: 1 } : {}).map(Number)),
        experience:    data.experience ?? 0,
        runs:          Object.values(data.times_played || {}).reduce((s: number, v) => s + (v as number), 0),
      }
    }

    // 6. Collections
    const collections: Record<string, number> = member.collection || {}

    // 7. Pets
    const pets = (member.pets_data?.pets || []).slice(0, 20).map((p: any) => ({
      type:     p.type,
      tier:     p.tier,
      level:    p.exp,
      active:   p.active ?? false,
      heldItem: p.heldItem,
    }))

    // 8. Inventaire summary (items équipés)
    const inventorySummary = {
      armor:     member.inventory?.inv_armor?.data ? 'has_armor' : null,
      equipment: member.inventory?.equipment_contents?.data ? 'has_equipment' : null,
      wardrobe:  member.inventory?.wardrobe_contents?.data ? 'has_wardrobe' : null,
    }

    // 8b. Armure équipée décodée (NBT, réutilise le décodeur ah-collect en mode multi-items)
    // Ordre confirmé sur un vrai profil : slot 0=boots, 1=leggings, 2=chestplate, 3=helmet.
    // On dérive quand même le "slot" depuis le suffixe de item_id plutôt que l'index brut,
    // pour rester correct si Hypixel change un jour l'ordre.
    const ARMOR_SLOT_SUFFIXES: Record<string, string> = {
      HELMET: 'helmet', CHESTPLATE: 'chestplate', LEGGINGS: 'leggings', BOOTS: 'boots',
    }
    const armorData = member.inventory?.inv_armor?.data
    const equippedArmor: Record<string, any> = {}
    if (armorData) {
      const decoded = decodeItemListBytes(armorData)
      decoded.forEach((item, index) => {
        if (!item) return
        const suffix = Object.keys(ARMOR_SLOT_SUFFIXES).find(s => item.item_id.endsWith(`_${s}`))
        const slotKey = suffix ? ARMOR_SLOT_SUFFIXES[suffix] : `slot_${index}`
        equippedArmor[slotKey] = {
          item_id:      item.item_id,
          item_name:    item.item_name,
          reforge:      item.reforge,
          stars:        item.total_stars,
          is_recomb:    item.is_recomb,
          enchantments: item.enchantments,
          gems:         item.gems,
        }
      })
    }

    // 8c. Accessory bag décodé (member.inventory.bag_contents.talisman_bag.data)
    const bagData = member.inventory?.bag_contents?.talisman_bag?.data
    const equippedAccessories = bagData
      ? decodeItemListBytes(bagData)
          .filter((item): item is NonNullable<typeof item> => !!item)
          .map(item => ({
            item_id:      item.item_id,
            item_name:    item.item_name,
            reforge:      item.reforge,
            stars:        item.total_stars,
            is_recomb:    item.is_recomb,
            enchantments: item.enchantments,
            gems:         item.gems,
          }))
      : []

    // 8d. Inventaire principal + enderchest décodés (member.inventory.inv_contents / ender_chest_contents)
    const inventoryItems  = decodeItemList(member.inventory?.inv_contents?.data)
    const enderChestItems = decodeItemList(member.inventory?.ender_chest_contents?.data)

    // 9. Networth approximatif
    const purse    = Math.round(member.currencies?.coin_purse ?? 0)
    const bank     = Math.round(profile.banking?.balance ?? 0)
    const networth = purse + bank

    // 10. Fairy souls
    const fairySouls = member.fairy_soul?.total_collected ?? 0

    // 11. Game stage
    const maxSlayerXP = Math.max(...Object.values(slayers).map((s: any) => s.xp || 0))
    const gameStage   = detectGameStage(skillLevels, Object.fromEntries(Object.entries(slayers).map(([k, v]: any) => [k, v.xp])), networth)

    // 12. Skin URL
    const skinUrl = `https://crafatar.com/renders/body/${uuid}?overlay=true&scale=4`

    // 13. Upsert dans player_data
    const playerRecord = {
      user_id:           userId || null,
      hypixel_username:  username,
      hypixel_uuid:      uuid,
      profile_id:        profile.profile_id,
      purse,
      bank,
      networth,
      skills:            skillLevels,
      slayers,
      dungeons,
      collections,
      pets,
      inventory_summary: inventorySummary,
      equipped_armor:        equippedArmor,
      equipped_accessories:  equippedAccessories,
      inventory_items:       inventoryItems,
      ender_chest_items:     enderChestItems,
      fairy_souls:       fairySouls,
      skin_url:          skinUrl,
      game_stage:        gameStage,
      raw_profile:       { skills_xp: skillXP },
      last_synced:       new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }

    const { error } = await supabase
      .from('player_data')
      .upsert(playerRecord, { onConflict: 'hypixel_uuid,profile_id' })

    if (error) throw error

    return NextResponse.json({
      success:    true,
      username,
      uuid,
      profile_id: profile.profile_id,
      cute_name:  profile.cute_name ?? null,
      game_stage: gameStage,
      skills:     skillLevels,
      networth,
      skin_url:   skinUrl,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}