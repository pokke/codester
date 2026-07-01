import { useRepo } from '../state/RepoContext'
import { useProblems, counts } from '../editor/markers'

export function StatusBar({
  version,
  panelTab,
  onToggleTerminal,
  onToggleProblems
}: {
  version: string
  panelTab: 'terminal' | 'problems' | null
  onToggleTerminal: () => void
  onToggleProblems: () => void
}): JSX.Element {
  const { status, repo, busy } = useRepo()
  const problems = useProblems()
  const { errors, warnings } = counts(problems)
  const changeCount = status?.files.length ?? 0

  return (
    <footer className="statusbar">
      {repo ? (
        <>
          <span className="seg">⎇ {status?.current ?? '–'}</span>
          <span className="seg">
            ↑{status?.ahead ?? 0} ↓{status?.behind ?? 0}
          </span>
          <span className="seg">● {changeCount} ändringar</span>
          {busy && <span className="seg">⟳ arbetar…</span>}
        </>
      ) : (
        <span className="seg">Inget repo öppnat</span>
      )}
      <span className="spacer" />
      <span
        className={`seg clickable ${panelTab === 'terminal' ? 'on' : ''}`}
        title="Terminal (Ctrl+`)"
        onClick={onToggleTerminal}
      >
        {'>_'} Terminal
      </span>
      <span
        className={`seg clickable ${panelTab === 'problems' ? 'on' : ''}`}
        title="Problem (Ctrl+Shift+M)"
        onClick={onToggleProblems}
      >
        ✖ {errors} ⚠ {warnings}
      </span>
      <span className="seg">UTF-8</span>
      <span className="seg">Codester v{version}</span>
    </footer>
  )
}
