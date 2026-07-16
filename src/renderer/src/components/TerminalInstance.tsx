import { useEffect, useRef, useState } from 'react'
import { Terminal, type ILink } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { useSettings } from '../settings/SettingsContext'
import { useRepo } from '../state/RepoContext'
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
export function TerminalInstance({
  id,
  active,
  onOpenEditor
}: {
  id: string
  active: boolean
  onOpenEditor: () => void
}): JSX.Element {
  const { settings } = useSettings()
  const { repo, selectPath } = useRepo()
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const modeRef = useRef<'pty' | 'pipe'>('pty')
  const [mode, setMode] = useState<'pty' | 'pipe'>('pty')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [input, setInput] = useState('')
  const history = useRef<string[]>([])
  const histPos = useRef(-1)

  // Refs så länk-providern (registreras en gång) alltid ser aktuellt repo/callback.
  const openLinkRef = useRef<(raw: string, line?: number) => void>(() => {})
  openLinkRef.current = (raw: string, line?: number): void => {
    // Öppna filen i editorn; gör sökvägen repo-relativ om den ligger under repot.
    let rel = raw.replace(/\\/g, '/')
    const root = repo?.path?.replace(/\\/g, '/')
    if (root && rel.toLowerCase().startsWith(root.toLowerCase() + '/')) {
      rel = rel.slice(root.length + 1)
    }
    selectPath(rel, line)
    onOpenEditor()
  }

  useEffect(() => {
    if (!hostRef.current) return
    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'Consolas', monospace",
      fontSize: settings.fontSize,
      cursorBlink: true,
      convertEol: true,
      scrollback: 10000, // långa agent-sessioner → gott om historik att scrolla i
      theme: xtermTheme(getTheme(settings.themeId))
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    const search = new SearchAddon()
    term.loadAddon(search)
    searchRef.current = search
    term.open(hostRef.current)
    // GPU-renderare för slät utskrift vid hög genomströmning (t.ex. en agent
    // som streamar). Vid förlorad WebGL-kontext faller xterm tillbaka på DOM.
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      /* ingen WebGL → DOM-renderaren (default) används */
    }
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

    // Klickbara länkar: URL:er → öppna externt; fil[:rad[:kol]] → öppna i editorn.
    // (Bra för agentverktyg som Claude Code som skriver fil-referenser i utdata.)
    const linkProvider = term.registerLinkProvider({
      provideLinks(y, callback) {
        const bufLine = term.buffer.active.getLine(y - 1)
        if (!bufLine) {
          callback(undefined)
          return
        }
        const text = bufLine.translateToString(false)
        const links: ILink[] = []
        const push = (index: number, len: number, activate: () => void): void => {
          links.push({
            range: { start: { x: index + 1, y }, end: { x: index + len, y } },
            text: text.slice(index, index + len),
            activate
          })
        }
        let m: RegExpExecArray | null
        // URL:er
        const urlSpans: [number, number][] = []
        const urlRe = /https?:\/\/[^\s<>"'`)\]}]+/g
        while ((m = urlRe.exec(text))) {
          const url = m[0]
          urlSpans.push([m.index, m.index + url.length])
          push(m.index, url.length, () => window.open(url))
        }
        // fil[:rad[:kol]] – kräver filändelse för att undvika brus, och hoppar
        // träffar som ligger inuti en URL (t.ex. ".git" i en clone-url).
        // Ändelsen måste börja med bokstav → undviker att versionsnummer som
        // 3.14 eller v0.1.84 felaktigt blir "fil-länkar".
        const fileRe = /(?<![\w/\\.:-])((?:[A-Za-z]:[\\/])?[\w.\-/\\]+\.[A-Za-z][A-Za-z0-9]*)(?::(\d+))?(?::(\d+))?/g
        while ((m = fileRe.exec(text))) {
          const start = m.index
          if (urlSpans.some(([a, b]) => start >= a && start < b)) continue
          const path = m[1]
          const line = m[2] ? Number(m[2]) : undefined
          push(start, m[0].length, () => openLinkRef.current(path, line))
        }
        callback(links.length ? links : undefined)
      }
    })

    // Kopiera/klistra: Ctrl+Shift+C/V, samt Ctrl+C när något är markerat
    // (annars går Ctrl+C vidare som avbryt-signal till skalet).
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const k = e.key.toLowerCase()
      if (e.ctrlKey && !e.shiftKey && k === 'f') {
        setSearchOpen(true)
        return false
      }
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
    if (active) term.focus()

    // Fit kan misslyckas tidigt (cellstorleken går ej att mäta förrän fonten
    // målats) och lämnar då både xterm och skalet på default 80 kolumner. Kör
    // därför flera försök tills det stämmer, plus vid fönster-/host-storleks-
    // ändring, så terminalen alltid fyller hela ytan.
    const timers = [0, 50, 150, 350, 600].map((ms) => window.setTimeout(refit, ms))
    requestAnimationFrame(() => requestAnimationFrame(refit))
    const onWinResize = (): void => refit()
    window.addEventListener('resize', onWinResize)

    const ro = new ResizeObserver(() => refit())
    ro.observe(hostRef.current)

    return () => {
      // Döda INTE skalet här – bara koppla loss. Sessionen lever kvar i main
      // så terminalen finns kvar när panelen stängs/öppnas. (Explicit stängning
      // sker via ×-knappen som anropar window.api.terminal.kill.)
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', onWinResize)
      linkProvider.dispose()
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

  // Passa storleken när terminalen blir aktiv (kan ha varit dold → mätt som 0)
  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => requestAnimationFrame(refit))
      window.setTimeout(refit, 120)
      termRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Räkna om kolumner/rader mot värdens aktuella storlek och meddela skalet.
  const refit = (): void => {
    const fit = fitRef.current
    const term = termRef.current
    if (!fit || !term) return
    try {
      fit.fit()
      window.api.terminal.resize(id, term.cols, term.rows)
    } catch {
      /* host borta */
    }
  }
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

  // Sök i terminalens buffert (Ctrl+F).
  const findInTerm = (dir: 'next' | 'prev', q = searchTerm): void => {
    if (!q) return
    if (dir === 'next') searchRef.current?.findNext(q)
    else searchRef.current?.findPrevious(q)
  }
  const closeSearch = (): void => {
    setSearchOpen(false)
    termRef.current?.clearSelection()
    termRef.current?.focus()
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
      {searchOpen && (
        <div className="term-search">
          <input
            autoFocus
            placeholder="Sök i terminalen…"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              findInTerm('next', e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') findInTerm(e.shiftKey ? 'prev' : 'next')
              else if (e.key === 'Escape') closeSearch()
            }}
          />
          <button title="Föregående (Shift+Enter)" onClick={() => findInTerm('prev')}>
            ↑
          </button>
          <button title="Nästa (Enter)" onClick={() => findInTerm('next')}>
            ↓
          </button>
          <button title="Stäng (Esc)" onClick={closeSearch}>
            ✕
          </button>
        </div>
      )}
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
