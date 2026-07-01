import { useEffect, useState } from 'react'
import { useToast } from '../ui/Toast'
import { rowA11y } from '../ui/a11y'
import type { Issue } from '../../../shared/types'

function contrastText(hex: string): string {
  const n = parseInt(hex, 16)
  if (Number.isNaN(n)) return '#fff'
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#000' : '#fff'
}

function Labels({ labels }: { labels: Issue['labels'] }): JSX.Element | null {
  if (!labels.length) return null
  return (
    <span className="issue-labels">
      {labels.map((l) => (
        <span
          key={l.name}
          className="issue-label"
          style={{ background: `#${l.color}`, color: contrastText(l.color) }}
        >
          {l.name}
        </span>
      ))}
    </span>
  )
}

function IssueDetail({ number, onBack }: { number: number; onBack: () => void }): JSX.Element {
  const { notify } = useToast()
  const [issue, setIssue] = useState<Issue | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const load = (): void => {
    window.api.github.issue(number).then((r) => r.ok && setIssue(r.data))
  }
  useEffect(load, [number])

  const submitComment = async (): Promise<void> => {
    if (!comment.trim() || busy) return
    setBusy(true)
    const r = await window.api.github.issueComment(number, comment.trim())
    setBusy(false)
    if (r.ok) {
      notify('Kommentar tillagd', 'success')
      setComment('')
      load()
    } else notify(r.error, 'error')
  }
  const toggleState = async (): Promise<void> => {
    if (!issue || busy) return
    const next = issue.state === 'open' ? 'closed' : 'open'
    setBusy(true)
    const r = await window.api.github.setIssueState(number, next)
    setBusy(false)
    if (r.ok) {
      notify(next === 'closed' ? 'Issue stängt' : 'Issue återöppnat', 'success')
      load()
    } else notify(r.error, 'error')
  }

  return (
    <div className="pr-detail">
      <div className="pr-detail-head">
        <button className="btn ghost small" onClick={onBack}>
          ← Tillbaka
        </button>
        <span className="spacer" />
        {issue && (
          <>
            <button className="btn small" disabled={busy} onClick={toggleState}>
              {issue.state === 'open' ? 'Stäng issue' : 'Återöppna'}
            </button>
            <button className="btn ghost small" onClick={() => window.open(issue.url)}>
              Öppna på GitHub
            </button>
          </>
        )}
      </div>
      {!issue ? (
        <div className="hint">Hämtar…</div>
      ) : (
        <>
          <h2 className="pr-detail-title">
            {issue.title} <span className="muted">#{issue.number}</span>
          </h2>
          <div className="pr-detail-meta">
            <span className={`pr-state ${issue.state === 'open' ? 'open' : 'merged'}`}>
              {issue.state === 'open' ? 'Öppen' : 'Stängd'}
            </span>
            <span className="path-dim">@{issue.author}</span>
            <Labels labels={issue.labels} />
          </div>
          {issue.body ? (
            <div className="pr-body">{issue.body}</div>
          ) : (
            <div className="hint">Ingen beskrivning</div>
          )}
          <textarea
            className="pr-create-body"
            placeholder="Skriv en kommentar…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="btn primary" disabled={!comment.trim() || busy} onClick={submitComment}>
            Kommentera
          </button>
        </>
      )}
    </div>
  )
}

function CreateIssue({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): JSX.Element {
  const { notify } = useToast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (): Promise<void> => {
    if (!title.trim() || busy) return
    setBusy(true)
    const r = await window.api.github.createIssue(title.trim(), body)
    setBusy(false)
    if (r.ok) {
      notify(`Issue #${r.data.number} skapat`, 'success')
      onCreated()
    } else notify(r.error, 'error')
  }
  return (
    <div className="pr-create">
      <div className="pr-detail-head">
        <button className="btn ghost small" onClick={onClose}>
          ← Tillbaka
        </button>
        <h3>Nytt issue</h3>
      </div>
      <label className="field-label">Titel</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kort beskrivning" />
      <label className="field-label">Beskrivning</label>
      <textarea
        className="pr-create-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Detaljer…"
      />
      <button className="btn primary full" disabled={!title.trim() || busy} onClick={submit}>
        {busy ? 'Skapar…' : 'Skapa issue'}
      </button>
    </div>
  )
}

export function GitHubIssues(): JSX.Element {
  const { notify } = useToast()
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [openIssue, setOpenIssue] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const load = (): void => {
    setLoading(true)
    window.api.github.issues().then((r) => {
      setIssues(r.ok ? r.data : [])
      setLoading(false)
      if (!r.ok) notify(r.error, 'error')
    })
  }
  useEffect(load, [])

  if (creating)
    return (
      <CreateIssue
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false)
          load()
        }}
      />
    )
  if (openIssue != null)
    return (
      <IssueDetail
        number={openIssue}
        onBack={() => {
          setOpenIssue(null)
          load()
        }}
      />
    )

  return (
    <>
      <div className="gh-list-head">
        <h3>Issues</h3>
        <button className="btn small" onClick={() => setCreating(true)}>
          + Nytt
        </button>
      </div>
      {loading && <div className="hint">Hämtar…</div>}
      {!loading && issues.length === 0 && <div className="hint">Inga öppna issues</div>}
      {issues.map((i) => (
        <div
          key={i.number}
          className="row pr-row"
          {...rowA11y(() => setOpenIssue(i.number))}
          onClick={() => setOpenIssue(i.number)}
        >
          <span className="pr-num">#{i.number}</span>
          <span className="pr-title">{i.title}</span>
          <Labels labels={i.labels} />
          {i.comments > 0 && <span className="path-dim">💬 {i.comments}</span>}
        </div>
      ))}
    </>
  )
}
