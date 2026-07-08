import { useEffect, useRef, useState } from 'react'
import { useRepo } from '../state/RepoContext'
import { useProblems, counts } from '../editor/markers'

export function StatusBar({
  version,
  panelTab,
  onShowTerminal,
  onShowProblems,
  onOpenChanges
}: {
  version: string
  panelTab: 'terminal' | 'problems' | null
  onShowTerminal: () => void
  onShowProblems: () => void
  onOpenChanges: () => void
}): JSX.Element {
  const { status, repo, busy, branches, checkout } = useRepo()
  const problems = useProblems()
  const { errors, warnings } = counts(problems)
  const changeCount = status?.files.length ?? 0
  const current = status?.current ?? '–'
  const ahead = status?.ahead ?? 0
  const behind = status?.behind ?? 0

  const [pickerOpen, setPickerOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)

  // Stäng branch-väljaren vid klick utanför / Escape
  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent): void => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  const pick = (name: string): void => {
    setPickerOpen(false)
    setFilter('')
    if (name !== current) checkout(name)
  }

  const shownBranches = branches.filter((b) =>
    b.name.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <footer className="statusbar">
      {repo ? (
        <>
          <div className="branch-picker-wrap" ref={pickerRef}>
            <button
              className="seg clickable branch"
              title="Byt gren"
              onClick={() => setPickerOpen((v) => !v)}
            >
              ⎇ {current} ▾
            </button>
            {pickerOpen && (
              <div className="branch-picker" role="listbox">
                <input
                  autoFocus
                  className="branch-picker-filter"
                  placeholder="Byt gren…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <div className="branch-picker-list">
                  {shownBranches.length === 0 && <div className="hint">Inga grenar</div>}
                  {shownBranches.map((b) => (
                    <button
                      key={b.name}
                      role="option"
                      aria-selected={b.current}
                      className={`branch-picker-item ${b.current ? 'active' : ''}`}
                      onClick={() => pick(b.name)}
                    >
                      <span className="icon">⎇</span>
                      <span className="branch-name">{b.name}</span>
                      {b.current && <span className="tick">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            className="seg clickable"
            title={`${ahead} att skicka (push), ${behind} att hämta (pull) mot fjärren — öppna källkontroll`}
            onClick={onOpenChanges}
          >
            ↑{ahead} ↓{behind}
          </button>
          <button
            className="seg clickable"
            title="Antal ändrade filer — öppna källkontroll"
            onClick={onOpenChanges}
          >
            ● {changeCount} ändringar
          </button>
          {busy && (
            <span className="seg">
              <span className="spinner">⟳</span> arbetar…
            </span>
          )}
        </>
      ) : (
        <span className="seg">Inget repo öppnat</span>
      )}
      <span className="spacer" />
      <button
        className={`seg clickable ${panelTab === 'terminal' ? 'on' : ''}`}
        title="Visa/dölj terminalen (Ctrl+`)"
        onClick={onShowTerminal}
      >
        {'>_'} Terminal
      </button>
      <button
        className={`seg clickable ${panelTab === 'problems' ? 'on' : ''}`}
        title="Visa/dölj problem – fel och varningar (Ctrl+Shift+M)"
        onClick={onShowProblems}
      >
        ✖ {errors} ⚠ {warnings}
      </button>
      <span className="seg optional" title="Filkodning">
        UTF-8
      </span>
      <span className="seg optional" title="Codester-version">
        Codester v{version}
      </span>
    </footer>
  )
}
