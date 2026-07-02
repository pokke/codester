import { useState } from 'react'
import { useRepo } from '../state/RepoContext'
import { useToast } from '../ui/Toast'

// Visas i GitHub-vyns repo-scope när det aktiva repot saknar github-remote.
// Skapar ett repo på användarens konto och pushar upp den lokala koden.
export function GitHubPublish({ onPublished }: { onPublished: () => void }): JSX.Element {
  const { repo, refresh } = useRepo()
  const { notify } = useToast()
  const [name, setName] = useState(repo?.name ?? '')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(true)
  const [busy, setBusy] = useState(false)

  const publish = async (): Promise<void> => {
    if (!name.trim() || busy) return
    setBusy(true)
    const r = await window.api.github.publish(name.trim(), description, isPrivate)
    setBusy(false)
    if (r.ok) {
      notify(`Publicerade på GitHub: ${r.data.fullName}`, 'success')
      await refresh()
      onPublished()
    } else {
      notify(r.error, 'error')
    }
  }

  return (
    <div className="gh-publish">
      <div className="gh-publish-hero">
        <div className="gh-publish-icon">⤒</div>
        <h3>Publicera på GitHub</h3>
        <p className="muted small">
          Det här projektet är inte kopplat till GitHub än. Skapa ett repo och pusha upp koden – med
          din anslutna token, ingen extra inloggning behövs.
        </p>
      </div>

      <label className="field-label">Repo-namn</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.replace(/\s+/g, '-'))}
        placeholder="mitt-projekt"
        disabled={busy}
      />

      <label className="field-label">Beskrivning (valfri)</label>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Kort beskrivning"
        disabled={busy}
      />

      <div className="gh-publish-vis">
        <label className={`vis-opt ${isPrivate ? 'on' : ''}`}>
          <input
            type="radio"
            name="vis"
            checked={isPrivate}
            onChange={() => setIsPrivate(true)}
            disabled={busy}
          />
          <span>🔒 Privat</span>
          <span className="muted small">Bara du ser repot</span>
        </label>
        <label className={`vis-opt ${!isPrivate ? 'on' : ''}`}>
          <input
            type="radio"
            name="vis"
            checked={!isPrivate}
            onChange={() => setIsPrivate(false)}
            disabled={busy}
          />
          <span>🌐 Publikt</span>
          <span className="muted small">Alla kan se repot</span>
        </label>
      </div>

      <button className="btn primary full" disabled={!name.trim() || busy} onClick={publish}>
        {busy ? 'Publicerar…' : 'Publicera på GitHub'}
      </button>
      <p className="muted small">
        Finns ingen commit än skapas en första commit automatiskt. Origin kopplas och aktuell branch
        pushas med upstream.
      </p>
    </div>
  )
}
