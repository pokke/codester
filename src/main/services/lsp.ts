import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { dirname, join } from 'path'
import type { WebContents } from 'electron'
import { getRepoPath } from './git'

// Generisk LSP-klient: startar en språkserver per språk, pratar JSON-RPC över
// stdio, synkar dokument och vidarebefordrar completion/hover/definition samt
// pushar diagnostik till renderern. TS/JS använder en buntad typescript-
// language-server (zero-install); övriga kräver att servern finns i PATH.

interface SpawnCfg {
  cmd: string
  args: string[]
  env?: NodeJS.ProcessEnv
  initOptions?: unknown
}

// PATH-baserade servrar (måste installeras av användaren).
const SERVERS: Record<string, { cmd: string; args: string[] }> = {
  python: { cmd: 'pyright-langserver', args: ['--stdio'] },
  rust: { cmd: 'rust-analyzer', args: [] },
  go: { cmd: 'gopls', args: [] },
  c: { cmd: 'clangd', args: [] },
  cpp: { cmd: 'clangd', args: [] }
}

// Bygger spawn-konfig för ett språk. TS/JS körs via buntad tsls under
// Electrons node-runtime, med explicit sökväg till buntad tsserver.
function buildConfig(langId: string): SpawnCfg | null {
  if (langId === 'typescript' || langId === 'javascript') {
    try {
      const tsls = join(dirname(require.resolve('typescript-language-server/package.json')), 'lib', 'cli.mjs')
      const tsserver = require.resolve('typescript/lib/tsserver.js')
      return {
        cmd: process.execPath,
        args: [tsls, '--stdio'],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        initOptions: { tsserver: { path: tsserver } }
      }
    } catch {
      return null
    }
  }
  const d = SERVERS[langId]
  return d ? { cmd: d.cmd, args: d.args } : null
}

function rootUri(): string {
  const p = getRepoPath()
  return p ? `file:///${p.replace(/\\/g, '/')}` : 'file:///'
}

class LspServer {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buffer = Buffer.alloc(0)
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()
  private ready: Promise<boolean>
  private resolveReady!: (v: boolean) => void

  constructor(
    private langId: string,
    private cfg: SpawnCfg,
    private sender: WebContents
  ) {
    this.ready = new Promise((r) => (this.resolveReady = r))
  }

  async start(): Promise<boolean> {
    try {
      this.proc = spawn(this.cfg.cmd, this.cfg.args, {
        cwd: getRepoPath() ?? process.cwd(),
        env: this.cfg.env ?? process.env,
        windowsHide: true
      })
    } catch {
      this.resolveReady(false)
      return false
    }
    this.proc.on('error', () => this.resolveReady(false))
    this.proc.stdout.on('data', (d: Buffer) => this.onData(d))
    this.proc.stderr.on('data', () => {
      /* serverlogg ignoreras */
    })
    this.proc.on('exit', () => this.resolveReady(false))

    try {
      await this.request('initialize', {
        processId: process.pid,
        rootUri: rootUri(),
        workspaceFolders: [{ uri: rootUri(), name: 'workspace' }],
        initializationOptions: this.cfg.initOptions,
        capabilities: {
          textDocument: {
            synchronization: { didSave: true, dynamicRegistration: false },
            completion: { completionItem: { snippetSupport: true } },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            definition: {},
            publishDiagnostics: {}
          }
        }
      })
      this.notify('initialized', {})
      this.resolveReady(true)
      return true
    } catch {
      this.resolveReady(false)
      return false
    }
  }

  whenReady(): Promise<boolean> {
    return this.ready
  }

  private write(msg: object): void {
    if (!this.proc) return
    const body = JSON.stringify(msg)
    this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++
    this.write({ jsonrpc: '2.0', id, method, params })
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error('LSP timeout'))
        }
      }, 8000)
    })
  }

  notify(method: string, params: unknown): void {
    this.write({ jsonrpc: '2.0', method, params })
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    // Läs så många kompletta meddelanden som möjligt
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const header = this.buffer.subarray(0, headerEnd).toString('utf8')
      const m = /Content-Length:\s*(\d+)/i.exec(header)
      if (!m) {
        this.buffer = this.buffer.subarray(headerEnd + 4)
        continue
      }
      const len = Number(m[1])
      const start = headerEnd + 4
      if (this.buffer.length < start + len) return // vänta på mer data
      const body = this.buffer.subarray(start, start + len).toString('utf8')
      this.buffer = this.buffer.subarray(start + len)
      try {
        this.dispatch(JSON.parse(body))
      } catch {
        /* trasigt meddelande */
      }
    }
  }

  private dispatch(msg: {
    id?: number
    method?: string
    result?: unknown
    error?: unknown
    params?: unknown
  }): void {
    if (typeof msg.id === 'number' && (msg.result !== undefined || msg.error !== undefined)) {
      const p = this.pending.get(msg.id)
      if (p) {
        this.pending.delete(msg.id)
        if (msg.error) p.reject(msg.error)
        else p.resolve(msg.result)
      }
      return
    }
    // Notifieringar från servern
    if (msg.method === 'textDocument/publishDiagnostics') {
      if (!this.sender.isDestroyed()) this.sender.send('lsp:diagnostics', msg.params)
    }
    // Server-requests (t.ex. configuration/registerCapability) – svara tomt
    if (typeof msg.id === 'number' && msg.method) {
      this.write({ jsonrpc: '2.0', id: msg.id, result: null })
    }
  }

  dispose(): void {
    try {
      this.proc?.kill()
    } catch {
      /* ignorera */
    }
    this.proc = null
  }
}

const servers = new Map<string, LspServer>()
const unavailable = new Set<string>()

export async function ensure(langId: string, sender: WebContents): Promise<boolean> {
  if (unavailable.has(langId)) return false
  const existing = servers.get(langId)
  if (existing) return existing.whenReady()
  const cfg = buildConfig(langId)
  if (!cfg) {
    unavailable.add(langId)
    return false
  }
  const srv = new LspServer(langId, cfg, sender)
  servers.set(langId, srv)
  const ok = await srv.start()
  if (!ok) {
    servers.delete(langId)
    unavailable.add(langId)
  }
  return ok
}

export function didOpen(langId: string, uri: string, text: string): void {
  servers
    .get(langId)
    ?.notify('textDocument/didOpen', {
      textDocument: { uri, languageId: langId, version: 1, text }
    })
}

export function didChange(langId: string, uri: string, text: string, version: number): void {
  servers
    .get(langId)
    ?.notify('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }]
    })
}

export function didClose(langId: string, uri: string): void {
  servers.get(langId)?.notify('textDocument/didClose', { textDocument: { uri } })
}

export async function request(langId: string, method: string, params: unknown): Promise<unknown> {
  const srv = servers.get(langId)
  if (!srv) return null
  try {
    return await srv.request(method, params)
  } catch {
    return null
  }
}

export function killAll(): void {
  for (const s of servers.values()) s.dispose()
  servers.clear()
  unavailable.clear()
}
