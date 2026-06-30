import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { homedir } from 'os'
import type { WebContents } from 'electron'

// Terminal-backend. Föredrar en riktig PTY (@lydell/node-pty, förbyggd ConPTY)
// → färger, markör, riktig prompt och interaktiva program. Misslyckas den
// native-laddningen faller vi tillbaka till ett pipe-baserat PowerShell-skal.

type PtyModule = typeof import('@lydell/node-pty')
type IPty = import('@lydell/node-pty').IPty

let ptyLib: PtyModule | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ptyLib = require('@lydell/node-pty')
} catch {
  ptyLib = null
}

let ptyProc: IPty | null = null
let pipeProc: ChildProcessWithoutNullStreams | null = null

export function startTerminal(sender: WebContents, cwd: string | null): void {
  killTerminal()
  const dir = cwd ?? homedir()
  const send = (channel: string, ...args: unknown[]): void => {
    if (!sender.isDestroyed()) sender.send(channel, ...args)
  }

  if (ptyLib) {
    try {
      ptyProc = ptyLib.spawn('powershell.exe', [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: dir,
        env: process.env as Record<string, string>
      })
      ptyProc.onData((d) => send('terminal:data', d))
      ptyProc.onExit(() => send('terminal:data', '\r\n[skalet avslutades]\r\n'))
      send('terminal:mode', 'pty')
      return
    } catch {
      ptyProc = null
    }
  }

  // Fallback: pipe-baserat skal (radvis, ingen full interaktivitet)
  pipeProc = spawn('powershell.exe', ['-NoLogo', '-NoExit', '-Command', '-'], {
    cwd: dir,
    windowsHide: true
  })
  pipeProc.stdout.on('data', (d: Buffer) => send('terminal:data', d.toString()))
  pipeProc.stderr.on('data', (d: Buffer) => send('terminal:data', d.toString()))
  pipeProc.on('exit', (code) => send('terminal:data', `\r\n[skalet avslutades med kod ${code ?? 0}]\r\n`))
  send('terminal:mode', 'pipe')
  send('terminal:data', `Codester-terminal · ${dir}\r\n`)
}

export function ensureStarted(sender: WebContents, cwd: string | null): void {
  if (!ptyProc && !pipeProc) startTerminal(sender, cwd)
}

export function writeTerminal(data: string): void {
  if (ptyProc) ptyProc.write(data)
  else pipeProc?.stdin.write(data)
}

export function resizeTerminal(cols: number, rows: number): void {
  if (ptyProc && cols > 0 && rows > 0) {
    try {
      ptyProc.resize(cols, rows)
    } catch {
      /* ignorera */
    }
  }
}

export function killTerminal(): void {
  if (ptyProc) {
    try {
      ptyProc.kill()
    } catch {
      /* ignorera */
    }
    ptyProc = null
  }
  if (pipeProc) {
    pipeProc.kill()
    pipeProc = null
  }
}
