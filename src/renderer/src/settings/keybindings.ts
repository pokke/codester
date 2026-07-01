// Konfigurerbara kortkommandon. Standardvärden kan överridas via
// keybindings.json (userData). Handlarna själva bor kvar i App/EditorArea –
// här bestäms bara vilken tangentkombination som mappar till vilket kommando.

export const KEYBINDING_FILE = 'keybindings.json'

export interface CommandDef {
  id: string
  label: string
  default: string
}

// De kommandon som går att binda om. Ctrl+Tab (MRU) och zoom (Ctrl +/-/0)
// hanteras separat pga specialtangenter.
export const COMMANDS: CommandDef[] = [
  { id: 'quickOpen', label: 'Snabböppna fil', default: 'Ctrl+P' },
  { id: 'commandPalette', label: 'Kommandopalett', default: 'Ctrl+Shift+P' },
  { id: 'openSettings', label: 'Inställningar', default: 'Ctrl+,' },
  { id: 'toggleSidebar', label: 'Visa/dölj sidofält', default: 'Ctrl+B' },
  { id: 'toggleTerminal', label: 'Terminal-panel', default: 'Ctrl+`' },
  { id: 'toggleProblems', label: 'Problem-panel', default: 'Ctrl+Shift+M' },
  { id: 'splitEditor', label: 'Dela editor', default: 'Ctrl+\\' },
  { id: 'closeTab', label: 'Stäng flik', default: 'Ctrl+W' },
  // Hanteras av Monaco (i editorn) via comboToMonaco vid mount
  { id: 'save', label: 'Spara', default: 'Ctrl+S' },
  { id: 'formatDocument', label: 'Formatera dokument', default: 'Shift+Alt+F' }
]

const DEFAULTS: Record<string, string> = Object.fromEntries(
  COMMANDS.map((c) => [c.id, c.default])
)

// Aktiva bindningar (standard + override). Läses live av tangenthanterarna.
let bindings: Record<string, string> = { ...DEFAULTS }

function normKey(k: string): string {
  if (k.length === 1) return k.toUpperCase()
  const map: Record<string, string> = { esc: 'Escape', spacebar: 'Space', ' ': 'Space' }
  return map[k.toLowerCase()] ?? k
}

// Kanoniserar en kombination ("ctrl+shift+p" → "Ctrl+Shift+P") för jämförelse.
function canon(combo: string): string {
  const parts = combo.split('+').map((s) => s.trim()).filter(Boolean)
  const mods = new Set<string>()
  let key = ''
  for (const p of parts) {
    const low = p.toLowerCase()
    if (low === 'ctrl' || low === 'control' || low === 'cmd' || low === 'meta') mods.add('Ctrl')
    else if (low === 'shift') mods.add('Shift')
    else if (low === 'alt' || low === 'option') mods.add('Alt')
    else key = p
  }
  const out = ['Ctrl', 'Shift', 'Alt'].filter((m) => mods.has(m))
  if (key) out.push(normKey(key))
  return out.join('+')
}

// Översätter ett tangenttryck till en kanonisk kombination.
export function eventToCombo(e: KeyboardEvent): string {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return ''
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  parts.push(e.key)
  return canon(parts.join('+'))
}

export function matches(e: KeyboardEvent, id: string): boolean {
  const combo = eventToCombo(e)
  if (!combo) return false
  const binding = bindings[id]
  return !!binding && combo === canon(binding)
}

export function currentBindings(): Record<string, string> {
  return { ...bindings }
}

export function bindingFor(id: string): string {
  return bindings[id] ?? ''
}

// Översätter en bindning ("Ctrl+S") till Monacos numeriska keybinding, för
// kommandon som körs inuti editorn (ed.addCommand). m = monaco-namespace.
export function comboToMonaco(
  m: { KeyMod: Record<string, number>; KeyCode: Record<string, number> },
  combo: string
): number | null {
  if (!combo) return null
  let mod = 0
  let keyCode: number | null = null
  for (const raw of combo.split('+').map((s) => s.trim()).filter(Boolean)) {
    const low = raw.toLowerCase()
    if (low === 'ctrl' || low === 'cmd' || low === 'meta' || low === 'control') mod |= m.KeyMod.CtrlCmd
    else if (low === 'shift') mod |= m.KeyMod.Shift
    else if (low === 'alt' || low === 'option') mod |= m.KeyMod.Alt
    else keyCode = keyToCode(m, raw)
  }
  return keyCode == null ? null : mod | keyCode
}

function keyToCode(
  m: { KeyCode: Record<string, number> },
  key: string
): number | null {
  if (key.length === 1) {
    const up = key.toUpperCase()
    if (up >= 'A' && up <= 'Z') return m.KeyCode['Key' + up] ?? null
    if (up >= '0' && up <= '9') return m.KeyCode['Digit' + up] ?? null
    const sym: Record<string, string> = {
      ',': 'Comma',
      '.': 'Period',
      '/': 'Slash',
      ';': 'Semicolon',
      "'": 'Quote',
      '[': 'BracketLeft',
      ']': 'BracketRight',
      '\\': 'Backslash',
      '`': 'Backquote',
      '-': 'Minus',
      '=': 'Equal'
    }
    if (sym[key]) return m.KeyCode[sym[key]] ?? null
  }
  const named: Record<string, string> = {
    tab: 'Tab',
    enter: 'Enter',
    escape: 'Escape',
    space: 'Space'
  }
  const n = named[key.toLowerCase()]
  return n ? (m.KeyCode[n] ?? null) : null
}

// Läser keybindings.json och slår ihop med standardvärden. Anropas vid start
// och efter att filen redigerats i inställningarna.
export async function loadKeybindings(): Promise<void> {
  const r = await window.api.config.read(KEYBINDING_FILE)
  if (r.ok && r.data) {
    try {
      const parsed = JSON.parse(r.data)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        bindings = { ...DEFAULTS, ...parsed }
        return
      }
    } catch {
      // trasig fil – behåll standard
    }
  }
  bindings = { ...DEFAULTS }
}

export function defaultKeybindingsJson(): string {
  return JSON.stringify(DEFAULTS, null, 2)
}
