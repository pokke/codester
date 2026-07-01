import { useEffect, useState } from 'react'
import { useToast } from '../ui/Toast'
import type { WorkflowRun } from '../../../shared/types'

function runState(run: WorkflowRun): { label: string; cls: string } {
  if (run.status !== 'completed') return { label: 'kör…', cls: 'pending' }
  if (run.conclusion === 'success') return { label: '✓', cls: 'success' }
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out')
    return { label: '✗', cls: 'failure' }
  return { label: run.conclusion ?? '–', cls: 'pending' }
}

export function GitHubActions(): JSX.Element {
  const { notify } = useToast()
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)

  const load = (): void => {
    setLoading(true)
    window.api.github.runs().then((r) => {
      setRuns(r.ok ? r.data : [])
      setLoading(false)
      if (!r.ok) notify(r.error, 'error')
    })
  }
  useEffect(load, [])

  const rerun = async (run: WorkflowRun): Promise<void> => {
    setBusy(run.id)
    const r = await window.api.github.rerun(run.id)
    setBusy(null)
    if (r.ok) {
      notify('Kör om workflow…', 'success')
      setTimeout(load, 1500)
    } else notify(r.error, 'error')
  }

  return (
    <>
      <div className="gh-list-head">
        <h3>Workflow-körningar</h3>
        <button className="btn small" onClick={load}>
          Uppdatera
        </button>
      </div>
      {loading && <div className="hint">Hämtar…</div>}
      {!loading && runs.length === 0 && <div className="hint">Inga körningar</div>}
      {runs.map((run) => {
        const st = runState(run)
        return (
          <div key={run.id} className="row run-row">
            <span className={`check-badge ${st.cls}`}>{st.label}</span>
            <div className="repo-main">
              <div className="fname">
                {run.name} <span className="muted">#{run.runNumber}</span>
              </div>
              <div className="path-dim">
                {run.branch} · {run.event} · {run.createdAt.slice(0, 10)}
              </div>
            </div>
            <button className="btn ghost small" onClick={() => window.open(run.htmlUrl)}>
              Öppna
            </button>
            {run.status === 'completed' && run.conclusion !== 'success' && (
              <button className="btn small" disabled={busy === run.id} onClick={() => rerun(run)}>
                Kör om
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}
