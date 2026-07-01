import { useEffect, useState } from 'react'
import { useSettings, type Density, SETTINGS_FILE } from '../settings/SettingsContext'
import {
  KEYBINDING_FILE,
  loadKeybindings,
  defaultKeybindingsJson,
  COMMANDS
} from '../settings/keybindings'
import { themes } from '../themes/themes'
import { LangServersSettings } from './LangServersSettings'
import { useToast } from '../ui/Toast'

// Återanvändbar redigerare för en JSON-config-fil (settings.json/keybindings.json).
function JsonConfigSection({
  file,
  title,
  fallback,
  onSave
}: {
  file: string
  title: string
  fallback: string
  onSave: (obj: Record<string, unknown>, raw: string) => void | Promise<void>
}): JSX.Element {
  const { notify } = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [dir, setDir] = useState('')

  useEffect(() => {
    if (!open) return
    window.api.config.read(file).then((r) => setText(r.ok && r.data ? r.data : fallback))
    window.api.config.dir().then((r) => {
      if (r.ok) setDir(r.data)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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
    <div className="field">
      <label>
        <button
          className="btn ghost small"
          style={{ padding: '2px 8px' }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '▾' : '▸'} {title}
        </button>
      </label>
      {open && (
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
      )}
    </div>
  )
}

const ACCENTS = ['#0e639c', '#0a7ea4', '#7c3aed', '#bd93f9', '#e06c75', '#2ea043', '#d29922']
const DENSITIES: Density[] = ['compact', 'comfortable', 'spacious']
const DENSITY_LABEL: Record<Density, string> = {
  compact: 'Kompakt',
  comfortable: 'Bekväm',
  spacious: 'Luftig'
}

export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const { settings, update, replace, reset } = useSettings()

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Utseende & inställningar</span>
          <button className="btn icon ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {/* Tema */}
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

          {/* Accentfärg */}
          <div className="field">
            <label>Accentfärg</label>
            <div className="swatch-row">
              <button
                className={`swatch ${settings.accentOverride === null ? 'active' : ''}`}
                title="Använd temats accent"
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent) 50%, var(--bg-input) 50%)'
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

          {/* Fontstorlek */}
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

          {/* UI-skala */}
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

          {/* Täthet */}
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

          {/* Redigering */}
          <div className="field">
            <label>Redigering</label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.formatOnSave}
                onChange={(e) => update({ formatOnSave: e.target.checked })}
              />
              Formatera vid spara (Prettier)
            </label>
          </div>

          {/* Auto-spara */}
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

          <LangServersSettings />

          {/* Redigerbar config */}
          <JsonConfigSection
            file={SETTINGS_FILE}
            title="settings.json"
            fallback={JSON.stringify(settings, null, 2)}
            onSave={(obj) => replace(obj as Partial<typeof settings>)}
          />
          <JsonConfigSection
            file={KEYBINDING_FILE}
            title="keybindings.json"
            fallback={defaultKeybindingsJson()}
            onSave={async (_obj, raw) => {
              await window.api.config.write(KEYBINDING_FILE, raw)
              await loadKeybindings()
            }}
          />
          <p className="muted small">
            Kommandon:{' '}
            {COMMANDS.map((c) => c.id).join(', ')}
          </p>

          <button className="btn full" onClick={reset}>
            Återställ till standard
          </button>
        </div>
      </div>
    </div>
  )
}
