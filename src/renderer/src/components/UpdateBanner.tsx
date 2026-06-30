import { useEffect, useState } from 'react'

type Phase = 'idle' | 'downloading' | 'ready'

export function UpdateBanner(): JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('idle')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)

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
        setPhase('idle')
      }
    })
  }, [])

  if (phase === 'idle') return null

  return (
    <div className="update-banner">
      {phase === 'downloading' ? (
        <span>
          Laddar ner uppdatering {version}… {percent}%
        </span>
      ) : (
        <>
          <span>Ny version {version} är redo.</span>
          <button className="btn primary" onClick={() => window.api.update.install()}>
            Starta om & uppdatera
          </button>
        </>
      )}
    </div>
  )
}
