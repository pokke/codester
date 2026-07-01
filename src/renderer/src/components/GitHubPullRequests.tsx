import { useEffect, useState } from 'react'
import { useRepo } from '../state/RepoContext'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/Confirm'
import { rowA11y } from '../ui/a11y'
import type { CheckStatus, PrFile, PullRequest, PullRequestDetail } from '../../../shared/types'

// Renderar en unified-diff-patch med färgade rader (samma stil som HunkView).
export function PatchView({ patch }: { patch: string | null }): JSX.Element {
  if (!patch) return <div className="hint">Ingen diff att visa (binär eller för stor).</div>
  return (
    <pre className="hunk-body">
      {patch.split('\n').map((line, i) => {
        const cls = line.startsWith('@@')
          ? 'hl-head'
          : line.startsWith('+')
            ? 'hl-add'
            : line.startsWith('-')
              ? 'hl-del'
              : 'hl-ctx'
        return (
          <div key={i} className={`hl ${cls}`}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

export function CheckBadge({ checks }: { checks: CheckStatus | null }): JSX.Element | null {
  if (!checks || checks.state === 'none') return null
  const label =
    checks.state === 'success'
      ? `✓ ${checks.passed}`
      : checks.state === 'failure'
        ? `✗ ${checks.failed}`
        : `● ${checks.pending}`
  return (
    <span
      className={`check-badge ${checks.state}`}
      title={`${checks.passed} ok · ${checks.failed} fel · ${checks.pending} väntar`}
    >
      {label}
    </span>
  )
}

function PrDetail({ number, onBack }: { number: number; onBack: () => void }): JSX.Element {
  const { notify } = useToast()
  const { refresh } = useRepo()
  const confirm = useConfirm()
  const [pr, setPr] = useState<PullRequestDetail | null>(null)
  const [files, setFiles] = useState<PrFile[]>([])
  const [checks, setChecks] = useState<CheckStatus | null>(null)
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [reviewBody, setReviewBody] = useState('')
  const [mergeMethod, setMergeMethod] = useState<'merge' | 'squash' | 'rebase'>('merge')
  const [busy, setBusy] = useState(false)

  const load = (): void => {
    window.api.github.pr(number).then((r) => {
      if (r.ok) {
        setPr(r.data)
        window.api.github.checks(r.data.headSha).then((c) => c.ok && setChecks(c.data))
      }
    })
    window.api.github.prFiles(number).then((r) => r.ok && setFiles(r.data))
  }
  useEffect(load, [number])

  const checkout = async (): Promise<void> => {
    if (!pr || busy) return
    setBusy(true)
    const r = await window.api.git.checkoutPr(pr.number, pr.headRef)
    setBusy(false)
    if (r.ok) {
      notify(`Checkade ut PR #${pr.number} som "${pr.headRef}"`, 'success')
      refresh()
    } else notify(r.error, 'error')
  }
  const review = async (event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'): Promise<void> => {
    if (busy) return
    if (event === 'COMMENT' && !reviewBody.trim()) return
    setBusy(true)
    const r = await window.api.github.review(number, event, reviewBody)
    setBusy(false)
    if (r.ok) {
      notify('Review skickad', 'success')
      setReviewBody('')
      load()
    } else notify(r.error, 'error')
  }
  const merge = async (): Promise<void> => {
    if (!pr || busy) return
    const ok = await confirm({
      message: `Merga PR #${pr.number} (${mergeMethod}) till ${pr.baseRef}?`,
      confirmLabel: 'Merga'
    })
    if (!ok) return
    setBusy(true)
    const r = await window.api.github.mergePr(number, mergeMethod)
    setBusy(false)
    if (r.ok) {
      notify(`PR #${number} merged`, 'success')
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
        <CheckBadge checks={checks} />
        {pr && (
          <button className="btn ghost small" onClick={() => window.open(pr.url)}>
            Öppna på GitHub
          </button>
        )}
      </div>
      {!pr ? (
        <div className="hint">Hämtar…</div>
      ) : (
        <>
          <h2 className="pr-detail-title">
            {pr.title} <span className="muted">#{pr.number}</span>
          </h2>
          <div className="pr-detail-meta">
            <span className={`pr-state ${pr.merged ? 'merged' : pr.draft ? 'draft' : 'open'}`}>
              {pr.merged ? 'Merged' : pr.draft ? 'Utkast' : 'Öppen'}
            </span>
            <span className="path-dim">
              {pr.headRef} → {pr.baseRef} · @{pr.author}
            </span>
            <span className="add">+{pr.additions}</span>
            <span className="del">−{pr.deletions}</span>
            <span className="path-dim">{pr.changedFiles} filer</span>
          </div>

          {!pr.merged && (
            <div className="pr-actions">
              <button className="btn small" disabled={busy} onClick={checkout}>
                Checka ut lokalt
              </button>
              <span className="spacer" />
              <select
                className="merge-method"
                value={mergeMethod}
                onChange={(e) => setMergeMethod(e.target.value as typeof mergeMethod)}
              >
                <option value="merge">Merge</option>
                <option value="squash">Squash</option>
                <option value="rebase">Rebase</option>
              </select>
              <button
                className="btn primary small"
                disabled={busy || pr.mergeable === false}
                title={pr.mergeable === false ? 'Kan inte mergas (konflikter)' : ''}
                onClick={merge}
              >
                Merga
              </button>
            </div>
          )}

          {!pr.merged && (
            <div className="pr-review">
              <textarea
                className="pr-create-body"
                placeholder="Review-kommentar (valfri för godkänn/begär ändringar)…"
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
              />
              <div className="pr-review-actions">
                <button className="btn small approve" disabled={busy} onClick={() => review('APPROVE')}>
                  ✓ Godkänn
                </button>
                <button
                  className="btn small request"
                  disabled={busy}
                  onClick={() => review('REQUEST_CHANGES')}
                >
                  Begär ändringar
                </button>
                <button
                  className="btn small"
                  disabled={busy || !reviewBody.trim()}
                  onClick={() => review('COMMENT')}
                >
                  Kommentera
                </button>
              </div>
            </div>
          )}

          {pr.body && <div className="pr-body">{pr.body}</div>}
          <div className="pr-files">
            {files.map((f) => {
              const open = openFile === f.filename
              return (
                <div key={f.filename} className="pr-file">
                  <div
                    className="pr-file-head"
                    {...rowA11y(() => setOpenFile(open ? null : f.filename))}
                    onClick={() => setOpenFile(open ? null : f.filename)}
                  >
                    <span className="icon">{open ? '▾' : '▸'}</span>
                    <span className="fname">{f.filename}</span>
                    <span className="spacer" />
                    <span className="add">+{f.additions}</span>
                    <span className="del">−{f.deletions}</span>
                  </div>
                  {open && <PatchView patch={f.patch} />}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function CreatePr({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): JSX.Element {
  const { status } = useRepo()
  const { notify } = useToast()
  const head = status?.current ?? ''
  const [base, setBase] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.github.defaultBranch().then((r) => r.ok && setBase(r.data))
  }, [])

  const submit = async (): Promise<void> => {
    if (!title.trim() || busy) return
    setBusy(true)
    const r = await window.api.github.createPr(title.trim(), body, base.trim() || undefined)
    setBusy(false)
    if (r.ok) {
      notify(`PR #${r.data.number} skapad`, 'success')
      onCreated()
    } else notify(r.error, 'error')
  }

  return (
    <div className="pr-create">
      <div className="pr-detail-head">
        <button className="btn ghost small" onClick={onClose}>
          ← Tillbaka
        </button>
        <h3>Ny pull request</h3>
      </div>
      <label className="field-label">Från (head)</label>
      <input value={head} disabled />
      <label className="field-label">Till (bas)</label>
      <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="main" />
      <label className="field-label">Titel</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kort beskrivning" />
      <label className="field-label">Beskrivning</label>
      <textarea
        className="pr-create-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Vad ändrar den här PR:en?"
      />
      <button className="btn primary full" disabled={!title.trim() || busy} onClick={submit}>
        {busy ? 'Skapar…' : 'Skapa pull request'}
      </button>
    </div>
  )
}

export function GitHubPullRequests(): JSX.Element {
  const { notify } = useToast()
  const [prs, setPrs] = useState<PullRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [openPr, setOpenPr] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const load = (): void => {
    setLoading(true)
    window.api.github.pulls().then((r) => {
      setPrs(r.ok ? r.data : [])
      setLoading(false)
      if (!r.ok) notify(r.error, 'error')
    })
  }
  useEffect(load, [])

  if (creating)
    return (
      <CreatePr
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false)
          load()
        }}
      />
    )
  if (openPr != null) return <PrDetail number={openPr} onBack={() => setOpenPr(null)} />

  return (
    <>
      <div className="gh-list-head">
        <h3>Pull requests</h3>
        <button className="btn small" onClick={() => setCreating(true)}>
          + Ny PR
        </button>
      </div>
      {loading && <div className="hint">Hämtar…</div>}
      {!loading && prs.length === 0 && <div className="hint">Inga öppna pull requests</div>}
      {prs.map((p) => (
        <div
          key={p.number}
          className="row pr-row"
          {...rowA11y(() => setOpenPr(p.number))}
          onClick={() => setOpenPr(p.number)}
        >
          <span className="pr-num">#{p.number}</span>
          <span className="pr-title">
            {p.title}
            {p.draft && <span className="repo-badge">utkast</span>}
          </span>
          <span className="path-dim">
            {p.headRef} → {p.baseRef} · @{p.author}
          </span>
        </div>
      ))}
    </>
  )
}
