import { useEffect, useRef, useState } from 'react'
import Editor, { DiffEditor, useMonaco } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import type { BlameLine } from '../../../shared/types'
import { defineMonacoTheme, languageForPath } from '../editor/monaco'
import { canFormat, formatCode } from '../editor/format'
import { ConflictResolver } from './ConflictResolver'
import { HunkView } from './HunkView'
import { FileHistoryModal } from './FileHistoryModal'
import { useRepo } from '../state/RepoContext'
import { useSettings } from '../settings/SettingsContext'
import { getTheme } from '../themes/themes'
import { useToast } from '../ui/Toast'
import { ContextMenu, type MenuState } from '../ui/ContextMenu'
import { bindingFor, comboToMonaco } from '../settings/keybindings'

type Mode = 'diff' | 'edit' | 'hunks'

// Flik-/aktivfil-tillstånd som en grupp behöver. Primärgruppen matas från
// RepoContext, en sekundär (delad) grupp från EditorArea:s lokala state.
export interface GroupApi {
  openTabs: string[]
  activePath: string | null
  previewPath: string | null
  activeLine: number | null
  selectPath: (path: string | null, line?: number) => void
  pinTab: (path: string) => void
  closeTab: (path: string) => void
  closeTabs: (paths: string[]) => void
  reorderTabs: (from: string, to: string) => void
}

// Delas mellan grupperna så osparat innehåll och dirty-status är samma oavsett
// vilken grupp en fil visas i.
export interface SharedBuffers {
  buffers: React.MutableRefObject<Map<string, string>>
  dirtyTabs: Set<string>
  markDirty: (path: string, isDirty: boolean) => void
}

interface EditorGroupProps {
  api: GroupApi
  shared: SharedBuffers
  isActive: boolean
  onFocus: () => void
  onSplit?: () => void
  onOpenToSide?: (path: string) => void
  onCloseGroup?: () => void
}

export function EditorGroup({
  api,
  shared,
  isActive,
  onFocus,
  onSplit,
  onOpenToSide,
  onCloseGroup
}: EditorGroupProps): JSX.Element {
  const { openTabs, previewPath, activePath, activeLine } = api
  const { selectPath, pinTab, closeTab, closeTabs, reorderTabs } = api
  const { buffers, dirtyTabs, markDirty } = shared
  // Globalt/repo-brett tillstånd är gemensamt för alla grupper
  const { status, revision, refresh, resolveSide } = useRepo()
  const dragTabRef = useRef<string | null>(null)
  const { settings } = useSettings()
  const { notify } = useToast()
  const monaco = useMonaco()

  const [mode, setMode] = useState<Mode>('diff')
  const [head, setHead] = useState('')
  const [working, setWorking] = useState('')
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [closePrompt, setClosePrompt] = useState<string | null>(null)
  const [tabMenu, setTabMenu] = useState<MenuState | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const editedRef = useRef('')
  const diskRef = useRef('')
  const loadedPathRef = useRef<string | null>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const saveRef = useRef<() => void>(() => {})
  const savePathRef = useRef<(p: string) => void>(() => {})
  const formatDocRef = useRef<() => void>(() => {})
  const autoSaveRef = useRef(settings.autoSave)
  autoSaveRef.current = settings.autoSave
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Gutter-markeringar + inline blame
  const [editorReady, setEditorReady] = useState(0)
  const changesRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const blameDataRef = useRef<BlameLine[]>([])
  const blameCol = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)

  const change = status?.files.find((f) => f.path === activePath)
  const isConflicted = !!activePath && (status?.conflicted ?? []).includes(activePath)

  // Applicera Codesters tema på Monaco när temat ändras
  useEffect(() => {
    if (!monaco) return
    monaco.editor.setTheme(defineMonacoTheme(getTheme(settings.themeId)))
  }, [monaco, settings.themeId])

  // Välj förnuftigt standardläge när filen byts – men behåll "Hunkar" om
  // användaren valt det (praktiskt vid staging fil för fil).
  useEffect(() => {
    if (isConflicted || !change || activeLine) setMode('edit')
    else setMode((m) => (m === 'hunks' ? 'hunks' : 'diff'))
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
  const groupClass = `panel center editor-group ${isActive ? 'group-active' : ''}`

  if (!activePath) {
    return (
      <main className={groupClass} onMouseDownCapture={onFocus}>
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
    if (previewPath === activePath) pinTab(activePath)
    editedRef.current = val
    const isDirty = val !== diskRef.current
    setDirty(isDirty)
    if (isDirty) buffers.current.set(activePath, val)
    else buffers.current.delete(activePath)
    markDirty(activePath, isDirty)
    if (autoSaveRef.current === 'afterDelay' && isDirty) {
      // Fånga sökvägen NU så rätt fil sparas även om man hinner byta flik
      const path = activePath
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => savePathRef.current(path), 800)
    }
  }

  // Sparar en valfri flik (aktiv → live-innehåll, annars dess buffert).
  const savePath = async (path: string): Promise<boolean> => {
    let content = path === activePath ? editedRef.current : buffers.current.get(path)
    if (content === undefined) return true // inget osparat
    let didFormat = false
    const plang = languageForPath(path)
    if (settings.formatOnSave && canFormat(plang)) {
      try {
        content = await formatCode(content, plang)
        didFormat = true
      } catch (e) {
        notify(`Formatering misslyckades: ${e instanceof Error ? e.message : e}`, 'error')
      }
    }
    const res = await window.api.git.saveFile(path, content)
    if (!res.ok) {
      notify(`Kunde inte spara: ${res.error}`, 'error')
      return false
    }
    buffers.current.delete(path)
    markDirty(path, false)
    if (path === activePath) {
      editedRef.current = content
      diskRef.current = content
      setWorking(content)
      setDirty(false)
    }
    notify(didFormat ? 'Formaterad & sparad' : 'Sparad', 'success')
    await refresh()
    return true
  }

  const save = (): void => {
    if (dirty) savePath(activePath)
  }
  saveRef.current = save
  savePathRef.current = (p: string): void => {
    savePath(p)
  }

  const discardAndClose = (path: string): void => {
    buffers.current.delete(path)
    markDirty(path, false)
    setClosePrompt(null)
    closeTab(path)
  }

  const handleClose = (path: string, e?: React.MouseEvent): void => {
    e?.stopPropagation()
    if (dirtyTabs.has(path)) {
      setClosePrompt(path) // visa in-app-dialog (Spara / Spara inte / Avbryt)
      return
    }
    closeTab(path)
  }

  // Stäng flera flikar men behåll de med osparade ändringar
  const bulkClose = (targets: string[]): void => {
    const safe = targets.filter((p) => !dirtyTabs.has(p))
    safe.forEach((p) => buffers.current.delete(p))
    closeTabs(safe)
    const skipped = targets.length - safe.length
    if (skipped > 0) notify(`${skipped} flik(ar) med osparade ändringar behölls`, 'info')
  }

  const openTabMenu = (path: string, e: React.MouseEvent): void => {
    e.preventDefault()
    const idx = openTabs.indexOf(path)
    setTabMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Stäng', onClick: () => handleClose(path) },
        { label: 'Stäng andra', onClick: () => bulkClose(openTabs.filter((p) => p !== path)) },
        { label: 'Stäng till höger', onClick: () => bulkClose(openTabs.slice(idx + 1)) },
        ...(onOpenToSide
          ? [{ separator: true }, { label: 'Öppna till höger', onClick: () => onOpenToSide(path) }]
          : []),
        { separator: true },
        { label: 'Stäng alla', onClick: () => bulkClose(openTabs) }
      ]
    })
  }

  // Formatera hela dokumentet (Shift+Alt+F) – bevarar ångra-historik
  const formatDoc = async (): Promise<void> => {
    if (!canFormat(lang)) {
      notify('Ingen formaterare för den här filtypen', 'info')
      return
    }
    try {
      const formatted = await formatCode(editedRef.current, lang)
      const ed = editorRef.current
      const model = ed?.getModel()
      if (!ed || !model) return
      ed.executeEdits('format', [{ range: model.getFullModelRange(), text: formatted }])
      ed.pushUndoStop()
    } catch (e) {
      notify(`Formatering misslyckades: ${e instanceof Error ? e.message : e}`, 'error')
    }
  }
  formatDocRef.current = formatDoc

  return (
    <main className={groupClass} onMouseDownCapture={onFocus}>
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
            onContextMenu={(e) => openTabMenu(path, e)}
            title={path}
            onAuxClick={(e) => e.button === 1 && handleClose(path, e)}
            draggable
            onDragStart={() => (dragTabRef.current = path)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragTabRef.current && dragTabRef.current !== path)
                reorderTabs(dragTabRef.current, path)
              dragTabRef.current = null
            }}
          >
            <span className="tab-name">{path.split('/').pop()}</span>
            {dirtyTabs.has(path) && <span className="tab-dirty">•</span>}
            <button className="tab-close" title="Stäng" onClick={(e) => handleClose(path, e)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      {tabMenu && <ContextMenu menu={tabMenu} onClose={() => setTabMenu(null)} />}

      <div className="panel-header editor-toolbar">
        <span className="breadcrumbs" title={activePath}>
          {isConflicted && '⚠ '}
          {activePath.split('/').map((seg, i, arr) => (
            <span key={i}>
              <span className={i === arr.length - 1 ? 'crumb-file' : 'crumb'}>{seg}</span>
              {i < arr.length - 1 && <span className="crumb-sep">›</span>}
            </span>
          ))}
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
                <button className={mode === 'hunks' ? 'active' : ''} onClick={() => setMode('hunks')}>
                  Hunkar
                </button>
                <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>
                  Redigera
                </button>
              </div>
            )}
            <span className="muted small">{dirty ? 'Osparat · Ctrl+S' : 'Sparat'}</span>
            <button
              className="btn ghost icon"
              title="Fil-historik"
              onClick={() => setShowHistory(true)}
            >
              🕘
            </button>
          </>
        )}

        {onSplit && (
          <button
            className="btn ghost icon"
            title="Dela editor till höger"
            onClick={() => onSplit()}
          >
            ◫
          </button>
        )}
        {onCloseGroup && (
          <button className="btn ghost icon" title="Stäng grupp" onClick={() => onCloseGroup()}>
            ✕
          </button>
        )}
      </div>

      {isConflicted ? (
        <ConflictResolver path={activePath} onResolved={refresh} />
      ) : loading ? (
        <div className="empty-state">Laddar…</div>
      ) : canDiff && mode === 'hunks' ? (
        <div className="hunkview-wrap">
          <HunkView file={activePath} />
        </div>
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
          path={`file:///${activePath}`}
          value={working}
          onMount={(ed, monacoApi) => {
            editorRef.current = ed
            changesRef.current = null
            blameCol.current = null
            ed.onDidFocusEditorText(() => onFocus())
            // Spara / formatera – tangenter från keybindings.json (default
            // Ctrl+S resp. Shift+Alt+F). Läses vid mount; ändring gäller efter
            // att filen öppnats på nytt.
            const saveKb =
              comboToMonaco(monacoApi, bindingFor('save')) ??
              (monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS)
            ed.addCommand(saveKb, () => saveRef.current())
            const fmtKb =
              comboToMonaco(monacoApi, bindingFor('formatDocument')) ??
              (monacoApi.KeyMod.Shift | monacoApi.KeyMod.Alt | monacoApi.KeyCode.KeyF)
            ed.addCommand(fmtKb, () => formatDocRef.current())
            // Auto-spara vid fokusbyte
            ed.onDidBlurEditorText(() => {
              if (autoSaveRef.current === 'onFocusChange') saveRef.current()
            })
            setEditorReady((n) => n + 1)
          }}
          onChange={onEdit}
          options={{
            fontSize: settings.fontSize,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            stickyScroll: { enabled: true }
          }}
        />
      )}

      {showHistory && <FileHistoryModal file={activePath} onClose={() => setShowHistory(false)} />}

      {closePrompt && (
        <div className="overlay" onClick={() => setClosePrompt(null)}>
          <div className="modal confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">Spara ändringar?</div>
            <div className="modal-body">
              <p>
                Vill du spara ändringarna i <strong>{closePrompt.split('/').pop()}</strong>?
              </p>
              <p className="muted small">Ändringarna går förlorade om du inte sparar.</p>
              <div className="dialog-actions">
                <button className="btn ghost" onClick={() => setClosePrompt(null)}>
                  Avbryt
                </button>
                <button className="btn" onClick={() => discardAndClose(closePrompt)}>
                  Spara inte
                </button>
                <button
                  className="btn primary"
                  onClick={async () => {
                    const p = closePrompt
                    setClosePrompt(null)
                    if (await savePath(p)) closeTab(p)
                  }}
                >
                  Spara
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )

  function resolveSideFull(side: 'ours' | 'theirs'): void {
    if (activePath) resolveSide(activePath, side)
  }
}
