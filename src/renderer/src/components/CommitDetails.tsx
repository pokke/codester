import { useEffect, useState } from 'react'
import { DiffEditor, useMonaco } from '@monaco-editor/react'
import type { CommitLogEntry, FileChange } from '../../../shared/types'
import { defineMonacoTheme, languageForPath } from '../editor/monaco'
import { useSettings } from '../settings/SettingsContext'
import { getTheme } from '../themes/themes'

function statusClass(status: string): string {
  if (status.startsWith('A')) return 'added'
  if (status.startsWith('D')) return 'removed'
  return 'modified'
}

export function CommitDetails({
  commit,
  onBack
}: {
  commit: CommitLogEntry
  onBack: () => void
}): JSX.Element {
  const { settings } = useSettings()
  const monaco = useMonaco()
  const [files, setFiles] = useState<FileChange[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [original, setOriginal] = useState('')
  const [modified, setModified] = useState('')

  useEffect(() => {
    if (!monaco) return
    const id = defineMonacoTheme(getTheme(settings.themeId))
    monaco.editor.setTheme(id)
  }, [monaco, settings.themeId])

  useEffect(() => {
    window.api.git.commitFiles(commit.hash).then((r) => {
      if (r.ok) {
        setFiles(r.data)
        setSelected(r.data[0]?.path ?? null)
      }
    })
  }, [commit.hash])

  useEffect(() => {
    if (!selected) return
    Promise.all([
      window.api.git.showFile(`${commit.hash}~1`, selected),
      window.api.git.showFile(commit.hash, selected)
    ]).then(([o, m]) => {
      setOriginal(o.ok ? o.data : '')
      setModified(m.ok ? m.data : '')
    })
  }, [selected, commit.hash])

  const themeId = `codester-${settings.themeId}`

  return (
    <main className="panel center">
      <div className="panel-header editor-toolbar">
        <button className="btn ghost" onClick={onBack}>
          ← Tillbaka
        </button>
        <span className="hash">{commit.shortHash}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {commit.message}
        </span>
      </div>
      <div className="commit-detail-meta">
        {commit.author} · {commit.date.slice(0, 16).replace('T', ' ')} ·{' '}
        {files.length} fil{files.length !== 1 ? 'er' : ''}
      </div>
      <div className="commit-detail-body">
        <div className="commit-file-list">
          {files.map((f) => (
            <div
              key={f.path}
              className={`row file-row ${selected === f.path ? 'active' : ''}`}
              onClick={() => setSelected(f.path)}
              title={f.path}
            >
              <span className={`dot ${statusClass(f.status)}`} />
              <span className="fname">{f.path.split('/').pop()}</span>
              <span className="path-dim">{f.path.split('/').slice(0, -1).join('/')}</span>
            </div>
          ))}
        </div>
        <div className="commit-diff">
          {selected ? (
            <DiffEditor
              height="100%"
              theme={themeId}
              language={languageForPath(selected)}
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
          ) : (
            <div className="empty-state">Inga filändringar.</div>
          )}
        </div>
      </div>
    </main>
  )
}
