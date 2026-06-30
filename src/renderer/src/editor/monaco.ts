import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import type { Theme } from '../themes/themes'

// Bunta Monaco och dess workers lokalt så att appen fungerar offline och
// utan att bryta mot CSP (inget hämtas från CDN).
self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

loader.config({ monaco })

function hex(c: string): string {
  return c.replace('#', '')
}

// Skapar/uppdaterar ett Monaco-tema utifrån ett av Codesters appteman,
// så att editorns syntaxfärger följer det valda temat.
export function defineMonacoTheme(theme: Theme): string {
  const id = `codester-${theme.id}`
  const c = theme.colors
  monaco.editor.defineTheme(id, {
    base: theme.type === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: hex(c.synKeyword) },
      { token: 'keyword.control', foreground: hex(c.synKeyword) },
      { token: 'storage', foreground: hex(c.synKeyword) },
      { token: 'string', foreground: hex(c.synString) },
      { token: 'comment', foreground: hex(c.synComment), fontStyle: 'italic' },
      { token: 'number', foreground: hex(c.synNumber) },
      { token: 'type', foreground: hex(c.synType) },
      { token: 'type.identifier', foreground: hex(c.synType) },
      { token: 'function', foreground: hex(c.synFunction) },
      { token: 'identifier', foreground: hex(c.text) }
    ],
    colors: {
      'editor.background': c.bg,
      'editor.foreground': c.text,
      'editorLineNumber.foreground': c.textMuted,
      'editorCursor.foreground': c.accent,
      'editor.selectionBackground': c.accent + '55',
      'editor.lineHighlightBackground': c.bgElevated,
      'diffEditor.insertedTextBackground': c.added + '33',
      'diffEditor.removedTextBackground': c.removed + '33'
    }
  })
  return id
}

// Bygger ett index över Monacos alla registrerade språk (filändelser + filnamn)
// så att vi får färg för allt Monaco kan, inte bara en handplockad lista.
let extIndex: Record<string, string> | null = null
let nameIndex: Record<string, string> | null = null

// Extra mappningar för format Monaco saknar egen grammatik för – föll
// tidigare tillbaka till plaintext. Vi lånar en snarlik grammatik.
const overrides: Record<string, string> = {
  '.vue': 'html',
  '.svelte': 'html',
  '.astro': 'html',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.toml': 'ini',
  '.gradle': 'java',
  '.cmake': 'cmake'
}

function buildIndex(): void {
  extIndex = {}
  nameIndex = {}
  for (const lang of monaco.languages.getLanguages()) {
    for (const ext of lang.extensions ?? []) extIndex[ext.toLowerCase()] = lang.id
    for (const fn of lang.filenames ?? []) nameIndex[fn.toLowerCase()] = lang.id
  }
}

// Filändelse/filnamn → Monaco-språk-id.
export function languageForPath(path: string): string {
  if (!extIndex || !nameIndex) buildIndex()
  const file = path.split(/[\\/]/).pop()?.toLowerCase() ?? ''

  // 1) Exakt filnamn (Dockerfile, Makefile, .gitignore, …)
  if (nameIndex![file]) return nameIndex![file]

  const firstDot = file.indexOf('.')
  if (firstDot >= 0) {
    // 2) Hela svansen (t.ex. ".d.ts") – fångar sammansatta ändelser
    const full = file.slice(firstDot)
    if (overrides[full]) return overrides[full]
    if (extIndex![full]) return extIndex![full]

    // 3) Sista ändelsen (".ts")
    const ext = file.slice(file.lastIndexOf('.'))
    if (overrides[ext]) return overrides[ext]
    if (extIndex![ext]) return extIndex![ext]
  }

  return 'plaintext'
}

export { monaco }
