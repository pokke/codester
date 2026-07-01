import { useEffect, useMemo, useState } from 'react'
import type { DeviceCodeInfo, GitHubRepo, GitHubUser, PullRequest } from '../../../shared/types'
import { useRepo } from '../state/RepoContext'
import { useToast } from '../ui/Toast'
import { Icon } from '../ui/Icon'
import { rowA11y } from '../ui/a11y'

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
  const { cloneAndOpen, repo } = useRepo()
  const { notify } = useToast()
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [token, setToken] = useState('')
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [pulls, setPulls] = useState<PullRequest[]>([])
  const [filter, setFilter] = useState('')
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientIdInput, setClientIdInput] = useState('')
  const [showCfg, setShowCfg] = useState(false)
  const [device, setDevice] = useState<DeviceCodeInfo | null>(null)
  const [reposLoading, setReposLoading] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [connecting, setConnecting] = useState(false)
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

  const loadPulls = async (): Promise<void> => {
    if (!repo) return
    const p = await window.api.github.pulls()
    if (p.ok) setPulls(p.data)
    else notify(p.error, 'error')
  }

  useEffect(() => {
    loadUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (authed && repo) loadPulls()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, repo])

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
    setPulls([])
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
              </div>

              {/* Utvecklarinställning: OAuth-app client ID */}
              <button className="btn ghost small" onClick={() => setShowCfg((v) => !v)}>
                {showCfg ? 'Dölj' : 'Konfigurera OAuth (utvecklare)'}
              </button>
              {showCfg && (
                <div style={{ width: '100%' }}>
                  <p className="muted small">
                    Registrera en OAuth App på github.com (Settings → Developer settings → OAuth
                    Apps) med <em>Device Flow</em> aktiverat och klistra in dess client ID:
                  </p>
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

  const shown = useMemo(() => {
    const f = repos.filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase()))
    const s = [...f]
    if (sortBy === 'name') s.sort((a, b) => a.fullName.localeCompare(b.fullName))
    else if (sortBy === 'stars') s.sort((a, b) => b.stars - a.stars)
    else s.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return s
  }, [repos, filter, sortBy])

  return (
    <main className="panel center">
      <div className="panel-header gh-header">
        <span>
          {user?.avatarUrl && <img className="avatar" src={user.avatarUrl} alt="" />}
          {user ? `${user.name ?? user.login} (@${user.login})` : 'GitHub'}
        </span>
        <button className="btn ghost" onClick={signOut}>
          Logga ut
        </button>
      </div>

      <div className="gh-body">
        {repo && (
          <section>
            <h3>Öppna pull requests</h3>
            {pulls.length === 0 && <p className="muted small">Inga öppna PR (eller ingen remote).</p>}
            {pulls.map((p) => (
              <div
                key={p.number}
                className="row pr-row"
                {...rowA11y(() => window.open(p.url))}
                onClick={() => window.open(p.url)}
              >
                <span className="pr-num">#{p.number}</span>
                <span className="pr-title">{p.title}</span>
                <span className="path-dim">
                  {p.headRef} → {p.baseRef} · @{p.author}
                </span>
              </div>
            ))}
          </section>
        )}

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
      </div>
    </main>
  )
}
