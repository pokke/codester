import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useRepo } from '../state/RepoContext'
import { useSettings } from '../settings/SettingsContext'
import { getTheme, type Theme } from '../themes/themes'

function xtermTheme(t: Theme): Record<string, string> {
  const c = t.colors
  return {
    background: c.bg,
    foreground: c.text,
    cursor: c.accent,
    cursorAccent: c.bg,
    selectionBackground: `${c.accent}55`,
    black: c.bg,
    red: c.removed,
    green: c.added,
    yellow: c.synType,
    blue: c.synKeyword,
    magenta: c.synNumber,
    cyan: c.synFunction,
    white: c.text,
    brightBlack: c.textMuted,
    brightRed: c.removed,
    brightGreen: c.added,
    brightYellow: c.synType,
    brightBlue: c.synKeyword,
    brightMagenta: c.synNumber,
    brightCyan: c.synFunction,
    brightWhite: c.text
  }
}

export function TerminalView(): JSX.Element {
  const { repo } = useRepo()
  const { settings } = useSettings()
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const modeRef = useRef<'pty' | 'pipe'>('pty')
  const [mode, setMode] = useState<'pty' | 'pipe'>('pty')
  const [input, setInput] = useState('')
  const history = useRef<string[]>([])
  const histPos = useRef(-1)

  useEffect(() => {
    if (!hostRef.current) return
    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'Consolas', monospace",
      fontSize: settings.fontSize,
      cursorBlink: true,
      convertEol: true,
      theme: xtermTheme(getTheme(settings.themeId))
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const unsubData = window.api.terminal.onData((d) => term.write(d))
    const unsubMode = window.api.terminal.onMode((m) => {
      modeRef.current = m as 'pty' | 'pipe'
      setMode(m as 'pty' | 'pipe')
    })

    // Tangenttryck i terminalen → skicka till PTY (riktig interaktivitet).
    // I pipe-läge sköts inmatningen av textfältet nedanför istället.
    term.onData((d) => {
      if (modeRef.current === 'pty') window.api.terminal.input(d)
    })
    term.onResize(({ cols, rows }) => window.api.terminal.resize(cols, rows))

    window.api.terminal.ensure()
    window.api.terminal.resize(term.cols, term.rows)
    term.focus()

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* host borttagen */
      }
    })
    ro.observe(hostRef.current)

    return () => {
      ro.disconnect()
      unsubData()
      unsubMode()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = xtermTheme(getTheme(settings.themeId))
    term.options.fontSize = settings.fontSize
    fitRef.current?.fit()
  }, [settings.themeId, settings.fontSize])

  // Radvis inmatning (endast pipe-fallback)
  const run = (): void => {
    const cmd = input
    termRef.current?.write(`\r\n\x1b[36m❯\x1b[0m ${cmd}\r\n`)
    window.api.terminal.input(`${cmd}\n`)
    if (cmd.trim()) history.current.unshift(cmd)
    histPos.current = -1
    setInput('')
  }
  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') run()
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (histPos.current < history.current.length - 1) setInput(history.current[++histPos.current])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (histPos.current > 0) setInput(history.current[--histPos.current])
      else {
        histPos.current = -1
        setInput('')
      }
    }
  }

  return (
    <main className="panel center">
      <div className="panel-header editor-toolbar">
        <span>
          Terminal {repo ? `· ${repo.name}` : ''}
          {mode === 'pipe' && <span className="muted small"> · enkelt läge</span>}
        </span>
        <button className="btn ghost icon" title="Rensa" onClick={() => termRef.current?.clear()}>
          ⌫
        </button>
        <button
          className="btn ghost icon"
          title="Starta om skalet"
          onClick={() => {
            termRef.current?.reset()
            window.api.terminal.kill()
            window.api.terminal.start()
          }}
        >
          ⟳
        </button>
      </div>
      <div className="xterm-host" ref={hostRef} onClick={() => termRef.current?.focus()} />
      {mode === 'pipe' && (
        <div className="terminal-input">
          <span className="prompt">❯</span>
          <input
            value={input}
            placeholder="Skriv ett kommando och tryck Enter…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
      )}
    </main>
  )
}
