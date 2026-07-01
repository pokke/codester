import { useEffect, useState } from 'react'
import { useToast } from '../ui/Toast'
import { rowA11y } from '../ui/a11y'
import type { GhNotification } from '../../../shared/types'

export function GitHubNotifications({ onChanged }: { onChanged?: () => void }): JSX.Element {
  const { notify } = useToast()
  const [items, setItems] = useState<GhNotification[]>([])
  const [loading, setLoading] = useState(true)

  const load = (): void => {
    setLoading(true)
    window.api.github.notifications().then((r) => {
      setItems(r.ok ? r.data : [])
      setLoading(false)
      if (!r.ok) notify(r.error, 'error')
    })
  }
  useEffect(load, [])

  const open = (n: GhNotification): void => {
    window.open(n.url)
    window.api.github.markNotifRead(n.id).then(() => {
      setItems((x) => x.filter((i) => i.id !== n.id))
      onChanged?.()
    })
  }

  return (
    <>
      <div className="gh-list-head">
        <h3>Notiser {items.length > 0 && <span className="muted small">({items.length})</span>}</h3>
        <button className="btn small" onClick={load}>
          Uppdatera
        </button>
      </div>
      {loading && <div className="hint">Hämtar…</div>}
      {!loading && items.length === 0 && <div className="hint">Inga olästa notiser</div>}
      {items.map((n) => (
        <div
          key={n.id}
          className="row notif-row"
          {...rowA11y(() => open(n))}
          onClick={() => open(n)}
          title={`${n.repo} · ${n.reason}`}
        >
          <div className="notif-main">
            <div className="fname">{n.title}</div>
            <div className="path-dim">
              {n.repo} · {n.reason} · {n.type}
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
