// Klickbara länkar i terminalen: URL:er och fil[:rad[:kol]].
//
// Söker i en *logisk* rad: när terminalen radbryter en lång rad består den av
// flera buffertrader, och en URL kan då spänna över brytningen. Raderna fogas
// ihop före sökningen och träffarna räknas tillbaka till (kolumn, rad) per
// buffertrad, så hela länken blir klickbar – inte bara första delen.

export interface TermLink {
  kind: 'url' | 'file'
  text: string // det som syns i terminalen
  target: string // URL eller sökväg
  line?: number // radnummer för fil-länkar
  start: { x: number; y: number } // 1-baserat, inklusive
  end: { x: number; y: number } // 1-baserat, inklusive
}

// Skiljetecken som avslutar en mening snarare än hör till URL:en
// ("…/account." ska inte öppna "account.").
const TRAILING_PUNCT = /[.,;:!?]+$/

// rows: texten för varje buffertrad i den logiska raden (otrimmad).
// firstY: 1-baserat radnummer för första raden.
export function findTermLinks(rows: string[], firstY: number): TermLink[] {
  const text = rows.join('')
  const offsets: number[] = []
  let acc = 0
  for (const r of rows) {
    offsets.push(acc)
    acc += r.length
  }
  const pos = (i: number): { x: number; y: number } => {
    let k = offsets.length - 1
    while (k > 0 && offsets[k] > i) k--
    return { x: i - offsets[k] + 1, y: firstY + k }
  }

  const links: TermLink[] = []
  let m: RegExpExecArray | null

  // URL:er
  const urlSpans: [number, number][] = []
  const urlRe = /https?:\/\/[^\s<>"'`)\]}]+/g
  while ((m = urlRe.exec(text))) {
    const url = m[0].replace(TRAILING_PUNCT, '')
    urlSpans.push([m.index, m.index + url.length])
    links.push({
      kind: 'url',
      text: url,
      target: url,
      start: pos(m.index),
      end: pos(m.index + url.length - 1)
    })
  }

  // fil[:rad[:kol]] – kräver filändelse för att undvika brus, och hoppar
  // träffar som ligger inuti en URL (t.ex. ".git" i en clone-url).
  // Ändelsen måste börja med bokstav → undviker att versionsnummer som
  // 3.14 eller v0.1.84 felaktigt blir "fil-länkar".
  const fileRe = /(?<![\w/\\.:-])((?:[A-Za-z]:[\\/])?[\w.\-/\\]+\.[A-Za-z][A-Za-z0-9]*)(?::(\d+))?(?::(\d+))?/g
  while ((m = fileRe.exec(text))) {
    const start = m.index
    if (urlSpans.some(([a, b]) => start >= a && start < b)) continue
    links.push({
      kind: 'file',
      text: m[0],
      target: m[1],
      line: m[2] ? Number(m[2]) : undefined,
      start: pos(start),
      end: pos(start + m[0].length - 1)
    })
  }
  return links
}
