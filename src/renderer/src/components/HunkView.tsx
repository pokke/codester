import { useEffect, useState } from 'react'
import { useRepo } from '../state/RepoContext'
import { useConfirm } from '../ui/Confirm'

function hunksOf(patch: string): string[] {
  const lines = patch.split('\n')
  const hunks: string[] = []
  let cur: string[] | null = null
  for (const l of lines) {
    if (l.startsWith('@@')) {
      if (cur) hunks.push(cur.join('\n'))
      cur = [l]
    } else if (cur) {
      cur.push(l)
    }
  }
  if (cur) hunks.push(cur.join('\n'))
  return hunks
}

function HunkBody({ hunk }: { hunk: string }): JSX.Element {
  return (
    <pre className="hunk-body">
      {hunk.split('\n').map((line, i) => {
        const cls = line.startsWith('@@')
          ? 'hl-head'
          : line.startsWith('+')
            ? 'hl-add'
            : line.startsWith('-')
              ? 'hl-del'
              : 'hl-ctx'
        return (
          <div key={i} className={`hl ${cls}`}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

export function HunkView({ file }: { file: string }): JSX.Element {
  const { stageHunk, unstageHunk, discardHunk, revision } = useRepo()
  const confirm = useConfirm()
  const [working, setWorking] = useState<string[]>([])
  const [staged, setStaged] = useState<string[]>([])

  useEffect(() => {
    window.api.git.diff(file, false).then((r) => setWorking(r.ok ? hunksOf(r.data.patch) : []))
    window.api.git.diff(file, true).then((r) => setStaged(r.ok ? hunksOf(r.data.patch) : []))
  }, [file, revision])

  const askDiscard = async (i: number): Promise<void> => {
    if (await confirm({ message: 'Kasta den här ändringen?', confirmLabel: 'Kasta', danger: true }))
      discardHunk(file, i)
  }

  return (
    <div className="hunkview">
      <div className="hunk-section-title">Stagade ({staged.length})</div>
      {staged.length === 0 && <div className="hint">Inget stagat</div>}
      {staged.map((h, i) => (
        <div key={`s${i}`} className="hunk">
          <div className="hunk-actions">
            <button className="btn ghost" onClick={() => unstageHunk(file, i)}>
              − Avstagea
            </button>
          </div>
          <HunkBody hunk={h} />
        </div>
      ))}

      <div className="hunk-section-title" style={{ marginTop: 'var(--space)' }}>
        Ändringar ({working.length})
      </div>
      {working.length === 0 && <div className="hint">Inga ostagade hunkar</div>}
      {working.map((h, i) => (
        <div key={`w${i}`} className="hunk">
          <div className="hunk-actions">
            <button className="btn ghost" onClick={() => stageHunk(file, i)}>
              + Stagea
            </button>
            <button className="btn ghost" onClick={() => askDiscard(i)}>
              ⨯ Kasta
            </button>
          </div>
          <HunkBody hunk={h} />
        </div>
      ))}
    </div>
  )
}
