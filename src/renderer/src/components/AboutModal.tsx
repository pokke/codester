import { useEffect } from 'react'

export function AboutModal({
  version,
  onClose
}: {
  version: string
  onClose: () => void
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal about" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Om Codester</span>
          <button className="btn icon ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="welcome-logo" />
          <h2>Codester</h2>
          <p className="muted">Version {version}</p>
          <p className="muted small">
            En lättviktig kod- och Git-klient för Windows. Koppla mot GitHub,
            överblicka branches och committa – enkelt och anpassningsbart.
          </p>
          <p className="muted small">Byggd med Electron, React och Monaco.</p>
        </div>
      </div>
    </div>
  )
}
