// lib/gate-content.ts
// Filtrage de contenu par plan, partage entre les routes qui servent la meme donnee sous
// des formes differentes (market-data / patch-insights / player/money-making) — jamais
// duplique la logique de troncature.
import { Plan } from './get-plan'

// ── Money Making — Vault Exclusive reserve Elite, Active accessible des Pro ──────────
export function filterMoneyMaking(parsed: any, plan: Plan) {
  const active = Array.isArray(parsed?.active) ? parsed.active : []
  const vault  = plan === 'elite' && Array.isArray(parsed?.vault) ? parsed.vault : []
  return { comparison_summary: parsed?.comparison_summary || '', active, vault }
}

// ── Patch Insights (table insight_patch) — Free : titre + impact 1 phrase, Live seulement.
// Alert+ : contenu complet (items/methods/prediction/signal/confidence), Live + Alpha. ──
export function filterPatchInsight(row: any, plan: Plan): any | null {
  if (plan !== 'free') return row
  if (row.is_alpha) return null // Free = Live seulement
  return {
    patch_title: row.patch_title,
    patch_date:  row.patch_date,
    patch_type:  row.patch_type || 'live',
    direct_impact: row.direct_impact || null,
  }
}

// ── Patch Analysis (claude_analysis.patch_analysis, forme {patches:[...]}) — meme regle,
// utilise seulement en repli si insight_patch est vide (voir PatchSection.tsx). ──────────
export function filterPatchAnalysisContent(contentJson: string, plan: Plan): string {
  if (plan !== 'free' || !contentJson) return contentJson
  try {
    const parsed = JSON.parse(contentJson)
    if (!Array.isArray(parsed?.patches)) return contentJson
    const trimmed = {
      patches: parsed.patches.map((p: any) => ({ title: p.title, impact: p.impact })),
    }
    return JSON.stringify(trimmed)
  } catch {
    return contentJson
  }
}
