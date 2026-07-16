import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'child_process'
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
}

const sessions = new Map<string, Session>()

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

function spawnSession(id: string, sender: WebContents, cwd: string | null): void {
  const dir = cwd ?? homedir()
  const send = (channel: string, payload: unknown): void => {
    if (!sender.isDestroyed()) sender.send(channel, payload)
  }

  if (ptyLib) {
    try {
      const hist = historyFile(id).replace(/'/g, "''")
      const pty = ptyLib.spawn(
        'powershell.exe',
        ['-NoExit', '-Command', `try { Set-PSReadLineOption -HistorySavePath '${hist}' } catch {}`],
        {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: dir,
        // TERM + COLORTERM så CLI-verktyg (t.ex. Claude Code) vet att de kan
        // använda 256-färg/truecolor och full TUI.
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        } as Record<string, string>
      })
      pty.onData((d) => send('terminal:data', { id, text: d }))
      pty.onExit(() => send('terminal:data', { id, text: '\r\n[skalet avslutades]\r\n' }))
      sessions.set(id, { pty, pipe: null })
      send('terminal:mode', { id, mode: 'pty' })
      return
    } catch {
      /* faller igenom till pipe */
    }
  }

  const pipe = spawn('powershell.exe', ['-NoLogo', '-NoExit', '-Command', '-'], {
    cwd: dir,
    windowsHide: true
  })
  pipe.stdout.on('data', (d: Buffer) => send('terminal:data', { id, text: d.toString() }))
  pipe.stderr.on('data', (d: Buffer) => send('terminal:data', { id, text: d.toString() }))
  pipe.on('exit', (code) =>
    send('terminal:data', { id, text: `\r\n[skalet avslutades med kod ${code ?? 0}]\r\n` })
  )
  sessions.set(id, { pty: null, pipe })
  send('terminal:mode', { id, mode: 'pipe' })
  send('terminal:data', { id, text: `Codester-terminal · ${dir}\r\n` })
  // Pipe-läget saknar riktig PTY → interaktiva TUI-verktyg fungerar inte fullt ut.
  send('terminal:data', {
    id,
    text: '\x1b[33m⚠ Riktig PTY saknas – interaktiva verktyg (t.ex. Claude Code) fungerar inte fullt ut i det här läget.\x1b[0m\r\n'
  })
}

export function ensureTerminal(id: string, sender: WebContents, cwd: string | null): void {
  if (!sessions.has(id)) spawnSession(id, sender, cwd)
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
