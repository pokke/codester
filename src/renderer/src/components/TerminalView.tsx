import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useRepo } from '../state/RepoContext'
import { useSettings } from '../settings/SettingsContext'
import { getTheme, type Theme } from '../themes/themes'

// Bygg ett xterm-tema från Codesters apptema (xterm kräver hex, inte CSS-vars).
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
  const [input, setInput] = useState('')
  const history = useRef<string[]>([])
  const histPos = useRef(-1)

  // Skapa terminalen en gång
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

    const unsub = window.api.terminal.onData((d) => term.write(d))
    window.api.terminal.ensure()

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* host kan vara borttagen */
      }
    })
    ro.observe(hostRef.current)

    return () => {
      ro.disconnect()
      unsub()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Uppdatera tema/fontstorlek live
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = xtermTheme(getTheme(settings.themeId))
    term.options.fontSize = settings.fontSize
    fitRef.current?.fit()
  }, [settings.themeId, settings.fontSize])

  const run = (): void => {
    const term = termRef.current
    if (!term) return
    const cmd = input
    // Eko av kommandot med en färgad prompt
    term.write(`\r\n\x1b[36m❯\x1b[0m ${cmd}\r\n`)
    window.api.terminal.input(`${cmd}\n`)
    if (cmd.trim()) history.current.unshift(cmd)
    histPos.current = -1
    setInput('')
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
        <button
          className="btn ghost icon"
          title="Rensa"
          onClick={() => termRef.current?.clear()}
        >
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
      <div className="xterm-host" ref={hostRef} />
      <div className="terminal-input">
        <span className="prompt">❯</span>
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
