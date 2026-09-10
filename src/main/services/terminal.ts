import { spawn, execFile, execFileSync, type ChildProcessWithoutNullStreams } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { app, type WebContents } from 'electron'

// Flera terminaler samtidigt: varje terminal är en egen session (pty eller
// pipe-fallback) nycklad på ett id. Utdata taggas med id:t så renderern kan
// rikta den till rätt xterm. Föredrar riktig PTY (@lydell/node-pty), annars
// pipe-baserat PowerShell-skal.

type PtyModule = typeof import('@lydell/node-pty')
type IPty = import('@lydell/node-pty').IPty

let ptyLib: PtyModule | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ptyLib = require('@lydell/node-pty')
} catch {
  ptyLib = null
}

interface Session {
  pty: IPty | null
  pipe: ChildProcessWithoutNullStreams | null
  // Aktuell renderer. Uppdateras vid återanslutning (t.ex. efter projektbyte)
  // så live-utdata alltid går till den xterm som är monterad nu.
  sender: WebContents
  // Rå utdata hittills, så en ny xterm kan spela upp allt och återskapa både
  // skärmbild och scrollback vid återanslutning. Kapad till de sista tecknen.
  buffer: string
  mode: 'pty' | 'pipe'
}

const sessions = new Map<string, Session>()

// Hur mycket rå terminalutdata som sparas per session för återuppspelning.
// ~200k tecken räcker gott för scrollbacken utan att växa obegränsat.
const MAX_BUFFER = 200_000

// Egen PSReadLine-historikfil per terminal-id → pil-upp blir separat per
// terminal och sparas mellan körningar (id kodar repo+nummer, se renderern).
function historyFile(id: string): string {
  const dir = join(app.getPath('userData'), 'term-history')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* ignorera */
  }
  return join(dir, `${id.replace(/[^a-z0-9_-]/gi, '_')}.txt`)
}

// Vilket PowerShell som ska köras. Föredra PowerShell 7 (pwsh) när det finns i
// PATH – det stödjer bracketed paste, så flerradig inklistring väntar på Enter i
// stället för att köra rad ett direkt. Annars Windows PowerShell 5.1 (finns
// alltid). Resultatet cachas – PATH ändras inte under körning.
let resolvedShell: string | null = null
function powershellExe(): string {
  if (resolvedShell) return resolvedShell
  try {
    execFileSync('where', ['pwsh'], { stdio: 'ignore' })
    resolvedShell = 'pwsh.exe'
  } catch {
    resolvedShell = 'powershell.exe'
  }
  return resolvedShell
}

function spawnSession(id: string, sender: WebContents, cwd: string | null): void {
  const dir = cwd ?? homedir()
  const session: Session = { pty: null, pipe: null, sender, buffer: '', mode: 'pty' }
  sessions.set(id, session)

  // Utdata: spara i bufferten (kapad) OCH skicka till aktuell renderer.
  const emit = (text: string): void => {
    session.buffer += text
    if (session.buffer.length > MAX_BUFFER) {
      session.buffer = session.buffer.slice(session.buffer.length - MAX_BUFFER)
    }
    if (!session.sender.isDestroyed()) session.sender.send('terminal:data', { id, text })
  }
  const setMode = (mode: 'pty' | 'pipe'): void => {
    session.mode = mode
    if (!session.sender.isDestroyed()) session.sender.send('terminal:mode', { id, mode })
  }

  if (ptyLib) {
    try {
      const hist = historyFile(id).replace(/'/g, "''")
      const pty = ptyLib.spawn(
        powershellExe(),
        ['-NoExit', '-Command', `try { Set-PSReadLineOption -HistorySavePath '${hist}' } catch {}`],
        {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: dir,
        // Använd den conpty.dll som följer med node-pty i stället för Windows
        // egen. Ger samma PTY-beteende oavsett vilken Windows-build användaren
        // kör – vissa builds har en ConPTY som får pwsh att krascha
        // (FailFast 0x80131623) när man avslutar ett TUI-program, vilket är
        // precis vad t.ex. Claude Code är. Den medföljande är förbi den buggen.
        useConptyDll: true,
        // TERM + COLORTERM så CLI-verktyg (t.ex. Claude Code) vet att de kan
        // använda 256-färg/truecolor och full TUI.
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        } as Record<string, string>
      })
      pty.onData((d) => emit(d))
      pty.onExit(() => emit('\r\n[skalet avslutades]\r\n'))
      session.pty = pty
      setMode('pty')
      return
    } catch {
      /* faller igenom till pipe */
    }
  }

  const pipe = spawn(powershellExe(), ['-NoLogo', '-NoExit', '-Command', '-'], {
    cwd: dir,
    windowsHide: true
  })
  pipe.stdout.on('data', (d: Buffer) => emit(d.toString()))
  pipe.stderr.on('data', (d: Buffer) => emit(d.toString()))
  pipe.on('exit', (code) => emit(`\r\n[skalet avslutades med kod ${code ?? 0}]\r\n`))
  session.pipe = pipe
  setMode('pipe')
  emit(`Codester-terminal · ${dir}\r\n`)
  // Pipe-läget saknar riktig PTY → interaktiva TUI-verktyg fungerar inte fullt ut.
  emit(
    '\x1b[33m⚠ Riktig PTY saknas – interaktiva verktyg (t.ex. Claude Code) fungerar inte fullt ut i det här läget.\x1b[0m\r\n'
  )
}

export function ensureTerminal(id: string, sender: WebContents, cwd: string | null): void {
  const existing = sessions.get(id)
  if (existing) {
    // Sessionen lever redan (t.ex. man bytte projekt och är tillbaka). Rikta om
    // live-utdata till den nya xterm och spela upp allt hittills, så skärmbild
    // och scrollback återskapas – annars ritas ny text mot en tom xterm med
    // markören på fel plats.
    existing.sender = sender
    if (!sender.isDestroyed()) {
      sender.send('terminal:mode', { id, mode: existing.mode })
      if (existing.buffer) sender.send('terminal:data', { id, text: existing.buffer })
    }
    return
  }
  spawnSession(id, sender, cwd)
}

export function startTerminal(id: string, sender: WebContents, cwd: string | null): void {
  killTerminal(id)
  spawnSession(id, sender, cwd)
}

export function writeTerminal(id: string, data: string): void {
  const s = sessions.get(id)
  if (s?.pty) s.pty.write(data)
  else s?.pipe?.stdin.write(data)
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const s = sessions.get(id)
  if (s?.pty && cols > 0 && rows > 0) {
    try {
      s.pty.resize(cols, rows)
    } catch {
      /* ignorera */
    }
  }
}

export function killTerminal(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  try {
    s.pty?.kill()
  } catch {
    /* ignorera */
  }
  s.pipe?.kill()
  sessions.delete(id)
}

export function killAllTerminals(): void {
  for (const id of [...sessions.keys()]) killTerminal(id)
}

// Finns kommandot i PATH? (för att avgöra om t.ex. `claude` går att starta.)
export function hasCommand(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('where', [cmd], (err) => resolve(!err))
  })
}
