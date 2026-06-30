import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../ui/Toast'

interface TextSeg {
  type: 'text'
  value: string
}
interface ConflictSeg {
  type: 'conflict'
  id: number
  ours: string
  theirs: string
  base: string | null
}
type Seg = TextSeg | ConflictSeg
type Choice = 'ours' | 'theirs' | 'both-ot' | 'both-to'

// Tolkar git-konfliktmarkörer till segment. Stödjer både vanlig och diff3-form.
function parseConflicts(text: string): Seg[] {
  const lines = text.split('\n')
  const segs: Seg[] = []
  let buf: string[] = []
  let id = 0
  let i = 0

  const flushText = (): void => {
    if (buf.length) {
      segs.push({ type: 'text', value: buf.join('\n') })
      buf = []
    }
  }

  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      flushText()
      const ours: string[] = []
      const base: string[] = []
      const theirs: string[] = []
      let phase: 'ours' | 'base' | 'theirs' = 'ours'
      i++
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        if (lines[i].startsWith('|||||||')) phase = 'base'
        else if (lines[i].startsWith('=======')) phase = 'theirs'
        else if (phase === 'ours') ours.push(lines[i])
        else if (phase === 'base') base.push(lines[i])
        else theirs.push(lines[i])
        i++
      }
      i++ // hoppa över >>>>>>>-raden
      segs.push({
        type: 'conflict',
        id: id++,
        ours: ours.join('\n'),
        theirs: theirs.join('\n'),
        base: base.length ? base.join('\n') : null
      })
    } else {
      buf.push(lines[i])
      i++
    }
  }
  flushText()
  return segs
}

function resolveSeg(seg: ConflictSeg, choice: Choice | undefined): string | null {
  switch (choice) {
    case 'ours':
      return seg.ours
    case 'theirs':
      return seg.theirs
    case 'both-ot':
      return `${seg.ours}\n${seg.theirs}`
    case 'both-to':
      return `${seg.theirs}\n${seg.ours}`
    default:
      return null // ej beslutat
  }
}

export function ConflictResolver({
  path,
  onResolved
}: {
  path: string
  onResolved: () => void
}): JSX.Element {
  const { notify } = useToast()
  const [segs, setSegs] = useState<Seg[]>([])
  const [choices, setChoices] = useState<Record<number, Choice>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setChoices({})
    window.api.git.fileContent(path).then((r) => {
      setSegs(r.ok ? parseConflicts(r.data) : [])
      setLoading(false)
    })
  }, [path])

  const conflicts = useMemo(
    () => segs.filter((s): s is ConflictSeg => s.type === 'conflict'),
    [segs]
  )
  const decided = conflicts.filter((c) => choices[c.id]).length
  const allDecided = conflicts.length > 0 && decided === conflicts.length

  const buildResolved = (): string =>
    segs
      .map((s) => {
        if (s.type === 'text') return s.value
        const r = resolveSeg(s, choices[s.id])
        // Om obeslutat: behåll originalmarkörerna så inget tappas
        return r ?? `<<<<<<< HEAD\n${s.ours}\n=======\n${s.theirs}\n>>>>>>>`
      })
      .join('\n')

  const save = async (markResolved: boolean): Promise<void> => {
    const content = buildResolved()
    const res = await window.api.git.saveFile(path, content)
    if (!res.ok) {
      notify(`Kunde inte spara: ${res.error}`, 'error')
      return
    }
    if (markResolved) {
      await window.api.git.stage(path)
      notify(`${path} löst och stagad`, 'success')
      onResolved()
    } else {
      notify('Sparad', 'success')
    }
  }

  if (loading) return <div className="empty-state">Laddar…</div>

  const setChoice = (id: number, c: Choice): void =>
    setChoices((prev) => ({ ...prev, [id]: c }))

  return (
    <div className="conflict-resolver">
      <div className="conflict-bar">
        <span>
          {conflicts.length} konflikt{conflicts.length !== 1 ? 'er' : ''} · {decided} lösta
        </span>
        <span className="spacer" />
        <button className="btn" onClick={() => save(false)}>
          Spara
        </button>
        <button className="btn primary" disabled={!allDecided} onClick={() => save(true)}>
          Spara & markera löst
        </button>
      </div>

      <div className="conflict-body">
        {segs.map((s, idx) => {
          if (s.type === 'text') {
            return s.value.trim() ? (
              <pre key={idx} className="ctx-block">
                {s.value}
              </pre>
            ) : null
          }
          const choice = choices[s.id]
          return (
            <div key={idx} className={`conflict-hunk ${choice ? 'resolved' : ''}`}>
              <div className="hunk-head">
                <span>Konflikt #{s.id + 1}</span>
                <div className="hunk-choices">
                  <button
                    className={choice === 'ours' ? 'active' : ''}
                    onClick={() => setChoice(s.id, 'ours')}
                  >
                    Våra
                  </button>
                  <button
                    className={choice === 'theirs' ? 'active' : ''}
                    onClick={() => setChoice(s.id, 'theirs')}
                  >
                    Deras
                  </button>
                  <button
                    className={choice === 'both-ot' ? 'active' : ''}
                    onClick={() => setChoice(s.id, 'both-ot')}
                  >
                    Båda (V→D)
                  </button>
                  <button
                    className={choice === 'both-to' ? 'active' : ''}
                    onClick={() => setChoice(s.id, 'both-to')}
                  >
                    Båda (D→V)
                  </button>
                </div>
              </div>
              <div className="hunk-sides">
                <div className={`side ours ${choice === 'ours' ? 'picked' : ''}`}>
                  <div className="side-label">Våra (HEAD)</div>
                  <pre>{s.ours || '(tomt)'}</pre>
                </div>
                <div className={`side theirs ${choice === 'theirs' ? 'picked' : ''}`}>
                  <div className="side-label">Deras (inkommande)</div>
                  <pre>{s.theirs || '(tomt)'}</pre>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
