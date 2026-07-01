import { useEffect, useState } from 'react'
import { useRepo } from '../state/RepoContext'
import type { CommitLogEntry } from '../../../shared/types'
import { FileHistoryModal } from './FileHistoryModal'
import { rowA11y } from '../ui/a11y'

// Tidslinje (VS Code-stil): glanceable git-historik för den aktiva filen,
// längst ner i Filer-fliken. Klick öppnar diffen för den versionen.
export function TimelineView(): JSX.Element {
  const { activePath, revision } = useRepo()
  const [open, setOpen] = useState(true)
  const [commits, setCommits] = useState<CommitLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [modalRev, setModalRev] = useState<string | null>(null)

  useEffect(() => {
    if (!activePath || !open) {
      setCommits([])
      return
    }
    let cancelled = false
    setLoading(true)
    window.api.git.fileLog(activePath).then((r) => {
      if (cancelled) return
      setCommits(r.ok ? r.data : [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [activePath, revision, open])

  return (
    <div className="timeline">
      <div className="panel-header timeline-header" onClick={() => setOpen((v) => !v)}>
        <span className="icon">{open ? '▾' : '▸'}</span>
        <span>Tidslinje</span>
      </div>
      {open && (
        <div className="timeline-body">
          {!activePath && <div className="hint">Ingen fil vald</div>}
          {activePath && loading && <div className="hint">Läser historik…</div>}
          {activePath && !loading && commits.length === 0 && (
            <div className="hint">Ingen historik</div>
          )}
          {commits.map((c) => (
            <div
              key={c.hash}
              className="row timeline-row"
              title={c.message}
              {...rowA11y(() => setModalRev(c.hash))}
              onClick={() => setModalRev(c.hash)}
            >
              <span className="fname">{c.message}</span>
              <span className="path-dim">
                {c.shortHash} · {c.author} · {c.date.slice(0, 10)}
              </span>
            </div>
          ))}
        </div>
      )}
      {modalRev && activePath && (
        <FileHistoryModal file={activePath} initialRev={modalRev} onClose={() => setModalRev(null)} />
      )}
    </div>
  )
}
