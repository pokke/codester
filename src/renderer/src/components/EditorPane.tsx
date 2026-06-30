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
  const {
    openTabs,
    activePath,
    activeLine,
    status,
    revision,
    selectPath,
    closeTab,
    refresh,
    resolveSide
  } = useRepo()
  const { settings } = useSettings()
  const { notify } = useToast()
  const monaco = useMonaco()

  const [mode, setMode] = useState<Mode>('diff')
  const [head, setHead] = useState('')
  const [working, setWorking] = useState('')
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(new Set())

  const editedRef = useRef('')
  const diskRef = useRef('')
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  // Osparat innehåll per flik, så ändringar överlever flikbyten
  const buffers = useRef<Map<string, string>>(new Map())

  const change = status?.files.find((f) => f.path === activePath)
  const isConflicted = !!activePath && (status?.conflicted ?? []).includes(activePath)

  const markDirty = (path: string, isDirty: boolean): void => {
    setDirtyTabs((prev) => {
      if (isDirty === prev.has(path)) return prev
      const next = new Set(prev)
      isDirty ? next.add(path) : next.delete(path)
      return next
    })
  }

  // Applicera Codesters tema på Monaco när temat ändras
  useEffect(() => {
    if (!monaco) return
    monaco.editor.setTheme(defineMonacoTheme(getTheme(settings.themeId)))
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

  // Ladda innehåll vid filbyte ELLER när repot ändras (revision) – men behåll
  // osparade ändringar. Disk läses om varje gång, så editorn är aldrig "fast"
  // på en gammal version.
  useEffect(() => {
    if (!activePath) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      window.api.git.headContent(activePath),
      window.api.git.fileContent(activePath)
    ]).then(([h, w]) => {
      if (cancelled) return
      const disk = w.ok ? w.data : ''
      diskRef.current = disk
      const cached = buffers.current.get(activePath)
      const value = cached ?? disk
      setHead(h.ok ? h.data : '')
      setWorking(value)
      editedRef.current = value
      setDirty(value !== disk)
      markDirty(activePath, value !== disk)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [activePath, revision])

  const themeId = `codester-${settings.themeId}`

  if (!activePath) {
    return (
      <main className="panel center">
        <div className="empty-state">
          <div style={{ fontSize: 40 }}>📄</div>
          <h2>Ingen fil öppen</h2>
          <p>Välj en fil i sidofältet – under "Ändringar" för diff, eller "Filer" för att bläddra.</p>
        </div>
      </main>
    )
  }

  const lang = languageForPath(activePath)
  const canDiff = !!change && !isConflicted

  const onEdit = (v: string | undefined): void => {
    const val = v ?? ''
    editedRef.current = val
    const isDirty = val !== diskRef.current
    setDirty(isDirty)
    if (isDirty) buffers.current.set(activePath, val)
    else buffers.current.delete(activePath)
    markDirty(activePath, isDirty)
  }

  const save = async (): Promise<void> => {
    const res = await window.api.git.saveFile(activePath, editedRef.current)
    if (res.ok) {
      diskRef.current = editedRef.current
      setWorking(editedRef.current)
      buffers.current.delete(activePath)
      setDirty(false)
      markDirty(activePath, false)
      notify('Sparad', 'success')
      await refresh()
    } else {
      notify(`Kunde inte spara: ${res.error}`, 'error')
    }
  }

  const handleClose = (path: string, e?: React.MouseEvent): void => {
    e?.stopPropagation()
    if (dirtyTabs.has(path) && !confirm(`${path} har osparade ändringar. Stäng ändå?`)) return
    buffers.current.delete(path)
    markDirty(path, false)
    closeTab(path)
  }

  return (
    <main className="panel center">
      {/* Flikrad */}
      <div className="tabbar">
        {openTabs.map((path) => (
          <div
            key={path}
            className={`tab ${activePath === path ? 'active' : ''}`}
            onClick={() => selectPath(path)}
            title={path}
            onAuxClick={(e) => e.button === 1 && handleClose(path, e)}
          >
            <span className="tab-name">{path.split('/').pop()}</span>
            {dirtyTabs.has(path) && <span className="tab-dirty">•</span>}
            <button className="tab-close" title="Stäng" onClick={(e) => handleClose(path, e)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="panel-header editor-toolbar">
        <span title={activePath}>
          {isConflicted && '⚠ '}
          {activePath}
        </span>

        {isConflicted ? (
          <>
            <span className="muted small">Lös per block nedan, eller hela filen:</span>
            <button className="btn" onClick={() => resolveSideFull('ours')}>
              Hela filen: våra
            </button>
            <button className="btn" onClick={() => resolveSideFull('theirs')}>
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
          path={activePath}
          value={working}
          onMount={(ed) => {
            editorRef.current = ed
          }}
          onChange={onEdit}
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

  function resolveSideFull(side: 'ours' | 'theirs'): void {
    if (activePath) resolveSide(activePath, side)
  }
}
