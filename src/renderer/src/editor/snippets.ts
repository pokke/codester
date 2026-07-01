import { monaco } from './monaco'

// Användardefinierade snippets per språk. Lagras som snippets/<lang>.json i
// userData (VS Code-liknande format) och registreras som Monaco-completion.
//
// Format:
// {
//   "Namn": { "prefix": "clg", "body": ["console.log($1)"], "description": "..." }
// }
// body kan vara sträng eller rad-array; stödjer tab-stops ($1, ${1:foo}, $0).

export const SNIPPET_LANGS = [
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'c',
  'cpp',
  'java',
  'html',
  'css',
  'scss',
  'json',
  'markdown',
  'shell',
  'yaml'
]

interface RawSnippet {
  prefix: string | string[]
  body: string | string[]
  description?: string
}
interface SnippetDef {
  prefix: string
  body: string
  description: string
}

const cache = new Map<string, SnippetDef[]>()
let registered = false

async function loadLang(lang: string): Promise<SnippetDef[]> {
  const r = await window.api.config.read(`snippets/${lang}.json`)
  if (!r.ok || !r.data) return []
  try {
    const obj = JSON.parse(r.data) as Record<string, RawSnippet>
    const out: SnippetDef[] = []
    for (const [name, s] of Object.entries(obj)) {
      if (!s || !s.prefix || !s.body) continue
      const body = Array.isArray(s.body) ? s.body.join('\n') : String(s.body)
      const prefixes = Array.isArray(s.prefix) ? s.prefix : [s.prefix]
      for (const p of prefixes) out.push({ prefix: String(p), body, description: s.description ?? name })
    }
    return out
  } catch {
    return []
  }
}

// Töm cachen så nästa completion läser om filerna (efter redigering).
export function reloadSnippets(): void {
  cache.clear()
}

export function registerSnippets(): void {
  if (registered) return
  registered = true
  monaco.languages.registerCompletionItemProvider(SNIPPET_LANGS, {
    async provideCompletionItems(model, position) {
      const lang = model.getLanguageId()
      let defs = cache.get(lang)
      if (!defs) {
        defs = await loadLang(lang)
        cache.set(lang, defs)
      }
      if (!defs.length) return { suggestions: [] }
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }
      return {
        suggestions: defs.map((d) => ({
          label: d.prefix,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: d.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: d.description,
          detail: 'Snippet',
          range
        }))
      }
    }
  })
}

export function defaultSnippetsJson(): string {
  return JSON.stringify(
    {
      'Console log': {
        prefix: 'clg',
        body: ['console.log($1)'],
        description: 'Loggar till konsolen'
      }
    },
    null,
    2
  )
}
