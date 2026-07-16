export type View = 'editor' | 'history' | 'github' | 'terminal' | 'problems'

interface Props {
  view: View
  onChange: (v: View) => void
  onOpenSettings: () => void
  onOpenPalette: () => void
  onCheckUpdates: () => void
  badges?: Partial<Record<View, number>>
}

// Bara riktiga vyer bor här. Terminal/Problem togglas från statusraden nere
// (och Ctrl+` / Ctrl+Shift+M) så de inte tar plats som stora vänsterknappar.
const items: { id: View; icon: string; label: string }[] = [
  { id: 'terminal', icon: '>_', label: 'Terminal' },
  { id: 'editor', icon: '⎘', label: 'Ändringar & kod' },
  { id: 'github', icon: '⌥', label: 'GitHub' },
  { id: 'history', icon: '⟲', label: 'Historik' }
]

export function ActivityBar({
  view,
  onChange,
  onOpenSettings,
  onOpenPalette,
  onCheckUpdates,
  badges
}: Props): JSX.Element {
  return (
    <div className="activitybar">
      {items.map((it) => {
        const badge = badges?.[it.id] ?? 0
        return (
          <button
            key={it.id}
            className={`act ${view === it.id ? 'active' : ''}`}
            title={it.label}
            onClick={() => onChange(it.id)}
          >
            {it.icon}
            {badge > 0 && <span className="act-badge">{badge > 99 ? '99+' : badge}</span>}
          </button>
        )
      })}
      <div style={{ flex: 1 }} />
      <button className="act" title="Sök efter uppdateringar" onClick={onCheckUpdates}>
        ⟳
      </button>
      <button className="act" title="Kommandopalett (Ctrl+Shift+P)" onClick={onOpenPalette}>
        ⌘
      </button>
      <button className="act" title="Inställningar" onClick={onOpenSettings}>
        ⚙
      </button>
    </div>
  )
}
