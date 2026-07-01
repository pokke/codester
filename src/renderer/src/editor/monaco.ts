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

// ── Projektmedveten JS/TS ─────────────────────────────────────────────
// Matar Monacos TS/JS-motor med projektets tsconfig, käll-filer (som modeller)
// och node_modules-typer (som extra libs) → autocomplete/hover/diagnostik som
// förstår hela projektet.

interface TsProjectLike {
  compilerOptions: Record<string, unknown>
  files: { path: string; content: string }[]
}

const CODE_RE = /\.(ts|tsx|js|jsx|mts|cts)$/
const MAX_PROJECT_MODELS = 1500

function mapEnum(map: Record<string, number>, val: unknown, fallback: number): number {
  if (typeof val === 'string' && map[val.toLowerCase()] !== undefined) return map[val.toLowerCase()]
  return fallback
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapCompilerOptions(co: Record<string, unknown>): Record<string, unknown> {
  const t = (monaco.languages as any).typescript
  const target: Record<string, number> = {
    es3: t.ScriptTarget.ES3,
    es5: t.ScriptTarget.ES5,
    es6: t.ScriptTarget.ES2015,
    es2015: t.ScriptTarget.ES2015,
    es2016: t.ScriptTarget.ES2016,
    es2017: t.ScriptTarget.ES2017,
    es2018: t.ScriptTarget.ES2018,
    es2019: t.ScriptTarget.ES2019,
    es2020: t.ScriptTarget.ES2020,
    es2021: t.ScriptTarget.ES2021,
    es2022: t.ScriptTarget.ES2022,
    esnext: t.ScriptTarget.ESNext,
    latest: t.ScriptTarget.Latest
  }
  const mod: Record<string, number> = {
    none: t.ModuleKind.None,
    commonjs: t.ModuleKind.CommonJS,
    amd: t.ModuleKind.AMD,
    umd: t.ModuleKind.UMD,
    system: t.ModuleKind.System,
    es6: t.ModuleKind.ES2015,
    es2015: t.ModuleKind.ES2015,
    es2020: t.ModuleKind.ES2015,
    es2022: t.ModuleKind.ESNext,
    esnext: t.ModuleKind.ESNext,
    node16: t.ModuleKind.ESNext,
    nodenext: t.ModuleKind.ESNext
  }
  const jsx: Record<string, number> = {
    none: t.JsxEmit.None,
    preserve: t.JsxEmit.Preserve,
    react: t.JsxEmit.React,
    'react-jsx': t.JsxEmit.ReactJSX,
    'react-jsxdev': t.JsxEmit.ReactJSXDev,
    'react-native': t.JsxEmit.ReactNative
  }
  const res: Record<string, number> = {
    classic: t.ModuleResolutionKind.Classic,
    node: t.ModuleResolutionKind.NodeJs,
    node10: t.ModuleResolutionKind.NodeJs,
    node16: t.ModuleResolutionKind.NodeJs,
    nodenext: t.ModuleResolutionKind.NodeJs,
    bundler: t.ModuleResolutionKind.NodeJs
  }
  return {
    allowJs: true,
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: co.esModuleInterop !== false,
    target: mapEnum(target, co.target, t.ScriptTarget.ESNext),
    module: mapEnum(mod, co.module, t.ModuleKind.ESNext),
    moduleResolution: mapEnum(res, co.moduleResolution, t.ModuleResolutionKind.NodeJs),
    jsx: mapEnum(jsx, co.jsx, t.JsxEmit.ReactJSX),
    jsxImportSource: typeof co.jsxImportSource === 'string' ? co.jsxImportSource : undefined,
    strict: co.strict === true,
    skipLibCheck: co.skipLibCheck !== false,
    baseUrl: typeof co.baseUrl === 'string' ? co.baseUrl : undefined,
    paths: co.paths && typeof co.paths === 'object' ? co.paths : undefined,
    lib: Array.isArray(co.lib) ? (co.lib as string[]).map((l) => l.toLowerCase()) : undefined
  }
}

// Monacos inbyggda TS-motor har inte hela node_modules som riktiga tsserver,
// så dess *semantiska* analys ger falska "Cannot find module"/typfel. Vi stänger
// av semantisk validering (behåller syntaxfel) – autocomplete/hover/definition
// påverkas inte. Riktig typkontroll sker via tsc/CI; LSP-språk har egen korrekt
// diagnostik.
function silenceSemanticDiagnostics(): void {
  try {
    const tns = (monaco.languages as any).typescript
    if (!tns) return
    const opts = { noSemanticValidation: true, noSyntaxValidation: false }
    tns.typescriptDefaults.setDiagnosticsOptions(opts)
    tns.javascriptDefaults.setDiagnosticsOptions(opts)
  } catch {
    /* tyst */
  }
}
silenceSemanticDiagnostics()

export function configureTypeScript(project: TsProjectLike): void {
  try {
    const tns = (monaco.languages as any).typescript
    if (!tns) return
    const opts = mapCompilerOptions(project.compilerOptions)
    tns.typescriptDefaults.setCompilerOptions(opts)
    tns.javascriptDefaults.setCompilerOptions(opts)
    tns.typescriptDefaults.setEagerModelSync(true)
    tns.javascriptDefaults.setEagerModelSync(true)
    silenceSemanticDiagnostics()

    const codeFiles = project.files.filter(
      (f) => !f.path.startsWith('node_modules/') && CODE_RE.test(f.path)
    )
    const extraLibs = project.files
      .filter((f) => f.path.startsWith('node_modules/'))
      .map((f) => ({ content: f.content, filePath: monaco.Uri.parse(`file:///${f.path}`).toString() }))

    // Skapa modeller för projektets filer (så korsfils-IntelliSense fungerar)
    if (codeFiles.length <= MAX_PROJECT_MODELS) {
      for (const f of codeFiles) {
        const uri = monaco.Uri.parse(`file:///${f.path}`)
        if (!monaco.editor.getModel(uri)) monaco.editor.createModel(f.content, undefined, uri)
      }
    }

    tns.typescriptDefaults.setExtraLibs(extraLibs)
    tns.javascriptDefaults.setExtraLibs(extraLibs)
  } catch {
    /* tyst – IntelliSense är best-effort */
  }
}

export { monaco }
