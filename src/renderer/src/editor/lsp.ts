import { monaco } from './monaco'

// Kopplar Monaco till språkservrar via main-processens LSP-brygga:
// dokumentsynk, completion, hover, definition och diagnostik. Aktiveras bara
// för språk där en server faktiskt finns installerad.

const LSP_LANGS = new Set(['python', 'rust', 'go', 'c', 'cpp'])

let lspRoot = '' // absolut repo-sökväg, normaliserad med '/'
export function setLspRoot(path: string): void {
  lspRoot = path.replace(/\\/g, '/').replace(/\/$/, '')
}

// Monaco-modell-URI (file:///relativ) → absolut LSP-URI
function toLspUri(model: monaco.editor.ITextModel): string {
  const rel = model.uri.path.replace(/^\//, '')
  return `file:///${lspRoot}/${rel}`
}
// Absolut LSP-URI → Monaco-modell-URI
function toModelUri(lspUri: string): monaco.Uri {
  let abs = decodeURIComponent(lspUri).replace(/^file:\/\/\//, '')
  if (lspRoot && abs.toLowerCase().startsWith(lspRoot.toLowerCase())) {
    abs = abs.slice(lspRoot.length + 1)
  }
  return monaco.Uri.parse(`file:///${abs}`)
}

const availability = new Map<string, Promise<boolean>>()
function ensure(langId: string): Promise<boolean> {
  let p = availability.get(langId)
  if (!p) {
    p = window.api.lsp.ensure(langId)
    availability.set(langId, p)
  }
  return p
}

const pos = (p: { lineNumber: number; column: number }): { line: number; character: number } => ({
  line: p.lineNumber - 1,
  character: p.column - 1
})

interface LspRange {
  start: { line: number; character: number }
  end: { line: number; character: number }
}
const toRange = (r: LspRange): monaco.IRange => ({
  startLineNumber: r.start.line + 1,
  startColumn: r.start.character + 1,
  endLineNumber: r.end.line + 1,
  endColumn: r.end.character + 1
})

function mapKind(k: number): monaco.languages.CompletionItemKind {
  const K = monaco.languages.CompletionItemKind
  const m: Record<number, monaco.languages.CompletionItemKind> = {
    1: K.Text, 2: K.Method, 3: K.Function, 4: K.Constructor, 5: K.Field, 6: K.Variable,
    7: K.Class, 8: K.Interface, 9: K.Module, 10: K.Property, 11: K.Unit, 12: K.Value,
    13: K.Enum, 14: K.Keyword, 15: K.Snippet, 16: K.Color, 17: K.File, 18: K.Reference,
    19: K.Folder, 20: K.EnumMember, 21: K.Constant, 22: K.Struct, 23: K.Event,
    24: K.Operator, 25: K.TypeParameter
  }
  return m[k] ?? K.Text
}

function markdownOf(contents: unknown): string {
  if (typeof contents === 'string') return contents
  if (Array.isArray(contents)) return contents.map(markdownOf).join('\n\n')
  const c = contents as { value?: string }
  return c?.value ?? ''
}

let initialized = false

export function initLsp(): void {
  if (initialized) return
  initialized = true

  // Diagnostik → Monaco-markörer
  window.api.lsp.onDiagnostics(({ uri, diagnostics }) => {
    const model = monaco.editor.getModel(toModelUri(uri))
    if (!model) return
    const Sev = monaco.MarkerSeverity
    const sevMap: Record<number, monaco.MarkerSeverity> = {
      1: Sev.Error, 2: Sev.Warning, 3: Sev.Info, 4: Sev.Hint
    }
    monaco.editor.setModelMarkers(
      model,
      'lsp',
      (diagnostics as { range: LspRange; message: string; severity?: number; source?: string }[]).map(
        (d) => ({
          ...toRange(d.range),
          message: d.message,
          severity: sevMap[d.severity ?? 1] ?? Sev.Error,
          source: d.source
        })
      )
    )
  })

  // Dokumentsynk för LSP-språk
  const versions = new WeakMap<monaco.editor.ITextModel, number>()
  const hookModel = (model: monaco.editor.ITextModel): void => {
    const langId = model.getLanguageId()
    if (!LSP_LANGS.has(langId)) return
    ensure(langId).then((ok) => {
      if (!ok) return
      window.api.lsp.didOpen(langId, toLspUri(model), model.getValue())
      versions.set(model, 1)
      model.onDidChangeContent(() => {
        const v = (versions.get(model) ?? 1) + 1
        versions.set(model, v)
        window.api.lsp.didChange(langId, toLspUri(model), model.getValue(), v)
      })
      model.onWillDispose(() => window.api.lsp.didClose(langId, toLspUri(model)))
    })
  }
  monaco.editor.getModels().forEach(hookModel)
  monaco.editor.onDidCreateModel(hookModel)

  // Providers för varje LSP-språk
  for (const langId of LSP_LANGS) {
    monaco.languages.registerCompletionItemProvider(langId, {
      triggerCharacters: ['.', ':', '>', '/', '"', "'"],
      async provideCompletionItems(model, position) {
        if (!(await ensure(langId))) return { suggestions: [] }
        const res = (await window.api.lsp.request(langId, 'textDocument/completion', {
          textDocument: { uri: toLspUri(model) },
          position: pos(position)
        })) as { items?: unknown[] } | unknown[] | null
        const items = (Array.isArray(res) ? res : (res?.items ?? [])) as {
          label: string
          kind?: number
          insertText?: string
          insertTextFormat?: number
          detail?: string
          documentation?: unknown
        }[]
        const word = model.getWordUntilPosition(position)
        const range: monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }
        return {
          suggestions: items.map((it) => ({
            label: it.label,
            kind: mapKind(it.kind ?? 1),
            insertText: it.insertText ?? it.label,
            insertTextRules:
              it.insertTextFormat === 2
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : undefined,
            detail: it.detail,
            documentation: it.documentation ? { value: markdownOf(it.documentation) } : undefined,
            range
          }))
        }
      }
    })

    monaco.languages.registerHoverProvider(langId, {
      async provideHover(model, position) {
        if (!(await ensure(langId))) return null
        const res = (await window.api.lsp.request(langId, 'textDocument/hover', {
          textDocument: { uri: toLspUri(model) },
          position: pos(position)
        })) as { contents?: unknown; range?: LspRange } | null
        if (!res?.contents) return null
        const value = markdownOf(res.contents)
        if (!value) return null
        return { contents: [{ value }], range: res.range ? toRange(res.range) : undefined }
      }
    })

    monaco.languages.registerDefinitionProvider(langId, {
      async provideDefinition(model, position) {
        if (!(await ensure(langId))) return null
        const res = (await window.api.lsp.request(langId, 'textDocument/definition', {
          textDocument: { uri: toLspUri(model) },
          position: pos(position)
        })) as { uri: string; range: LspRange } | { uri: string; range: LspRange }[] | null
        if (!res) return null
        const arr = Array.isArray(res) ? res : [res]
        return arr.map((loc) => ({ uri: toModelUri(loc.uri), range: toRange(loc.range) }))
      }
    })

    monaco.languages.registerReferenceProvider(langId, {
      async provideReferences(model, position, context) {
        if (!(await ensure(langId))) return []
        const res = (await window.api.lsp.request(langId, 'textDocument/references', {
          textDocument: { uri: toLspUri(model) },
          position: pos(position),
          context: { includeDeclaration: context.includeDeclaration }
        })) as { uri: string; range: LspRange }[] | null
        if (!Array.isArray(res)) return []
        return res.map((loc) => ({ uri: toModelUri(loc.uri), range: toRange(loc.range) }))
      }
    })

    monaco.languages.registerRenameProvider(langId, {
      async provideRenameEdits(model, position, newName) {
        if (!(await ensure(langId))) return { edits: [] }
        const res = (await window.api.lsp.request(langId, 'textDocument/rename', {
          textDocument: { uri: toLspUri(model) },
          position: pos(position),
          newName
        })) as {
          changes?: Record<string, { range: LspRange; newText: string }[]>
          documentChanges?: { textDocument: { uri: string }; edits: { range: LspRange; newText: string }[] }[]
        } | null
        const edits: monaco.languages.IWorkspaceTextEdit[] = []
        const add = (uri: string, tes: { range: LspRange; newText: string }[]): void => {
          for (const te of tes)
            edits.push({
              resource: toModelUri(uri),
              versionId: undefined,
              textEdit: { range: toRange(te.range), text: te.newText }
            })
        }
        if (res?.changes) for (const [uri, tes] of Object.entries(res.changes)) add(uri, tes)
        if (res?.documentChanges)
          for (const dc of res.documentChanges) add(dc.textDocument.uri, dc.edits)
        return { edits }
      }
    })
  }
}
