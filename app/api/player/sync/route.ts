// app/api/player/sync/route.ts
// Sync compte joueur Hypixel → player_data
// GET /api/player/sync?username=Steve
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
  const username = req.nextUrl.searchParams.get('username')
  const userId   = req.nextUrl.searchParams.get('user_id')
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

    // Prend le profil le plus récent (selected=true sinon dernier)
    const profile = profiles.find((p: any) => p.selected) || profiles[profiles.length - 1]
    if (!profile) return NextResponse.json({ error: 'No Skyblock profile found' }, { status: 404 })

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
      purse,
      bank,
      networth,
      skills:            skillLevels,
      slayers,
      dungeons,
      collections,
      pets,
      inventory_summary: inventorySummary,
      fairy_souls:       fairySouls,
      skin_url:          skinUrl,
      game_stage:        gameStage,
      raw_profile:       { skills_xp: skillXP },
      last_synced:       new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }

    const { error } = await supabase
      .from('player_data')
      .upsert(playerRecord, { onConflict: 'hypixel_uuid' })

    if (error) throw error

    return NextResponse.json({
      success:    true,
      username,
      uuid,
      game_stage: gameStage,
      skills:     skillLevels,
      networth,
      skin_url:   skinUrl,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}