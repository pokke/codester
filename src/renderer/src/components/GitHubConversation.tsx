import { Markdown } from '../ui/Markdown'
import type { GhComment, PrReview } from '../../../shared/types'

export function fmtDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('sv-SE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

function reviewLabel(state: string): { text: string; cls: string } {
  switch (state) {
    case 'APPROVED':
      return { text: '✓ godkände', cls: 'approve' }
    case 'CHANGES_REQUESTED':
      return { text: '✗ begärde ändringar', cls: 'request' }
    case 'DISMISSED':
      return { text: 'avfärdad review', cls: '' }
    default:
      return { text: 'kommenterade', cls: '' }
  }
}

type Item =
  | { kind: 'comment'; at: string; data: GhComment }
  | { kind: 'review'; at: string; data: PrReview }

// Slår ihop kommentarer och reviews till en tidsordnad tråd.
export function Conversation({
  comments,
  reviews
}: {
  comments: GhComment[]
  reviews?: PrReview[]
}): JSX.Element | null {
  const items: Item[] = [
    ...comments.map((c) => ({ kind: 'comment' as const, at: c.createdAt, data: c })),
    ...(reviews ?? [])
      // Reviews utan text och utan tydlig status ger inget – hoppa dem.
      .filter((r) => r.body.trim() || r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED')
      .map((r) => ({ kind: 'review' as const, at: r.submittedAt, data: r }))
  ].sort((a, b) => a.at.localeCompare(b.at))

  if (!items.length) return null

  return (
    <div className="gh-thread">
      {items.map((it) =>
        it.kind === 'comment' ? (
          <div key={`c${it.data.id}`} className="gh-comment">
            <div className="gh-comment-head">
              <strong>@{it.data.author}</strong>
              <span className="path-dim">{fmtDate(it.data.createdAt)}</span>
            </div>
            <Markdown text={it.data.body} />
          </div>
        ) : (
          <div key={`r${it.data.id}`} className={`gh-comment gh-review ${reviewLabel(it.data.state).cls}`}>
            <div className="gh-comment-head">
              <strong>@{it.data.author}</strong>
              <span className={`gh-review-state ${reviewLabel(it.data.state).cls}`}>
                {reviewLabel(it.data.state).text}
              </span>
              <span className="path-dim">{fmtDate(it.data.submittedAt)}</span>
            </div>
            {it.data.body.trim() && <Markdown text={it.data.body} />}
          </div>
        )
      )}
    </div>
  )
}
