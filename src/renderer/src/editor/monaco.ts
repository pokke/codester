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

// Enkel filändelse → språk-mappning för Monaco
export function languageForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    sql: 'sql'
  }
  return map[ext] ?? 'plaintext'
}

export { monaco }
