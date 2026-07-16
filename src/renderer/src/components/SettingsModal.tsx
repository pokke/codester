import { useEffect, useState } from 'react'
import { useSettings, type Density, SETTINGS_FILE } from '../settings/SettingsContext'
import {
  KEYBINDING_FILE,
  loadKeybindings,
  defaultKeybindingsJson,
  COMMANDS,
  type CommandDef,
  bindingFor,
  eventToCombo,
  setBinding,
  resetBinding,
  findConflict
} from '../settings/keybindings'
import { SNIPPET_LANGS, defaultSnippetsJson, reloadSnippets } from '../editor/snippets'
import { themes } from '../themes/themes'
import { LangServersSettings } from './LangServersSettings'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/Confirm'

const ACCENTS = ['#0e639c', '#0a7ea4', '#7c3aed', '#bd93f9', '#e06c75', '#2ea043', '#d29922']
const DENSITIES: Density[] = ['compact', 'comfortable', 'spacious']
const DENSITY_LABEL: Record<Density, string> = {
  compact: 'Kompakt',
  comfortable: 'Bekväm',
  spacious: 'Luftig'
}

type Section = 'appearance' | 'editor' | 'keybindings' | 'snippets' | 'langservers' | 'advanced'
const NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'appearance', label: 'Utseende', icon: '◑' },
  { id: 'editor', label: 'Editor', icon: '✎' },
  { id: 'keybindings', label: 'Kortkommandon', icon: '⌨' },
  { id: 'snippets', label: 'Snippets', icon: '❯' },
  { id: 'langservers', label: 'Språkservrar', icon: '⚙' },
  { id: 'advanced', label: 'Avancerat (JSON)', icon: '{ }' }
]

// Återanvändbar JSON-redigerare för en config-fil.
function JsonConfigEditor({
  file,
  fallback,
  onSave
}: {
  file: string
  fallback: string
  onSave: (obj: Record<string, unknown>, raw: string) => void | Promise<void>
}): JSX.Element {
  const { notify } = useToast()
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [dir, setDir] = useState('')

  useEffect(() => {
    window.api.config.read(file).then((r) => setText(r.ok && r.data ? r.data : fallback))
    window.api.config.dir().then((r) => {
      if (r.ok) setDir(r.data)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const save = async (): Promise<void> => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ogiltig JSON')
      return
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setErr('JSON måste vara ett objekt')
      return
    }
    setErr(null)
    await onSave(parsed as Record<string, unknown>, text)
    notify(`${file} sparad`, 'success')
  }

  return (
    <>
      {dir && (
        <p className="muted small">
          {dir}\{file}
        </p>
      )}
      <textarea
        className="json-editor"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {err && <p className="error-text small">{err}</p>}
      <div style={{ display: 'flex', gap: 'var(--space)' }}>
        <button
          className="btn"
          onClick={() =>
            window.api.config.read(file).then((r) => setText(r.ok && r.data ? r.data : fallback))
          }
        >
          Läs om
        </button>
        <button className="btn primary" onClick={save}>
          Spara
        </button>
      </div>
    </>
  )
}

// En rad i kortkommando-listan: klicka på chippet och tryck tangenter.
function KeybindingRow({ cmd, onChanged }: { cmd: CommandDef; onChanged: () => void }): JSX.Element {
  const confirm = useConfirm()
  const { notify } = useToast()
  const [capturing, setCapturing] = useState(false)
  const combo = bindingFor(cmd.id) || cmd.default

  useEffect(() => {
    if (!capturing) return
    const onKey = async (e: KeyboardEvent): Promise<void> => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(false)
        return
      }
      const hasMod = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey
      if (!hasMod) {
        notify('Använd minst en modifierare (Ctrl/Alt/Shift)', 'info')
        return
      }
      const c = eventToCombo(e)
      if (!c) return
      setCapturing(false)
      const conflict = findConflict(c, cmd.id)
      if (conflict) {
        const other = COMMANDS.find((x) => x.id === conflict)?.label ?? conflict
        const ok = await confirm({
          message: `${c} är redan bundet till "${other}". Använd ändå?`,
          confirmLabel: 'Använd ändå'
        })
        if (!ok) return
      }
      await setBinding(cmd.id, c)
      onChanged()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, cmd.id])

  return (
    <div className="kb-row">
      <span className="kb-label">{cmd.label}</span>
      <button
        className={`kb-chip ${capturing ? 'capturing' : ''}`}
        title="Klicka och tryck tangenter"
        onClick={() => setCapturing(true)}
      >
        {capturing ? 'Tryck tangenter…' : combo}
      </button>
      <button
        className="btn ghost icon"
        title="Återställ till standard"
        aria-label={`Återställ ${cmd.label}`}
        onClick={async () => {
          await resetBinding(cmd.id)
          onChanged()
        }}
      >
        ↺
      </button>
    </div>
  )
}

export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const { settings, update, replace, reset } = useSettings()
  const confirm = useConfirm()
  const [section, setSection] = useState<Section>('appearance')
  const [snipLang, setSnipLang] = useState('typescript')
  const [, setKbVersion] = useState(0) // tvinga om-render av kortkommando-rader

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const renderSection = (): JSX.Element => {
    switch (section) {
      case 'appearance':
        return (
          <>
            <div className="field">
              <label>Tema</label>
              <div className="theme-grid">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    className={`theme-swatch ${settings.themeId === t.id ? 'active' : ''}`}
                    onClick={() => update({ themeId: t.id })}
                  >
                    <div className="preview">
                      <span style={{ background: t.colors.bg }} />
                      <span style={{ background: t.colors.synKeyword }} />
                      <span style={{ background: t.colors.synString }} />
                      <span style={{ background: t.colors.accent }} />
                    </div>
                    <span className="label">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Accentfärg</label>
              <div className="swatch-row">
                <button
                  className={`swatch ${settings.accentOverride === null ? 'active' : ''}`}
                  title="Använd temats accent"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent) 50%, var(--bg-input) 50%)'
                  }}
                  onClick={() => update({ accentOverride: null })}
                />
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${settings.accentOverride === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => update({ accentOverride: c })}
                  />
                ))}
              </div>
            </div>

            <div className="field">
              <label>Teckenstorlek i kod: {settings.fontSize}px</label>
              <div className="range-row">
                <input
                  type="range"
                  min={11}
                  max={22}
                  value={settings.fontSize}
                  onChange={(e) => update({ fontSize: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="field">
              <label>Gränssnittsskala: {Math.round(settings.uiScale * 100)}%</label>
              <div className="range-row">
                <input
                  type="range"
                  min={0.9}
                  max={1.2}
                  step={0.05}
                  value={settings.uiScale}
                  onChange={(e) => update({ uiScale: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="field">
              <label>Täthet</label>
              <div className="seg-toggle">
                {DENSITIES.map((d) => (
                  <button
                    key={d}
                    className={settings.density === d ? 'active' : ''}
                    onClick={() => update({ density: d })}
                  >
                    {DENSITY_LABEL[d]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )

      case 'editor':
        return (
          <>
            <div className="field">
              <label>Spara</label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settings.formatOnSave}
                  onChange={(e) => update({ formatOnSave: e.target.checked })}
                />
                Formatera vid spara (Prettier)
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settings.wordWrap}
                  onChange={(e) => update({ wordWrap: e.target.checked })}
                />
                Radbrytning i editorn (Alt+Z)
              </label>
            </div>
            <div className="field">
              <label>Spara automatiskt</label>
              <div className="seg-toggle">
                {(
                  [
                    ['off', 'Av'],
                    ['afterDelay', 'Efter paus'],
                    ['onFocusChange', 'Vid fokusbyte']
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    className={settings.autoSave === val ? 'active' : ''}
                    onClick={() => update({ autoSave: val })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )

      case 'keybindings':
        return (
          <div className="field">
            <label>Kortkommandon</label>
            <p className="muted small">Klicka på ett kommando och tryck önskad tangentkombination.</p>
            <div className="kb-list">
              {COMMANDS.map((c) => (
                <KeybindingRow key={c.id} cmd={c} onChanged={() => setKbVersion((v) => v + 1)} />
              ))}
            </div>
          </div>
        )

      case 'snippets':
        return (
          <div className="field">
            <label>Snippets (språk)</label>
            <select
              value={snipLang}
              onChange={(e) => setSnipLang(e.target.value)}
              style={{ width: '100%', marginBottom: 'var(--space)' }}
            >
              {SNIPPET_LANGS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <JsonConfigEditor
              file={`snippets/${snipLang}.json`}
              fallback={defaultSnippetsJson()}
              onSave={async (_obj, raw) => {
                await window.api.config.write(`snippets/${snipLang}.json`, raw)
                reloadSnippets()
              }}
            />
          </div>
        )

      case 'langservers':
        return <LangServersSettings />

      case 'advanced':
        return (
          <>
            <div className="field">
              <label>settings.json</label>
              <JsonConfigEditor
                file={SETTINGS_FILE}
                fallback={JSON.stringify(settings, null, 2)}
                onSave={(obj) => replace(obj as Partial<typeof settings>)}
              />
            </div>
            <div className="field">
              <label>keybindings.json</label>
              <JsonConfigEditor
                file={KEYBINDING_FILE}
                fallback={defaultKeybindingsJson()}
                onSave={async (_obj, raw) => {
                  await window.api.config.write(KEYBINDING_FILE, raw)
                  await loadKeybindings()
                }}
              />
            </div>
            <button
              className="btn full"
              onClick={async () => {
                if (
                  await confirm({
                    message: 'Återställ utseende- och editor-inställningar till standard?',
                    confirmLabel: 'Återställ',
                    danger: true
                  })
                )
                  reset()
              }}
            >
              Återställ utseende &amp; editor till standard
            </button>
          </>
        )
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Inställningar</span>
          <button className="btn icon ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="settings-layout">
          <nav className="settings-nav">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={section === n.id ? 'active' : ''}
                onClick={() => setSection(n.id)}
              >
                <span className="settings-nav-icon">{n.icon}</span>
                {n.label}
              </button>
            ))}
          </nav>
          <div className="settings-content">{renderSection()}</div>
        </div>
      </div>
    </div>
  )
}
