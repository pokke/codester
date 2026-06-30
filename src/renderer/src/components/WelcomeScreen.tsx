import { useState } from 'react'
import { useRepo } from '../state/RepoContext'

export function WelcomeScreen(): JSX.Element {
  const { openDialog, cloneAndOpen, busy } = useRepo()
  const [url, setUrl] = useState('')

  return (
    <main className="panel center">
      <div className="welcome">
        <div className="welcome-logo" />
        <h1>Codester</h1>
        <p className="muted">Koppla mot GitHub, överblicka branches och committa – enkelt.</p>

        <div className="welcome-actions">
          <button className="btn primary" onClick={() => openDialog()}>
            📂 Öppna lokalt repo
          </button>
        </div>

        <div className="welcome-clone">
          <input
            placeholder="https://github.com/användare/repo.git"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url.trim()) cloneAndOpen(url.trim())
            }}
          />
          <button
            className="btn"
            disabled={!url.trim() || busy}
            onClick={() => cloneAndOpen(url.trim())}
          >
            Klona
          </button>
        </div>
        <p className="muted small">
          Tips: anslut ditt GitHub-konto under fliken GitHub för att lista och klona dina repon.
        </p>
      </div>
    </main>
  )
}
