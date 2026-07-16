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

interface TermState {
  ids: string[]
  active: string
  counter: number
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
      if (Array.isArray(s.ids) && s.ids.length && s.active) return s
    }
  } catch {
    /* falla tillbaka */
  }
  return { ids: [`${h}-1`], active: `${h}-1`, counter: 1 }
}

export function TerminalView({ onOpenEditor }: { onOpenEditor: () => void }): JSX.Element {
  const { repo } = useRepo()
  const { notify } = useToast()
  const repoPath = repo?.path ?? 'none'
  const [state, setState] = useState<TermState>(() => loadState(repoPath))
  const [hasClaude, setHasClaude] = useState<boolean | null>(null)
  const prevPath = useRef(repoPath)

  useEffect(() => {
    window.api.terminal.hasCommand('claude').then((r) => setHasClaude(r.ok ? r.data : true))
  }, [])

  // Starta Claude Code i den aktiva terminalen (skickar `claude` + Enter).
  const startClaude = (): void => {
    if (hasClaude === false) {
      notify('Claude Code (`claude`) hittades inte i PATH. Installera det först.', 'error')
      return
    }
    window.api.terminal.input(state.active, 'claude\r')
  }

  // Byt terminaluppsättning när repo byts
  useEffect(() => {
    if (prevPath.current !== repoPath) {
      prevPath.current = repoPath
      setState(loadState(repoPath))
    }
  }, [repoPath])

  // Spara listan per repo
  useEffect(() => {
    localStorage.setItem(keyFor(repoPath), JSON.stringify(state))
  }, [repoPath, state])

  const commit = (patch: Partial<TermState>): void => setState((s) => ({ ...s, ...patch }))

  const addTerminal = (): void => {
    const counter = state.counter + 1
    const id = `${repoHash(repoPath)}-${counter}`
    setState((s) => ({ ids: [...s.ids, id], active: id, counter }))
  }

  const closeTerminal = (id: string): void => {
    window.api.terminal.kill(id)
    setState((s) => {
      const idx = s.ids.indexOf(id)
      const ids = s.ids.filter((x) => x !== id)
      if (ids.length === 0) {
        const counter = s.counter + 1
        const fresh = `${repoHash(repoPath)}-${counter}`
        return { ids: [fresh], active: fresh, counter }
      }
      // Aktivera grannen (föregående om möjligt, annars nästa)
      const nextActive = s.active === id ? (ids[idx - 1] ?? ids[idx] ?? ids[0]) : s.active
      return { ...s, ids, active: nextActive }
    })
  }

  return (
    <main className="panel center terminal-view">
      <div className="term-tabs">
        {state.ids.map((id, i) => (
          <div
            key={id}
            className={`term-tab ${state.active === id ? 'active' : ''}`}
            onClick={() => commit({ active: id })}
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
        <span className="spacer" />
        <button
          className={`term-claude ${hasClaude === false ? 'missing' : ''}`}
          title={
            hasClaude === false
              ? 'Claude Code hittades inte i PATH'
              : 'Starta Claude Code i den aktiva terminalen'
          }
          onClick={startClaude}
        >
          ▷ Claude Code
        </button>
      </div>
      <div className="term-body">
        {state.ids.map((id) => (
          <div
            key={id}
            className="term-slot"
            style={{ display: state.active === id ? 'flex' : 'none' }}
          >
            <TerminalInstance id={id} active={state.active === id} onOpenEditor={onOpenEditor} />
          </div>
        ))}
      </div>
    </main>
  )
}
