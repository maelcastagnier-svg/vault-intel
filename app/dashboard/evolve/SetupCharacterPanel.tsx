// app/dashboard/evolve/SetupCharacterPanel.tsx
// Thin wrapper around SkinArmorRender (components/, reused completely
// unmodified) for one side of SkillProgressOverlay's current/target split.
// The only new logic here is the empty state: a render_setup with no
// armor_set means "nothing to show" -- render the bare skin with an
// explicit message, never a silently blank or ambiguous panel (current-empty
// is a real, expected state for a skill the player hasn't invested in yet).
'use client'
import SkinArmorRender from '../../../components/SkinArmorRender'
import type { RenderSetup } from './types'

export default function SetupCharacterPanel({ label, setup, skinUrls, accentColor, emptyMessage }: {
  label: string
  setup: RenderSetup | undefined
  skinUrls: string[]
  accentColor: string
  emptyMessage: string
}) {
  const hasArmor = !!setup?.armor_set

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        fontSize: 9, color: accentColor, fontFamily: 'Space Mono, monospace',
        letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8,
      }}>
        {label}
      </div>
      <SkinArmorRender skinUrls={skinUrls} setup={setup || {}} accentColor={accentColor} />
      {!hasArmor && (
        <div style={{
          fontSize: 10, color: '#4a4a45', fontFamily: 'Space Mono, monospace',
          textAlign: 'center', marginTop: 6, maxWidth: 220, lineHeight: 1.5,
        }}>
          {emptyMessage}
        </div>
      )}
    </div>
  )
}
