export type View = 'editor' | 'history' | 'github' | 'terminal' | 'problems'

interface Props {
  view: View
  onChange: (v: View) => void
  onOpenSettings: () => void
  onOpenPalette: () => void
}

const items: { id: View; icon: string; label: string }[] = [
  { id: 'editor', icon: '⎘', label: 'Ändringar & kod' },
  { id: 'history', icon: '🕘', label: 'Historik' },
  { id: 'github', icon: '⌥', label: 'GitHub' },
  { id: 'terminal', icon: '▶', label: 'Terminal' },
  { id: 'problems', icon: '⚠', label: 'Problem' }
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
      <button className="act" title="Kommandopalett (Ctrl+P)" onClick={onOpenPalette}>
        ⌘
      </button>
      <button className="act" title="Inställningar" onClick={onOpenSettings}>
        ⚙
      </button>
    </div>
  )
}
