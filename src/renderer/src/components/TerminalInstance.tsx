import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
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

// En enskild terminal (xterm) kopplad till en skalsession i main via id.
export function TerminalInstance({ id, active }: { id: string; active: boolean }): JSX.Element {
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

    // Ladda pipe-lägets kommandohistorik för just denna terminal
    try {
      history.current = JSON.parse(localStorage.getItem(`codester.termhist.${id}`) || '[]')
    } catch {
      history.current = []
    }

    const unsubData = window.api.terminal.onData((d) => {
      if (d.id === id) term.write(d.text)
    })
    const unsubMode = window.api.terminal.onMode((d) => {
      if (d.id !== id) return
      modeRef.current = d.mode as 'pty' | 'pipe'
      setMode(d.mode as 'pty' | 'pipe')
    })

    term.onData((data) => {
      if (modeRef.current === 'pty') window.api.terminal.input(id, data)
    })
    term.onResize(({ cols, rows }) => window.api.terminal.resize(id, cols, rows))

    // Kopiera/klistra: Ctrl+Shift+C/V, samt Ctrl+C när något är markerat
    // (annars går Ctrl+C vidare som avbryt-signal till skalet).
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const k = e.key.toLowerCase()
      if (e.ctrlKey && e.shiftKey && k === 'c') {
        copySelection()
        return false
      }
      if (e.ctrlKey && e.shiftKey && k === 'v') {
        pasteClipboard()
        return false
      }
      if (e.ctrlKey && !e.shiftKey && k === 'c' && term.hasSelection()) {
        copySelection()
        return false
      }
      return true
    })

    window.api.terminal.ensure(id)
    window.api.terminal.resize(id, term.cols, term.rows)
    if (active) term.focus()

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* host borta */
      }
    })
    ro.observe(hostRef.current)

    return () => {
      // Döda INTE skalet här – bara koppla loss. Sessionen lever kvar i main
      // så terminalen finns kvar när panelen stängs/öppnas. (Explicit stängning
      // sker via ×-knappen som anropar window.api.terminal.kill.)
      ro.disconnect()
      unsubData()
      unsubMode()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = xtermTheme(getTheme(settings.themeId))
    term.options.fontSize = settings.fontSize
    fitRef.current?.fit()
  }, [settings.themeId, settings.fontSize])

  // Passa storleken när terminalen blir aktiv (kan ha varit dold)
  useEffect(() => {
    if (active) {
      fitRef.current?.fit()
      termRef.current?.focus()
    }
  }, [active])

  // Kopiera aktuell markering till systemets urklipp.
  const copySelection = (): void => {
    const sel = termRef.current?.getSelection()
    if (sel) {
      window.api.clipboard.write(sel)
      termRef.current?.clearSelection()
    }
  }
  // Klistra in urklippet i skalet (endast pty-läge; pipe-läget har eget fält).
  const pasteClipboard = async (): Promise<void> => {
    if (modeRef.current !== 'pty') return
    const r = await window.api.clipboard.read()
    if (r.ok && r.data) window.api.terminal.input(id, r.data)
  }
  // Högerklick: kopiera om något är markerat, annars klistra in.
  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    if (termRef.current?.hasSelection()) copySelection()
    else pasteClipboard()
  }

  const run = (): void => {
    const cmd = input
    termRef.current?.write(`\r\n\x1b[36m❯\x1b[0m ${cmd}\r\n`)
    window.api.terminal.input(id, `${cmd}\n`)
    if (cmd.trim()) {
      history.current.unshift(cmd)
      try {
        localStorage.setItem(`codester.termhist.${id}`, JSON.stringify(history.current.slice(0, 100)))
      } catch {
        /* ignorera */
      }
    }
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
    <div className="terminal-instance">
      <div
        className="xterm-host"
        ref={hostRef}
        onClick={() => termRef.current?.focus()}
        onContextMenu={onContextMenu}
      />
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
    </div>
  )
}
