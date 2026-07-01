import { useRepo } from '../state/RepoContext'
import { useProblems, counts } from '../editor/markers'

export function StatusBar({
  version,
  panelTab,
  onShowTerminal,
  onShowProblems
}: {
  version: string
  panelTab: 'terminal' | 'problems' | null
  onShowTerminal: () => void
  onShowProblems: () => void
}): JSX.Element {
  const { status, repo, busy } = useRepo()
  const problems = useProblems()
  const { errors, warnings } = counts(problems)
  const changeCount = status?.files.length ?? 0

  return (
    <footer className="statusbar">
      {repo ? (
        <>
          <span className="seg branch" title={status?.current ?? ''}>
            ⎇ {status?.current ?? '–'}
          </span>
          <span className="seg">
            ↑{status?.ahead ?? 0} ↓{status?.behind ?? 0}
          </span>
          <span className="seg">● {changeCount} ändringar</span>
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
        title="Terminal (Ctrl+`)"
        onClick={onShowTerminal}
      >
        {'>_'} Terminal
      </button>
      <button
        className={`seg clickable ${panelTab === 'problems' ? 'on' : ''}`}
        title="Problem (Ctrl+Shift+M)"
        onClick={onShowProblems}
      >
        ✖ {errors} ⚠ {warnings}
      </button>
      <span className="seg optional">UTF-8</span>
      <span className="seg optional">Codester v{version}</span>
    </footer>
  )
}
