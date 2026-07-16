import { useEffect, useRef, useState } from 'react'
import { TerminalInstance } from './TerminalInstance'
import { useRepo } from '../state/RepoContext'
import { useToast } from '../ui/Toast'

// Terminal-id kodar repo (kort hash) + nummer, så de är unika mellan repon och
// stabila mellan omstarter → varje terminal återfår sin egen historikfil.
function repoHash(path: string): string {
  let h = 0
  for (let i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// Hur många terminaler som visas samtidigt i respektive layout.
type Layout = 'single' | 'cols2' | 'rows2' | 'grid4'
const PANES: Record<Layout, number> = { single: 1, cols2: 2, rows2: 2, grid4: 4 }
const LAYOUTS: { id: Layout; icon: string; label: string }[] = [
  { id: 'single', icon: '▢', label: 'En terminal' },
  { id: 'cols2', icon: '◫', label: '2 sida vid sida' },
  { id: 'rows2', icon: '⊟', label: '2 på varandra' },
  { id: 'grid4', icon: '⊞', label: '2×2 (fyra)' }
]

interface TermState {
  ids: string[]
  active: string
  counter: number
  layout: Layout
}

function keyFor(repoPath: string): string {
  return `codester.terminals.${repoPath}`
}

function loadState(repoPath: string): TermState {
  const h = repoHash(repoPath)
  try {
    const raw = localStorage.getItem(keyFor(repoPath))
    if (raw) {
      const s = JSON.parse(raw) as TermState
      if (Array.isArray(s.ids) && s.ids.length && s.active)
        return { ...s, layout: s.layout ?? 'single' }
    }
  } catch {
    /* falla tillbaka */
  }
  return { ids: [`${h}-1`], active: `${h}-1`, counter: 1, layout: 'single' }
}

export function TerminalView({
  visible,
  onOpenEditor,
  onAttention
}: {
  visible: boolean
  onOpenEditor: () => void
  onAttention: () => void
}): JSX.Element {
  const { repo } = useRepo()
  const { notify } = useToast()
  const repoPath = repo?.path ?? 'none'
  const [state, setState] = useState<TermState>(() => loadState(repoPath))
  const [hasClaude, setHasClaude] = useState<boolean | null>(null)
  const prevPath = useRef(repoPath)

  useEffect(() => {
    window.api.terminal.hasCommand('claude').then((r) => setHasClaude(r.ok ? r.data : true))
  }, [])

  // Byt terminaluppsättning när repo byts
  useEffect(() => {
    if (prevPath.current !== repoPath) {
      prevPath.current = repoPath
      setState(loadState(repoPath))
    }
  }, [repoPath])

  // Spara per repo
  useEffect(() => {
    localStorage.setItem(keyFor(repoPath), JSON.stringify(state))
  }, [repoPath, state])

  const paneCount = PANES[state.layout]
  const visibleIds = state.ids.slice(0, paneCount)
  const focused = visibleIds.includes(state.active) ? state.active : (visibleIds[0] ?? state.active)

  // Starta Claude Code i den fokuserade terminalen (skickar `claude` + Enter).
  const startClaude = (): void => {
    if (hasClaude === false) {
      notify('Claude Code (`claude`) hittades inte i PATH. Installera det först.', 'error')
      return
    }
    window.api.terminal.input(focused, 'claude\r')
  }

  const newId = (counter: number): string => `${repoHash(repoPath)}-${counter}`

  // Ny terminal – väx layouten så den nya rutan syns.
  const addTerminal = (): void => {
    setState((s) => {
      const counter = s.counter + 1
      const ids = [...s.ids, newId(counter)]
      let layout = s.layout
      if (ids.length > PANES[layout]) layout = ids.length >= 3 ? 'grid4' : 'cols2'
      return { ids, active: newId(counter), counter, layout }
    })
  }

  // Välj layout – fyll på med nya terminaler så alla rutor har en session.
  const setLayout = (layout: Layout): void => {
    setState((s) => {
      let counter = s.counter
      const ids = [...s.ids]
      while (ids.length < PANES[layout]) {
        counter++
        ids.push(newId(counter))
      }
      return { ...s, ids, counter, layout, active: ids.includes(s.active) ? s.active : ids[0] }
    })
  }

  // Fokusera en session; ligger den utanför de synliga rutorna, flytta in den.
  const focusSession = (id: string): void => {
    setState((s) => {
      const ids =
        s.ids.indexOf(id) >= PANES[s.layout] ? [id, ...s.ids.filter((x) => x !== id)] : s.ids
      return { ...s, ids, active: id }
    })
  }

  const closeTerminal = (id: string): void => {
    window.api.terminal.kill(id)
    setState((s) => {
      const idx = s.ids.indexOf(id)
      const ids = s.ids.filter((x) => x !== id)
      if (ids.length === 0) {
        const counter = s.counter + 1
        const fresh = newId(counter)
        return { ids: [fresh], active: fresh, counter, layout: 'single' }
      }
      const nextActive = s.active === id ? (ids[idx - 1] ?? ids[idx] ?? ids[0]) : s.active
      // Krymp till en ruta om bara en session finns kvar
      const layout = ids.length <= 1 ? 'single' : s.layout
      return { ...s, ids, active: nextActive, layout }
    })
  }

  return (
    <main className="panel center terminal-view">
      <div className="term-tabs">
        {state.ids.map((id, i) => (
          <div
            key={id}
            className={`term-tab ${focused === id ? 'active' : ''}`}
            onClick={() => focusSession(id)}
            onAuxClick={(e) => e.button === 1 && closeTerminal(id)}
            title={`Terminal ${i + 1} · mittenklick stänger`}
          >
            <span className="term-tab-label">▶ {i + 1}</span>
            <button
              className="term-tab-close"
              title="Stäng terminal"
              onClick={(e) => {
                e.stopPropagation()
                closeTerminal(id)
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="term-add" title="Ny terminal" onClick={addTerminal}>
          +
        </button>
        <div className="term-layout-picker" title="Terminallayout">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              className={state.layout === l.id ? 'active' : ''}
              title={l.label}
              onClick={() => setLayout(l.id)}
            >
              {l.icon}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button
          className={`term-claude ${hasClaude === false ? 'missing' : ''}`}
          title={
            hasClaude === false
              ? 'Claude Code hittades inte i PATH'
              : 'Starta Claude Code i den fokuserade terminalen'
          }
          onClick={startClaude}
        >
          ▷ Claude Code
        </button>
      </div>
      <div className={`term-grid ${state.layout}`}>
        {visibleIds.map((id) => (
          <div
            key={id}
            className={`term-cell ${focused === id ? 'focused' : ''}`}
            onMouseDown={() => {
              if (focused !== id) focusSession(id)
            }}
          >
            <TerminalInstance
              id={id}
              active={focused === id}
              visible={visible}
              onOpenEditor={onOpenEditor}
              onAttention={onAttention}
            />
          </div>
        ))}
      </div>
    </main>
  )
}
