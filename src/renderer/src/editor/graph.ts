import type { CommitLogEntry } from '../../../shared/types'

// Beräknar en enkel commit-graf (lanes) från en lista commits i
// omvänd kronologisk ordning. Varje commit får en kolumn, och vi spårar
// linjer ner till föräldrarna så att grenar och merges kan ritas.

export interface GraphRow {
  col: number
  // Linjer från denna rad ner till nästa rad: par av (övre kolumn, undre kolumn)
  links: { from: number; to: number }[]
  maxCols: number
}

export function computeGraph(commits: CommitLogEntry[]): GraphRow[] {
  const rows: GraphRow[] = []
  let lanes: (string | null)[] = [] // förväntad hash i varje lane

  let overallMax = 1

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i]

    // Hitta min lane (där min hash förväntas), annars ta en ledig
    let col = lanes.findIndex((l) => l === c.hash)
    if (col === -1) {
      col = lanes.findIndex((l) => l === null)
      if (col === -1) {
        col = lanes.length
        lanes.push(null)
      }
    }
    lanes[col] = c.hash

    // Tilldela föräldrar till lanes
    if (c.parents.length === 0) {
      lanes[col] = null
    } else {
      lanes[col] = c.parents[0]
      for (let p = 1; p < c.parents.length; p++) {
        const parent = c.parents[p]
        let pc = lanes.findIndex((l) => l === parent)
        if (pc === -1) {
          pc = lanes.findIndex((l) => l === null)
          if (pc === -1) {
            pc = lanes.length
            lanes.push(null)
          }
          lanes[pc] = parent
        }
      }
    }

    // Komprimera bort tomma lanes i slutet
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()

    // Beräkna länkar till nästa rad: varje aktiv lane går till sin
    // kolumn i nästa rad (samma index, eller commitens kolumn om nästa
    // commit är den lane väntar på).
    const next = commits[i + 1]
    const links: { from: number; to: number }[] = []
    lanes.forEach((h, laneIdx) => {
      if (h === null) return
      let to = laneIdx
      if (next && h === next.hash) {
        const firstIdx = lanes.findIndex((l) => l === next.hash)
        to = firstIdx === -1 ? laneIdx : firstIdx
      }
      links.push({ from: laneIdx, to })
    })

    overallMax = Math.max(overallMax, lanes.length, col + 1)
    rows.push({ col, links, maxCols: lanes.length })
  }

  return rows.map((r) => ({ ...r, maxCols: overallMax }))
}

// Stabil färgpalett (CSS-variabler) per kolumn
export const laneColors = [
  'var(--accent)',
  'var(--syn-function)',
  'var(--syn-type)',
  'var(--added)',
  'var(--syn-keyword)',
  'var(--syn-number)',
  'var(--removed)'
]

export function laneColor(col: number): string {
  return laneColors[col % laneColors.length]
}
