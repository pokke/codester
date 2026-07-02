import { useEffect, useMemo, useState } from 'react'
import { useRepo } from '../state/RepoContext'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/Confirm'
import { FileTree } from './FileTree'
import { TimelineView } from './TimelineView'
import { MultiRepoChanges } from './MultiRepoChanges'
import { CommitBox } from './CommitBox'
import { Icon } from '../ui/Icon'
import { rowA11y } from '../ui/a11y'
import type { FileChange, SearchHit } from '../../../shared/types'

function statusClass(status: string): string {
  if (status.includes('A') || status.includes('?')) return 'added'
  if (status.includes('D')) return 'removed'
  return 'modified'
}

type Tab = 'changes' | 'files' | 'search'

export function Sidebar({ onOpenEditor }: { onOpenEditor: () => void }): JSX.Element {
  const {
    repo,
    repos,
    switchRepo,
    addFolder,
    closeFolder,
    status,
    branches,
    activePath,
    selectPath,
    previewFile,
    checkout,
    createBranch,
    stage,
    unstage,
    stageAll,
    discard,
    stashes,
    stashSave,
    stashApply,
    stashDrop,
    refresh
  } = useRepo()
  const { notify } = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('files')
  const [creating, setCreating] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)

  // Debouncad fritextsökning i hela repot
  useEffect(() => {
    if (tab !== 'search') return
    if (!query.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      const r = await window.api.git.search(query)
      if (r.ok) setResults(r.data)
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query, tab])

  const openHit = (hit: SearchHit): void => {
    selectPath(hit.file, hit.line)
    onOpenEditor()
  }

  // Gruppera sökträffar per fil
  const groupedHits = useMemo(() => {
    const m = new Map<string, SearchHit[]>()
    for (const h of results) {
      const arr = m.get(h.file)
      if (arr) arr.push(h)
      else m.set(h.file, [h])
    }
    return [...m.entries()]
  }, [results])

  const doReplace = async (): Promise<void> => {
    if (!query.trim()) return
    const fileCount = new Set(results.map((r) => r.file)).size
    const ok = await confirm({
      message: `Ersätt "${query}" med "${replacement}" i ${fileCount} fil(er)?`,
      confirmLabel: 'Ersätt alla'
    })
    if (!ok) return
    const res = await window.api.git.replace(query, replacement)
    if (res.ok) {
      notify(`Ersatte ${res.data.count} förekomster i ${res.data.files} fil(er)`, 'success')
      await refresh()
      setResults([])
    } else {
      notify(res.error, 'error')
    }
  }

  if (!repo) {
    return (
      <aside className="panel sidebar">
        <div className="panel-header">
          <span>Inget repo</span>
        </div>
      </aside>
    )
  }

  const conflicted = new Set(status?.conflicted ?? [])
  const files = (status?.files ?? []).filter((f) => !conflicted.has(f.path))
  const unstaged = files.filter((f) => !f.staged)
  const staged = files.filter((f) => f.staged)

  const submitBranch = async (): Promise<void> => {
    const name = newBranch.trim()
    if (name) await createBranch(name)
    setNewBranch('')
    setCreating(false)
  }

  const fileRow = (f: FileChange, isStaged: boolean): JSX.Element => (
    <div
      key={f.path}
      className={`row file-row ${activePath === f.path ? 'active' : ''}`}
      {...rowA11y(() => {
        previewFile(f.path)
        onOpenEditor()
      })}
      onClick={() => {
        previewFile(f.path)
        onOpenEditor()
      }}
      onDoubleClick={() => {
        selectPath(f.path)
        onOpenEditor()
      }}
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
              unstage(f.path)
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
                  discard(f.path)
              }}
            >
              ⨯
            </button>
            <button
              className="btn ghost icon"
              title="Stage"
              onClick={(e) => {
                e.stopPropagation()
                stage(f.path)
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
    <aside className="panel sidebar">
      <div className="workspace-bar">
        <select
          className="ws-select"
          value={repo.path}
          onChange={(e) => switchRepo(e.target.value)}
          title="Aktivt repo i arbetsytan"
        >
          {repos.map((r) => (
            <option key={r.path} value={r.path}>
              {r.name}
            </option>
          ))}
        </select>
        <button
          className="btn ghost icon"
          title="Öppna mapp / projekt (skapar Git-repo vid behov)"
          onClick={() => addFolder()}
        >
          +
        </button>
        {repos.length > 1 && (
          <button
            className="btn ghost icon"
            title="Ta bort aktiv mapp ur arbetsytan"
            onClick={() => closeFolder(repo.path)}
          >
            −
          </button>
        )}
      </div>

      <div className="panel-header">
        <span>Branches</span>
        <button className="btn icon ghost" title="Ny branch" onClick={() => setCreating(true)}>
          +
        </button>
      </div>
      <div className="panel-body" style={{ flex: '0 0 auto', maxHeight: 160 }}>
        {creating && (
          <div className="row">
            <input
              autoFocus
              placeholder="ny-branch"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitBranch()
                if (e.key === 'Escape') setCreating(false)
              }}
              style={{ width: '100%' }}
            />
          </div>
        )}
        {branches.length > 8 && (
          <div className="row">
            <input
              placeholder="Filtrera branches…"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        )}
        {branches
          .filter((b) => b.name.toLowerCase().includes(branchFilter.toLowerCase()))
          .map((b) => (
            <div
              key={b.name}
              className={`row ${b.current ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => !b.current && checkout(b.name)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !b.current) {
                  e.preventDefault()
                  checkout(b.name)
                }
              }}
            >
              <span className="icon">⎇</span>
              <span>{b.name}</span>
            </div>
          ))}
      </div>

      <div className="sidebar-tabs">
        <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
          Filer
        </button>
        <button className={tab === 'changes' ? 'active' : ''} onClick={() => setTab('changes')}>
          Ändringar
        </button>
        <button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>
          Sök
        </button>
      </div>

      {tab === 'search' ? (
        <>
          <div
            style={{
              padding: 'var(--space)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}
          >
            <input
              autoFocus
              placeholder="Sök i alla filer…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%' }}
            />
            <input
              placeholder="Ersätt med…"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              style={{ width: '100%' }}
            />
            <button
              className="btn full"
              disabled={!query.trim() || results.length === 0}
              onClick={doReplace}
            >
              Ersätt alla
            </button>
          </div>
          <div className="panel-body">
            {searching && <div className="hint">Söker…</div>}
            {!searching && query.trim() && results.length === 0 && (
              <div className="hint">Inga träffar</div>
            )}
            {groupedHits.map(([file, hits]) => (
              <div key={file} className="search-group">
                <div className="search-file-header" title={file}>
                  <span className="fname">{file.split('/').pop()}</span>
                  <span className="path-dim">{file.split('/').slice(0, -1).join('/')}</span>
                  <span className="search-count">{hits.length}</span>
                </div>
                {hits.map((hit, i) => (
                  <div
                    key={`${hit.line}:${i}`}
                    className="row search-hit"
                    {...rowA11y(() => openHit(hit))}
                    onClick={() => openHit(hit)}
                    title={`${file}:${hit.line}`}
                  >
                    <span className="path-dim hit-line">{hit.line}</span>
                    <code className="hit-text">{hit.text.trim().slice(0, 120)}</code>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : tab === 'files' ? (
        <div className="files-tab">
          <div className="files-tree-wrap">
            <FileTree onOpenEditor={onOpenEditor} />
          </div>
          <TimelineView />
        </div>
      ) : repos.length > 1 ? (
        <MultiRepoChanges onOpenEditor={onOpenEditor} />
      ) : (
        <>
          <div className="panel-body changes-list">
            {!status && <div className="hint">Läser status…</div>}
            {conflicted.size > 0 && (
              <>
                <div className="panel-header conflict-header">
                  <span>⚠ Konflikter ({conflicted.size})</span>
                </div>
                {[...conflicted].map((path) => (
                  <div
                    key={path}
                    className={`row file-row conflict ${activePath === path ? 'active' : ''}`}
                    {...rowA11y(() => {
                      previewFile(path)
                      onOpenEditor()
                    })}
                    onClick={() => {
                      previewFile(path)
                      onOpenEditor()
                    }}
                    onDoubleClick={() => {
                      selectPath(path)
                      onOpenEditor()
                    }}
                    title={path}
                  >
                    <span className="dot removed" />
                    <span className="fname">{path.split('/').pop()}</span>
                  </div>
                ))}
              </>
            )}

            <div className="panel-header">
              <span>Stagade ({staged.length})</span>
            </div>
            {status && staged.length === 0 && <div className="hint">Inget stagat</div>}
            {staged.map((f) => fileRow(f, true))}

            <div className="panel-header">
              <span>Ändringar ({unstaged.length})</span>
              <span style={{ display: 'flex', gap: 2 }}>
                {(unstaged.length > 0 || staged.length > 0) && (
                  <button
                    className="btn ghost icon"
                    title="Stasha alla ändringar"
                    onClick={() => stashSave()}
                  >
                    ⮟
                  </button>
                )}
                {unstaged.length > 0 && (
                  <button className="btn ghost icon" title="Stage alla" onClick={() => stageAll()}>
                    ++
                  </button>
                )}
              </span>
            </div>
            {status && unstaged.length === 0 && <div className="hint">Inga ändringar</div>}
            {unstaged.map((f) => fileRow(f, false))}

            {stashes.length > 0 && (
              <>
                <div className="panel-header" style={{ borderTop: '1px solid var(--border)' }}>
                  <span>Stash ({stashes.length})</span>
                </div>
                {stashes.map((s) => (
                  <div key={s.index} className="row stash-row" title={s.message}>
                    <span className="icon">
                      <Icon name="package" size={14} />
                    </span>
                    <span className="fname">{s.message}</span>
                    <span className="row-actions">
                      <button
                        className="btn ghost icon"
                        title="Pop (applicera + ta bort)"
                        onClick={() => stashApply(s.index, true)}
                      >
                        ⮝
                      </button>
                      <button
                        className="btn ghost icon"
                        title="Ta bort stash"
                        onClick={async () => {
                          if (
                            await confirm({
                              message: `Ta bort stash: ${s.message}?`,
                              confirmLabel: 'Ta bort',
                              danger: true
                            })
                          )
                            stashDrop(s.index)
                        }}
                      >
                        ⨯
                      </button>
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          <CommitBox />
        </>
      )}
    </aside>
  )
}
