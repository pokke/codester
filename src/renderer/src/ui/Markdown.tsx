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
  // Auto-länka nakna URL:er som inte redan ingår i en markdown-länk (undvik
  // träffar direkt efter " ( eller > som betyder att de redan är i en <a>).
  s = s.replace(/(^|[^"(>])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '$1<a href="$2" data-ext>$2</a>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  return s
}

// Task-list-rad: "[ ] text" eller "[x] text". Ger en avstängd kryssruta.
function taskItem(content: string): string | null {
  const m = content.match(/^\[([ xX])\]\s+(.*)$/)
  if (!m) return null
  const checked = m[1].toLowerCase() === 'x' ? ' checked' : ''
  return `<li class="task"><input type="checkbox" disabled${checked}> ${inline(m[2])}</li>`
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
  let list: 'ul' | 'ol' | null = null
  let inQuote = false
  const closeList = (): void => {
    if (list) {
      out.push(`</${list}>`)
      list = null
    }
  }
  const closeQuote = (): void => {
    if (inQuote) {
      out.push('</blockquote>')
      inQuote = false
    }
  }
  const openList = (type: 'ul' | 'ol'): void => {
    if (list !== type) {
      closeList()
      out.push(`<${type}>`)
      list = type
    }
  }
  const codeRe = new RegExp(`^${CB_OPEN}(\\d+)${CB_CLOSE}$`)
  for (const raw of lines) {
    const codeM = raw.match(codeRe)
    if (codeM) {
      closeList()
      closeQuote()
      out.push(`<pre class="md-code"><code>${escapeHtml(blocks[Number(codeM[1])])}</code></pre>`)
      continue
    }
    const h = raw.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      closeList()
      closeQuote()
      const lvl = Math.min(h[1].length + 2, 6)
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`)
      continue
    }
    const quote = raw.match(/^\s*>\s?(.*)$/)
    if (quote) {
      closeList()
      if (!inQuote) {
        out.push('<blockquote>')
        inQuote = true
      }
      out.push(`<p>${inline(quote[1])}</p>`)
      continue
    }
    const ul = raw.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      closeQuote()
      openList('ul')
      out.push(taskItem(ul[1]) ?? `<li>${inline(ul[1])}</li>`)
      continue
    }
    const ol = raw.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      closeQuote()
      openList('ol')
      out.push(`<li>${inline(ol[1])}</li>`)
      continue
    }
    if (raw.trim() === '') {
      closeList()
      closeQuote()
      continue
    }
    closeList()
    closeQuote()
    out.push(`<p>${inline(raw)}</p>`)
  }
  closeList()
  closeQuote()
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
