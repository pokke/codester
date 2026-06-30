import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { homedir } from 'os'
import type { WebContents } from 'electron'

// Lättviktig terminal/kommandokonsol utan native-beroenden (ingen node-pty).
// Vi startar ett uthålligt PowerShell-skal med pipes och strömmar utdata till
// renderern. Input skickas radvis. Detta täcker git/npm/build-kommandon väl;
// fullt interaktiva TUI-program (vim etc) kräver en riktig PTY och stöds inte.

let shell: ChildProcessWithoutNullStreams | null = null

export function startTerminal(sender: WebContents, cwd: string | null): void {
  killTerminal()
  const dir = cwd ?? homedir()
  shell = spawn('powershell.exe', ['-NoLogo', '-NoExit', '-Command', '-'], {
    cwd: dir,
    windowsHide: true
  })

  const send = (data: string): void => {
    if (!sender.isDestroyed()) sender.send('terminal:data', data)
  }

  shell.stdout.on('data', (d: Buffer) => send(d.toString()))
  shell.stderr.on('data', (d: Buffer) => send(d.toString()))
  shell.on('exit', (code) => send(`\n[processen avslutades med kod ${code ?? 0}]\n`))

  send(`Codester-terminal · ${dir}\n`)
}

// Starta bara om inget skal redan kör (så sessionen överlever vy-byten).
export function ensureStarted(sender: WebContents, cwd: string | null): void {
  if (!shell) startTerminal(sender, cwd)
}

export function writeTerminal(data: string): void {
  shell?.stdin.write(data)
}

export function killTerminal(): void {
  if (shell) {
    shell.kill()
    shell = null
  }
}
