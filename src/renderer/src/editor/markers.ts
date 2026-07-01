import { useEffect, useState } from 'react'
import { monaco } from './monaco'

// Samlar diagnostik (Monacos modellmarkörer) från både inbyggda TS/JS-motorn
// och LSP-servrarna till en enhetlig lista för Problems-panelen.

export interface Problem {
  path: string
  line: number
  column: number
  message: string
  severity: number // monaco.MarkerSeverity
  source?: string
}

function collect(): Problem[] {
  return monaco.editor
    .getModelMarkers({})
    .filter((m) => m.resource.scheme === 'file' && m.severity >= monaco.MarkerSeverity.Info)
    .map((m) => ({
      path: m.resource.path.replace(/^\//, ''),
      line: m.startLineNumber,
      column: m.startColumn,
      message: m.message,
      severity: m.severity,
      source: m.source
    }))
    .sort((a, b) =>
      b.severity - a.severity || a.path.localeCompare(b.path) || a.line - b.line
    )
}

export function useProblems(): Problem[] {
  const [problems, setProblems] = useState<Problem[]>([])
  useEffect(() => {
    const update = (): void => setProblems(collect())
    update()
    const d = monaco.editor.onDidChangeMarkers(update)
    return () => d.dispose()
  }, [])
  return problems
}

export function counts(problems: Problem[]): { errors: number; warnings: number } {
  let errors = 0
  let warnings = 0
  for (const p of problems) {
    if (p.severity === monaco.MarkerSeverity.Error) errors++
    else if (p.severity === monaco.MarkerSeverity.Warning) warnings++
  }
  return { errors, warnings }
}
