// Route de debug temporaire — validation end-to-end de l'intégration réelle
// SetupOverlay + SkinArmorRender : compte Vault jetable (Pro), lié à un vrai
// compte Hypixel (résolution Mojang réelle, même logique que
// /api/link-hypixel-account), setup regénéré via le vrai pipeline grounded
// (setup-generate-agent), lu exactement comme /api/setup/generate le fait,
// puis dérive le contenu exact que SkinArmorRender afficherait (skin URL,
// tooltip armure) -- tout tracé jusqu'à de vraies lignes DB, rien d'inventé.
// Nettoie le compte jetable en fin de requête. À supprimer après validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  loadPricedItems, gearCatalogForBudget, buildWikiContext, GROUNDING_RULES,
  generateOne, methodKey,
} from '../../cron/setup-generate-agent/route'
import { TIER_CONFIG } from '../../../../lib/money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TEST_HYPIXEL_USERNAME = 'Cucumber' // déjà utilisé/validé cette semaine (profil MID réel avec vrai gear)

export async function GET() {
  const testEmail = `vault-skin-test-${Date.now()}@example.invalid`
  let userId: string | null = null

  try {
    // 1. Compte jetable
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: testEmail, password: 'test-password-not-real-12345', email_confirm: true,
    })
    if (createErr || !created.user) throw new Error('createUser: ' + createErr?.message)
    userId = created.user.id

    // 2. Plan Pro (bypass Stripe pour le test, même pattern que les comptes jetables déjà utilisés cette semaine)
    const { error: subErr } = await supabase.from('subscriptions').upsert(
      { email: testEmail, plan: 'pro', status: 'active' }, { onConflict: 'email' }
    )
    if (subErr) throw new Error('subscriptions upsert: ' + subErr.message)

    // 3. Vraie résolution Mojang (même logique que /api/link-hypixel-account, pas de self-fetch HTTP)
    const mojangRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(TEST_HYPIXEL_USERNAME)}`)
    if (!mojangRes.ok) throw new Error('Mojang lookup failed: ' + mojangRes.status)
    const mojangData = await mojangRes.json()
    const rawId = mojangData.id as string
    const hypixelUuid = `${rawId.slice(0,8)}-${rawId.slice(8,12)}-${rawId.slice(12,16)}-${rawId.slice(16,20)}-${rawId.slice(20)}`
    const hypixelUsername = mojangData.name as string

    const { error: linkErr } = await supabase.from('hypixel_account_links').upsert(
      { user_id: userId, hypixel_uuid: hypixelUuid, hypixel_username: hypixelUsername, linked_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    if (linkErr) throw new Error('hypixel_account_links upsert: ' + linkErr.message)

    // 4. Regénère UN setup réel via le vrai pipeline grounded (même code que setup-generate-agent,
    //    garantit que method_setups contient des données fraîches, pas d'anciennes lignes pré-grounding)
    const { data: analysis } = await supabase.from('claude_analysis').select('content').eq('section', 'money_making_late').single()
    if (!analysis) throw new Error('No money_making_late in claude_analysis')
    const tierData = JSON.parse(analysis.content)
    const methods: any[] = [...(tierData.active || []), ...(tierData.vault || [])]
    const method = methods.find((m: any) => /mining|gemstone|crystal|glacite|hollow/i.test(m.method || '') || m.skill === 'mining') || methods[0]

    const [{ data: ctx }, pricedItems] = await Promise.all([supabase.rpc('get_full_context'), loadPricedItems()])
    const catalog = gearCatalogForBudget(pricedItems, TIER_CONFIG.late.max_gear_cost)
    const wikiContext = buildWikiContext(ctx) + '\n' + GROUNDING_RULES + '\n\n' + catalog
    const genOk = await generateOne(method, 'late', wikiContext, pricedItems)

    // 5. Lit le setup EXACTEMENT comme /api/setup/generate le fait
    const key = methodKey(method)
    const { data: savedRow } = await supabase.from('method_setups').select('setup').eq('method_key', key).eq('tier', 'late').single()
    const setup = savedRow ? JSON.parse(savedRow.setup) : null

    // 6. Dérive exactement ce que SetupOverlay/SkinArmorRender afficheraient
    const skinUrl = `https://crafatar.com/skins/${hypixelUuid}`
    const armorTooltip = setup?.armor_set ? {
      title: `${setup.armor_set}${setup.armor_stars ? ' ' + '✪'.repeat(Math.min(setup.armor_stars, 5)) : ''}`,
      lines: [setup.armor_stats, setup.armor_bonus].filter(Boolean),
    } : null
    const weaponTextBlock = {
      weapon_name: setup?.weapon_name || null,
      weapon_stars: setup?.weapon_stars || null,
      weapon_stats: setup?.weapon_stats || null,
      weapon_ability: setup?.weapon_ability || null,
      tool: setup?.tool || null,
      rod: setup?.rod || null,
    }

    return NextResponse.json({
      test_account: { email: testEmail, plan: 'pro', cleaned_up: 'see below' },
      hypixel_link: { hypixel_uuid: hypixelUuid, hypixel_username: hypixelUsername },
      skin_url_that_setupoverlay_would_fetch: skinUrl,
      method_regenerated: { id: method.id, method: method.method, generation_ok: genOk },
      real_setup_from_method_setups_table: setup,
      derived_armor_tooltip_content: armorTooltip,
      derived_weapon_text_block: weaponTextBlock,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    // Nettoyage — jamais laisser le compte jetable en base
    if (userId) {
      await supabase.from('hypixel_account_links').delete().eq('user_id', userId)
      await supabase.from('subscriptions').delete().eq('email', testEmail)
      await supabase.auth.admin.deleteUser(userId)
    }
  }
}
