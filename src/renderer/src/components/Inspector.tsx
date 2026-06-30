import { useState } from 'react'
import { useRepo } from '../state/RepoContext'

export function Inspector(): JSX.Element {
  const { status, commit, push, pull, fetch, busy } = useRepo()
  const [message, setMessage] = useState('')

  const files = status?.files ?? []
  const stagedCount = files.filter((f) => f.staged).length

  const doCommit = async (): Promise<void> => {
    const ok = await commit(message)
    if (ok) setMessage('')
  }

  // Enkel "AI-liknande" förslagsgenerator utifrån stagade filer (Fas 3).
  // Riktig modell kopplas in senare via main-processen.
  const suggest = (): void => {
    const staged = files.filter((f) => f.staged)
    if (staged.length === 0) return
    const names = staged.map((f) => f.path.split('/').pop()).slice(0, 3)
    const verb = staged.every((f) => f.status.includes('A'))
      ? 'Lägg till'
      : staged.every((f) => f.status.includes('D'))
        ? 'Ta bort'
        : 'Uppdatera'
    setMessage(`${verb} ${names.join(', ')}${staged.length > 3 ? ' m.m.' : ''}`)
  }

  return (
    <aside className="panel inspector">
      <div className="panel-header">
        <span>Commit</span>
        <button className="btn ghost icon" title="Föreslå meddelande" onClick={suggest}>
          ✨
        </button>
      </div>
      <div className="commit-box">
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          På branch <strong style={{ color: 'var(--text)' }}>{status?.current ?? '–'}</strong>
          {status?.tracking && (
            <>
              {' '}
              ↑{status.ahead} ↓{status.behind}
            </>
          )}
        </div>
        <textarea
          placeholder="Commit-meddelande…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doCommit()
          }}
        />
        <button
          className="btn primary full"
          disabled={!message.trim() || stagedCount === 0 || busy}
          onClick={doCommit}
        >
          Committa {stagedCount > 0 ? `(${stagedCount})` : ''}
        </button>
        <div style={{ display: 'flex', gap: 'var(--space)' }}>
          <button className="btn full" disabled={busy} onClick={() => pull()}>
            ↓ Pull
          </button>
          <button className="btn full" disabled={busy} onClick={() => push()}>
            ↑ Push
          </button>
        </div>
        <button className="btn ghost full" disabled={busy} onClick={() => fetch()}>
          ⟳ Fetch
        </button>
      </div>
    </aside>
  )
}
