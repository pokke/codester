import { useSettings } from '../settings/SettingsContext'

// Dra-handtag som ändrar bredden på sidofält eller commit-panel.
// Under dragningen sätter vi CSS-variabeln direkt (snabbt, ingen omrendering)
// och sparar slutbredden i inställningarna när musen släpps.
export function Resizer({ side }: { side: 'sidebar' | 'inspector' }): JSX.Element {
  const { settings, update } = useSettings()
  const cssVar = side === 'sidebar' ? '--sidebar-w' : '--inspector-w'

  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = side === 'sidebar' ? settings.sidebarWidth : settings.inspectorWidth
    let lastW = startW
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent): void => {
      const dx = ev.clientX - startX
      const raw = side === 'sidebar' ? startW + dx : startW - dx
      lastW = Math.max(180, Math.min(520, raw))
      document.documentElement.style.setProperty(cssVar, `${lastW}px`)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      update(side === 'sidebar' ? { sidebarWidth: lastW } : { inspectorWidth: lastW })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return <div className="resizer" onMouseDown={onMouseDown} title="Dra för att ändra bredd" />
}
