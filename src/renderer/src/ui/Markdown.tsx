import { useMemo } from 'react'

// Minimal, XSS-säker markdown → HTML. All indata escapas först; endast våra
// egna taggar läggs till, så ingen råm-HTML från GitHub kan köras. Länkar får
// data-ext och öppnas externt via klick-delegering.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(t: string): string {
  let s = escapeHtml(t)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" data-ext>$1</a>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  return s
}

const CB_OPEN = 'CB'
const CB_CLOSE = ''

export function renderMarkdown(md: string): string {
  const blocks: string[] = []
  // Skydda fenced code blocks från vidare bearbetning med en osynlig markör
  const protectedMd = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    blocks.push(String(code).replace(/\n$/, ''))
    return CB_OPEN + (blocks.length - 1) + CB_CLOSE
  })
  const lines = protectedMd.split('\n')
  const out: string[] = []
  let inList = false
  const closeList = (): void => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }
  const codeRe = new RegExp(`^${CB_OPEN}(\\d+)${CB_CLOSE}$`)
  for (const raw of lines) {
    const codeM = raw.match(codeRe)
    if (codeM) {
      closeList()
      out.push(`<pre class="md-code"><code>${escapeHtml(blocks[Number(codeM[1])])}</code></pre>`)
      continue
    }
    const h = raw.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      closeList()
      const lvl = Math.min(h[1].length + 2, 6)
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`)
      continue
    }
    const li = raw.match(/^\s*[-*]\s+(.*)$/)
    if (li) {
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${inline(li[1])}</li>`)
      continue
    }
    if (raw.trim() === '') {
      closeList()
      continue
    }
    closeList()
    out.push(`<p>${inline(raw)}</p>`)
  }
  closeList()
  return out.join('\n')
}

export function Markdown({ text }: { text: string }): JSX.Element {
  const html = useMemo(() => renderMarkdown(text), [text])
  const onClick = (e: React.MouseEvent): void => {
    const a = (e.target as HTMLElement).closest('a[data-ext]') as HTMLAnchorElement | null
    if (a) {
      e.preventDefault()
      window.open(a.href)
    }
  }
  return <div className="markdown" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
