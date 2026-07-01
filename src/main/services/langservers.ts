import { spawn } from 'child_process'
import type { WebContents } from 'electron'
import type { LangServerStatus } from '../../shared/types'

// Installerbara språkservrar. Installationen körs via respektive officiella
// verktygskedja (npm/go/rustup) – bara på användarens uttryckliga klick.

interface ServerDef {
  id: string
  name: string
  description: string
  bin: string // binären som LSP-bryggan startar
  prereq: string | null // verktyg som krävs för installation
  installCmd: string | null // kommando som körs vid klick (i skal)
  manualHint?: string // för servrar utan enkelt installationskommando
}

const LIST: ServerDef[] = [
  {
    id: 'python',
    name: 'Python — Pyright',
    description: 'Autocomplete, typkontroll och gå-till-definition för Python.',
    bin: 'pyright-langserver',
    prereq: 'npm',
    installCmd: 'npm install -g pyright'
  },
  {
    id: 'go',
    name: 'Go — gopls',
    description: 'Officiella språkservern för Go: komplettering, hover och diagnostik.',
    bin: 'gopls',
    prereq: 'go',
    installCmd: 'go install golang.org/x/tools/gopls@latest'
  },
  {
    id: 'rust',
    name: 'Rust — rust-analyzer',
    description: 'Kraftfull IntelliSense och felmarkering för Rust.',
    bin: 'rust-analyzer',
    prereq: 'rustup',
    installCmd: 'rustup component add rust-analyzer'
  },
  {
    id: 'cpp',
    name: 'C/C++ — clangd',
    description: 'Komplettering och diagnostik för C och C++.',
    bin: 'clangd',
    prereq: null,
    installCmd: null,
    manualHint: 'Installera LLVM/clangd från llvm.org eller via din pakethanterare (t.ex. winget install LLVM.LLVM), och se till att clangd finns i PATH.'
  }
]

function exists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const which = process.platform === 'win32' ? 'where' : 'which'
    const c = spawn(which, [cmd], { windowsHide: true })
    c.on('error', () => resolve(false))
    c.on('close', (code) => resolve(code === 0))
  })
}

export async function list(): Promise<LangServerStatus[]> {
  return Promise.all(
    LIST.map(async (s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      installCmd: s.installCmd,
      manualHint: s.manualHint ?? null,
      installed: await exists(s.bin),
      prereqOk: s.prereq ? await exists(s.prereq) : true,
      prereq: s.prereq
    }))
  )
}

export function install(id: string, sender: WebContents): Promise<{ ok: boolean; code: number }> {
  const s = LIST.find((x) => x.id === id)
  return new Promise((resolve) => {
    if (!s?.installCmd) {
      resolve({ ok: false, code: -1 })
      return
    }
    const send = (text: string): void => {
      if (!sender.isDestroyed()) sender.send('langserver:output', { id, text })
    }
    send(`$ ${s.installCmd}\n`)
    const child = spawn(s.installCmd, { shell: true, windowsHide: true })
    child.stdout.on('data', (d: Buffer) => send(d.toString()))
    child.stderr.on('data', (d: Buffer) => send(d.toString()))
    child.on('error', (e) => {
      send(`\n[fel] ${e.message}\n`)
      resolve({ ok: false, code: -1 })
    })
    child.on('close', (code) => {
      send(`\n[klar] avslutades med kod ${code ?? 0}\n`)
      resolve({ ok: code === 0, code: code ?? -1 })
    })
  })
}
