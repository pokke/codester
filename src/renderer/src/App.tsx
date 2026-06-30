import { useEffect, useState } from 'react'
import { ActivityBar, type View } from './components/ActivityBar'
import { Sidebar } from './components/Sidebar'
import { EditorPane } from './components/EditorPane'
import { HistoryView } from './components/HistoryView'
import { GitHubPanel } from './components/GitHubPanel'
import { TerminalView } from './components/TerminalView'
import { Inspector } from './components/Inspector'
import { Resizer } from './components/Resizer'
import { StatusBar } from './components/StatusBar'
import { SettingsModal } from './components/SettingsModal'
import { CommandPalette } from './components/CommandPalette'
import { QuickOpen } from './components/QuickOpen'
import { AboutModal } from './components/AboutModal'
import { UpdateBanner } from './components/UpdateBanner'
import { WelcomeScreen } from './components/WelcomeScreen'
import { useRepo } from './state/RepoContext'
import './styles/app.css'

export function App(): JSX.Element {
  const { repo } = useRepo()
  const [view, setView] = useState<View>('editor')
  const [showSettings, setShowSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showQuickOpen, setShowQuickOpen] = useState(false)
  const [showInspector, setShowInspector] = useState(true)
  const [version, setVersion] = useState('0.1.0')

  useEffect(() => {
    window.api?.getVersion().then(setVersion).catch(() => {})
  }, [])

  // Globala kortkommandon
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        if (e.shiftKey) setShowPalette((v) => !v) // Ctrl+Shift+P → kommandopalett
        else setShowQuickOpen((v) => !v) // Ctrl+P → hoppa till fil
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setShowSettings(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const renderCenter = (): JSX.Element => {
    if (view === 'terminal') return <TerminalView />
    if (view === 'github') return <GitHubPanel />
    if (!repo) return <WelcomeScreen />
    if (view === 'history') return <HistoryView />
    return <EditorPane />
  }

  const showSidebar = repo && (view === 'editor' || view === 'history')
  const showInspectorPanel = repo && showInspector && view === 'editor'

  return (
    <div className="app">
      <div className="titlebar">
        <span className="brand">
          <span className="logo" />
          Codester{repo ? ` — ${repo.name}` : ''}
        </span>
        <span className="spacer" />
        {view === 'editor' && repo && (
          <button
            className="btn ghost icon"
            title="Visa/dölj commit-panel"
            onClick={() => setShowInspector((v) => !v)}
          >
            ▦
          </button>
        )}
      </div>

      <div className="body">
        <ActivityBar
          view={view}
          onChange={setView}
          onOpenSettings={() => setShowSettings(true)}
          onOpenPalette={() => setShowPalette(true)}
        />
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
          {showInspectorPanel && (
            <>
              <Resizer side="inspector" />
              <div
                className="pane inspector-pane"
                style={{ width: 'var(--inspector-w, 280px)' }}
              >
                <Inspector />
              </div>
            </>
          )}
        </div>
      </div>

      <UpdateBanner />

      <StatusBar version={version} />

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
