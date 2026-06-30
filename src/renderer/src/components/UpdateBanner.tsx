import { useEffect, useState } from 'react'

type Phase = 'idle' | 'downloading' | 'ready'

export function UpdateBanner(): JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('idle')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    return window.api.update.on((e) => {
      if (e.type === 'update:available') {
        setVersion(String(e.payload))
        setPhase('downloading')
        setPercent(0)
        setDismissed(false)
      } else if (e.type === 'update:progress') {
        setPhase('downloading')
        setPercent(Number(e.payload))
      } else if (e.type === 'update:downloaded') {
        setVersion(String(e.payload))
        setPhase('ready')
        setDismissed(false)
      } else if (e.type === 'update:error') {
        setPhase('idle')
      }
    })
  }, [])

  if (phase === 'idle' || dismissed) return null

  return (
    <div className={`update-banner ${phase}`}>
      <span className="update-icon">↑</span>
      {phase === 'downloading' ? (
        <span className="update-text">Laddar ner uppdatering {version}… {percent}%</span>
      ) : (
        <div className="update-text">
          <strong>Version {version} är redo</strong>
          <span className="muted small">Installeras automatiskt när du stänger appen.</span>
        </div>
      )}
      {phase === 'ready' && (
        <button className="btn primary" onClick={() => window.api.update.install()}>
          Starta om nu
        </button>
      )}
      <button className="btn ghost icon" title="Dölj" onClick={() => setDismissed(true)}>
        ✕
      </button>
    </div>
  )
}
