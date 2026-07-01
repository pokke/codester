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
  { id: 'closeTab', label: 'Stäng flik', default: 'Ctrl+W' }
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
