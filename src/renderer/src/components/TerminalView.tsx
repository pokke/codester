import { useEffect, useRef, useState } from 'react'
import { useRepo } from '../state/RepoContext'

// Tar bort ANSI-escape-sekvenser så utdata blir läsbar i en enkel <pre>.
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
}

export function TerminalView(): JSX.Element {
  const { repo, refresh } = useRepo()
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const outRef = useRef<HTMLPreElement>(null)
  const history = useRef<string[]>([])
  const histPos = useRef(-1)

  // Starta (och vid repo-byte: starta om) terminalen
  useEffect(() => {
    setOutput('')
    const unsub = window.api.terminal.onData((d) => setOutput((prev) => prev + stripAnsi(d)))
    window.api.terminal.start()
    return () => {
      unsub()
      window.api.terminal.kill()
    }
  }, [repo?.path])

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight
  }, [output])

  const run = (): void => {
    const cmd = input
    setOutput((prev) => `${prev}\n$ ${cmd}\n`)
    window.api.terminal.input(`${cmd}\n`)
    if (cmd.trim()) history.current.unshift(cmd)
    histPos.current = -1
    setInput('')
    // Uppdatera git-status efter ett tag (kommandot kan ha ändrat repot)
    setTimeout(() => refresh(), 600)
  }

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') run()
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (histPos.current < history.current.length - 1) {
        histPos.current++
        setInput(history.current[histPos.current])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (histPos.current > 0) {
        histPos.current--
        setInput(history.current[histPos.current])
      } else {
        histPos.current = -1
        setInput('')
      }
    }
  }

  return (
    <main className="panel center">
      <div className="panel-header editor-toolbar">
        <span>Terminal {repo ? `· ${repo.name}` : ''}</span>
        <button className="btn ghost icon" title="Rensa" onClick={() => setOutput('')}>
          ⌫
        </button>
        <button
          className="btn ghost icon"
          title="Starta om"
          onClick={() => {
            window.api.terminal.kill()
            setOutput('')
            window.api.terminal.start()
          }}
        >
          ⟳
        </button>
      </div>
      <pre className="terminal-output" ref={outRef}>
        {output}
      </pre>
      <div className="terminal-input">
        <span className="prompt">$</span>
        <input
          autoFocus
          value={input}
          placeholder="Skriv ett kommando och tryck Enter…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
        />
      </div>
    </main>
  )
}
