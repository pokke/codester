import { useRepo } from '../state/RepoContext'

export function StatusBar({ version }: { version: string }): JSX.Element {
  const { status, repo, busy } = useRepo()
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
      <span className="seg">UTF-8</span>
      <span className="seg">Codester v{version}</span>
    </footer>
  )
}
