import { useEffect, useRef, useState } from 'react'
import { TerminalInstance } from './TerminalInstance'
import { useRepo } from '../state/RepoContext'

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

export function TerminalView(): JSX.Element {
  const { repo } = useRepo()
  const repoPath = repo?.path ?? 'none'
  const [state, setState] = useState<TermState>(() => loadState(repoPath))
  const prevPath = useRef(repoPath)

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
      const ids = s.ids.filter((x) => x !== id)
      if (ids.length === 0) {
        const counter = s.counter + 1
        const fresh = `${repoHash(repoPath)}-${counter}`
        return { ids: [fresh], active: fresh, counter }
      }
      return { ...s, ids, active: s.active === id ? ids[ids.length - 1] : s.active }
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
          >
            <span>▶ {i + 1}</span>
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
      </div>
      <div className="term-body">
        {state.ids.map((id) => (
          <div
            key={id}
            className="term-slot"
            style={{ display: state.active === id ? 'flex' : 'none' }}
          >
            <TerminalInstance id={id} active={state.active === id} />
          </div>
        ))}
      </div>
    </main>
  )
}
