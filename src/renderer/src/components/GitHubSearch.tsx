import { useState } from 'react'
import { useRepo } from '../state/RepoContext'
import { useToast } from '../ui/Toast'
import { rowA11y } from '../ui/a11y'
import { Icon } from '../ui/Icon'
import { Loading, Empty } from '../ui/States'
import type { SearchIssueResult, SearchRepoResult } from '../../../shared/types'

type SearchType = 'all' | 'repos' | 'issues'

export function GitHubSearch(): JSX.Element {
  const { cloneAndOpen } = useRepo()
  const { notify } = useToast()
  const [q, setQ] = useState('')
  const [type, setType] = useState<SearchType>('all')
  const [repos, setRepos] = useState<SearchRepoResult[]>([])
  const [issues, setIssues] = useState<SearchIssueResult[]>([])
  const [loading, setLoading] = useState(false)
  const [ran, setRan] = useState(false)

  const run = async (): Promise<void> => {
    if (!q.trim() || loading) return
    setLoading(true)
    const wantRepos = type === 'all' || type === 'repos'
    const wantIssues = type === 'all' || type === 'issues'
    const [r, i] = await Promise.all([
      wantRepos ? window.api.github.searchRepos(q) : Promise.resolve(null),
      wantIssues ? window.api.github.searchIssues(q) : Promise.resolve(null)
    ])
    setRepos(r && r.ok ? r.data : [])
    setIssues(i && i.ok ? i.data : [])
    if (r && !r.ok) notify(r.error, 'error')
    else if (i && !i.ok) notify(i.error, 'error')
    setLoading(false)
    setRan(true)
  }

  return (
    <div className="gh-search">
      <div className="welcome-clone">
        <input
          autoFocus
          placeholder="Sök på GitHub…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <select
          className="gh-filter"
          value={type}
          onChange={(e) => setType(e.target.value as SearchType)}
        >
          <option value="all">Allt</option>
          <option value="repos">Repositories</option>
          <option value="issues">Issues &amp; PR</option>
        </select>
        <button className="btn" disabled={!q.trim() || loading} onClick={run}>
          {loading ? 'Söker…' : 'Sök'}
        </button>
      </div>

      {loading && <Loading label="Söker…" />}
      {ran && !loading && repos.length === 0 && issues.length === 0 && (
        <Empty>Inga träffar</Empty>
      )}

      {repos.length > 0 && (
        <section>
          <h3>Repositories</h3>
          {repos.map((r) => (
            <div key={r.fullName} className="row repo-row">
              <span className="icon">
                <Icon name={r.private ? 'lock' : 'repo'} size={14} />
              </span>
              <div className="repo-main">
                <div className="fname">{r.fullName}</div>
                {r.description && <div className="path-dim">{r.description}</div>}
                <div className="repo-card-meta">
                  {r.language && <span>{r.language}</span>}
                  {r.stars > 0 && <span>★ {r.stars}</span>}
                </div>
              </div>
              <button className="btn ghost small" onClick={() => window.open(r.htmlUrl)}>
                Öppna
              </button>
              <button className="btn small" onClick={() => cloneAndOpen(r.cloneUrl)}>
                Klona
              </button>
            </div>
          ))}
        </section>
      )}

      {issues.length > 0 && (
        <section>
          <h3>Issues &amp; pull requests</h3>
          {issues.map((i) => (
            <div
              key={`${i.repo}#${i.number}`}
              className="row pr-row"
              {...rowA11y(() => window.open(i.htmlUrl))}
              onClick={() => window.open(i.htmlUrl)}
            >
              <span className={`repo-badge ${i.isPr ? 'is-pr' : 'is-issue'}`}>
                {i.isPr ? 'PR' : 'issue'}
              </span>
              <span className="pr-num">#{i.number}</span>
              <span className="pr-title">{i.title}</span>
              <span className="path-dim">
                {i.repo} · {i.state} · @{i.author}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
