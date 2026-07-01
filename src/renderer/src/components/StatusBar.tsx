import { useRepo } from '../state/RepoContext'
import { useProblems, counts } from '../editor/markers'

export function StatusBar({
  version,
  onShowProblems
}: {
  version: string
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
        className="seg clickable"
        title="Visa problem (Ctrl+Shift+M)"
        onClick={onShowProblems}
      >
        ✖ {errors} ⚠ {warnings}
      </span>
      <span className="seg">UTF-8</span>
      <span className="seg">Codester v{version}</span>
    </footer>
  )
}
