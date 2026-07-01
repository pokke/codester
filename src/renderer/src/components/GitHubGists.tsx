import { useEffect, useState } from 'react'
import { useToast } from '../ui/Toast'
import { rowA11y } from '../ui/a11y'
import type { Gist } from '../../../shared/types'

function CreateGist({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): JSX.Element {
  const { notify } = useToast()
  const [description, setDescription] = useState('')
  const [filename, setFilename] = useState('')
  const [content, setContent] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (!content.trim() || busy) return
    setBusy(true)
    const r = await window.api.github.createGist(
      description.trim(),
      filename.trim() || 'gist.txt',
      content,
      isPublic
    )
    setBusy(false)
    if (r.ok) {
      notify('Gist skapad', 'success')
      onCreated()
    } else notify(r.error, 'error')
  }

  return (
    <div className="pr-create">
      <div className="pr-detail-head">
        <button className="btn ghost small" onClick={onClose}>
          ← Tillbaka
        </button>
        <h3>Ny gist</h3>
      </div>
      <label className="field-label">Beskrivning</label>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Vad är det här?" />
      <label className="field-label">Filnamn</label>
      <input value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="snippet.ts" />
      <label className="field-label">Innehåll</label>
      <textarea
        className="pr-create-body"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Klistra in kod eller text…"
        spellCheck={false}
      />
      <label className="checkbox-row">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />{' '}
        Publik
      </label>
      <button className="btn primary full" disabled={!content.trim() || busy} onClick={submit}>
        {busy ? 'Skapar…' : 'Skapa gist'}
      </button>
    </div>
  )
}

export function GitHubGists(): JSX.Element {
  const { notify } = useToast()
  const [items, setItems] = useState<Gist[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = (): void => {
    setLoading(true)
    window.api.github.gists().then((r) => {
      setItems(r.ok ? r.data : [])
      setLoading(false)
      if (!r.ok) notify(r.error, 'error')
    })
  }
  useEffect(load, [])

  if (creating)
    return (
      <CreateGist
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false)
          load()
        }}
      />
    )

  return (
    <>
      <div className="gh-list-head">
        <h3>Gists</h3>
        <button className="btn small" onClick={() => setCreating(true)}>
          + Ny gist
        </button>
      </div>
      {loading && <div className="hint">Hämtar…</div>}
      {!loading && items.length === 0 && <div className="hint">Inga gists</div>}
      {items.map((g) => (
        <div
          key={g.id}
          className="row pr-row"
          {...rowA11y(() => window.open(g.htmlUrl))}
          onClick={() => window.open(g.htmlUrl)}
        >
          <span className="pr-title">
            {g.description}
            {!g.public && <span className="repo-badge">privat</span>}
          </span>
          <span className="path-dim">
            {g.files.join(', ')} · {g.updatedAt.slice(0, 10)}
          </span>
        </div>
      ))}
    </>
  )
}
