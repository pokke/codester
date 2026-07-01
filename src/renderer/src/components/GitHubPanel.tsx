import { useEffect, useState } from 'react'
import type { DeviceCodeInfo, GitHubRepo, GitHubUser } from '../../../shared/types'
import { useRepo } from '../state/RepoContext'
import { useToast } from '../ui/Toast'
import { Icon } from '../ui/Icon'
import { GitHubPullRequests } from './GitHubPullRequests'
import { GitHubIssues } from './GitHubIssues'
import { GitHubNotifications } from './GitHubNotifications'
import { GitHubSearch } from './GitHubSearch'
import { GitHubReleases } from './GitHubReleases'
import { GitHubActions } from './GitHubActions'
import { GitHubGists } from './GitHubGists'
import { GitHubInsights } from './GitHubInsights'
import { RepoScopeGuard } from './RepoScopeGuard'
import type { RateLimit } from '../../../shared/types'

type Scope = 'account' | 'repo'
type AccountTab = 'repos' | 'search' | 'notifs' | 'gists'
type RepoTab = 'overview' | 'pulls' | 'issues' | 'actions' | 'releases'

type RepoSort = 'updated' | 'name' | 'stars'

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Rust: '#dea584',
  Go: '#00add8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#888888',
  'C#': '#178600',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Swift: '#f05138',
  Kotlin: '#a97bff',
  Vue: '#41b883',
  Dart: '#00b4ab'
}
function langColor(lang: string): string {
  return LANG_COLORS[lang] ?? 'var(--text-muted)'
}
function relativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (!then) return ''
  const s = (Date.now() - then) / 1000
  if (s < 60) return 'nyss'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)} min sedan`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)} h sedan`
  const d = h / 24
  if (d < 30) return `${Math.floor(d)} d sedan`
  const mo = d / 30
  if (mo < 12) return `${Math.floor(mo)} mån sedan`
  return `${Math.floor(mo / 12)} år sedan`
}

export function GitHubPanel(): JSX.Element {
  const { cloneAndOpen, repo, repos: workspaceRepos, switchRepo } = useRepo()
  const { notify } = useToast()
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [token, setToken] = useState('')
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [scope, setScope] = useState<Scope>('repo')
  const [accountTab, setAccountTab] = useState<AccountTab>('repos')
  const [repoTab, setRepoTab] = useState<RepoTab>('overview')
  const [remote, setRemote] = useState<{ owner: string; repo: string } | null>(null)
  const [filter, setFilter] = useState('')
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientIdInput, setClientIdInput] = useState('')
  const [showCfg, setShowCfg] = useState(false)
  const [device, setDevice] = useState<DeviceCodeInfo | null>(null)
  const [reposLoading, setReposLoading] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [rate, setRate] = useState<RateLimit | null>(null)
  const [sortBy, setSortBy] = useState<RepoSort>('updated')

  const loadUser = async (): Promise<void> => {
    const cid = await window.api.github.getClientId()
    if (cid.ok) setClientId(cid.data)
    const has = await window.api.github.hasToken()
    if (has.ok && has.data) {
      // Har vi en token → visa repo-vyn direkt. Användarprofilen hämtas
      // best-effort (kan strula utan att vi ska falla tillbaka till login).
      setAuthed(true)
      loadRepos()
      window.api.github.rateLimit().then((r) => r.ok && setRate(r.data))
      const u = await window.api.github.user()
      if (u.ok) setUser(u.data)
    }
  }

  const saveClientId = async (): Promise<void> => {
    const id = clientIdInput.trim()
    if (!id) return
    await window.api.github.setClientId(id)
    setClientId(id)
    setShowCfg(false)
    notify('Client ID sparat', 'success')
  }

  const loginWithDevice = async (): Promise<void> => {
    const start = await window.api.github.deviceStart()
    if (!start.ok) {
      notify(`Kunde inte starta inloggning: ${start.error}`, 'error')
      return
    }
    setDevice(start.data)
    window.open(start.data.verificationUri) // öppnas i systemets webbläsare
    const res = await window.api.github.devicePoll(start.data.deviceCode, start.data.interval)
    setDevice(null)
    if (res.ok) {
      setUser(res.data)
      setAuthed(true)
      notify(`Inloggad som ${res.data.login}`, 'success')
      loadRepos()
    } else {
      notify(`Inloggning misslyckades: ${res.error}`, 'error')
    }
  }

  const loadRepos = async (): Promise<void> => {
    setReposLoading(true)
    const r = await window.api.github.repos()
    if (r.ok) setRepos(r.data)
    setReposLoading(false)
  }

  useEffect(() => {
    loadUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hämta aktivt repos GitHub owner/namn (för repo-scope-etiketten)
  useEffect(() => {
    if (!repo) {
      setRemote(null)
      return
    }
    window.api.repo.remote().then((r) => setRemote(r.ok ? r.data : null))
  }, [repo])

  const connect = async (): Promise<void> => {
    if (connecting || !token.trim()) return
    setConnecting(true)
    try {
      const res = await window.api.github.setToken(token)
      if (res.ok) {
        setUser(res.data)
        setAuthed(true)
        setToken('')
        notify(`Inloggad som ${res.data.login}`, 'success')
        loadRepos()
      } else {
        notify(`Inloggning misslyckades: ${res.error}`, 'error')
      }
    } finally {
      setConnecting(false)
    }
  }

  const signOut = async (): Promise<void> => {
    await window.api.github.signOut()
    setUser(null)
    setAuthed(false)
    setRepos([])
  }

  if (!authed) {
    return (
      <main className="panel center">
        <div className="welcome">
          <h2>Anslut GitHub</h2>

          {/* Pågående device flow */}
          {device ? (
            <div className="device-flow">
              <p className="muted">Ange den här koden i webbläsaren som öppnades:</p>
              <div className="device-code">{device.userCode}</div>
              <p className="muted small">
                Öppnades inte?{' '}
                <a href="#" onClick={() => window.open(device.verificationUri)}>
                  {device.verificationUri}
                </a>
              </p>
              <p className="muted small">Väntar på godkännande…</p>
            </div>
          ) : (
            <>
              {/* Snabbast: OAuth Device Flow (om client ID finns) */}
              {clientId ? (
                <button className="btn primary" onClick={loginWithDevice}>
                  Logga in med GitHub
                </button>
              ) : (
                <p className="muted small">
                  Tips: konfigurera ett OAuth-client-ID nedan för inloggning med ett klick.
                </p>
              )}

              {/* Alternativ: Personal Access Token */}
              <div style={{ width: '100%', marginTop: 'var(--space)' }}>
                <p className="muted small">…eller med en Personal Access Token:</p>
                <div className="welcome-clone">
                  <input
                    type="password"
                    placeholder="ghp_…"
                    value={token}
                    disabled={connecting}
                    onChange={(e) => setToken(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && token && connect()}
                  />
                  <button className="btn" disabled={!token || connecting} onClick={connect}>
                    {connecting ? 'Ansluter…' : 'Anslut'}
                  </button>
                </div>
                <div className="gh-scope-help">
                  <p className="muted small">
                    Tokenen behöver dessa scopes: <code>repo</code>, <code>read:user</code>,{' '}
                    <code>notifications</code>, <code>gist</code>{' '}
                    <span className="muted">(<code>workflow</code> valfritt)</span>.
                  </p>
                  <a
                    href="#"
                    className="small"
                    onClick={(e) => {
                      e.preventDefault()
                      window.open(
                        'https://github.com/settings/tokens/new?description=Codester&scopes=repo,read:user,notifications,gist,workflow'
                      )
                    }}
                  >
                    Skapa token med rätt scopes förikryssade ↗
                  </a>
                </div>
              </div>

              {/* Utvecklarinställning: OAuth-app client ID */}
              <button className="btn ghost small" onClick={() => setShowCfg((v) => !v)}>
                {showCfg ? 'Dölj' : 'Konfigurera OAuth (utvecklare)'}
              </button>
              {showCfg && (
                <div style={{ width: '100%' }}>
                  <p className="muted small">
                    Registrera en OAuth App för inloggning med ett klick (Device Flow). Client ID är
                    publikt – ingen client secret behövs.
                  </p>
                  <ol className="gh-oauth-steps muted small">
                    <li>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          window.open(
                            'https://github.com/settings/applications/new?' +
                              'oauth_application[name]=Codester&' +
                              'oauth_application[url]=' +
                              encodeURIComponent('https://github.com/pokke/codester') +
                              '&oauth_application[callback_url]=' +
                              encodeURIComponent('https://github.com/pokke/codester')
                          )
                        }}
                      >
                        Öppna ”New OAuth App” (namn/URL förifyllt) ↗
                      </a>
                    </li>
                    <li>
                      Bocka i <strong>Enable Device Flow</strong> och klicka{' '}
                      <em>Register application</em>.
                    </li>
                    <li>
                      Kopiera <strong>Client ID</strong> och klistra in nedan.
                    </li>
                  </ol>
                  <div className="welcome-clone">
                    <input
                      placeholder="Iv1.xxxxxxxxxxxx"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                    />
                    <button className="btn" disabled={!clientIdInput.trim()} onClick={saveClientId}>
                      Spara
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    )
  }

  // Vanlig beräkning (INTE en hook) – ligger efter en tidig return, så useMemo
  // här skulle bryta mot React:s hook-regler (error #310).
  const shown = repos
    .filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return (a.fullName ?? '').localeCompare(b.fullName ?? '')
      if (sortBy === 'stars') return (b.stars ?? 0) - (a.stars ?? 0)
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
    })

  return (
    <main className="panel center">
      <div className="panel-header gh-header">
        <span>
          {user?.avatarUrl && <img className="avatar" src={user.avatarUrl} alt="" />}
          {user ? `${user.name ?? user.login} (@${user.login})` : 'GitHub'}
        </span>
        {rate && (
          <span className="gh-rate muted small" title="GitHub API-anrop kvar denna timme">
            API {rate.remaining}/{rate.limit}
          </span>
        )}
        <button className="btn ghost" onClick={signOut}>
          Logga ut
        </button>
      </div>

      <div className="gh-scopebar" role="tablist" aria-label="Omfattning">
        <button
          role="tab"
          aria-selected={scope === 'account'}
          className={`gh-scope ${scope === 'account' ? 'active' : ''}`}
          onClick={() => setScope('account')}
        >
          Mitt konto
        </button>
        <button
          role="tab"
          aria-selected={scope === 'repo'}
          className={`gh-scope ${scope === 'repo' ? 'active' : ''}`}
          onClick={() => setScope('repo')}
        >
          Detta repo
        </button>
        {scope === 'repo' && (
          <span className="gh-repo-ctx">
            <span className="muted">▸</span>
            {workspaceRepos.length > 1 ? (
              <select
                className="gh-repo-select"
                value={repo?.path ?? ''}
                onChange={(e) => switchRepo(e.target.value)}
                title="Byt aktivt repo"
              >
                {workspaceRepos.map((r) => (
                  <option key={r.path} value={r.path}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{remote ? `${remote.owner}/${remote.repo}` : repo?.name ?? 'inget repo'}</strong>
            )}
            {workspaceRepos.length > 1 && remote && (
              <span className="muted small">
                {remote.owner}/{remote.repo}
              </span>
            )}
          </span>
        )}
      </div>

      <div className="gh-subtabs" role="tablist">
        {scope === 'account'
          ? (
              [
                ['repos', 'Repositories'],
                ['search', 'Sök'],
                ['notifs', 'Notiser'],
                ['gists', 'Gists']
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                role="tab"
                aria-selected={accountTab === v}
                className={accountTab === v ? 'active' : ''}
                onClick={() => setAccountTab(v)}
              >
                {l}
              </button>
            ))
          : (
              [
                ['overview', 'Översikt'],
                ['pulls', 'Pull requests'],
                ['issues', 'Issues'],
                ['actions', 'Actions'],
                ['releases', 'Releaser']
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                role="tab"
                aria-selected={repoTab === v}
                className={repoTab === v ? 'active' : ''}
                onClick={() => setRepoTab(v)}
              >
                {l}
              </button>
            ))}
      </div>

      <div className="gh-body">
        {scope === 'repo' && (
          <RepoScopeGuard key={repo?.path ?? 'none'}>
            {repoTab === 'overview' && <GitHubInsights />}
            {repoTab === 'pulls' && <GitHubPullRequests />}
            {repoTab === 'issues' && <GitHubIssues />}
            {repoTab === 'actions' && <GitHubActions />}
            {repoTab === 'releases' && <GitHubReleases />}
          </RepoScopeGuard>
        )}
        {scope === 'account' && accountTab === 'search' && <GitHubSearch />}
        {scope === 'account' && accountTab === 'notifs' && <GitHubNotifications />}
        {scope === 'account' && accountTab === 'gists' && <GitHubGists />}
        {scope === 'account' && accountTab === 'repos' && (
        <section>
          <div className="repo-list-head">
            <h3>Dina repon {repos.length > 0 && <span className="muted small">({repos.length})</span>}</h3>
            <div className="seg-toggle small">
              {(
                [
                  ['updated', 'Senaste'],
                  ['name', 'Namn'],
                  ['stars', 'Stjärnor']
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  className={sortBy === v ? 'active' : ''}
                  onClick={() => setSortBy(v)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <input
            placeholder="Filtrera…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 8 }}
          />
          {reposLoading && repos.length === 0 && <div className="hint">Hämtar repon…</div>}
          {!reposLoading && repos.length === 0 && <div className="hint">Inga repon hittades</div>}
          {!reposLoading && repos.length > 0 && shown.length === 0 && (
            <div className="hint">Inga repon matchar filtret</div>
          )}
          <div className="repo-cards">
            {shown.map((r) => (
              <div key={r.fullName} className="repo-card">
                <div className="repo-card-head">
                  <Icon name={r.private ? 'lock' : 'repo'} size={14} />
                  <span className="fname" title={r.fullName}>
                    {r.name}
                  </span>
                  {r.private && <span className="repo-badge">privat</span>}
                  <span className="spacer" />
                  <button
                    className="btn ghost small"
                    title="Öppna på GitHub"
                    onClick={() => window.open(r.htmlUrl)}
                  >
                    Öppna
                  </button>
                  <button className="btn small" title="Klona" onClick={() => cloneAndOpen(r.cloneUrl)}>
                    Klona
                  </button>
                </div>
                {r.description && <div className="repo-card-desc">{r.description}</div>}
                <div className="repo-card-meta">
                  {r.language && (
                    <span className="repo-lang">
                      <span className="lang-dot" style={{ background: langColor(r.language) }} />
                      {r.language}
                    </span>
                  )}
                  {r.stars > 0 && <span title="Stjärnor">★ {r.stars}</span>}
                  {r.updatedAt && <span className="path-dim">{relativeTime(r.updatedAt)}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
        )}
      </div>
    </main>
  )
}
