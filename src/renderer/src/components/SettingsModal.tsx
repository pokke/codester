import { useSettings, type Density } from '../settings/SettingsContext'
import { themes } from '../themes/themes'
import { LangServersSettings } from './LangServersSettings'

const ACCENTS = ['#0e639c', '#0a7ea4', '#7c3aed', '#bd93f9', '#e06c75', '#2ea043', '#d29922']
const DENSITIES: Density[] = ['compact', 'comfortable', 'spacious']
const DENSITY_LABEL: Record<Density, string> = {
  compact: 'Kompakt',
  comfortable: 'Bekväm',
  spacious: 'Luftig'
}

export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const { settings, update, reset } = useSettings()

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

          <button className="btn full" onClick={reset}>
            Återställ till standard
          </button>
        </div>
      </div>
    </div>
  )
}
