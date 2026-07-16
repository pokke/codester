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
  // Terminalen är en center-vy som hålls monterad när den väl öppnats (så
  // scrollbacken lever kvar även när man växlar vy).
  const [termMounted, setTermMounted] = useState(false)
  const prevViewRef = useRef<View>('editor')
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

  // Växla en center-vy (terminal/problem): klick igen → tillbaka till förra vyn.
  const toggleCenter = (v: 'terminal' | 'problems'): void =>
    setView((cur) => (cur === v ? prevViewRef.current : v))

  // Kom ihåg senaste "innehållsvy" (så terminal/problem kan togglas tillbaka),
  // och montera terminalen så fort den öppnats (behåll scrollback).
  useEffect(() => {
    if (view !== 'terminal' && view !== 'problems') prevViewRef.current = view
    if (view === 'terminal') setTermMounted(true)
  }, [view])

  // Stänger man sista öppna filen i editorn → gå till terminalen (bra för
  // agent-flöde: klar med filerna, tillbaka till Claude Code).
  const prevTabsRef = useRef(openTabs.length)
  useEffect(() => {
    if (prevTabsRef.current > 0 && openTabs.length === 0 && view === 'editor') {
      setView('terminal')
    }
    prevTabsRef.current = openTabs.length
  }, [openTabs.length, view])

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
        toggleCenter('terminal')
        return
      }
      if (matches(e, 'toggleProblems')) {
        e.preventDefault()
        toggleCenter('problems')
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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activePath, openTabs, selectPath, settings.uiScale, update])

  // Center-panen för icke-terminal-vyer (terminalen renderas separat och hålls
  // monterad). Anropas bara när view !== 'terminal'.
  const renderCenter = (): JSX.Element => {
    if (view === 'github') return <GitHubPanel />
    if (view === 'problems') return <ProblemsView onOpenFile={() => setView('editor')} />
    if (!repo) return <WelcomeScreen />
    if (view === 'history') return <HistoryView />
    return <EditorArea />
  }

  // Sidofältet visas bredvid editor/historik OCH terminalen (standard-workbench,
  // så man kan bläddra i filer/grenar även med terminalen i mitten).
  const showSidebar =
    repo && !sidebarHidden && (view === 'editor' || view === 'history' || view === 'terminal')

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
            if (id === 'terminal' || id === 'problems') toggleCenter(id)
            else if (id === view && (id === 'editor' || id === 'history')) {
              // Klick på den redan aktiva vyn togglar sidofältet (VS Code-stil)
              setSidebarHidden((v) => !v)
            } else setView(id)
          }}
          onOpenSettings={() => setShowSettings(true)}
          onOpenPalette={() => setShowPalette(true)}
          badges={{ github: ghUnread }}
        />
        <div className="main-area">
          <div className="workbench">
            {showSidebar && (
              <>
                <div className="pane sidebar-pane" style={{ width: 'var(--sidebar-w, 250px)' }}>
                  <Sidebar
                    onOpenEditor={() => setView('editor')}
                    onCollapse={() => setSidebarHidden(true)}
                    tab={sidebarTab}
                    onTabChange={setSidebarTab}
                  />
                </div>
                <Resizer side="sidebar" />
              </>
            )}
            <div className="pane center-pane">
              {view !== 'terminal' && renderCenter()}
              {/* Terminalen hålls monterad (dold när annan vy visas) så
                  scrollback/agent-sessioner lever kvar. */}
              {termMounted && (
                <div
                  className="center-terminal"
                  style={{ display: view === 'terminal' ? 'flex' : 'none' }}
                >
                  <TerminalView
                    onOpenEditor={() => setView('editor')}
                    onAttention={() => {
                      // Terminalen (t.ex. en agent) larmade. Blinka i aktivitets-
                      // fältet om fönstret är obevakat + toasta om man inte tittar.
                      const unfocused = !document.hasFocus()
                      if (unfocused) window.api.window.flash()
                      if (unfocused || view !== 'terminal') {
                        notify('🔔 Terminalen behöver uppmärksamhet', 'info')
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <UpdateBanner />

      <StatusBar
        version={version}
        view={view}
        onShowTerminal={() => toggleCenter('terminal')}
        onShowProblems={() => toggleCenter('problems')}
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
          openPanel={toggleCenter}
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
