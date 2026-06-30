import { useEffect, useRef, useState } from 'react'
import Editor, { DiffEditor, useMonaco } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { defineMonacoTheme, languageForPath } from '../editor/monaco'
import { ConflictResolver } from './ConflictResolver'
import { useRepo } from '../state/RepoContext'
import { useSettings } from '../settings/SettingsContext'
import { getTheme } from '../themes/themes'
import { useToast } from '../ui/Toast'

type Mode = 'diff' | 'edit'

export function EditorPane(): JSX.Element {
  const { activePath, activeLine, status, refresh, resolveSide } = useRepo()
  const { settings } = useSettings()
  const { notify } = useToast()
  const monaco = useMonaco()

  const [mode, setMode] = useState<Mode>('diff')
  const [head, setHead] = useState('')
  const [working, setWorking] = useState('')
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const editedRef = useRef('')
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)

  const change = status?.files.find((f) => f.path === activePath)
  const isConflicted = !!activePath && (status?.conflicted ?? []).includes(activePath)

  // Applicera Codesters tema på Monaco när temat ändras
  useEffect(() => {
    if (!monaco) return
    const themeId = defineMonacoTheme(getTheme(settings.themeId))
    monaco.editor.setTheme(themeId)
  }, [monaco, settings.themeId])

  // Välj förnuftigt standardläge när filen byts
  useEffect(() => {
    if (isConflicted || !change || activeLine) setMode('edit')
    else setMode('diff')
  }, [activePath, isConflicted, change, activeLine])

  // Hoppa till rad (t.ex. från en sökträff)
  useEffect(() => {
    if (activeLine && editorRef.current && mode === 'edit' && !loading) {
      editorRef.current.revealLineInCenter(activeLine)
      editorRef.current.setPosition({ lineNumber: activeLine, column: 1 })
      editorRef.current.focus()
    }
  }, [activeLine, loading, mode, working])

  // Ladda innehåll när aktiv fil ändras
  useEffect(() => {
    if (!activePath) return
    setLoading(true)
    setDirty(false)
    Promise.all([
      window.api.git.headContent(activePath),
      window.api.git.fileContent(activePath)
    ]).then(([h, w]) => {
      setHead(h.ok ? h.data : '')
      const content = w.ok ? w.data : ''
      setWorking(content)
      editedRef.current = content
      setLoading(false)
    })
  }, [activePath])

  const themeId = `codester-${settings.themeId}`

  if (!activePath) {
    return (
      <main className="panel center">
        <div className="empty-state">
          <div style={{ fontSize: 40 }}>📄</div>
          <h2>Ingen fil vald</h2>
          <p>Välj en fil i sidofältet – under "Ändringar" för diff, eller "Filer" för att bläddra.</p>
        </div>
      </main>
    )
  }

  const lang = languageForPath(activePath)

  const save = async (): Promise<void> => {
    const res = await window.api.git.saveFile(activePath, editedRef.current)
    if (res.ok) {
      setWorking(editedRef.current)
      setDirty(false)
      notify('Sparad', 'success')
      await refresh()
    } else {
      notify(`Kunde inte spara: ${res.error}`, 'error')
    }
  }

  const canDiff = !!change && !isConflicted

  return (
    <main className="panel center">
      <div className="panel-header editor-toolbar">
        <span title={activePath}>
          {isConflicted && '⚠ '}
          {activePath}
        </span>

        {isConflicted ? (
          <>
            <span className="muted small">Lös per block nedan, eller hela filen:</span>
            <button className="btn" onClick={() => resolveSide(activePath, 'ours')}>
              Hela filen: våra
            </button>
            <button className="btn" onClick={() => resolveSide(activePath, 'theirs')}>
              Hela filen: deras
            </button>
          </>
        ) : (
          <>
            {canDiff && (
              <div className="seg-toggle small">
                <button className={mode === 'diff' ? 'active' : ''} onClick={() => setMode('diff')}>
                  Diff
                </button>
                <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>
                  Redigera
                </button>
              </div>
            )}
            {mode === 'edit' && (
              <button className="btn primary" disabled={!dirty} onClick={save}>
                Spara{dirty ? ' •' : ''}
              </button>
            )}
          </>
        )}
      </div>

      {isConflicted ? (
        <ConflictResolver path={activePath} onResolved={refresh} />
      ) : loading ? (
        <div className="empty-state">Laddar…</div>
      ) : canDiff && mode === 'diff' ? (
        <DiffEditor
          height="100%"
          theme={themeId}
          language={lang}
          original={head}
          modified={working}
          options={{
            readOnly: true,
            renderSideBySide: true,
            fontSize: settings.fontSize,
            minimap: { enabled: false },
            scrollBeyondLastLine: false
          }}
        />
      ) : (
        <Editor
          height="100%"
          theme={themeId}
          language={lang}
          value={working}
          onMount={(ed) => {
            editorRef.current = ed
          }}
          onChange={(v) => {
            editedRef.current = v ?? ''
            setDirty((v ?? '') !== working)
          }}
          options={{
            fontSize: settings.fontSize,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true
          }}
        />
      )}
    </main>
  )
}
