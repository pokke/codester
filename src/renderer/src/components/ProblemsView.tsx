import { useMemo } from 'react'
import { useRepo } from '../state/RepoContext'
import { useProblems, type Problem } from '../editor/markers'
import { monaco } from '../editor/monaco'
import { Icon } from '../ui/Icon'

function sevIcon(sev: number): { icon: string; cls: string } {
  if (sev === monaco.MarkerSeverity.Error) return { icon: '✖', cls: 'sev-error' }
  if (sev === monaco.MarkerSeverity.Warning) return { icon: '⚠', cls: 'sev-warning' }
  return { icon: 'ℹ', cls: 'sev-info' }
}

export function ProblemsView({ onOpenFile }: { onOpenFile: () => void }): JSX.Element {
  const problems = useProblems()
  const { selectPath } = useRepo()

  const grouped = useMemo(() => {
    const map = new Map<string, Problem[]>()
    for (const p of problems) {
      const arr = map.get(p.path) ?? []
      arr.push(p)
      map.set(p.path, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [problems])

  return (
    <main className="panel center">
      <div className="panel-header">
        <span>Problem ({problems.length})</span>
      </div>
      {problems.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 34 }}>✓</div>
          <p>Inga problem hittades.</p>
        </div>
      ) : (
        <div className="problems">
          {grouped.map(([path, list]) => (
            <div key={path} className="problem-group">
              <div className="problem-file">
                <span className="icon">
                  <Icon name="file" size={14} />
                </span>
                {path} <span className="badge">{list.length}</span>
              </div>
              {list.map((p, i) => {
                const s = sevIcon(p.severity)
                return (
                  <div
                    key={i}
                    className="problem-row"
                    onClick={() => {
                      selectPath(p.path, p.line)
                      onOpenFile()
                    }}
                    title={`${p.path}:${p.line}`}
                  >
                    <span className={`sev ${s.cls}`}>{s.icon}</span>
                    <span className="problem-msg">{p.message}</span>
                    <span className="problem-loc">
                      {p.source ? `${p.source} · ` : ''}
                      {p.line}:{p.column}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
