import { useMemo, useState } from 'react'
import { useRepo } from '../state/RepoContext'
import { useSettings } from '../settings/SettingsContext'
import { themes } from '../themes/themes'
import type { View } from './ActivityBar'

interface Command {
  id: string
  label: string
  hint?: string
  run: () => void
}

interface Props {
  onClose: () => void
  setView: (v: View) => void
  openPanel: (tab: 'terminal' | 'problems') => void
  openSettings: () => void
  openAbout: () => void
}

export function CommandPalette({
  onClose,
  setView,
  openPanel,
  openSettings,
  openAbout
}: Props): JSX.Element {
  const repo = useRepo()
  const { update } = useSettings()
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'open', label: 'Öppna repo…', run: () => repo.openDialog() },
      { id: 'view-editor', label: 'Visa: Ändringar & kod', run: () => setView('editor') },
      { id: 'view-history', label: 'Visa: Historik', run: () => setView('history') },
      { id: 'view-github', label: 'Visa: GitHub', run: () => setView('github') },
      { id: 'view-terminal', label: 'Visa: Terminal', run: () => openPanel('terminal') },
      { id: 'view-problems', label: 'Visa: Problem', run: () => openPanel('problems') },
      { id: 'push', label: 'Git: Push', run: () => repo.push() },
      { id: 'pull', label: 'Git: Pull', run: () => repo.pull() },
      { id: 'fetch', label: 'Git: Fetch', run: () => repo.fetch() },
      { id: 'stash', label: 'Git: Stasha ändringar', run: () => repo.stashSave() },
      { id: 'refresh', label: 'Git: Uppdatera status', run: () => repo.refresh() },
      { id: 'settings', label: 'Öppna inställningar', run: openSettings },
      { id: 'about', label: 'Om Codester', run: openAbout }
    ]
    const branchCmds: Command[] = repo.branches
      .filter((b) => !b.current)
      .map((b) => ({
        id: `co-${b.name}`,
        label: `Byt till branch: ${b.name}`,
        hint: 'branch',
        run: () => repo.checkout(b.name)
      }))
    const themeCmds: Command[] = themes.map((t) => ({
      id: `theme-${t.id}`,
      label: `Tema: ${t.name}`,
      hint: 'tema',
      run: () => update({ themeId: t.id })
    }))
    return [...base, ...branchCmds, ...themeCmds]
  }, [repo, update, setView, openSettings])

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  )

  const exec = (cmd: Command | undefined): void => {
    if (!cmd) return
    cmd.run()
    onClose()
  }

  return (
    <div className="overlay palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Skriv ett kommando…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSel(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, filtered.length - 1))
            if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0))
            if (e.key === 'Enter') exec(filtered[sel])
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="palette-list">
          {filtered.map((c, i) => (
            <div
              key={c.id}
              className={`palette-item ${i === sel ? 'active' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => exec(c)}
            >
              <span>{c.label}</span>
              {c.hint && <span className="badge">{c.hint}</span>}
            </div>
          ))}
          {filtered.length === 0 && <div className="palette-item muted">Inga kommandon</div>}
        </div>
      </div>
    </div>
  )
}
