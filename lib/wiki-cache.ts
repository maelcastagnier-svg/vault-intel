// lib/wiki-cache.ts
// Helper partagé pour les crons "wiki-referential-sync" (chantier cartographie
// exhaustive, 2 août) -- lit une page déjà cachée par wiki-auto-sync
// (game_mechanics_misc) au lieu de refaire un appel réseau. Le cache est déjà
// rafraîchi en continu (*/30 min), donc relire ici garantit une donnée aussi
// fraîche que la dernière passe de wiki-auto-sync, sans appel réseau supplémentaire.
import { SupabaseClient } from '@supabase/supabase-js'

// Quelques pages/anciennes migrations ont un doublon 'fandom_wiki' périmé
// (source abandonnée le 22 juillet) sous la même clé -- toujours filtrer sur
// hypixelskyblock_wiki pour ne jamais lire une version périmée.
export async function getWikiContent(supabase: SupabaseClient, key: string): Promise<string> {
  const { data, error } = await supabase
    .from('game_mechanics_misc')
    .select('value')
    .eq('key', key)
    .eq('value->>source', 'hypixelskyblock_wiki')
    .maybeSingle()
  if (error) throw new Error(`game_mechanics_misc fetch ("${key}"): ${error.message}`)
  if (!data) throw new Error(`game_mechanics_misc: page "${key}" introuvable (source=hypixelskyblock_wiki) -- page renommée/supprimée cote wiki ? a verifier manuellement.`)
  const content = (data.value as any)?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error(`game_mechanics_misc: page "${key}" trouvee mais contenu vide`)
  }
  return content
}

// Retire les templates de mise en forme wiki les plus courants autour d'un nombre
// ({{Green|640}}, {{darkPurple|6}}, etc.) pour ne garder que la valeur brute.
export function stripColorTemplate(s: string): string {
  const m = s.match(/\{\{[A-Za-z]+\|([^}|]+)\}\}/)
  return (m ? m[1] : s).replace(/,/g, '').trim()
}
