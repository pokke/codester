import { useEffect, useRef, useState } from 'react'
import Editor, { DiffEditor, useMonaco } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import type { BlameLine } from '../../../shared/types'
import { defineMonacoTheme, languageForPath } from '../editor/monaco'
import { canFormat, formatCode } from '../editor/format'
import { ConflictResolver } from './ConflictResolver'
import { useRepo } from '../state/RepoContext'
import { useSettings } from '../settings/SettingsContext'
import { getTheme } from '../themes/themes'
import { useToast } from '../ui/Toast'

type Mode = 'diff' | 'edit'

export function EditorPane(): JSX.Element {
  const {
    openTabs,
    previewPath,
    activePath,
    activeLine,
    status,
    revision,
    selectPath,
    pinTab,
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
  const loadedPathRef = useRef<string | null>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const saveRef = useRef<() => void>(() => {})
  // Osparat innehåll per flik, så ändringar överlever flikbyten
  const buffers = useRef<Map<string, string>>(new Map())
  // Gutter-markeringar + inline blame
  const [editorReady, setEditorReady] = useState(0)
  const changesRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const blameDataRef = useRef<BlameLine[]>([])
  const blameCol = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)

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
    // Visa "Laddar…" bara vid genuint filbyte – inte vid tyst omläsning
    // (revision-bump efter spara/watcher), annars flimrar editorn.
    const isNewFile = loadedPathRef.current !== activePath
    if (isNewFile) setLoading(true)
    Promise.all([
      window.api.git.headContent(activePath),
      window.api.git.fileContent(activePath)
    ]).then(([h, w]) => {
      if (cancelled) return
      const disk = w.ok ? w.data : ''
      diskRef.current = disk
      const cached = buffers.current.get(activePath)
      const value = cached ?? disk
      setHead((prev) => (prev === (h.ok ? h.data : '') ? prev : h.ok ? h.data : ''))
      // Uppdatera bara editorvärdet om det faktiskt ändrats (undviker reset av
      // markör/ångra-historik och flimmer vid omläsning).
      setWorking((prev) => (prev === value ? prev : value))
      editedRef.current = value
      setDirty(value !== disk)
      markDirty(activePath, value !== disk)
      loadedPathRef.current = activePath
      if (isNewFile) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [activePath, revision])

  // Gutter: markera ändrade rader mot HEAD
  const applyGutter = (): void => {
    const ed = editorRef.current
    if (!ed || !monaco) return
    window.api.git.lineChanges(activePath!).then((r) => {
      if (!editorRef.current) return
      const list = r.ok ? r.data : []
      const decos = list.map((c) => ({
        range: new monaco.Range(c.start, 1, Math.max(c.start, c.end), 1),
        options: { linesDecorationsClassName: `gutter-${c.type}` }
      }))
      if (changesRef.current) changesRef.current.set(decos)
      else changesRef.current = ed.createDecorationsCollection(decos)
    })
  }

  // Inline blame på raden där markören står
  const applyBlame = (): void => {
    const ed = editorRef.current
    if (!ed || !monaco) return
    const pos = ed.getPosition()
    const b = pos ? blameDataRef.current[pos.lineNumber - 1] : undefined
    if (!pos || !b) {
      blameCol.current?.clear()
      return
    }
    const model = ed.getModel()
    const col = model ? model.getLineMaxColumn(pos.lineNumber) : 1
    const decos = [
      {
        range: new monaco.Range(pos.lineNumber, col, pos.lineNumber, col),
        options: {
          after: { content: `    ${b.author} · ${b.date}`, inlineClassName: 'blame-inline' }
        }
      }
    ]
    if (blameCol.current) blameCol.current.set(decos)
    else blameCol.current = ed.createDecorationsCollection(decos)
  }

  // Ladda gutter- och blame-data (endast i redigeringsläge)
  useEffect(() => {
    if (!activePath || isConflicted || mode !== 'edit' || !editorReady) return
    let cancelled = false
    applyGutter()
    window.api.git.blame(activePath).then((r) => {
      if (cancelled) return
      blameDataRef.current = r.ok ? r.data : []
      applyBlame()
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, revision, mode, editorReady, monaco])

  // Lyssna på markörflytt för att uppdatera inline blame
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    const sub = ed.onDidChangeCursorPosition(() => applyBlame())
    return () => sub.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorReady, monaco])

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
    // Redigering fäster en förhandsflik (som i VS Code)
    if (previewPath === activePath) pinTab(activePath)
    editedRef.current = val
    const isDirty = val !== diskRef.current
    setDirty(isDirty)
    if (isDirty) buffers.current.set(activePath, val)
    else buffers.current.delete(activePath)
    markDirty(activePath, isDirty)
  }

  const save = async (): Promise<void> => {
    if (!dirty) return
    let content = editedRef.current
    let didFormat = false
    if (settings.formatOnSave && canFormat(lang)) {
      try {
        content = await formatCode(content, lang)
        didFormat = true
      } catch (e) {
        notify(`Formatering misslyckades: ${e instanceof Error ? e.message : e}`, 'error')
      }
    }
    const res = await window.api.git.saveFile(activePath, content)
    if (res.ok) {
      editedRef.current = content
      diskRef.current = content
      setWorking(content)
      buffers.current.delete(activePath)
      setDirty(false)
      markDirty(activePath, false)
      notify(didFormat ? 'Formaterad & sparad' : 'Sparad', 'success')
      await refresh()
    } else {
      notify(`Kunde inte spara: ${res.error}`, 'error')
    }
  }
  saveRef.current = save

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
            className={`tab ${activePath === path ? 'active' : ''} ${
              previewPath === path ? 'preview' : ''
            }`}
            onClick={() => selectPath(path)}
            onDoubleClick={() => pinTab(path)}
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
              <span className="muted small">{dirty ? 'Osparat · Ctrl+S' : 'Sparat'}</span>
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
          onMount={(ed, monacoApi) => {
            editorRef.current = ed
            changesRef.current = null
            blameCol.current = null
            // Ctrl+S sparar (som i VS Code) – ingen synlig spara-knapp
            ed.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () =>
              saveRef.current()
            )
            setEditorReady((n) => n + 1)
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
