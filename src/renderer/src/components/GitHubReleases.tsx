import { useEffect, useState } from 'react'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/Confirm'
import { rowA11y } from '../ui/a11y'
import { Markdown } from '../ui/Markdown'
import { Loading, Empty } from '../ui/States'
import type { Release } from '../../../shared/types'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function EditRelease({
  rel,
  onDone,
  onCancel
}: {
  rel: Release
  onDone: () => void
  onCancel: () => void
}): JSX.Element {
  const { notify } = useToast()
  const [name, setName] = useState(rel.name)
  const [body, setBody] = useState(rel.body ?? '')
  const [prerelease, setPrerelease] = useState(rel.prerelease)
  const [busy, setBusy] = useState(false)

  const save = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    const r = await window.api.github.updateRelease(rel.id, { name, body, prerelease })
    setBusy(false)
    if (r.ok) {
      notify('Release uppdaterad', 'success')
      onDone()
    } else notify(r.error, 'error')
  }

  return (
    <div className="pr-create">
      <label className="field-label">Titel</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label className="field-label">Anteckningar (markdown)</label>
      <textarea className="pr-create-body" value={body} onChange={(e) => setBody(e.target.value)} />
      <label className="checkbox-row">
        <input type="checkbox" checked={prerelease} onChange={(e) => setPrerelease(e.target.checked)} />{' '}
        Pre-release
      </label>
      <div className="pr-review-actions">
        <button className="btn primary small" disabled={busy} onClick={save}>
          {busy ? 'Sparar…' : 'Spara'}
        </button>
        <button className="btn ghost small" disabled={busy} onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </div>
  )
}

function ReleaseDetail({
  rel,
  onBack,
  onChanged
}: {
  rel: Release
  onBack: () => void
  onChanged: () => void
}): JSX.Element {
  const { notify } = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const publish = async (): Promise<void> => {
    setBusy(true)
    const r = await window.api.github.updateRelease(rel.id, { draft: false })
    setBusy(false)
    if (r.ok) {
      notify('Release publicerad', 'success')
      onChanged()
    } else notify(r.error, 'error')
  }
  const remove = async (): Promise<void> => {
    const ok = await confirm({
      message: `Radera release ${rel.tagName}? Taggen finns kvar.`,
      confirmLabel: 'Radera'
    })
    if (!ok) return
    setBusy(true)
    const r = await window.api.github.deleteRelease(rel.id)
    setBusy(false)
    if (r.ok) {
      notify('Release raderad', 'success')
      onBack()
      onChanged()
    } else notify(r.error, 'error')
  }

  return (
    <div className="pr-detail">
      <div className="pr-detail-head">
        <button className="btn ghost small" onClick={onBack}>
          ← Tillbaka
        </button>
        <span className="spacer" />
        {!editing && (
          <>
            {rel.draft && (
              <button className="btn small" disabled={busy} onClick={publish}>
                Publicera
              </button>
            )}
            <button className="btn ghost small" disabled={busy} onClick={() => setEditing(true)}>
              Redigera
            </button>
            <button className="btn ghost small danger" disabled={busy} onClick={remove}>
              Radera
            </button>
            <button className="btn ghost small" onClick={() => window.open(rel.htmlUrl)}>
              Öppna på GitHub
            </button>
          </>
        )}
      </div>
      <h2 className="pr-detail-title">
        {rel.name} <span className="muted">{rel.tagName}</span>
      </h2>
      <div className="pr-detail-meta">
        {rel.draft && <span className="pr-state draft">Utkast</span>}
        {rel.prerelease && <span className="repo-badge">pre-release</span>}
        {rel.publishedAt && <span className="path-dim">{rel.publishedAt.slice(0, 10)}</span>}
        {rel.author && <span className="path-dim">@{rel.author}</span>}
      </div>

      {editing ? (
        <EditRelease
          rel={rel}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false)
            onChanged()
          }}
        />
      ) : (
        <>
          {rel.body ? (
            <div className="pr-body">
              <Markdown text={rel.body} />
            </div>
          ) : (
            <div className="hint">Inga release-anteckningar</div>
          )}
          {rel.assets.length > 0 && (
            <div className="release-assets">
              <label className="field-label">Filer ({rel.assets.length})</label>
              {rel.assets.map((a) => (
                <div key={a.id} className="row asset-row">
                  <span className="fname">{a.name}</span>
                  <span className="path-dim">{fmtBytes(a.size)}</span>
                  <span className="path-dim">↓ {a.downloadCount}</span>
                  <button className="btn ghost small" onClick={() => window.open(a.downloadUrl)}>
                    Ladda ner
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CreateRelease({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): JSX.Element {
  const { notify } = useToast()
  const [tagName, setTagName] = useState('')
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [target, setTarget] = useState('')
  const [draft, setDraft] = useState(false)
  const [prerelease, setPrerelease] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (!tagName.trim() || busy) return
    setBusy(true)
    const r = await window.api.github.createRelease({
      tagName: tagName.trim(),
      name: name.trim(),
      body,
      draft,
      prerelease,
      target: target.trim() || undefined
    })
    setBusy(false)
    if (r.ok) {
      notify(`Release ${r.data.tagName} skapad`, 'success')
      onCreated()
    } else notify(r.error, 'error')
  }

  return (
    <div className="pr-create">
      <div className="pr-detail-head">
        <button className="btn ghost small" onClick={onClose}>
          ← Tillbaka
        </button>
        <h3>Ny release</h3>
      </div>
      <label className="field-label">Tagg</label>
      <input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="v1.0.0" />
      <label className="field-label">Titel (valfri)</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Version 1.0.0" />
      <label className="field-label">Mål (branch/commit, valfri)</label>
      <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="main" />
      <label className="field-label">Anteckningar (markdown)</label>
      <textarea
        className="pr-create-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Vad är nytt?"
      />
      <label className="checkbox-row">
        <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Utkast
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={prerelease}
          onChange={(e) => setPrerelease(e.target.checked)}
        />{' '}
        Pre-release
      </label>
      <button className="btn primary full" disabled={!tagName.trim() || busy} onClick={submit}>
        {busy ? 'Skapar…' : 'Skapa release'}
      </button>
    </div>
  )
}

export function GitHubReleases(): JSX.Element {
  const { notify } = useToast()
  const [items, setItems] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  const load = (): void => {
    setLoading(true)
    window.api.github.releases().then((r) => {
      setItems(r.ok ? r.data : [])
      setLoading(false)
      if (!r.ok) notify(r.error, 'error')
    })
  }
  useEffect(load, [])

  if (creating)
    return (
      <CreateRelease
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false)
          load()
        }}
      />
    )
  const open = items.find((r) => r.id === openId)
  if (open)
    return <ReleaseDetail rel={open} onBack={() => setOpenId(null)} onChanged={load} />

  return (
    <>
      <div className="gh-list-head">
        <h3>Releaser</h3>
        <button className="btn small" onClick={() => setCreating(true)}>
          + Ny release
        </button>
      </div>
      {loading && <Loading />}
      {!loading && items.length === 0 && <Empty>Inga releaser</Empty>}
      {items.map((r) => (
        <div
          key={r.id}
          className="row pr-row"
          {...rowA11y(() => setOpenId(r.id))}
          onClick={() => setOpenId(r.id)}
        >
          <span className="pr-num">{r.tagName}</span>
          <span className="pr-title">
            {r.name}
            {r.draft && <span className="repo-badge">utkast</span>}
            {r.prerelease && <span className="repo-badge">pre</span>}
            {r.assets.length > 0 && <span className="repo-badge">{r.assets.length} filer</span>}
          </span>
          {r.publishedAt && <span className="path-dim">{r.publishedAt.slice(0, 10)}</span>}
        </div>
      ))}
    </>
  )
}
