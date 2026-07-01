import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorGroup, type GroupApi, type SharedBuffers } from './EditorGroup'
import { useRepo } from '../state/RepoContext'

// Editor-ytan: en primär grupp (styrd av RepoContext) och en valfri sekundär
// (delad) grupp med egna flikar. Buffertar och dirty-status delas så samma fil
// aldrig hamnar i olika tillstånd i de två grupperna.
export function EditorArea(): JSX.Element {
  const {
    openTabs,
    activePath,
    previewPath,
    activeLine,
    selectPath,
    pinTab,
    closeTab,
    closeTabs,
    reorderTabs
  } = useRepo()

  // Delade lagringar
  const buffers = useRef<Map<string, string>>(new Map())
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(new Set())
  const markDirty = useCallback((path: string, isDirty: boolean) => {
    setDirtyTabs((prev) => {
      if (isDirty === prev.has(path)) return prev
      const next = new Set(prev)
      isDirty ? next.add(path) : next.delete(path)
      return next
    })
  }, [])
  const shared: SharedBuffers = { buffers, dirtyTabs, markDirty }

  // Sekundär grupp (lokalt flik-tillstånd)
  const [tabs2, setTabs2] = useState<string[]>([])
  const [active2, setActive2] = useState<string | null>(null)
  const [line2, setLine2] = useState<number | null>(null)
  const [activeGroup, setActiveGroup] = useState<'primary' | 'secondary'>('primary')
  const [ratio, setRatio] = useState(0.5) // primärgruppens andel av bredden
  const containerRef = useRef<HTMLDivElement>(null)

  const secondaryOpen = tabs2.length > 0 && !!active2

  useEffect(() => {
    if (!secondaryOpen && activeGroup === 'secondary') setActiveGroup('primary')
  }, [secondaryOpen, activeGroup])

  const openToSide = useCallback((path: string) => {
    setTabs2((t) => (t.includes(path) ? t : [...t, path]))
    setActive2(path)
    setLine2(null)
    setActiveGroup('secondary')
  }, [])

  const select2 = useCallback((path: string | null, line?: number) => {
    if (!path) {
      setActive2(null)
      return
    }
    setTabs2((t) => (t.includes(path) ? t : [...t, path]))
    setActive2(path)
    setLine2(line ?? null)
  }, [])

  const closeTab2 = useCallback(
    (path: string) => {
      const idx = tabs2.indexOf(path)
      const next = tabs2.filter((p) => p !== path)
      setTabs2(next)
      if (active2 === path) {
        setActive2(next[idx - 1] ?? next[idx] ?? next[next.length - 1] ?? null)
      }
    },
    [tabs2, active2]
  )

  const closeTabs2 = useCallback(
    (paths: string[]) => {
      const drop = new Set(paths)
      const next = tabs2.filter((p) => !drop.has(p))
      setTabs2(next)
      if (active2 && drop.has(active2)) setActive2(next[next.length - 1] ?? null)
    },
    [tabs2, active2]
  )

  const reorder2 = useCallback((from: string, to: string) => {
    setTabs2((t) => {
      const arr = [...t]
      const fi = arr.indexOf(from)
      const ti = arr.indexOf(to)
      if (fi < 0 || ti < 0 || fi === ti) return t
      arr.splice(fi, 1)
      arr.splice(ti, 0, from)
      return arr
    })
  }, [])

  const closeSecondary = useCallback(() => {
    setTabs2([])
    setActive2(null)
    setActiveGroup('primary')
  }, [])

  const splitPrimary = useCallback(() => {
    if (activePath) openToSide(activePath)
  }, [activePath, openToSide])

  // Ctrl+\ delar editorn (som i VS Code)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault()
        splitPrimary()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [splitPrimary])

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const move = (ev: MouseEvent): void => {
      const r = (ev.clientX - rect.left) / rect.width
      setRatio(Math.max(0.2, Math.min(0.8, r)))
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const api1: GroupApi = {
    openTabs,
    activePath,
    previewPath,
    activeLine,
    selectPath,
    pinTab,
    closeTab,
    closeTabs,
    reorderTabs
  }

  const api2: GroupApi = {
    openTabs: tabs2,
    activePath: active2,
    previewPath: null,
    activeLine: line2,
    selectPath: select2,
    pinTab: () => {},
    closeTab: closeTab2,
    closeTabs: closeTabs2,
    reorderTabs: reorder2
  }

  return (
    <div className="editor-groups" ref={containerRef}>
      <div className="editor-group-wrap" style={{ flex: secondaryOpen ? ratio : 1 }}>
        <EditorGroup
          api={api1}
          shared={shared}
          isActive={secondaryOpen && activeGroup === 'primary'}
          onFocus={() => setActiveGroup('primary')}
          onSplit={splitPrimary}
          onOpenToSide={openToSide}
        />
      </div>
      {secondaryOpen && (
        <>
          <div className="group-resizer" title="Dra för att ändra bredd" onMouseDown={startResize} />
          <div className="editor-group-wrap" style={{ flex: 1 - ratio }}>
            <EditorGroup
              api={api2}
              shared={shared}
              isActive={activeGroup === 'secondary'}
              onFocus={() => setActiveGroup('secondary')}
              onCloseGroup={closeSecondary}
            />
          </div>
        </>
      )}
    </div>
  )
}
