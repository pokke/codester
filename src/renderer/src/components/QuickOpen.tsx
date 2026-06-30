import { useMemo, useState } from 'react'
import { useRepo } from '../state/RepoContext'

interface Props {
  onClose: () => void
  onPick: () => void
}

export function QuickOpen({ onClose, onPick }: Props): JSX.Element {
  const { files, selectPath } = useRepo()
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)

  const results = useMemo(() => {
    const q = query.toLowerCase().trim()
    const list = q ? files.filter((f) => f.toLowerCase().includes(q)) : files
    return list.slice(0, 50)
  }, [files, query])

  const open = (path: string | undefined): void => {
    if (!path) return
    selectPath(path)
    onPick()
    onClose()
  }

  return (
    <div className="overlay palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Hoppa till fil…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSel(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, results.length - 1))
            if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0))
            if (e.key === 'Enter') open(results[sel])
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="palette-list">
          {results.map((path, i) => (
            <div
              key={path}
              className={`palette-item ${i === sel ? 'active' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => open(path)}
            >
              <span className="fname">{path.split('/').pop()}</span>
              <span className="path-dim">{path.split('/').slice(0, -1).join('/')}</span>
            </div>
          ))}
          {results.length === 0 && <div className="palette-item muted">Inga filer</div>}
        </div>
      </div>
    </div>
  )
}
