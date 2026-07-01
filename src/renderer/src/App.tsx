import { useEffect, useRef, useState } from 'react'
import { ActivityBar, type View } from './components/ActivityBar'
import { Sidebar } from './components/Sidebar'
import { EditorArea } from './components/EditorArea'
import { HistoryView } from './components/HistoryView'
import { GitHubPanel } from './components/GitHubPanel'
import { TerminalView } from './components/TerminalView'
import { ProblemsView } from './components/ProblemsView'
import { Resizer } from './components/Resizer'
import { StatusBar } from './components/StatusBar'
import { SettingsModal } from './components/SettingsModal'
import { CommandPalette } from './components/CommandPalette'
import { QuickOpen } from './components/QuickOpen'
import { AboutModal } from './components/AboutModal'
import { UpdateBanner } from './components/UpdateBanner'
import { WelcomeScreen } from './components/WelcomeScreen'
import { useRepo } from './state/RepoContext'
import { useSettings } from './settings/SettingsContext'
import { configureTypeScript } from './editor/monaco'
import { initLsp, setLspRoot } from './editor/lsp'
import './styles/app.css'

export function App(): JSX.Element {
  const { repo, activePath, openTabs, closeTab, selectPath } = useRepo()
  const { settings, update } = useSettings()
  const mruRef = useRef<string[]>([])
  const [view, setView] = useState<View>('editor')
  const [showSettings, setShowSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showQuickOpen, setShowQuickOpen] = useState(false)
  const [sidebarHidden, setSidebarHidden] = useState(false)
  const [panelTab, setPanelTab] = useState<'terminal' | 'problems' | null>(null)
  const [panelHeight, setPanelHeight] = useState<number>(
    () => Number(localStorage.getItem('codester.panelHeight')) || 240
  )
  const [version, setVersion] = useState('0.1.0')

  const togglePanel = (tab: 'terminal' | 'problems'): void =>
    setPanelTab((cur) => (cur === tab ? null : tab))

  useEffect(() => {
    localStorage.setItem('codester.panelHeight', String(panelHeight))
  }, [panelHeight])

  useEffect(() => {
    window.api?.getVersion().then(setVersion).catch(() => {})
    initLsp() // registrera LSP-providers en gång
  }, [])

  // Spåra senast använda flikar (för Ctrl+Tab)
  useEffect(() => {
    if (activePath) {
      mruRef.current = [activePath, ...mruRef.current.filter((p) => p !== activePath)]
    }
  }, [activePath])

  // Projektmedveten JS/TS: mata Monaco med tsconfig + filer + typer (en gång per repo)
  const tsConfiguredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!repo || tsConfiguredRef.current === repo.path) return
    tsConfiguredRef.current = repo.path
    setLspRoot(repo.path)
    window.api.lang.tsProject().then((r) => {
      if (r.ok && r.data) configureTypeScript(r.data)
    })
  }, [repo])

  // Globala kortkommandon (VS Code-stil). Monaco sköter Ctrl+Z/Y/F/H m.m.
  // när editorn har fokus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === 'p') {
        e.preventDefault()
        if (e.shiftKey) setShowPalette((v) => !v) // Ctrl+Shift+P → kommandopalett
        else setShowQuickOpen((v) => !v) // Ctrl+P → hoppa till fil
      } else if (k === ',') {
        e.preventDefault()
        setShowSettings(true)
      } else if (k === 'b') {
        e.preventDefault()
        setSidebarHidden((v) => !v) // Ctrl+B → visa/dölj sidofält
      } else if (e.key === '`') {
        e.preventDefault()
        togglePanel('terminal') // Ctrl+` → terminal-panel
      } else if (e.shiftKey && k === 'm') {
        e.preventDefault()
        togglePanel('problems') // Ctrl+Shift+M → problem-panel
      } else if (k === 'w') {
        e.preventDefault()
        if (activePath) closeTab(activePath) // Ctrl+W → stäng flik
      } else if (e.key === 'Tab') {
        e.preventDefault() // Ctrl+Tab → senast använda flik
        const prev = mruRef.current.find((p) => p !== activePath && openTabs.includes(p))
        if (prev) selectPath(prev)
      } else if (k === '=' || k === '+') {
        e.preventDefault() // Ctrl++ → zooma in
        update({ uiScale: Math.min(1.4, Math.round((settings.uiScale + 0.05) * 100) / 100) })
      } else if (k === '-') {
        e.preventDefault() // Ctrl+- → zooma ut
        update({ uiScale: Math.max(0.8, Math.round((settings.uiScale - 0.05) * 100) / 100) })
      } else if (k === '0') {
        e.preventDefault() // Ctrl+0 → återställ zoom
        update({ uiScale: 1 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activePath, openTabs, closeTab, selectPath, settings.uiScale, update])

  const renderCenter = (): JSX.Element => {
    if (view === 'github') return <GitHubPanel />
    if (!repo) return <WelcomeScreen />
    if (view === 'history') return <HistoryView />
    return <EditorArea />
  }

  const showSidebar = repo && !sidebarHidden && (view === 'editor' || view === 'history')

  return (
    <div className="app">
      <div className="titlebar">
        <span className="brand">
          <span className="logo" />
          Codester{repo ? ` — ${repo.name}` : ''}
        </span>
        <span className="spacer" />
      </div>

      <div className="body">
        <ActivityBar
          view={view}
          onChange={(id) => {
            if (id === 'terminal' || id === 'problems') togglePanel(id)
            else setView(id)
          }}
          onOpenSettings={() => setShowSettings(true)}
          onOpenPalette={() => setShowPalette(true)}
        />
        <div className="main-area">
        <div className="workbench">
          {showSidebar && (
            <>
              <div className="pane sidebar-pane" style={{ width: 'var(--sidebar-w, 250px)' }}>
                <Sidebar onOpenEditor={() => setView('editor')} />
              </div>
              <Resizer side="sidebar" />
            </>
          )}
          <div className="pane center-pane">{renderCenter()}</div>
        </div>

        {panelTab && (
          <>
            <div
              className="panel-resizer"
              title="Dra för att ändra höjd"
              onMouseDown={(e) => {
                e.preventDefault()
                const startY = e.clientY
                const startH = panelHeight
                const move = (ev: MouseEvent): void =>
                  setPanelHeight(
                    Math.max(120, Math.min(window.innerHeight - 200, startH + (startY - ev.clientY)))
                  )
                const up = (): void => {
                  window.removeEventListener('mousemove', move)
                  window.removeEventListener('mouseup', up)
                }
                window.addEventListener('mousemove', move)
                window.addEventListener('mouseup', up)
              }}
            />
            <div className="bottom-panel" style={{ height: panelHeight }}>
              <div className="panel-tabs">
                <button
                  className={panelTab === 'terminal' ? 'active' : ''}
                  onClick={() => setPanelTab('terminal')}
                >
                  Terminal
                </button>
                <button
                  className={panelTab === 'problems' ? 'active' : ''}
                  onClick={() => setPanelTab('problems')}
                >
                  Problem
                </button>
                <span className="spacer" />
                <button
                  className="btn ghost icon"
                  title="Stäng panel (Ctrl+`)"
                  onClick={() => setPanelTab(null)}
                >
                  ✕
                </button>
              </div>
              <div className="panel-content">
                <div className="panel-view" style={{ display: panelTab === 'terminal' ? 'flex' : 'none' }}>
                  <TerminalView />
                </div>
                {panelTab === 'problems' && <ProblemsView onOpenFile={() => setView('editor')} />}
              </div>
            </div>
          </>
        )}
        </div>
      </div>

      <UpdateBanner />

      <StatusBar
        version={version}
        panelTab={panelTab}
        onToggleTerminal={() => togglePanel('terminal')}
        onToggleProblems={() => togglePanel('problems')}
      />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showAbout && <AboutModal version={version} onClose={() => setShowAbout(false)} />}
      {showQuickOpen && (
        <QuickOpen
          onClose={() => setShowQuickOpen(false)}
          onPick={() => setView('editor')}
        />
      )}
      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          setView={setView}
          openPanel={togglePanel}
          openSettings={() => {
            setShowPalette(false)
            setShowSettings(true)
          }}
          openAbout={() => {
            setShowPalette(false)
            setShowAbout(true)
          }}
        />
      )}
    </div>
  )
}
