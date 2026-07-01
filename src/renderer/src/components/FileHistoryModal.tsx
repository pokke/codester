import { useEffect, useState } from 'react'
import { DiffEditor, useMonaco } from '@monaco-editor/react'
import type { CommitLogEntry } from '../../../shared/types'
import { defineMonacoTheme, languageForPath } from '../editor/monaco'
import { useSettings } from '../settings/SettingsContext'
import { getTheme } from '../themes/themes'

export function FileHistoryModal({
  file,
  onClose,
  initialRev
}: {
  file: string
  onClose: () => void
  initialRev?: string
}): JSX.Element {
  const { settings } = useSettings()
  const monaco = useMonaco()
  const [commits, setCommits] = useState<CommitLogEntry[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selected, setSelected] = useState<CommitLogEntry | null>(null)
  const [original, setOriginal] = useState('')
  const [modified, setModified] = useState('')
  const [loadingDiff, setLoadingDiff] = useState(false)

  useEffect(() => {
    if (!monaco) return
    monaco.editor.setTheme(defineMonacoTheme(getTheme(settings.themeId)))
  }, [monaco, settings.themeId])

  useEffect(() => {
    setLoadingList(true)
    window.api.git.fileLog(file).then((r) => {
      if (r.ok) {
        setCommits(r.data)
        const pick = initialRev
          ? r.data.find((c) => c.hash === initialRev || c.shortHash === initialRev)
          : null
        setSelected(pick ?? r.data[0] ?? null)
      }
      setLoadingList(false)
    })
  }, [file, initialRev])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoadingDiff(true)
    Promise.all([
      window.api.git.showFile(`${selected.hash}~1`, file),
      window.api.git.showFile(selected.hash, file)
    ]).then(([o, m]) => {
      if (cancelled) return
      setOriginal(o.ok ? o.data : '')
      setModified(m.ok ? m.data : '')
      setLoadingDiff(false)
    })
    return () => {
      cancelled = true
    }
  }, [selected, file])

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Historik — {file.split('/').pop()}</span>
          <button className="btn icon ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="history-modal-body">
          <div className="history-commits">
            {loadingList && <div className="hint">Läser historik…</div>}
            {!loadingList && commits.length === 0 && <div className="hint">Ingen historik</div>}
            {commits.map((c) => (
              <div
                key={c.hash}
                className={`row ${selected?.hash === c.hash ? 'active' : ''}`}
                onClick={() => setSelected(c)}
                title={c.message}
              >
                <div className="ch-main">
                  <div className="fname">{c.message}</div>
                  <div className="path-dim">
                    {c.shortHash} · {c.author} · {c.date.slice(0, 10)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="history-diff">
            {loadingDiff && <div className="empty-state">Laddar diff…</div>}
            {!loadingDiff && selected ? (
              <DiffEditor
                height="100%"
                theme={`codester-${settings.themeId}`}
                language={languageForPath(file)}
                original={original}
                modified={modified}
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  fontSize: settings.fontSize,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false
                }}
              />
            ) : !loadingDiff ? (
              <div className="empty-state">Välj en commit</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
