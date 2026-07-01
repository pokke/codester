import { useState } from 'react'
import { TerminalInstance } from './TerminalInstance'

// Håller listan av terminaler över panelens öppna/stäng (modul-nivå), så
// sessionerna (som lever kvar i main) återansluts när panelen öppnas igen.
const store: { ids: string[]; active: string; counter: number } = {
  ids: ['term-1'],
  active: 'term-1',
  counter: 1
}

export function TerminalView(): JSX.Element {
  const [ids, setIds] = useState<string[]>(store.ids)
  const [active, setActive] = useState<string>(store.active)

  const commit = (nextIds: string[], nextActive: string): void => {
    store.ids = nextIds
    store.active = nextActive
    setIds(nextIds)
    setActive(nextActive)
  }

  const addTerminal = (): void => {
    store.counter++
    const id = `term-${store.counter}`
    commit([...ids, id], id)
  }

  const closeTerminal = (id: string): void => {
    window.api.terminal.kill(id)
    const remaining = ids.filter((x) => x !== id)
    if (remaining.length === 0) {
      store.counter++
      const fresh = `term-${store.counter}`
      commit([fresh], fresh)
    } else {
      commit(remaining, active === id ? remaining[remaining.length - 1] : active)
    }
  }

  return (
    <main className="panel center terminal-view">
      <div className="term-tabs">
        {ids.map((id, i) => (
          <div
            key={id}
            className={`term-tab ${active === id ? 'active' : ''}`}
            onClick={() => commit(ids, id)}
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
        {ids.map((id) => (
          <div
            key={id}
            className="term-slot"
            style={{ display: active === id ? 'flex' : 'none' }}
          >
            <TerminalInstance id={id} active={active === id} />
          </div>
        ))}
      </div>
    </main>
  )
}
