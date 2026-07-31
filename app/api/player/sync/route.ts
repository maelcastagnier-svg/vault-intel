// app/api/player/sync/route.ts
// Sync compte joueur Hypixel → player_data
// GET /api/player/sync?username=Steve
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { decodeItemListBytes } from '../../../../lib/skyblock-item-decoder'
import { requirePlan } from '../../../../lib/get-plan'
import { runEvolveSkills } from '../../cron/evolve-skills/route'
import { getSkillLevel } from '../../../../lib/skill-xp'

// 300s pour couvrir le sync lui-meme + la generation Skills chainee ci-dessous
// (meme plafond que evolve-skills seul avant ce chainage). Conformite API Hypixel :
// runEvolveSkills n'est plus jamais declenche par un cron/timer, uniquement ici,
// juste apres un sync reussi et explicitement demande par le joueur.
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Boss kills (Kuudra/Arachne/Ender Dragon) — 1re zone du chantier collecte totale
// repris. Structure vérifiée sur un vrai profil (Cucumber) avant codage, jamais
// devinée. Exportée en fonction pure (même member déjà décodé, zéro appel réseau
// propre) pour être testable directement sans passer par le handler GET complet
// (qui chaîne runEvolveSkills, un vrai coût Sonnet, après chaque sync réussi).
// - member.nether_island_player_data.kuudra_completed_tiers est un objet PLAT
//   mélangeant deux familles de clés pour les tiers réellement tentés : le nom du
//   tier lui-même ("none") = nombre de complétions, et "highest_wave_<tier>" = la
//   meilleure vague atteinte dans ce tier (stat de progression, pas une complétion).
//   Séparées ici plutôt que stockées telles quelles pour ne pas mélanger les deux
//   sens dans une même clé.
// - member.objectives.defeat_arachne_keeper est un objet quête standard
//   {status, progress, completed_at} — "COMPLETE" (confirmé par le vrai statut brut
//   Hypixel, pas deviné) avec completed_at>0 = Arachne vaincue.
// - member.player_stats.end_island.dragon_fight.fastest_kill n'a PAS de compteur de
//   kills réel — seulement un meilleur temps par variante de dragon (young/strong/
//   etc). La présence d'une entrée pour une variante = au moins un kill de cette
//   variante ; jamais transformé en un total inventé. Bug réel trouvé en testant sur
//   Cucumber : cet objet contient aussi une clé "best" (le record TOUTES variantes
//   confondues, valeur identique à sa variante "young" la plus rapide au moment du
//   test) — pas une variante réelle. Exclue explicitement pour ne jamais gonfler
//   killed_types d'un faux type de dragon.
const DRAGON_FASTEST_KILL_META_KEYS = new Set(['best'])
export function extractBossKills(member: any) {
  const kuudraRaw = member.nether_island_player_data?.kuudra_completed_tiers || {}
  const kuudraCompletedTiers: Record<string, number> = {}
  const kuudraHighestWave: Record<string, number> = {}
  for (const [key, value] of Object.entries(kuudraRaw as Record<string, number>)) {
    if (key.startsWith('highest_wave_')) kuudraHighestWave[key.replace('highest_wave_', '')] = value
    else kuudraCompletedTiers[key] = value
  }
  const arachneObjective = member.objectives?.defeat_arachne_keeper
  const dragonFastestKillRaw: Record<string, number> = member.player_stats?.end_island?.dragon_fight?.fastest_kill || {}
  const dragonFastestKill = Object.fromEntries(
    Object.entries(dragonFastestKillRaw).filter(([key]) => !DRAGON_FASTEST_KILL_META_KEYS.has(key))
  )
  return {
    kuudra: { completed_tiers: kuudraCompletedTiers, highest_wave: kuudraHighestWave },
    arachne: { defeated: !!arachneObjective && arachneObjective.status === 'COMPLETE', completed_at: arachneObjective?.completed_at ?? 0 },
    ender_dragon: { killed_types: Object.keys(dragonFastestKill), fastest_kill_ms: dragonFastestKill },
  }
}

// Bank tier + Fast Travel — 2e zone du chantier collecte totale repris. Structure
// vérifiée sur un vrai profil (Cucumber) avant codage. Fonction pure exportée (même
// pattern que extractBossKills) pour être testable sans passer par le handler GET
// complet (qui chaîne runEvolveSkills, un vrai coût Sonnet).
// - member.profile.personal_bank_upgrade est un entier réel = le tier du Personal
//   Bank (distinct de member.profile.bank_account, le SOLDE du bank personnel — déjà
//   couvert ailleurs par `bank` via profile.banking.balance, le bank de coop partagé.
//   Piège trouvé en vérifiant : `profile.members` contient TOUS les joueurs du même
//   profil coop, pas seulement Cucumber — une clé ressemblant par hasard à son
//   profile_id appartenait en fait à un coéquipier différent. Seul le lookup par le
//   vrai hypixel_uuid (déjà utilisé partout ailleurs dans ce fichier) est fiable.
// - member.player_data.visited_zones est la vraie liste des zones Fast Travel
//   débloquées (chaque zone visitée devient un warp instantané dans le menu Fast
//   Travel) — mappe directement sur la tâche Milestones "fast_travel_unlocked"
//   (jusque-là data_available:false, jamais reliée à une vraie donnée collectée).
export function extractBankAndFastTravel(member: any) {
  return {
    bank_tier: member.profile?.personal_bank_upgrade ?? 0,
    fast_travel_zones: (member.player_data?.visited_zones || []) as string[],
  }
}

// Essence — 3e zone du chantier collecte totale. Structure vérifiée sur Cucumber :
// member.currencies.essence est un objet réel indexé par type d'essence
// (DIAMOND/DRAGON/WITHER/SPIDER/UNDEAD/ICE/GOLD/CRIMSON — les 8 boutiques Essence du
// jeu), chaque entrée `{current: N}`. Types lus dynamiquement depuis les clés
// réellement renvoyées par Hypixel plutôt que codés en dur, pour ne jamais diverger
// si une 9e essence est ajoutée un jour (règle 7 CLAUDE.md — pas de constante de jeu
// reconstituée de mémoire). `member.attributes.stacks.*_essence` est un mécanisme
// séparé (stacks de fusion d'Attribute Shards) trouvé pendant la même recherche mais
// hors scope ici — exclu volontairement, ne pas confondre avec la vraie monnaie Essence.
export function extractEssence(member: any) {
  const essence = member.currencies?.essence || {}
  const result: Record<string, number> = {}
  for (const [type, obj] of Object.entries(essence)) {
    result[type] = (obj as any)?.current ?? 0
  }
  return result
}

// Minions — 5e zone du chantier collecte totale. Structure vérifiée sur Cucumber :
// member.player_data.crafted_generators est un array réel de strings "TYPE_TIER"
// (ex "COBBLESTONE_7", "MITHRIL_2") — confirmé sur 2 coéquipiers du même profil coop
// (128 et 46 entrées). PAS partagé au niveau du profil comme la banque : chaque
// membre a sa propre liste, contrairement à l'hypothèse initiale de cette recherche.
// Piège évité en vérifiant en direct : le champ est absent (pas juste vide) sur le
// membre correctement résolu de Cucumber (via son vrai hypixel_uuid) — cohérent avec
// l'absence totale de l'objectif craft_wheat_minion sur son membre alors qu'il est
// présent (COMPLETE) chez un coéquipier. Résultat réel, pas un bug : Cucumber n'a
// jamais crafté de minion. `|| []` retombe donc légitimement sur un array vide pour
// elle plutôt que d'aller chercher (à tort) la donnée d'un autre membre du coop.
export function extractMinions(member: any) {
  return {
    crafted_generators: (member.player_data?.crafted_generators || []) as string[],
  }
}

// Bestiary — 6e zone du chantier collecte totale. Structure vérifiée sur Cucumber :
// member.bestiary = {miscellaneous, kills, milestone, deaths}. `kills` est un objet
// réel mob_id+tier → compteur (252 entrées sur Cucumber, ex "graveyard_zombie_1": 240),
// plus une clé `last_killed_mob` (string, pas un compteur — laissée telle quelle dans
// le pass-through, cohérent avec le format brut Hypixel). `milestone.
// last_claimed_milestone` (71 sur Cucumber) est le vrai palier de progression Bestiary
// du jeu. `deaths` (même forme que kills mais pour les morts du joueur) repéré mais
// volontairement non mappé cette passe — pas de lien avec une feature Vault existante,
// repris plus tard si besoin (même logique que visited_modes/warp objectives notés
// non mappés dans les zones précédentes).
export function extractBestiary(member: any) {
  const bestiary = member.bestiary || {}
  return {
    bestiary_kills: (bestiary.kills || {}) as Record<string, any>,
    bestiary_milestone: bestiary.milestone?.last_claimed_milestone ?? 0,
  }
}

// Rift — 7e zone du chantier collecte totale. Structure vérifiée sur Cucumber :
// member.rift existe avec 11 sous-systèmes réels (village_plaza, wither_cage,
// black_lagoon, dead_cats, wizard_tower, enigma, gallery, west_village, wyld_woods,
// castle, dreadfarm) — mais TOUS vides sur son profil, et la monnaie Rift est
// carrément absente. Cohérent avec le reste de son profil (jamais crafté de minion) :
// elle n'a quasiment jamais engagé le Rift. Seul `access.charge_track_timestamp`
// porte une vraie valeur. Faute de donnée réelle non-vide pour vérifier la forme des
// sous-systèmes (village_plaza.murder/cowboy/seraphine etc., wyld_woods, castle...),
// volontairement PAS mappés cette passe — pas deviné pour gagner du temps, à
// revisiter avec un profil réellement engagé dans le Rift.
// 🔴 Bug corrigé (30 juillet, trouvé pendant l'audit hypixel-api-reborn) : le champ
// lisait member.currencies.motes.current par analogie avec Essence, jamais vérifié
// contre une vraie donnée. Le vrai champ Hypixel (confirmé par hypixel-api-reborn ET
// vérifié en direct sur Cucumber : member.currencies n'a que coin_purse+essence,
// aucun "motes" sous aucune forme) est member.currencies.motes_purse — un nombre
// plat, pas un objet imbriqué. Les deux chemins renvoyaient 0 par coïncidence chez
// elle ; le mauvais chemin aurait silencieusement retourné 0 pour n'importe quel
// joueur ayant réellement des Motes.
export function extractRift(member: any) {
  return {
    rift_motes: member.currencies?.motes_purse ?? 0,
  }
}

// Long tail (Dojo/Harp/Abiphone/Community/Festivals) — 8e et dernière zone nommée du
// chantier collecte totale. Chaque sous-champ vérifié individuellement sur Cucumber,
// mappé seulement si une vraie donnée non-nulle existe pour confirmer la forme :
// - Dojo : member.nether_island_player_data.dojo (un bloc de stats dédié) est ABSENT
//   sur son profil — seul le statut de la quête d'unlock existe
//   (nether_island_player_data.quests.quest_data.dojo, {status/progress/completed_at}).
//   Rien d'autre trouvé à mapper cette passe.
// - Harp : member.foraging.songs.harp confirmé exister mais vide ({}) — aucune chanson
//   débloquée/jouée par Cucumber. Structure confirmée, contenu réel absent.
// - Abiphone : member.nether_island_player_data.abiphone — donnée réelle et riche.
//   `active_contacts` (array de contacts débloqués) + `contact_data` (stats d'appel
//   par contact) mappés tels quels.
// - "Community shop" : aucun champ littéralement nommé ainsi n'existe. Le vrai système
//   équivalent trouvé est `profile.community_upgrades` (Community Center — partagé au
//   niveau du profil coop, pas "shop", comme la banque) : `upgrade_states`, un array
//   réel d'upgrades (island_size/minion_slots/coins_allowance/guests_count) avec
//   tier/started_ms/claimed_by. Documenté comme la correspondance la plus proche du
//   terme "community shop" plutôt que d'inventer un système qui n'existe pas.
// - Festivals : member.player_stats.candy_collected.<festival_instance_id> — données
//   réelles pour Spooky Festival uniquement (4 instances trouvées sur Cucumber). Mining
//   Fiesta / Fishing Festival / Jacob Farming Contest (les 3 autres event categories
//   déjà notées dans sblevel_tasks) n'apparaissent sous AUCUN champ contenant
//   "festival" dans cette recherche — pas mappés, à revisiter avec un vrai profil qui y
//   a participé plutôt que deviné.
export function extractLongTail(member: any, profile: any) {
  return {
    dojo_status: member.nether_island_player_data?.quests?.quest_data?.dojo ?? null,
    harp_songs: (member.foraging?.songs?.harp || {}) as Record<string, any>,
    abiphone_contacts: (member.nether_island_player_data?.abiphone?.active_contacts || []) as string[],
    community_upgrades: (profile.community_upgrades?.upgrade_states || []) as any[],
    festival_candy: (member.player_stats?.candy_collected || {}) as Record<string, any>,
  }
}

// Donjons — détail par étage. 1re zone du chantier "audit hypixel-api-reborn" (29 juillet) :
// notre mapping existant (dungeons[type].highest_floor/experience/runs) ne capturait que des
// agrégats, jamais le détail par étage que la référence hypixel-api-reborn documentait.
// Structure vérifiée sur Cucumber (220 runs Catacombs, bon profil de test) :
// member.dungeons.dungeon_types.catacombs.<champ>.<étage> pour tier_completions/best_score/
// mobs_killed/most_mobs_killed/watcher_kills/fastest_time/fastest_time_s/fastest_time_s_plus —
// chaque champ est un objet indexé par étage ("0".."7") PLUS une clé annexe "total" ou "best"
// (agrégat, pas un étage réel) qu'on exclut explicitement, même piège que dragon_fight.
// fastest_time (sans suffixe) est un 3e champ de temps réel, distinct de fastest_time_s/
// fastest_time_s_plus (S/S+ sont les paliers de score du jeu, pas des variantes inventées) —
// fastest_time = meilleur temps toutes notes confondues, les deux autres = meilleur temps
// avec au moins la note S / S+ atteinte.
// most_damage_<classe> et best_runs (historique complet des runs) volontairement PAS mappés
// cette passe — flavor/leaderboard, pas des métriques de progression Milestones. Pareil pour
// treasures.runs/chests (historique d'activité, pas de la progression) et 2 champs trouvés
// mais écartés : daily_runs (compteur journalier, transitoire) et dungeons_blah_blah (un nom
// de champ littéralement placeholder côté Hypixel, contient des flags de quête one-shot type
// "gatekeeper_first_talk" — pas de valeur de progression claire). milestone_completions
// trouvé mais identique à tier_completions sur Cucumber — pas remappé en double.
function extractDungeonFloorStats(modeData: any) {
  const floorFields = ['tier_completions', 'best_score', 'mobs_killed', 'most_mobs_killed', 'watcher_kills', 'fastest_time', 'fastest_time_s', 'fastest_time_s_plus']
  const floorKeys = new Set<string>()
  for (const field of floorFields) {
    for (const key of Object.keys(modeData?.[field] || {})) {
      if (key === 'total' || key === 'best') continue
      floorKeys.add(key)
    }
  }
  const floors: Record<string, any> = {}
  for (const floor of floorKeys) {
    floors[floor] = {
      times_played:         modeData.tier_completions?.[floor] ?? 0,
      best_score:           modeData.best_score?.[floor] ?? 0,
      mobs_killed:          modeData.mobs_killed?.[floor] ?? 0,
      most_mobs_killed:     modeData.most_mobs_killed?.[floor] ?? 0,
      watcher_kills:        modeData.watcher_kills?.[floor] ?? 0,
      fastest_time_ms:      modeData.fastest_time?.[floor] ?? 0,
      fastest_time_s_ms:    modeData.fastest_time_s?.[floor] ?? 0,
      fastest_time_s_plus_ms: modeData.fastest_time_s_plus?.[floor] ?? 0,
    }
  }
  return floors
}

export function extractDungeonDetail(member: any) {
  const dungeonData = member.dungeons || {}
  return {
    dungeon_secrets:            dungeonData.secrets ?? 0,
    dungeon_unlocked_journals:  (dungeonData.dungeon_journal?.unlocked_journals || []) as string[],
    catacombs_floors:           extractDungeonFloorStats(dungeonData.dungeon_types?.catacombs || {}),
    master_catacombs_floors:    extractDungeonFloorStats(dungeonData.dungeon_types?.master_catacombs || {}),
  }
}

// Slayer — claimed_levels + détail par tier. 2e zone du chantier "audit hypixel-api-reborn".
// Notre mapping existant (section 4, "slayers") ne stocke que xp + la somme des kills tous
// tiers confondus — jamais quels paliers de récompense ont déjà été réclamés, alors que
// Hypixel le calcule et l'expose directement (aucun seuil à deviner, contrairement à ce que
// CLAUDE.md notait pour les seuils de tier XP "verified:false"). Structure vérifiée sur
// Cucumber : member.slayer.slayer_bosses.<boss>.claimed_levels = objet ne contenant QUE les
// niveaux réellement réclamés (level_1..level_9, true) — un niveau non réclamé est absent,
// jamais false. Une clé "level_N_special" existe aussi (zombie, niveau 7) — variante réelle
// du même palier, pas une clé à ignorer. boss_kills_tier_0..4 et boss_attempts_tier_0..4 sont
// deux compteurs réels distincts par tier (kills vs tentatives) — attempts pas dans le mapping
// existant, ajouté ici en plus.
export function extractSlayerDetail(member: any) {
  const bosses = member.slayer?.slayer_bosses || {}
  const detail: Record<string, any> = {}
  for (const [boss, data] of Object.entries(bosses as Record<string, any>)) {
    const tiers: Record<string, { kills: number; attempts: number }> = {}
    for (let tier = 0; tier <= 4; tier++) {
      const kills = data[`boss_kills_tier_${tier}`]
      const attempts = data[`boss_attempts_tier_${tier}`]
      if (kills === undefined && attempts === undefined) continue
      tiers[tier] = { kills: kills ?? 0, attempts: attempts ?? 0 }
    }
    detail[boss] = {
      claimed_levels: (data.claimed_levels || {}) as Record<string, boolean>,
      tiers,
    }
  }
  return detail
}

// Jacob's Farming Contests — 3e zone du chantier "audit hypixel-api-reborn". Système de
// progression Farming complet, jusque-là zéro mapping (n'était même pas dans la liste
// d'origine du chantier collecte totale). Structure vérifiée sur Cucumber :
// member.jacobs_contest = {perks, medals_inv, unique_brackets, personal_bests, contests,
// talked}. `medals_inv`/`unique_brackets` n'ont que les clés réellement atteintes
// (Cucumber : bronze/silver seulement, aucune clé "gold" — absente, pas à zéro, même
// pattern que les autres zones). `personal_bests` = record réel crop→meilleur total
// collecté en un seul concours. `contests` = historique réel des 25 concours participés
// (clé composite "480:5_1:WHEAT", {collected, claimed_participants, claimed_position,
// claimed_rewards}) — inclus tel quel, volume raisonnable (contrairement à l'historique
// de coffres trésor des donjons, écarté pour être trop volumineux).
export function extractJacobsContests(member: any) {
  const jacob = member.jacobs_contest || {}
  return {
    jacob_medals:          (jacob.medals_inv || {}) as Record<string, number>,
    jacob_perks:           (jacob.perks || {}) as Record<string, any>,
    jacob_unique_brackets: (jacob.unique_brackets || {}) as Record<string, string[]>,
    jacob_personal_bests:  (jacob.personal_bests || {}) as Record<string, number>,
    jacob_contests:        (jacob.contests || {}) as Record<string, any>,
  }
}

// Chocolate Factory (event Easter) — 4e zone du chantier "audit hypixel-api-reborn".
// Repéré pendant l'investigation Long tail (member.events.easter.rabbits) mais écarté à
// tort comme hors-scope — c'est en fait un vrai système de progression complet, jamais
// dans la liste d'origine du chantier collecte totale. Structure vérifiée sur Cucumber :
// member.events.easter = {chocolate, total_chocolate, chocolate_since_prestige,
// rabbit_barn_capacity_level, click_upgrades, employees, time_tower, rabbit_hitmen, shop,
// rabbits}. `chocolate_level`/`chocolate_multiplier_upgrades`/`rabbit_rarity_upgrades`/
// `supreme_chocolate_bars` sont carrément ABSENTS chez elle (jamais prestige) — pas
// mappés faute de vraie donnée pour confirmer la forme. `time_tower`/`rabbit_hitmen`
// existent mais vides. `shop` trouvé mais absent de la référence hypixel-api-reborn —
// pas deviné, pas mappé. `rabbits` mélange 2 clés annexes (collected_eggs/
// collected_locations, pas des lapins) avec les vrais compteurs de lapins trouvés —
// filtré pour ne garder que ces derniers.
export function extractChocolateFactory(member: any) {
  const easter = member.events?.easter || {}
  const rabbitsFound = Object.fromEntries(
    Object.entries(easter.rabbits || {}).filter(([key]) => key !== 'collected_eggs' && key !== 'collected_locations')
  )
  return {
    chocolate:                  easter.chocolate ?? 0,
    total_chocolate:            easter.total_chocolate ?? 0,
    chocolate_since_prestige:   easter.chocolate_since_prestige ?? 0,
    rabbit_barn_capacity_level: easter.rabbit_barn_capacity_level ?? 0,
    click_upgrades:             easter.click_upgrades ?? 0,
    employees:                  (easter.employees || {}) as Record<string, number>,
    rabbits_found:              rabbitsFound as Record<string, number>,
  }
}

// Auctions — résumé d'activité AH par joueur. 5e zone du chantier "audit
// hypixel-api-reborn" — la plus pertinente pour Vault spécifiquement, jamais dans la
// liste d'origine du chantier collecte totale. Structure vérifiée sur Cucumber :
// member.player_stats.auctions = {bids, highest_bid, won, gold_spent, created, fees,
// completed, gold_earned, no_bids, total_sold, total_bought}. total_sold/total_bought
// sont des objets réels par rareté PLUS une clé "total" (vrai agrégat fourni par
// Hypixel, pas un faux type méta comme dragon_fight.fastest_kill.best — gardé tel quel).
export function extractAuctionStats(member: any) {
  const auctions = member.player_stats?.auctions || {}
  return {
    bids:         auctions.bids ?? 0,
    highest_bid:  auctions.highest_bid ?? 0,
    won:          auctions.won ?? 0,
    gold_spent:   auctions.gold_spent ?? 0,
    created:      auctions.created ?? 0,
    fees:         auctions.fees ?? 0,
    completed:    auctions.completed ?? 0,
    gold_earned:  auctions.gold_earned ?? 0,
    no_bids:      auctions.no_bids ?? 0,
    total_sold:   (auctions.total_sold || {}) as Record<string, number>,
    total_bought: (auctions.total_bought || {}) as Record<string, number>,
  }
}

// Fishing — 6e et dernière zone du chantier "audit hypixel-api-reborn". Fishing n'avait
// jamais eu sa propre zone malgré être un skill à part entière. Structure vérifiée sur
// Cucumber : member.player_stats.sea_creature_kills (nombre réel au niveau racine, pas
// nested) + member.player_stats.items_fished = {total, normal, treasure, large_treasure,
// trophy_fish} — "total" ici est un vrai agrégat Hypixel (250+34+3+27=314, confirmé
// cohérent), gardé tel quel.
export function extractFishingStats(member: any) {
  const playerStats = member.player_stats || {}
  return {
    sea_creature_kills: playerStats.sea_creature_kills ?? 0,
    items_fished:       (playerStats.items_fished || {}) as Record<string, number>,
  }
}

// Bloc 7 (audit 8 blocs), 31 juillet -- zones réelles non couvertes trouvées en
// re-vérifiant la structure brute sur Cucumber. Garden/AccessoryBag tuning/
// AutoPets confirmés réels et non-vides ; les vrais "gifts" trouvés sont ceux
// de Hina (Foraging) -- "Winter Gifts" supposé par l'audit d'origine n'existe
// pas comme champ API (recherché explicitement : aucune clé gift/santa/winter
// pertinente au-delà de member.attributes.stacks.winter_serendipity, un stack
// d'attribut sans rapport avec un compteur de dons).
//
// Garden : member.garden_player_data = {copper, discovered_greenhouse_crops}
// (vrai, confirmé non-vide). member.player_data.garden_chips = objet réel
// type_de_chip -> nombre possédé (vrai, confirmé non-vide, 8 chips réels chez
// Cucumber). La grosse partie de la progression Garden (cultures/niveau/barn)
// vit sur un endpoint SÉPARÉ (/v2/skyblock/garden), pas mappée cette passe --
// hors scope du plan (qui ne demandait l'endpoint séparé que pour Museum).
//
// AccessoryBag tuning : member.accessory_bag_storage = {tuning: {slot_N:
// {health,defense,walk_speed,strength,critical_damage,critical_chance,
// attack_speed,intelligence} | {purchase_ts}, highest_unlocked_slot, refund_2},
// highest_magical_power, selected_power, unlocked_powers} -- vrai, riche,
// confirmé non-vide.
//
// AutoPets : member.pets_data.autopet = {rules: [...]} -- structure confirmée
// réelle (vide chez Cucumber, aucune règle configurée), même limite que
// harp_songs (forme connue, contenu non-vide jamais vérifié).
export function extractBloc7Zones(member: any) {
  return {
    garden_copper:            member.garden_player_data?.copper ?? 0,
    garden_greenhouse_crops:  (member.garden_player_data?.discovered_greenhouse_crops || []) as string[],
    garden_chips:             (member.player_data?.garden_chips || {}) as Record<string, number>,
    accessory_tuning:         (member.accessory_bag_storage?.tuning || {}) as Record<string, any>,
    accessory_magical_power:  member.accessory_bag_storage?.highest_magical_power ?? 0,
    accessory_selected_power: member.accessory_bag_storage?.selected_power ?? null,
    accessory_unlocked_powers: (member.accessory_bag_storage?.unlocked_powers || []) as string[],
    autopet_rules:            (member.pets_data?.autopet?.rules || []) as any[],
    hina_tree_gifts:          (member.foraging?.tree_gifts || {}) as Record<string, any>,
    hina_daily_gifts:         member.foraging_core?.daily_gifts ?? 0,
  }
}

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

// ── Helpers ───────────────────────────────────────────────────
// Decode un blob NBT multi-items en liste plate (inventaire, enderchest, accessory bag...)
// Garde variant_key_full/variant_key_base : cles de jointure prix (price_history_ah),
// sans elles le calcul de networth ne peut matcher aucun prix.
function decodeItemList(bytesBase64: string | undefined) {
  if (!bytesBase64) return []
  return decodeItemListBytes(bytesBase64)
    .map((item, index) => item ? { slot: index, ...item } : null)
    .filter((item): item is NonNullable<typeof item> => !!item)
    .map(item => ({
      slot:             item.slot,
      item_id:          item.item_id,
      item_name:        item.item_name,
      item_count:       item.item_count,
      reforge:          item.reforge,
      stars:            item.total_stars,
      is_recomb:        item.is_recomb,
      enchantments:     item.enchantments,
      gems:             item.gems,
      variant_key_full: item.variant_key_full,
      variant_key_base: item.variant_key_base,
    }))
}

// Champs minimaux necessaires pour pricer un item (utilise par calculateNetworth)
type PriceableItem = { item_id: string; variant_key_full: string; variant_key_base: string; item_count: number }

// Seuils networth alignes sur les bandes deja validees de Money Making (TIER_CONFIG,
// money-making-agent/route.ts) — 0-50M/50M-500M/500M-5B/5B+ — plutot que d'en inventer
// de nouveaux. Remplace les anciens seuils (5M/100M/1B) calibres a l'epoque ou
// networth = purse+bank uniquement, desormais obsoletes puisque networth inclut le gear.
// Amelioration incrementale, pas la version finale : a terme game_stage devrait etre un
// score composite (skills + catacombs/slayer + qualite reelle du gear), pas juste
// networth+avgSkill — voir CLAUDE.md.
function detectGameStage(skills: Record<string, number>, slayers: Record<string, number>, networth: number): string {
  const avgSkill  = Object.values(skills).reduce((s, v) => s + v, 0) / Object.keys(skills).length
  const maxSlayer = Math.max(...Object.values(slayers))

  if (networth < 50_000_000   || avgSkill < 10) return 'EARLY'
  if (networth < 500_000_000  || avgSkill < 25) return 'MID'
  if (networth < 5_000_000_000 || avgSkill < 40) return 'END'
  return 'LATE'
}

// ── Networth ──────────────────────────────────────────────────
type CategoryBreakdown = { value: number; items_priced: number; items_unpriced: number }
type NetworthBreakdown = {
  total: number
  purse: number
  bank: number
  items_total: number
  categories: Record<string, CategoryBreakdown>
  calculated_at: string
}

// Garde la ligne au bucket_date le plus recent par cle (evite un ORDER BY + DISTINCT ON
// cote SQL, fait ici cote JS sur un resultat deja filtre/petit)
function pickLatestPriceByKey(rows: { key: string; price: number; date: string }[]): Map<string, number> {
  const latest = new Map<string, { price: number; date: string }>()
  for (const r of rows) {
    if (r.price <= 0) continue
    const prev = latest.get(r.key)
    if (!prev || r.date > prev.date) latest.set(r.key, { price: r.price, date: r.date })
  }
  return new Map(Array.from(latest, ([k, v]) => [k, v.price]))
}

function betterPrice(sellPrice: any, avgPrice: any): number {
  const sell = Number(sellPrice) || 0
  if (sell > 0) return sell
  return Number(avgPrice) || 0
}

// Calcule le networth complet (purse+bank+items) en 2 requetes batch (pas une par item) :
// 1) price_history_ah_variants pour tous les item_id concernes (variant_key exact, puis
//    variant_key_base en repli) 2) price_history (source BAZAAR) pour les item_id restants,
//    non trouves en AH. Jamais bloquant : un item sans prix trouve vaut 0, ne fait pas echouer
//    le sync.
// IMPORTANT : price_history_ah (sans suffixe) n'est PAS utilisable ici — ses rows DAILY sont
// une moyenne unique par item toutes variantes confondues, ecrites avec un variant_key
// placeholder ('nostar_norecomb_noreforge', voir ah-aggregate/route.ts) qui ne correspond a
// aucun etat reel d'item. Seule price_history_ah_variants contient un variant_key/variant_key_base
// fiable par variante (deja filtre scan_count >= 3 a l'ecriture).
async function calculateNetworth(
  supabase: any,
  purse: number,
  bank: number,
  categorizedItems: Record<string, PriceableItem[]>
): Promise<NetworthBreakdown> {
  const allItems     = Object.values(categorizedItems).flat()
  const uniqueItemIds = Array.from(new Set(allItems.map(i => i.item_id)))
  const emptyCategories = Object.fromEntries(
    Object.keys(categorizedItems).map(k => [k, { value: 0, items_priced: 0, items_unpriced: 0 } as CategoryBreakdown])
  )

  if (uniqueItemIds.length === 0) {
    return { total: purse + bank, purse, bank, items_total: 0, categories: emptyCategories, calculated_at: new Date().toISOString() }
  }

  const sinceDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // ── Tier 1+2 : price_history_ah_variants, exact (variant_key) puis base (variant_key_base) ──
  const { data: ahRows } = await supabase
    .from('price_history_ah_variants')
    .select('base_item_id, variant_key, variant_key_base, sell_price, avg_price, bucket_date')
    .in('base_item_id', uniqueItemIds)
    .gte('bucket_date', sinceDate)

  const exactRows: { key: string; price: number; date: string }[] = []
  const baseRows:  { key: string; price: number; date: string }[] = []
  const itemIdsWithAhPrice = new Set<string>()

  for (const row of (ahRows || []) as any[]) {
    const price = betterPrice(row.sell_price, row.avg_price)
    if (price <= 0) continue
    exactRows.push({ key: `${row.base_item_id}|${row.variant_key}`, price, date: row.bucket_date })
    itemIdsWithAhPrice.add(row.base_item_id)
    if (row.variant_key_base) {
      baseRows.push({ key: `${row.base_item_id}|${row.variant_key_base}`, price, date: row.bucket_date })
    }
  }

  const exactPriceMap = pickLatestPriceByKey(exactRows)
  const basePriceMap  = pickLatestPriceByKey(baseRows)

  // ── Tier 3 : price_history (BAZAAR), uniquement pour les item_id absents de l'AH ──
  const bazaarCandidateIds = uniqueItemIds.filter(id => !itemIdsWithAhPrice.has(id))
  let bazaarPriceMap = new Map<string, number>()

  if (bazaarCandidateIds.length > 0) {
    const { data: bazaarRows } = await supabase
      .from('price_history')
      .select('item_id, sell_price, avg_price, bucket_date')
      .eq('source', 'BAZAAR')
      .in('item_id', bazaarCandidateIds)
      .gte('bucket_date', sinceDate)

    const rows = ((bazaarRows || []) as any[])
      .map(row => ({ key: row.item_id, price: betterPrice(row.sell_price, row.avg_price), date: row.bucket_date }))
    bazaarPriceMap = pickLatestPriceByKey(rows)
  }

  const priceForItem = (item: PriceableItem): number => {
    const exact = exactPriceMap.get(`${item.item_id}|${item.variant_key_full}`)
    if (exact !== undefined) return exact
    const base = basePriceMap.get(`${item.item_id}|${item.variant_key_base}`)
    if (base !== undefined) return base
    return bazaarPriceMap.get(item.item_id) ?? 0
  }

  const categories: Record<string, CategoryBreakdown> = {}
  let itemsTotal = 0

  for (const [category, items] of Object.entries(categorizedItems)) {
    let value = 0, priced = 0, unpriced = 0
    for (const item of items) {
      const unitPrice = priceForItem(item)
      if (unitPrice > 0) { value += unitPrice * (item.item_count || 1); priced++ }
      else { unpriced++ }
    }
    categories[category] = { value: Math.round(value), items_priced: priced, items_unpriced: unpriced }
    itemsTotal += value
  }

  return {
    total:       Math.round(purse + bank + itemsTotal),
    purse, bank,
    items_total: Math.round(itemsTotal),
    categories,
    calculated_at: new Date().toISOString(),
  }
}

// ── Handler ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Evolve (Skills, chaine ci-dessous via runEvolveSkills) reserve Pro+. Verifie a chaque
  // appel, pas seulement a la liaison du compte Hypixel.
  const gate = await requirePlan('pro')
  if (!gate.ok) return gate.response

  const { data: link } = await supabase
    .from('hypixel_account_links')
    .select('hypixel_uuid, hypixel_username')
    .eq('user_id', gate.user.id)
    .single()
  if (!link) return NextResponse.json({ error: 'No Hypixel account linked. Link one first via /api/link-hypixel-account' }, { status: 400 })

  const username  = link.hypixel_username
  const userId    = gate.user.id
  const profileId = req.nextUrl.searchParams.get('profile_id')

  try {
    // UUID deja resolu et fige au moment de la liaison — pas besoin de rappeler Mojang.
    const uuid = link.hypixel_uuid

    // 2. Profil Skyblock
    const profileRes  = await fetch(
      `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`,
      { headers: { 'API-Key': HYPIXEL_KEY } }
    )
    const profileData = await profileRes.json()

    // Detection explicite cle invalide/expiree — avant, un 403/401 silencieux se traduisait
    // juste en "profiles: []" puis "No matching Skyblock profile found", indiscernable d'un
    // vrai probleme de profil (confirme le 23 juillet : c'est exactement ce qui s'est passe
    // en Phase 2 du chantier collecte totale, decouvert seulement par audit manuel).
    if (profileRes.status === 401 || profileRes.status === 403 || profileData.success === false) {
      const message = 'HYPIXEL_API_KEY invalide ou expiree — a regenerer sur developer.hypixel.net'
      await supabase.from('sync_log').insert({
        job_name:     'player-sync',
        finished_at:  new Date().toISOString(),
        status:       'error',
        rows_written: 0,
        error:        message,
        details:      { http_status: profileRes.status, cause: profileData.cause || null, hypixel_uuid: uuid, hypixel_username: username },
      })
      return NextResponse.json({ error: message }, { status: 502 })
    }

    const profiles = profileData.profiles || []

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

    // 5c. Classes de donjon (Phase 1 du chantier collecte totale) — vérifié sur un vrai
    // profil (Cucumber) : member.dungeons.player_classes est un objet {healer/mage/
    // berserk/archer/tank: {experience}}, aucun champ "level" fourni par l'API. Catacombs
    // et les classes utilisent chacun leur propre courbe XP→niveau, distincte des skills
    // classiques — aucune source vérifiée en interne pour cette courbe (pas dans
    // /v2/resources/skyblock/skills, pas dans une table interne), donc XP brute stockée
    // sans niveau dérivé, même principe que hotm_progress. selected_dungeon_class est un
    // bonus utile (classe actuellement équipée par le joueur).
    const dungeonClassData = member.dungeons?.player_classes || {}
    dungeons.classes = Object.fromEntries(
      Object.entries(dungeonClassData as Record<string, any>).map(([className, data]) => [
        className,
        { experience: data.experience ?? 0 },
      ])
    )
    dungeons.selected_class = member.dungeons?.selected_dungeon_class ?? null

    // 5b. Heart of the Mountain / Skill Tree (mining + foraging) — vérifié contre le code
    // source de hypixel-api-reborn : les perks/nodes ne vivent PAS dans member.mining_core
    // (qui ne contient que powder/crystals/forge) mais dans member.skill_tree, un champ
    // séparé. On stocke les niveaux de node bruts (ex: mining_speed:9) plutôt que de
    // dériver un "tier" — la table XP→tier (getLevelByXp type mining_tree) n'a pas de
    // source vérifiée en interne, donc pas codée en dur ici (règle : jamais de constante
    // de jeu reconstituée de mémoire).
    function extractSkillTree(tree: 'mining' | 'foraging', tokenKey: 'mountain' | 'forest') {
      const nodes = member.skill_tree?.nodes?.[tree] || {}
      return {
        nodes:            Object.fromEntries(Object.entries(nodes).filter(([k]) => !k.startsWith('toggle_'))),
        experience:       member.skill_tree?.experience?.[tree] ?? 0,
        tokens_spent:     member.skill_tree?.tokens_spent?.[tokenKey] ?? 0,
        selected_ability: member.skill_tree?.selected_ability?.[tree] ?? null,
      }
    }
    const powderOf = (type: string) => ({
      powder: member.mining_core?.[`powder_${type}`] ?? 0,
      spent:  member.mining_core?.[`powder_spent_${type}`] ?? 0,
    })
    const hotmProgress = {
      mining:          extractSkillTree('mining', 'mountain'),
      foraging:        extractSkillTree('foraging', 'forest'),
      powder: {
        mithril:  powderOf('mithril'),
        gemstone: powderOf('gemstone'),
        glacite:  powderOf('glacite'),
      },
      pickaxe_ability: member.mining_core?.selected_pickaxe_ability ?? null,
    }

    // 5d. Boss kills (Kuudra/Arachne/Ender Dragon) — voir extractBossKills en tête de
    // fichier pour la justification de chaque champ.
    const bossKills = extractBossKills(member)

    // 5e. Bank tier + Fast Travel — voir extractBankAndFastTravel en tête de fichier
    // pour la justification de chaque champ.
    const bankFastTravel = extractBankAndFastTravel(member)

    // 5f. Essence — voir extractEssence en tête de fichier pour la justification.
    const essence = extractEssence(member)

    // 5g. Minions — voir extractMinions en tête de fichier pour la justification.
    const minions = extractMinions(member)

    // 5h. Bestiary — voir extractBestiary en tête de fichier pour la justification.
    const bestiary = extractBestiary(member)

    // 5i. Rift — voir extractRift en tête de fichier pour la justification.
    const rift = extractRift(member)

    // 5j. Long tail (Dojo/Harp/Abiphone/Community/Festivals) — voir extractLongTail.
    const longTail = extractLongTail(member, profile)

    // 5k. Donjons — détail par étage. Voir extractDungeonDetail en tête de fichier.
    const dungeonDetail = extractDungeonDetail(member)

    // 5l. Slayer — claimed_levels + détail par tier. Voir extractSlayerDetail.
    const slayerDetail = extractSlayerDetail(member)

    // 5m. Jacob's Farming Contests — voir extractJacobsContests en tête de fichier.
    const jacobsContests = extractJacobsContests(member)

    // 5n. Chocolate Factory (Easter) — voir extractChocolateFactory en tête de fichier.
    const chocolateFactory = extractChocolateFactory(member)

    // 5o. Auctions — voir extractAuctionStats en tête de fichier.
    const auctionStats = extractAuctionStats(member)

    // 5p. Fishing — voir extractFishingStats en tête de fichier.
    const fishingStats = extractFishingStats(member)

    // 5q. Bloc 7 (audit 8 blocs) — Garden/AccessoryBag tuning/AutoPets/Hina gifts.
    // Voir extractBloc7Zones en tête de fichier pour la justification de chaque champ.
    const bloc7Zones = extractBloc7Zones(member)

    // 5r. Musée — endpoint SÉPARÉ de /v2/skyblock/profiles (Bloc 7.3, audit 8 blocs).
    // Structure vérifiée sur Cucumber avant mapping : {value, appraisal, items:
    // {ITEM_ID: {donated_time, featured_slot, items:{type,data}}}, special}.
    // Décoder chaque NBT donné est un chantier séparé (permettrait de vérifier les
    // 416 tâches "Museum Donations" par vrai don plutôt que par présence en
    // inventaire, voir CLAUDE.md) -- volontairement pas fait cette passe, juste le
    // résumé réel (valeur totale + vrais item_id donnés) pour ne pas complexifier
    // ce bloc déjà large.
    let museumValue = 0
    let museumDonatedItemIds: string[] = []
    try {
      const museumRes = await fetch(`https://api.hypixel.net/v2/skyblock/museum?profile=${profile.profile_id}`, { headers: { 'API-Key': HYPIXEL_KEY } })
      const museumData = await museumRes.json()
      const museumMember = museumData?.members?.[uuid.replace(/-/g, '')]
      if (museumData.success && museumMember) {
        museumValue = museumMember.value ?? 0
        museumDonatedItemIds = Object.keys(museumMember.items || {})
      }
    } catch (e) {
      console.error('museum fetch failed:', e)
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
          item_id:          item.item_id,
          item_name:        item.item_name,
          reforge:          item.reforge,
          stars:            item.total_stars,
          is_recomb:        item.is_recomb,
          enchantments:     item.enchantments,
          gems:             item.gems,
          item_count:       1,
          variant_key_full: item.variant_key_full,
          variant_key_base: item.variant_key_base,
        }
      })
    }

    // 8c. Accessory bag décodé (member.inventory.bag_contents.talisman_bag.data)
    const bagData = member.inventory?.bag_contents?.talisman_bag?.data
    const equippedAccessories = bagData
      ? decodeItemListBytes(bagData)
          .filter((item): item is NonNullable<typeof item> => !!item)
          .map(item => ({
            item_id:          item.item_id,
            item_name:        item.item_name,
            reforge:          item.reforge,
            stars:            item.total_stars,
            is_recomb:        item.is_recomb,
            enchantments:     item.enchantments,
            gems:             item.gems,
            item_count:       1,
            variant_key_full: item.variant_key_full,
            variant_key_base: item.variant_key_base,
          }))
      : []

    // 8d. Inventaire principal + enderchest décodés (member.inventory.inv_contents / ender_chest_contents)
    const inventoryItems  = decodeItemList(member.inventory?.inv_contents?.data)
    const enderChestItems = decodeItemList(member.inventory?.ender_chest_contents?.data)

    // 8f. Personal Vault (feature nommee "Vault", distincte des coffres poses sur l'ile —
    // ces derniers ne sont pas exposes par l'API Hypixel, voir CLAUDE.md)
    const personalVaultItems = decodeItemList(member.inventory?.personal_vault_contents?.data)

    // 8e. Backpacks (backpack_icons + backpack_contents, mappes par la meme cle slot —
    // verifie explicitement, pas suppose par ordre de tableau)
    const backpackIcons    = member.inventory?.backpack_icons || {}
    const backpackContents = member.inventory?.backpack_contents || {}
    const backpacks = Object.keys(backpackIcons)
      .filter(slot => backpackContents[slot]?.data)
      .map(slot => {
        const iconData = backpackIcons[slot]?.data
        const icon = iconData ? decodeItemListBytes(iconData).find(i => i) : null
        return {
          slot:           Number(slot),
          icon_item_id:   icon?.item_id ?? null,
          icon_item_name: icon?.item_name ?? null,
          items:          decodeItemList(backpackContents[slot]?.data),
        }
      })

    // 8g. Wardrobe (tenues sauvegardees, member.loadout.armor — objet indexe par slot "1".."27",
    // PAS des doublons de inv_armor : une tenue non portee est invisible partout ailleurs)
    const decodeOne = (bytesBase64: string | undefined) =>
      bytesBase64 ? decodeItemListBytes(bytesBase64).find(i => i) ?? null : null

    const loadoutArmor = member.loadout?.armor || {}
    const wardrobeSlots = Object.entries(loadoutArmor)
      .map(([key, slotData]: [string, any]) => {
        const helmet     = decodeOne(slotData?.HELMET?.data)
        const chestplate = decodeOne(slotData?.CHESTPLATE?.data)
        const leggings   = decodeOne(slotData?.LEGGINGS?.data)
        const boots      = decodeOne(slotData?.BOOTS?.data)
        return { slot: Number(key), helmet, chestplate, leggings, boots }
      })
      .filter(s => s.helmet || s.chestplate || s.leggings || s.boots)
      .map(s => {
        const piece = (item: typeof s.helmet) => item ? {
          item_id: item.item_id, item_name: item.item_name, reforge: item.reforge, stars: item.total_stars,
          enchantments: item.enchantments, gems: item.gems, item_count: 1,
          variant_key_full: item.variant_key_full, variant_key_base: item.variant_key_base,
        } : null
        return {
          slot:       s.slot,
          helmet:     piece(s.helmet),
          chestplate: piece(s.chestplate),
          leggings:   piece(s.leggings),
          boots:      piece(s.boots),
        }
      })

    // 9. Networth complet — purse+bank + valeur de marche de tous les items decodes
    const purse = Math.round(member.currencies?.coin_purse ?? 0)
    const bank  = Math.round(profile.banking?.balance ?? 0)

    const categorizedItems: Record<string, PriceableItem[]> = {
      equipped_armor:       Object.values(equippedArmor) as PriceableItem[],
      equipped_accessories: equippedAccessories as PriceableItem[],
      inventory_items:      inventoryItems as PriceableItem[],
      ender_chest_items:    enderChestItems as PriceableItem[],
      backpacks:            backpacks.flatMap(bp => bp.items) as PriceableItem[],
      personal_vault_items: personalVaultItems as PriceableItem[],
      wardrobe_slots:       wardrobeSlots.flatMap(s => [s.helmet, s.chestplate, s.leggings, s.boots])
                               .filter((p): p is NonNullable<typeof p> => !!p) as PriceableItem[],
    }

    const networthBreakdown = await calculateNetworth(supabase, purse, bank, categorizedItems)
    const networth = networthBreakdown.total

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
      bank_tier:          bankFastTravel.bank_tier,
      fast_travel_zones:  bankFastTravel.fast_travel_zones,
      essence,
      crafted_generators: minions.crafted_generators,
      bestiary_kills:     bestiary.bestiary_kills,
      bestiary_milestone: bestiary.bestiary_milestone,
      rift_motes:         rift.rift_motes,
      dojo_status:        longTail.dojo_status,
      harp_songs:         longTail.harp_songs,
      abiphone_contacts:  longTail.abiphone_contacts,
      community_upgrades: longTail.community_upgrades,
      festival_candy:     longTail.festival_candy,
      dungeon_secrets:           dungeonDetail.dungeon_secrets,
      dungeon_unlocked_journals: dungeonDetail.dungeon_unlocked_journals,
      catacombs_floors:          dungeonDetail.catacombs_floors,
      master_catacombs_floors:   dungeonDetail.master_catacombs_floors,
      slayer_detail:             slayerDetail,
      jacob_medals:              jacobsContests.jacob_medals,
      jacob_perks:               jacobsContests.jacob_perks,
      jacob_unique_brackets:     jacobsContests.jacob_unique_brackets,
      jacob_personal_bests:      jacobsContests.jacob_personal_bests,
      jacob_contests:            jacobsContests.jacob_contests,
      chocolate_factory:         chocolateFactory,
      auction_stats:             auctionStats,
      fishing_stats:             fishingStats,
      garden_copper:             bloc7Zones.garden_copper,
      garden_greenhouse_crops:   bloc7Zones.garden_greenhouse_crops,
      garden_chips:              bloc7Zones.garden_chips,
      accessory_tuning:          bloc7Zones.accessory_tuning,
      accessory_magical_power:   bloc7Zones.accessory_magical_power,
      accessory_selected_power:  bloc7Zones.accessory_selected_power,
      accessory_unlocked_powers: bloc7Zones.accessory_unlocked_powers,
      autopet_rules:             bloc7Zones.autopet_rules,
      hina_tree_gifts:           bloc7Zones.hina_tree_gifts,
      hina_daily_gifts:          bloc7Zones.hina_daily_gifts,
      museum_value:              museumValue,
      museum_donated_item_ids:   museumDonatedItemIds,
      networth,
      networth_breakdown: networthBreakdown,
      skills:            skillLevels,
      slayers,
      dungeons,
      boss_kills:        bossKills,
      collections,
      pets,
      inventory_summary: inventorySummary,
      equipped_armor:        equippedArmor,
      equipped_accessories:  equippedAccessories,
      inventory_items:       inventoryItems,
      ender_chest_items:     enderChestItems,
      backpacks:             backpacks,
      personal_vault_items:  personalVaultItems,
      wardrobe_slots:        wardrobeSlots,
      hotm_progress:         hotmProgress,
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

    // Chaine la generation des cartes Skills juste apres un sync reussi, filtree sur
    // ce seul profil — jamais sur l'ensemble de player_data, jamais sur un timer (voir
    // commentaire en tete de evolve-skills/route.ts). Echec non bloquant : le sync a
    // reussi independamment, une erreur Claude ne doit pas transformer une reponse
    // reussie en 500.
    let skillCards: { success: boolean; error?: string } = { success: false }
    try {
      const result = await runEvolveSkills([profile.profile_id])
      skillCards = { success: !('error' in result) }
    } catch (e: any) {
      console.error('runEvolveSkills chained call failed:', e.message)
      skillCards = { success: false, error: e.message }
    }

    return NextResponse.json({
      success:    true,
      username,
      uuid,
      profile_id: profile.profile_id,
      cute_name:  profile.cute_name ?? null,
      game_stage: gameStage,
      skills:     skillLevels,
      networth,
      networth_breakdown: networthBreakdown,
      hotm_progress: hotmProgress,
      skin_url:   skinUrl,
      skill_cards_generated: skillCards.success,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}