import { useEffect, useRef, useState } from 'react'
import { ActivityBar, type View } from './components/ActivityBar'
import { Sidebar, type SidebarTab } from './components/Sidebar'
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
import { useToast } from './ui/Toast'
import { configureTypeScript } from './editor/monaco'
import { initLsp, setLspRoot } from './editor/lsp'
import { registerSnippets } from './editor/snippets'
import { loadKeybindings, matches } from './settings/keybindings'
import './styles/app.css'

export function App(): JSX.Element {
  const { repo, activePath, openTabs, selectPath } = useRepo()
  const { settings, update } = useSettings()
  const { notify } = useToast()
  const mruRef = useRef<string[]>([])
  const [view, setView] = useState<View>('editor')
  const [showSettings, setShowSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showQuickOpen, setShowQuickOpen] = useState(false)
  const [sidebarHidden, setSidebarHidden] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('files')
  const [panelTab, setPanelTab] = useState<'terminal' | 'problems' | null>(() => {
    const saved = localStorage.getItem('codester.panelTab')
    return saved === 'terminal' || saved === 'problems' ? saved : null
  })
  const [panelHeight, setPanelHeight] = useState<number>(
    () => Number(localStorage.getItem('codester.panelHeight')) || 240
  )
  const [version, setVersion] = useState('0.1.0')
  const [ghUnread, setGhUnread] = useState(0)

  // Polla GitHub-notiser (om inloggad) för badge på activitybaren
  useEffect(() => {
    let stopped = false
    let lastRun = 0
    const tick = async (): Promise<void> => {
      lastRun = Date.now()
      const has = await window.api.github.hasToken()
      if (has.ok && has.data) {
        const c = await window.api.github.notificationCount()
        if (!stopped && c.ok) setGhUnread(c.data)
      } else if (!stopped) setGhUnread(0)
    }
    tick()
    const id = setInterval(tick, 180000)
    // Fönsterfokus kan trigga tätt (alt-tab) – throttla till max var 60:e sek
    // så vi inte spammar API:t. ETag-cachen gör en 304 billig, men slipp ändå.
    const onFocus = (): void => {
      if (Date.now() - lastRun > 60000) tick()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      stopped = true
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const togglePanel = (tab: 'terminal' | 'problems'): void =>
    setPanelTab((cur) => (cur === tab ? null : tab))

  useEffect(() => {
    localStorage.setItem('codester.panelHeight', String(panelHeight))
  }, [panelHeight])

  // Håll panelhöjden inom fönstret (ett sparat värde från ett större fönster
  // får annars panelen att svämma över statusraden). Klampa vid start + resize.
  useEffect(() => {
    const clamp = (): void =>
      setPanelHeight((h) => Math.max(120, Math.min(window.innerHeight - 200, h)))
    clamp()
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [])

  // Maximerad panel: terminalen/problem fyller hela ytan (dölj editorn) – bäst
  // för att köra en agent (t.ex. Claude Code) i terminalen. Kom ihåg valet.
  const [panelMax, setPanelMax] = useState(() => localStorage.getItem('codester.panelMax') === '1')
  useEffect(() => {
    localStorage.setItem('codester.panelMax', panelMax ? '1' : '0')
  }, [panelMax])
  // Läses i den globala tangenthanteraren utan att göra om lyssnaren.
  const panelTabRef = useRef(panelTab)
  panelTabRef.current = panelTab
  const maximized = !!panelTab && panelMax

  // Kom ihåg om terminal-/problem-panelen var öppen (överlever omstart/uppdatering)
  useEffect(() => {
    localStorage.setItem('codester.panelTab', panelTab ?? '')
  }, [panelTab])

  useEffect(() => {
    window.api?.getVersion().then(setVersion).catch(() => {})
    initLsp() // registrera LSP-providers en gång
    registerSnippets() // registrera snippet-completion (snippets/<lang>.json)
    loadKeybindings() // läs keybindings.json (annars standard)
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
      // Konfigurerbara kommandon (keybindings.json)
      if (matches(e, 'quickOpen')) {
        e.preventDefault()
        setShowQuickOpen((v) => !v)
        return
      }
      if (matches(e, 'commandPalette')) {
        e.preventDefault()
        setShowPalette((v) => !v)
        return
      }
      if (matches(e, 'openSettings')) {
        e.preventDefault()
        setShowSettings(true)
        return
      }
      if (matches(e, 'toggleSidebar')) {
        e.preventDefault()
        setSidebarHidden((v) => !v)
        return
      }
      if (matches(e, 'toggleTerminal')) {
        e.preventDefault()
        togglePanel('terminal')
        return
      }
      if (matches(e, 'toggleProblems')) {
        e.preventDefault()
        togglePanel('problems')
        return
      }
      // Fasta specialtangenter: Ctrl+Tab (MRU) + zoom
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      if (e.key === 'Tab') {
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
      } else if (e.shiftKey && e.key === 'Enter' && panelTabRef.current) {
        e.preventDefault() // Ctrl+Shift+Enter → maximera/återställ panelen (när öppen)
        setPanelMax((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activePath, openTabs, selectPath, settings.uiScale, update])

  const renderCenter = (): JSX.Element => {
    if (view === 'github') return <GitHubPanel />
    if (!repo) return <WelcomeScreen />
    if (view === 'history') return <HistoryView />
    return <EditorArea />
  }

  // Sidofältet visas i editor-/historik-vyn – och även bredvid en maximerad
  // terminal, så man kan bläddra i filer/grenar med terminalen stor.
  const showSidebar =
    repo && !sidebarHidden && (maximized || view === 'editor' || view === 'history')

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
            else {
              // Byter man till en riktig vy medan panelen är maximerad måste vi
              // återställa den, annars göms vyn bakom terminalen.
              setPanelMax(false)
              setView(id)
            }
          }}
          onOpenSettings={() => setShowSettings(true)}
          onOpenPalette={() => setShowPalette(true)}
          badges={{ github: ghUnread }}
        />
        <div className={`main-area ${maximized ? 'row-max' : ''}`}>
        {(!maximized || showSidebar) && (
          <div className={`workbench ${maximized ? 'sidebar-only' : ''}`}>
            {showSidebar && (
              <>
                <div className="pane sidebar-pane" style={{ width: 'var(--sidebar-w, 250px)' }}>
                  <Sidebar
                    onOpenEditor={() => {
                      setPanelMax(false)
                      setView('editor')
                    }}
                    tab={sidebarTab}
                    onTabChange={setSidebarTab}
                  />
                </div>
                <Resizer side="sidebar" />
              </>
            )}
            {!maximized && <div className="pane center-pane">{renderCenter()}</div>}
          </div>
        )}

        {panelTab && (
          <>
            {!maximized && (
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
            )}
            <div
              className={`bottom-panel ${maximized ? 'maximized' : ''}`}
              style={maximized ? undefined : { height: panelHeight }}
            >
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
                  title={
                    maximized
                      ? 'Återställ panelstorlek (Ctrl+Shift+Enter)'
                      : 'Maximera panelen – fyll ytan (Ctrl+Shift+Enter)'
                  }
                  onClick={() => setPanelMax((v) => !v)}
                >
                  {maximized ? '⤡' : '⤢'}
                </button>
                <button
                  className="btn ghost icon"
                  title="Stäng panel"
                  onClick={() => setPanelTab(null)}
                >
                  ✕
                </button>
              </div>
              <div className="panel-content">
                <div className="panel-view" style={{ display: panelTab === 'terminal' ? 'flex' : 'none' }}>
                  <TerminalView
                    onOpenEditor={() => {
                      setPanelMax(false)
                      setView('editor')
                    }}
                    onAttention={() => {
                      // Terminalen (t.ex. en agent) larmade. Blinka i aktivitets-
                      // fältet om fönstret är obevakat + toasta om man inte redan
                      // tittar på terminalen.
                      const unfocused = !document.hasFocus()
                      if (unfocused) window.api.window.flash()
                      if (unfocused || panelTabRef.current !== 'terminal') {
                        notify('🔔 Terminalen behöver uppmärksamhet', 'info')
                      }
                    }}
                  />
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
        onShowTerminal={() => setPanelTab('terminal')}
        onShowProblems={() => setPanelTab('problems')}
        onOpenChanges={() => {
          setSidebarHidden(false)
          setSidebarTab('changes')
          setView('editor')
        }}
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
