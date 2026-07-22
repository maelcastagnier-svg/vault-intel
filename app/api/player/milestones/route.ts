// app/api/player/milestones/route.ts
// Calcule les paliers de progression du joueur — JS pur depuis player_data déjà collecté
// GET /api/player/milestones?uuid={uuid}
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '../../../../lib/supabase-server'

export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Milestone = {
  category: 'skill' | 'slayer' | 'dungeon' | 'fairy_soul' | 'collection'
  label: string
  current: number
  target: number
  progress_pct: number
  completed: boolean
  // false uniquement pour les slayers : seuils non confirmes contre une source structuree
  // (voir commentaire sur SLAYER_TIER_XP). Le frontend doit afficher un badge "a verifier"
  // plutot que de presenter target/progress_pct comme fiables quand verified === false.
  verified: boolean
}

function buildMilestone(category: Milestone['category'], label: string, current: number, ladder: number[], verified = true): Milestone {
  const maxTarget = ladder[ladder.length - 1]
  const target = ladder.find(t => current < t) ?? maxTarget
  const completed = current >= maxTarget
  return {
    category,
    label,
    current,
    target,
    progress_pct: Math.min(100, Math.round((current / target) * 100)),
    completed,
    verified,
  }
}

// ── Skills — paliers 25/30/35/40/45/50/55, filtrés par cap reel de chaque skill.
// Caps source: https://api.hypixel.net/v2/resources/skyblock/skills (verifie 2026-07-21).
// 'hunting' existe cote Hypixel mais n'est pas encore synchronise par player/sync -> exclu ici.
const SKILL_CAPS: Record<string, number> = {
  farming: 60, mining: 60, combat: 60, foraging: 54, fishing: 50,
  enchanting: 60, alchemy: 50, carpentry: 50, taming: 60,
  runecrafting: 25, social: 25,
}
const SKILL_LABELS: Record<string, string> = {
  farming: 'Farming', mining: 'Mining', combat: 'Combat', foraging: 'Foraging',
  fishing: 'Fishing', enchanting: 'Enchanting', alchemy: 'Alchemy', carpentry: 'Carpentry',
  runecrafting: 'Runecrafting', taming: 'Taming', social: 'Social',
}
const SKILL_LADDER = [25, 30, 35, 40, 45, 50, 55]

// ── Slayers — XP requis pour débloquer le tier suivant.
// Pas de source fiable trouvée en interne pour ces seuils : /v2/resources/skyblock/slayers n'existe pas
// cote Hypixel, et le contenu wiki scrape dans game_mechanics_misc (categorie slayer_wiki) est un dump de
// tableau HTML sans labels exploitables. Valeurs ci-dessous = connaissance publique Hypixel, non verifiees
// contre une source structuree — a corriger si un joueur signale un tier errone.
const SLAYER_TIER_XP: Record<string, number[]> = {
  zombie:   [5, 15, 200, 1000, 5000],
  spider:   [5, 15, 200, 1000, 5000],
  wolf:     [5, 15, 200, 1000],
  enderman: [5, 15, 200, 1000, 5000],
  blaze:    [10, 30, 250, 1500, 5000],
  vampire:  [20, 75, 500, 2000],
}
const SLAYER_LABELS: Record<string, string> = {
  zombie: 'Zombie', spider: 'Spider', wolf: 'Wolf', enderman: 'Enderman', blaze: 'Blaze', vampire: 'Vampire',
}

// ── Dungeons — floors 1 à 7 ──
const DUNGEON_FLOOR_LADDER = [1, 2, 3, 4, 5, 6, 7]
const DUNGEON_LABELS: Record<string, string> = {
  catacombs: 'Catacombs Floor',
  master_catacombs: 'Master Mode Floor',
}

// ── Fairy souls — total en jeu : 255 (source: table interne fairy_soul_locations, count(*)=255).
const FAIRY_SOUL_LADDER = [50, 100, 150, 200, 255]

// ── Collections — paliers exacts par item, table interne `collections` seedee depuis
// https://api.hypixel.net/v2/resources/skyblock/collections (verifie 2026-07-21).
const COLLECTION_TOP_N = 10

export async function GET(req: NextRequest) {
  // Auth de base : session Vault reelle requise. Meme limite que sync — ne verifie
  // pas encore que ce uuid appartient a cet utilisateur (pas de flux de liaison).
  const serverClient = await createServerSupabaseClient()
  const { data: { user: authUser } } = await serverClient.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uuid      = req.nextUrl.searchParams.get('uuid')
  const profileId = req.nextUrl.searchParams.get('profile_id')
  if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 })
  if (!profileId) return NextResponse.json({ error: 'profile_id required' }, { status: 400 })

  const { data: player, error } = await supabase
    .from('player_data')
    .select('skills, slayers, dungeons, fairy_souls, collections')
    .eq('hypixel_uuid', uuid)
    .eq('profile_id', profileId)
    .single()

  if (error || !player) return NextResponse.json({ error: 'Player not synced yet' }, { status: 404 })

  const { data: collectionDefs } = await supabase
    .from('collections')
    .select('collection_id, tiers')

  const milestones: Milestone[] = []

  // ── Skills ──────────────────────────────────────────────────
  const skills = player.skills || {}
  for (const [key, cap] of Object.entries(SKILL_CAPS)) {
    const level = skills[key] ?? 0
    const ladder = SKILL_LADDER.filter(t => t <= cap)
    if (ladder.length === 0) continue
    milestones.push(buildMilestone('skill', SKILL_LABELS[key], level, ladder))
  }

  // ── Slayers ─────────────────────────────────────────────────
  const slayers = player.slayers || {}
  for (const [key, ladder] of Object.entries(SLAYER_TIER_XP)) {
    const xp = slayers[key]?.xp ?? 0
    const tierReached = ladder.filter(t => xp >= t).length
    const m = buildMilestone('slayer', '', xp, ladder, false)
    m.label = `${SLAYER_LABELS[key]} — Tier ${Math.min(tierReached + 1, ladder.length)}`
    milestones.push(m)
  }

  // ── Dungeons ────────────────────────────────────────────────
  const dungeons = player.dungeons || {}
  for (const [type, label] of Object.entries(DUNGEON_LABELS)) {
    const highestFloor = dungeons[type]?.highest_floor
    if (highestFloor === undefined || highestFloor === null) continue
    const floor = Math.max(0, highestFloor)
    milestones.push(buildMilestone('dungeon', label, floor, DUNGEON_FLOOR_LADDER))
  }

  // ── Fairy souls ─────────────────────────────────────────────
  const souls = player.fairy_souls ?? 0
  milestones.push(buildMilestone('fairy_soul', 'Fairy Souls', souls, FAIRY_SOUL_LADDER))

  // ── Collections — top 10 les plus proches du prochain palier (seuils exacts, table `collections`) ──
  const collectionLadders = new Map<string, number[]>()
  for (const def of collectionDefs || []) {
    try {
      const tiers = JSON.parse(def.tiers) as { tier: number; amount_required: number }[]
      collectionLadders.set(def.collection_id, tiers.map(t => t.amount_required))
    } catch { /* tiers malformees, item ignore */ }
  }

  const collections = player.collections || {}
  const collectionMilestones = Object.entries(collections)
    .filter(([item, amount]) => (amount as number) > 0 && collectionLadders.has(item))
    .map(([item, amount]) => buildMilestone('collection', item, amount as number, collectionLadders.get(item)!))
    .sort((a, b) => b.progress_pct - a.progress_pct)
    .slice(0, COLLECTION_TOP_N)
  milestones.push(...collectionMilestones)

  return NextResponse.json({ milestones })
}
