import { useEffect, useRef, useState } from 'react'
import type { LangServerStatus } from '../../../shared/types'
import { useToast } from '../ui/Toast'

export function LangServersSettings(): JSX.Element {
  const { notify } = useToast()
  const [servers, setServers] = useState<LangServerStatus[]>([])
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [log, setLog] = useState('')
  const logRef = useRef<HTMLPreElement>(null)

  const load = (): void => {
    window.api.langServers.list().then((r) => {
      if (r.ok) setServers(r.data)
    })
  }
  useEffect(load, [])

  useEffect(() => {
    return window.api.langServers.onOutput(({ text }) => setLog((prev) => prev + text))
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const install = async (s: LangServerStatus): Promise<void> => {
    setInstallingId(s.id)
    setLog('')
    const res = await window.api.langServers.install(s.id)
    setInstallingId(null)
    if (res.ok) {
      notify(`${s.name} installerad`, 'success')
    } else {
      notify(`Installationen av ${s.name} misslyckades`, 'error')
    }
    load()
  }

  return (
    <div className="field">
      <label>Språkservrar (IntelliSense för fler språk)</label>
      <div className="langserver-list">
        {servers.map((s) => (
          <div key={s.id} className="langserver">
            <div className="ls-main">
              <div className="ls-name">
                {s.name}
                {s.installed && <span className="ls-badge ok">Installerad</span>}
              </div>
              <div className="ls-desc muted small">{s.description}</div>
              {!s.installed && s.installCmd && (
                <code className="ls-cmd">{s.installCmd}</code>
              )}
              {!s.installed && !s.installCmd && s.manualHint && (
                <div className="muted small">{s.manualHint}</div>
              )}
              {!s.installed && s.installCmd && !s.prereqOk && (
                <div className="ls-warn small">
                  Kräver <strong>{s.prereq}</strong> i PATH
                </div>
              )}
            </div>
            <div className="ls-action">
              {s.installed ? (
                <span className="ls-check">✓</span>
              ) : s.installCmd ? (
                <button
                  className="btn primary"
                  disabled={!s.prereqOk || installingId !== null}
                  onClick={() => install(s)}
                >
                  {installingId === s.id ? 'Installerar…' : 'Installera'}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {(installingId || log) && (
        <pre className="ls-log" ref={logRef}>
          {log || 'Startar…'}
        </pre>
      )}
    </div>
  )
}
