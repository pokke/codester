import { useEffect, useState } from 'react'
import { useRepo } from '../state/RepoContext'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/Confirm'
import type { FileChange, RepoStatus } from '../../../shared/types'

// Simultana per-repo källkontroll-sektioner (multi-root). En sektion per repo
// med egna ändringar + commit-ruta. Riktar git-anrop mot rätt rot.

function statusClass(status: string): string {
  if (status.includes('A') || status.includes('?')) return 'added'
  if (status.includes('D')) return 'removed'
  return 'modified'
}

export function MultiRepoChanges({ onOpenEditor }: { onOpenEditor: () => void }): JSX.Element {
  const { repos, repo, revision, switchRepo, previewFile, selectPath, refresh } = useRepo()
  const { notify } = useToast()
  const confirm = useConfirm()

  const [statuses, setStatuses] = useState<Record<string, RepoStatus | null>>({})
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [amends, setAmends] = useState<Record<string, boolean>>({})
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(
        repos.map(async (r) => {
          const s = await window.api.git.status(r.path)
          return [r.path, s.ok ? s.data : null] as const
        })
      )
      if (!cancelled) setStatuses(Object.fromEntries(entries))
    })()
    return () => {
      cancelled = true
    }
  }, [repos, revision])

  const run = async (p: Promise<{ ok: boolean; error?: string }>): Promise<void> => {
    const r = await p
    if (!r.ok) notify(r.error ?? 'Fel', 'error')
    await refresh()
  }

  const withBusy = async (root: string, p: Promise<{ ok: boolean; error?: string }>): Promise<void> => {
    setBusy((b) => new Set(b).add(root))
    try {
      const r = await p
      if (!r.ok) notify(r.error ?? 'Fel', 'error')
      await refresh()
    } finally {
      setBusy((b) => {
        const n = new Set(b)
        n.delete(root)
        return n
      })
    }
  }

  const openFile = async (root: string, file: string, pin: boolean): Promise<void> => {
    if (root !== repo?.path) await switchRepo(root)
    pin ? selectPath(file) : previewFile(file)
    onOpenEditor()
  }

  const toggleCollapse = (root: string): void =>
    setCollapsed((prev) => {
      const n = new Set(prev)
      n.has(root) ? n.delete(root) : n.add(root)
      return n
    })

  const toggleAmend = async (root: string, on: boolean): Promise<void> => {
    setAmends((a) => ({ ...a, [root]: on }))
    if (on && !(messages[root] ?? '').trim()) {
      const r = await window.api.git.lastCommitMessage(root)
      if (r.ok) setMessages((m) => ({ ...m, [root]: r.data }))
    }
  }

  const doCommit = async (root: string): Promise<void> => {
    const msg = (messages[root] ?? '').trim()
    const amend = amends[root] ?? false
    if (!msg) return
    const r = await window.api.git.commit(msg, amend, root)
    if (r.ok) {
      setMessages((m) => ({ ...m, [root]: '' }))
      setAmends((a) => ({ ...a, [root]: false }))
      notify(amend ? 'Ändrade senaste commit' : `Committade ${r.data.slice(0, 7)}`, 'success')
      await refresh()
    } else notify(r.error, 'error')
  }

  const fileRow = (root: string, f: FileChange, isStaged: boolean): JSX.Element => (
    <div
      key={f.path}
      className="row file-row"
      onClick={() => openFile(root, f.path, false)}
      onDoubleClick={() => openFile(root, f.path, true)}
      title={f.path}
    >
      <span className={`dot ${statusClass(f.status)}`} />
      <span className="fname">{f.path.split('/').pop()}</span>
      <span className="path-dim">{f.path.split('/').slice(0, -1).join('/')}</span>
      <span className="row-actions">
        {isStaged ? (
          <button
            className="btn ghost icon"
            title="Unstage"
            onClick={(e) => {
              e.stopPropagation()
              run(window.api.git.unstage(f.path, root))
            }}
          >
            −
          </button>
        ) : (
          <>
            <button
              className="btn ghost icon"
              title="Kasta ändringar"
              onClick={async (e) => {
                e.stopPropagation()
                if (
                  await confirm({
                    message: `Kasta ändringar i ${f.path}?`,
                    confirmLabel: 'Kasta',
                    danger: true
                  })
                )
                  run(window.api.git.discard(f.path, root))
              }}
            >
              ⨯
            </button>
            <button
              className="btn ghost icon"
              title="Stage"
              onClick={(e) => {
                e.stopPropagation()
                run(window.api.git.stage(f.path, root))
              }}
            >
              +
            </button>
          </>
        )}
      </span>
    </div>
  )

  return (
    <div className="panel-body multi-repo-changes">
      {repos.map((r) => {
        const st = statuses[r.path]
        const conflicted = new Set(st?.conflicted ?? [])
        const files = (st?.files ?? []).filter((f) => !conflicted.has(f.path))
        const staged = files.filter((f) => f.staged)
        const unstaged = files.filter((f) => !f.staged)
        const isCollapsed = collapsed.has(r.path)
        const isBusy = busy.has(r.path)
        const msg = messages[r.path] ?? ''
        const amend = amends[r.path] ?? false

        return (
          <section className="repo-section" key={r.path}>
            <div
              className="panel-header repo-section-header"
              onClick={() => toggleCollapse(r.path)}
              title={r.path}
            >
              <span className="icon">{isCollapsed ? '▸' : '▾'}</span>
              <span className="repo-sec-name">{r.name}</span>
              <span className="muted small">⎇ {st?.current ?? '–'}</span>
              {st && st.ahead + st.behind > 0 && (
                <span className="muted small">
                  ↑{st.ahead} ↓{st.behind}
                </span>
              )}
              <span className="repo-sec-count">{files.length + conflicted.size}</span>
              {r.path === repo?.path && <span className="ws-active-badge">aktiv</span>}
            </div>

            {!isCollapsed && (
              <div className="repo-section-body">
                {conflicted.size > 0 && (
                  <div
                    className="row file-row conflict"
                    onClick={() => openFile(r.path, [...conflicted][0], true)}
                    title="Öppna för att lösa konflikter"
                  >
                    <span className="dot removed" />
                    <span className="fname">⚠ {conflicted.size} konflikt(er)</span>
                  </div>
                )}

                {staged.map((f) => fileRow(r.path, f, true))}
                {unstaged.map((f) => fileRow(r.path, f, false))}
                {files.length === 0 && conflicted.size === 0 && (
                  <div className="hint">Inga ändringar</div>
                )}

                {unstaged.length > 0 && (
                  <button
                    className="btn ghost full small"
                    onClick={() => run(window.api.git.stageAll(r.path))}
                  >
                    ++ Stage alla
                  </button>
                )}

                <div className="commit-box compact">
                  <textarea
                    placeholder="Commit-meddelande…"
                    value={msg}
                    onChange={(e) => setMessages((m) => ({ ...m, [r.path]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doCommit(r.path)
                    }}
                  />
                  <div className="commit-row-actions">
                    <label className="checkbox-row" style={{ fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={amend}
                        onChange={(e) => toggleAmend(r.path, e.target.checked)}
                      />
                      Amend
                    </label>
                  </div>
                  <button
                    className="btn primary full"
                    disabled={!msg.trim() || (staged.length === 0 && !amend) || isBusy}
                    onClick={() => doCommit(r.path)}
                  >
                    {amend ? 'Ändra commit' : `Committa ${staged.length > 0 ? `(${staged.length})` : ''}`}
                  </button>
                  <div style={{ display: 'flex', gap: 'var(--space)' }}>
                    <button
                      className="btn full"
                      disabled={isBusy}
                      onClick={() => withBusy(r.path, window.api.git.pull(r.path))}
                    >
                      ↓ Pull
                    </button>
                    <button
                      className="btn full"
                      disabled={isBusy}
                      onClick={() => withBusy(r.path, window.api.git.push(r.path))}
                    >
                      ↑ Push
                    </button>
                    <button
                      className="btn ghost"
                      disabled={isBusy}
                      title="Fetch"
                      onClick={() => withBusy(r.path, window.api.git.fetch(r.path))}
                    >
                      ⟳
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
