import { useEffect, useState } from 'react'
import { useToast } from '../ui/Toast'
import { rowA11y } from '../ui/a11y'
import { Markdown } from '../ui/Markdown'
import { Conversation } from './GitHubConversation'
import type { GhComment, Issue } from '../../../shared/types'

type IssueFilter = 'open' | 'closed' | 'all' | 'mine'

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
  const [comments, setComments] = useState<GhComment[]>([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const load = (): void => {
    window.api.github.issue(number).then((r) => r.ok && setIssue(r.data))
    window.api.github.issueComments(number).then((r) => r.ok && setComments(r.data))
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
            <div className="pr-body">
              <Markdown text={issue.body} />
            </div>
          ) : (
            <div className="hint">Ingen beskrivning</div>
          )}

          <Conversation comments={comments} />

          <textarea
            className="pr-create-body"
            placeholder="Skriv en kommentar (Ctrl+Enter för att skicka)…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitComment()
            }}
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
  const [repoLabels, setRepoLabels] = useState<{ name: string; color: string }[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [assignable, setAssignable] = useState<string[]>([])
  const [pickedUsers, setPickedUsers] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.github.labels().then((r) => r.ok && setRepoLabels(r.data))
    window.api.github.assignees().then((r) => r.ok && setAssignable(r.data))
  }, [])

  const toggle = (name: string): void =>
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })
  const toggleUser = (login: string): void =>
    setPickedUsers((prev) => {
      const n = new Set(prev)
      n.has(login) ? n.delete(login) : n.add(login)
      return n
    })

  const submit = async (): Promise<void> => {
    if (!title.trim() || busy) return
    setBusy(true)
    const r = await window.api.github.createIssue(title.trim(), body, [...selected], [...pickedUsers])
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
      {repoLabels.length > 0 && (
        <>
          <label className="field-label">Labels</label>
          <div className="label-picker">
            {repoLabels.map((l) => {
              const on = selected.has(l.name)
              return (
                <button
                  key={l.name}
                  className={`issue-label label-pick ${on ? 'on' : ''}`}
                  style={
                    on
                      ? { background: `#${l.color}`, color: contrastText(l.color) }
                      : { borderColor: `#${l.color}`, color: 'var(--text)' }
                  }
                  onClick={() => toggle(l.name)}
                >
                  {l.name}
                </button>
              )
            })}
          </div>
        </>
      )}
      {assignable.length > 0 && (
        <>
          <label className="field-label">Tilldela</label>
          <div className="label-picker">
            {assignable.map((u) => {
              const on = pickedUsers.has(u)
              return (
                <button
                  key={u}
                  className={`issue-label label-pick ${on ? 'on' : ''}`}
                  onClick={() => toggleUser(u)}
                >
                  @{u}
                </button>
              )
            })}
          </div>
        </>
      )}
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
  const [filter, setFilter] = useState<IssueFilter>('open')
  const [me, setMe] = useState<string | null>(null)

  useEffect(() => {
    window.api.github.user().then((r) => r.ok && setMe(r.data.login))
  }, [])

  const load = (): void => {
    setLoading(true)
    const apiState = filter === 'mine' ? 'all' : filter
    window.api.github.issues(apiState).then((r) => {
      const data = r.ok ? r.data : []
      setIssues(filter === 'mine' && me ? data.filter((i) => i.author === me) : data)
      setLoading(false)
      if (!r.ok) notify(r.error, 'error')
    })
  }
  useEffect(load, [filter, me])

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
        <select
          className="gh-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as IssueFilter)}
        >
          <option value="open">Öppna</option>
          <option value="closed">Stängda</option>
          <option value="all">Alla</option>
          <option value="mine" disabled={!me}>
            Mina
          </option>
        </select>
        <button className="btn small" onClick={() => setCreating(true)}>
          + Nytt
        </button>
      </div>
      {loading && <div className="hint">Hämtar…</div>}
      {!loading && issues.length === 0 && <div className="hint">Inga issues</div>}
      {issues.map((i) => (
        <div
          key={i.number}
          className="row pr-row"
          {...rowA11y(() => setOpenIssue(i.number))}
          onClick={() => setOpenIssue(i.number)}
        >
          <span className="pr-num">#{i.number}</span>
          <span className="pr-title">
            {i.title}
            {i.state === 'closed' && <span className="repo-badge is-closed">stängd</span>}
          </span>
          <Labels labels={i.labels} />
          {i.comments > 0 && <span className="path-dim">💬 {i.comments}</span>}
        </div>
      ))}
    </>
  )
}
