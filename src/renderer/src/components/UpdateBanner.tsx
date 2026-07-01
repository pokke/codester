import { useEffect, useState } from 'react'

type Phase = 'idle' | 'downloading' | 'ready' | 'error'

export function UpdateBanner(): JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('idle')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)
  // Vilken version användaren avfärdat (X). Samma version visas aldrig igen –
  // bara en NYARE version dyker upp på nytt. (Auto-updatern åter-sänder events
  // vid varje fokus/koll, så en enkel bool skulle poppa upp igen.)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)

  useEffect(() => {
    return window.api.update.on((e) => {
      if (e.type === 'update:available') {
        setVersion(String(e.payload))
        setPhase('downloading')
        setPercent(0)
      } else if (e.type === 'update:progress') {
        setPhase('downloading')
        setPercent(Number(e.payload))
      } else if (e.type === 'update:downloaded') {
        setVersion(String(e.payload))
        setPhase('ready')
      } else if (e.type === 'update:error') {
        setPhase('error')
      }
    })
  }, [])

  if (phase === 'idle') return null
  if (phase !== 'error' && version === dismissedVersion) return null

  return (
    <div className={`update-banner ${phase}`}>
      <span className="update-icon">{phase === 'error' ? '⚠' : '↑'}</span>
      {phase === 'downloading' && (
        <span className="update-text">
          Laddar ner uppdatering {version}… {percent}%
        </span>
      )}
      {phase === 'ready' && (
        <div className="update-text">
          <strong>Version {version} är redo</strong>
          <span className="muted small">Installeras automatiskt när du stänger appen.</span>
        </div>
      )}
      {phase === 'error' && (
        <div className="update-text">
          <strong>Uppdateringen misslyckades</strong>
          <span className="muted small">Kontrollera nätverket och försök igen.</span>
        </div>
      )}

      {phase === 'ready' && (
        <button className="btn primary" onClick={() => window.api.update.install()}>
          Starta om nu
        </button>
      )}
      {phase === 'error' && (
        <button className="btn" onClick={() => window.api.update.check()}>
          Försök igen
        </button>
      )}
      <button
        className="btn ghost icon"
        title="Dölj"
        aria-label="Dölj uppdateringsmeddelande"
        onClick={() => (phase === 'error' ? setPhase('idle') : setDismissedVersion(version))}
      >
        ✕
      </button>
    </div>
  )
}
