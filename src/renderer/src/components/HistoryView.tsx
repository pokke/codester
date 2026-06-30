import { useMemo, useState } from 'react'
import { useRepo } from '../state/RepoContext'
import { computeGraph, laneColor } from '../editor/graph'
import { CommitDetails } from './CommitDetails'
import type { CommitLogEntry } from '../../../shared/types'

const ROW_H = 50
const COL_W = 16
const DOT_R = 4.5

export function HistoryView(): JSX.Element {
  const { log } = useRepo()
  const [selected, setSelected] = useState<CommitLogEntry | null>(null)
  const graph = useMemo(() => computeGraph(log), [log])

  if (selected) {
    return <CommitDetails commit={selected} onBack={() => setSelected(null)} />
  }
  const maxCols = graph[0]?.maxCols ?? 1
  const gutter = Math.max(1, maxCols) * COL_W + COL_W

  if (log.length === 0) {
    return (
      <main className="panel center">
        <div className="panel-header">
          <span>Historik</span>
        </div>
        <div className="empty-state">Ingen historik att visa.</div>
      </main>
    )
  }

  const x = (col: number): number => COL_W / 2 + col * COL_W

  return (
    <main className="panel center">
      <div className="panel-header">
        <span>Historik ({log.length} commits)</span>
      </div>
      <div className="history">
        <div className="history-inner" style={{ position: 'relative' }}>
          {/* SVG-graf till vänster */}
          <svg
            className="graph-svg"
            width={gutter}
            height={log.length * ROW_H}
            style={{ position: 'absolute', left: 0, top: 0 }}
          >
            {graph.map((row, i) => {
              const y = i * ROW_H + ROW_H / 2
              return (
                <g key={log[i].hash}>
                  {/* linjer ner till nästa rad */}
                  {row.links.map((lnk, j) => (
                    <path
                      key={j}
                      d={`M ${x(lnk.from)} ${y} C ${x(lnk.from)} ${y + ROW_H / 2}, ${x(
                        lnk.to
                      )} ${y + ROW_H / 2}, ${x(lnk.to)} ${y + ROW_H}`}
                      stroke={laneColor(lnk.from)}
                      strokeWidth={2}
                      fill="none"
                    />
                  ))}
                  {/* commit-prick */}
                  <circle cx={x(row.col)} cy={y} r={DOT_R} fill={laneColor(row.col)} />
                </g>
              )
            })}
          </svg>

          {/* commit-rader */}
          {log.map((c) => (
            <div
              key={c.hash}
              className="commit-row clickable"
              style={{ height: ROW_H, marginLeft: gutter }}
              onClick={() => setSelected(c)}
            >
              <div className="commit-main">
                <div className="commit-msg">
                  {c.message}
                  {c.refs && <span className="ref-badge">{c.refs}</span>}
                </div>
                <div className="commit-meta">
                  <span className="hash">{c.shortHash}</span>
                  <span>{c.author}</span>
                  <span>{c.date.slice(0, 16).replace('T', ' ')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
