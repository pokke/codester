import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { defaultThemeId, getTheme } from '../themes/themes'

export type Density = 'compact' | 'comfortable' | 'spacious'
export type AutoSave = 'off' | 'afterDelay' | 'onFocusChange'

export interface Settings {
  themeId: string
  accentOverride: string | null // null = använd temats accent
  fontSize: number // px för kod/innehåll
  uiScale: number // 0.9–1.2, skalar gränssnittet
  density: Density
  sidebarWidth: number // px
  inspectorWidth: number // px
  formatOnSave: boolean
  autoSave: AutoSave
  wordWrap: boolean // radbrytning i editorn (Alt+Z)
}

const DEFAULTS: Settings = {
  themeId: defaultThemeId,
  accentOverride: null,
  fontSize: 14,
  uiScale: 1,
  density: 'comfortable',
  sidebarWidth: 250,
  inspectorWidth: 280,
  formatOnSave: false,
  autoSave: 'off',
  wordWrap: false
}

const STORAGE_KEY = 'codester.settings'

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    // ignorera trasig/saknad data och falla tillbaka till standard
  }
  return DEFAULTS
}

const densityScale: Record<Density, number> = {
  compact: 0.85,
  comfortable: 1,
  spacious: 1.2
}

interface SettingsContextValue {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  replace: (next: Partial<Settings>) => void
  reset: () => void
}

export const SETTINGS_FILE = 'settings.json'

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  // Applicera temat som CSS-variabler på dokumentroten varje gång det ändras
  useEffect(() => {
    const theme = getTheme(settings.themeId)
    const root = document.documentElement
    const c = theme.colors

    root.style.setProperty('--bg', c.bg)
    root.style.setProperty('--bg-elevated', c.bgElevated)
    root.style.setProperty('--bg-input', c.bgInput)
    root.style.setProperty('--border', c.border)
    root.style.setProperty('--text', c.text)
    root.style.setProperty('--text-muted', c.textMuted)
    root.style.setProperty('--accent', settings.accentOverride ?? c.accent)
    root.style.setProperty('--accent-text', c.accentText)
    root.style.setProperty('--added', c.added)
    root.style.setProperty('--removed', c.removed)
    root.style.setProperty('--syn-keyword', c.synKeyword)
    root.style.setProperty('--syn-string', c.synString)
    root.style.setProperty('--syn-comment', c.synComment)
    root.style.setProperty('--syn-function', c.synFunction)
    root.style.setProperty('--syn-number', c.synNumber)
    root.style.setProperty('--syn-type', c.synType)

    root.style.setProperty('--font-size', `${settings.fontSize}px`)
    root.style.setProperty('--ui-scale', String(settings.uiScale))
    root.style.setProperty('--density', String(densityScale[settings.density]))
    root.style.setProperty('--sidebar-w', `${settings.sidebarWidth}px`)
    root.style.setProperty('--inspector-w', `${settings.inspectorWidth}px`)
    root.dataset.themeType = theme.type
  }, [settings])

  // Ladda settings.json (källan) vid start – localStorage är bara snabb cache
  // för att undvika flimmer. Saknas filen skrivs nuvarande som utgångsläge.
  useEffect(() => {
    ;(async () => {
      const r = await window.api.config.read(SETTINGS_FILE)
      if (r.ok && r.data) {
        try {
          const parsed = JSON.parse(r.data)
          setSettings((s) => ({ ...DEFAULTS, ...s, ...parsed }))
        } catch {
          // trasig fil – behåll cache
        }
      } else {
        window.api.config.write(SETTINGS_FILE, JSON.stringify(loadSettings(), null, 2))
      }
    })()
  }, [])

  // Spara vid varje ändring – snabb cache direkt, filskrivning debouncad
  // (så att reglagedragningar inte spammar disken).
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    const t = setTimeout(() => {
      window.api.config.write(SETTINGS_FILE, JSON.stringify(settings, null, 2))
    }, 400)
    return () => clearTimeout(t)
  }, [settings])

  const update = (patch: Partial<Settings>): void =>
    setSettings((prev) => ({ ...prev, ...patch }))
  // Full ersättning (från JSON-redigeraren): borttagna nycklar återgår till standard
  const replace = (next: Partial<Settings>): void => setSettings({ ...DEFAULTS, ...next })
  const reset = (): void => setSettings(DEFAULTS)

  return (
    <SettingsContext.Provider value={{ settings, update, replace, reset }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings måste användas inom SettingsProvider')
  return ctx
}
