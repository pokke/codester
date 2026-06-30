import { useEffect, useState } from 'react'
import type { DeviceCodeInfo, GitHubRepo, GitHubUser, PullRequest } from '../../../shared/types'
import { useRepo } from '../state/RepoContext'
import { useToast } from '../ui/Toast'

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

  const loadUser = async (): Promise<void> => {
    const cid = await window.api.github.getClientId()
    if (cid.ok) setClientId(cid.data)
    const has = await window.api.github.hasToken()
    if (has.ok && has.data) {
      const u = await window.api.github.user()
      if (u.ok) {
        setUser(u.data)
        loadRepos()
      }
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
      notify(`Inloggad som ${res.data.login}`, 'success')
      loadRepos()
    } else {
      notify(`Inloggning misslyckades: ${res.error}`, 'error')
    }
  }

  const loadRepos = async (): Promise<void> => {
    const r = await window.api.github.repos()
    if (r.ok) setRepos(r.data)
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
    if (user && repo) loadPulls()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, repo])

  const connect = async (): Promise<void> => {
    const res = await window.api.github.setToken(token)
    if (res.ok) {
      setUser(res.data)
      setToken('')
      notify(`Inloggad som ${res.data.login}`, 'success')
      loadRepos()
    } else {
      notify(`Inloggning misslyckades: ${res.error}`, 'error')
    }
  }

  const signOut = async (): Promise<void> => {
    await window.api.github.signOut()
    setUser(null)
    setRepos([])
    setPulls([])
  }

  if (!user) {
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
                    onChange={(e) => setToken(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && token && connect()}
                  />
                  <button className="btn" disabled={!token} onClick={connect}>
                    Anslut
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

  const filtered = repos.filter((r) =>
    r.fullName.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <main className="panel center">
      <div className="panel-header gh-header">
        <span>
          {user.avatarUrl && <img className="avatar" src={user.avatarUrl} alt="" />}
          {user.name ?? user.login} (@{user.login})
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
              <div key={p.number} className="row pr-row" onClick={() => window.open(p.url)}>
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
          <h3>Dina repon</h3>
          <input
            placeholder="Filtrera…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 8 }}
          />
          {filtered.map((r) => (
            <div key={r.fullName} className="row repo-row">
              <span className="icon">{r.private ? '🔒' : '📦'}</span>
              <div className="repo-main">
                <div className="fname">{r.fullName}</div>
                {r.description && <div className="path-dim">{r.description}</div>}
              </div>
              <button
                className="btn"
                title="Klona"
                onClick={() => cloneAndOpen(r.cloneUrl)}
              >
                Klona
              </button>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
