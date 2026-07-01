export type View = 'editor' | 'history' | 'github' | 'terminal' | 'problems'

interface Props {
  view: View
  onChange: (v: View) => void
  onOpenSettings: () => void
  onOpenPalette: () => void
}

// Bara riktiga vyer bor här. Terminal/Problem togglas från statusraden nere
// (och Ctrl+` / Ctrl+Shift+M) så de inte tar plats som stora vänsterknappar.
const items: { id: View; icon: string; label: string }[] = [
  { id: 'editor', icon: '⎘', label: 'Ändringar & kod' },
  { id: 'history', icon: '⟲', label: 'Historik' },
  { id: 'github', icon: '⌥', label: 'GitHub' }
]

export function ActivityBar({ view, onChange, onOpenSettings, onOpenPalette }: Props): JSX.Element {
  return (
    <div className="activitybar">
      {items.map((it) => (
        <button
          key={it.id}
          className={`act ${view === it.id ? 'active' : ''}`}
          title={it.label}
          onClick={() => onChange(it.id)}
        >
          {it.icon}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <button className="act" title="Kommandopalett (Ctrl+Shift+P)" onClick={onOpenPalette}>
        ⌘
      </button>
      <button className="act" title="Inställningar" onClick={onOpenSettings}>
        ⚙
      </button>
    </div>
  )
}
