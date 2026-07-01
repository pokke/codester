import { useState } from 'react'
import { useRepo } from '../state/RepoContext'

// Källkontrollens commit-ruta. Bor i vänstra sidofältet (Ändringar-fliken),
// som i VS Code – så höger-panelen inte behövs.
export function CommitBox(): JSX.Element {
  const { status, commit, push, pull, fetch, busy } = useRepo()
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)

  const files = status?.files ?? []
  const stagedCount = files.filter((f) => f.staged).length

  const toggleAmend = async (on: boolean): Promise<void> => {
    setAmend(on)
    if (on && !message.trim()) {
      const r = await window.api.git.lastCommitMessage()
      if (r.ok) setMessage(r.data)
    }
  }

  const canCommit = !!message.trim() && (stagedCount > 0 || amend) && !busy

  const doCommit = async (): Promise<void> => {
    if (!canCommit) return
    const ok = await commit(message, amend)
    if (ok) {
      setMessage('')
      setAmend(false)
    }
  }

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
    <div className="commit-box">
      <textarea
        placeholder="Commit-meddelande…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doCommit()
        }}
      />
      <div className="commit-row-actions">
        <label className="checkbox-row" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={amend} onChange={(e) => toggleAmend(e.target.checked)} />
          Amend
        </label>
        <button className="btn ghost icon" title="Föreslå meddelande" onClick={suggest}>
          ✨
        </button>
      </div>
      <button
        className="btn primary full"
        disabled={!canCommit}
        onClick={doCommit}
      >
        {amend ? 'Ändra commit' : `Committa ${stagedCount > 0 ? `(${stagedCount})` : ''}`}
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
  )
}
