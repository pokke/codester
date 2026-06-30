import { useEffect } from 'react'

export interface MenuItem {
  label?: string
  onClick?: () => void
  danger?: boolean
  separator?: boolean
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

export function ContextMenu({
  menu,
  onClose
}: {
  menu: MenuState
  onClose: () => void
}): JSX.Element {
  useEffect(() => {
    const close = (): void => onClose()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    // Stäng vid klick utanför, scroll eller blur
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Håll menyn inom fönstret
  const left = Math.min(menu.x, window.innerWidth - 200)
  const top = Math.min(menu.y, window.innerHeight - menu.items.length * 30 - 10)

  return (
    <div className="context-menu" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
      {menu.items.map((it, i) =>
        it.separator ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <div
            key={i}
            className={`ctx-item ${it.danger ? 'danger' : ''}`}
            onClick={() => {
              it.onClick?.()
              onClose()
            }}
          >
            {it.label}
          </div>
        )
      )}
    </div>
  )
}
