import { useEffect, useState } from 'react'
import { useToast } from '../ui/Toast'
import type { RepoInsights } from '../../../shared/types'

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Rust: '#dea584',
  Go: '#00add8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#888888',
  'C#': '#178600',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Shell: '#89e051',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Swift: '#f05138',
  Kotlin: '#a97bff',
  Vue: '#41b883',
  Dart: '#00b4ab'
}
const FALLBACK = ['#6e7681', '#8957e5', '#1f6feb', '#2ea043', '#db6d28', '#cf222e']
function langColor(name: string, i: number): string {
  return LANG_COLORS[name] ?? FALLBACK[i % FALLBACK.length]
}

export function GitHubInsights(): JSX.Element {
  const { notify } = useToast()
  const [data, setData] = useState<RepoInsights | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.api.github.insights().then((r) => {
      if (r.ok) setData(r.data)
      else notify(r.error, 'error')
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="hint">Hämtar…</div>
  if (!data) return <div className="hint">Kunde inte hämta insikter</div>

  const total = data.languages.reduce((n, l) => n + l.bytes, 0) || 1

  return (
    <div className="insights">
      <section>
        <h3>Språk</h3>
        {data.languages.length === 0 ? (
          <div className="hint">Ingen språkdata</div>
        ) : (
          <>
            <div className="lang-bar">
              {data.languages.map((l, i) => (
                <span
                  key={l.name}
                  className="lang-seg"
                  style={{ width: `${(l.bytes / total) * 100}%`, background: langColor(l.name, i) }}
                  title={`${l.name} ${((l.bytes / total) * 100).toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="lang-legend">
              {data.languages.slice(0, 8).map((l, i) => (
                <span key={l.name} className="repo-lang">
                  <span className="lang-dot" style={{ background: langColor(l.name, i) }} />
                  {l.name} {((l.bytes / total) * 100).toFixed(1)}%
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section>
        <h3>Bidragsgivare</h3>
        {data.contributors.length === 0 ? (
          <div className="hint">Ingen data</div>
        ) : (
          data.contributors.map((c) => (
            <div key={c.login} className="row contrib-row">
              <img className="avatar sm" src={c.avatarUrl} alt="" />
              <span className="fname">{c.login}</span>
              <span className="spacer" />
              <span className="path-dim">{c.contributions} commits</span>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
