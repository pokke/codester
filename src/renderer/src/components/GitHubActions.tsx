import { useEffect, useRef, useState } from 'react'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/Confirm'
import { rowA11y } from '../ui/a11y'
import { Loading, Empty } from '../ui/States'
import type { WorkflowJob, WorkflowRun } from '../../../shared/types'

function statusIcon(status: string, conclusion: string | null): { label: string; cls: string } {
  if (status !== 'completed') return { label: '●', cls: 'pending' }
  if (conclusion === 'success') return { label: '✓', cls: 'success' }
  if (conclusion === 'failure' || conclusion === 'timed_out') return { label: '✗', cls: 'failure' }
  if (conclusion === 'cancelled' || conclusion === 'skipped') return { label: '–', cls: 'pending' }
  return { label: conclusion ?? '–', cls: 'pending' }
}

const isActive = (r: WorkflowRun): boolean => r.status !== 'completed'

function Jobs({ runId }: { runId: number }): JSX.Element {
  const [jobs, setJobs] = useState<WorkflowJob[] | null>(null)
  useEffect(() => {
    let stop = false
    window.api.github.runJobs(runId).then((r) => {
      if (!stop) setJobs(r.ok ? r.data : [])
    })
    return () => {
      stop = true
    }
  }, [runId])

  if (!jobs) return <div className="hint run-jobs">Hämtar jobb…</div>
  if (!jobs.length) return <div className="hint run-jobs">Inga jobb</div>
  return (
    <div className="run-jobs">
      {jobs.map((j) => {
        const ji = statusIcon(j.status, j.conclusion)
        return (
          <div key={j.id} className="run-job">
            <div className="run-job-head">
              <span className={`check-badge ${ji.cls}`}>{ji.label}</span>
              <span className="fname">{j.name}</span>
            </div>
            <div className="run-steps">
              {j.steps.map((s) => {
                const si = statusIcon(s.status, s.conclusion)
                return (
                  <div key={s.number} className="run-step">
                    <span className={`step-dot ${si.cls}`}>{si.label}</span>
                    <span>{s.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function GitHubActions(): JSX.Element {
  const { notify } = useToast()
  const confirm = useConfirm()
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = (showSpinner = true): void => {
    if (showSpinner) setLoading(true)
    window.api.github.runs().then((r) => {
      setRuns(r.ok ? r.data : [])
      setLoading(false)
      if (!r.ok) notify(r.error, 'error')
    })
  }
  useEffect(() => load(), [])

  // Auto-uppdatera medan någon körning pågår (stannar av sig själv).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (runs.some(isActive)) {
      timer.current = setTimeout(() => load(false), 5000)
    }
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [runs])

  const act = async (
    runId: number,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    msg: string
  ): Promise<void> => {
    setBusy(runId)
    const r = await fn()
    setBusy(null)
    if (r.ok) {
      notify(msg, 'success')
      setTimeout(() => load(false), 1500)
    } else notify(r.error ?? 'Fel', 'error')
  }

  return (
    <>
      <div className="gh-list-head">
        <h3>Workflow-körningar</h3>
        {runs.some(isActive) && <span className="path-dim run-live">● live</span>}
        <button className="btn small" onClick={() => load()}>
          Uppdatera
        </button>
      </div>
      {loading && <Loading />}
      {!loading && runs.length === 0 && <Empty>Inga körningar</Empty>}
      {runs.map((run) => {
        const st = statusIcon(run.status, run.conclusion)
        const open = expanded === run.id
        const failed = run.status === 'completed' && run.conclusion !== 'success'
        return (
          <div key={run.id} className="run-item">
            <div className="row run-row">
              <span
                className="icon"
                {...rowA11y(() => setExpanded(open ? null : run.id))}
                onClick={() => setExpanded(open ? null : run.id)}
              >
                {open ? '▾' : '▸'}
              </span>
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
              {isActive(run) && (
                <button
                  className="btn small"
                  disabled={busy === run.id}
                  onClick={() =>
                    confirm({
                      message: `Avbryt körning #${run.runNumber}?`,
                      confirmLabel: 'Avbryt körning'
                    }).then((ok) => {
                      if (ok) act(run.id, () => window.api.github.cancelRun(run.id), 'Avbryter körning…')
                    })
                  }
                >
                  Avbryt
                </button>
              )}
              {failed && (
                <>
                  <button
                    className="btn small"
                    disabled={busy === run.id}
                    onClick={() =>
                      act(run.id, () => window.api.github.rerunFailed(run.id), 'Kör om misslyckade jobb…')
                    }
                  >
                    Kör om felade
                  </button>
                  <button
                    className="btn ghost small"
                    disabled={busy === run.id}
                    onClick={() => act(run.id, () => window.api.github.rerun(run.id), 'Kör om workflow…')}
                  >
                    Kör om allt
                  </button>
                </>
              )}
            </div>
            {open && <Jobs runId={run.id} />}
          </div>
        )
      })}
    </>
  )
}
