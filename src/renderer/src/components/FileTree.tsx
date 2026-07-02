import { useEffect, useMemo, useRef, useState } from 'react'
import { useRepo } from '../state/RepoContext'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/Confirm'
import { ContextMenu, type MenuState } from '../ui/ContextMenu'
import { Icon } from '../ui/Icon'
import type { RepoStatus } from '../../../shared/types'

interface TreeNode {
  name: string
  path: string
  children: Map<string, TreeNode>
  isFile: boolean
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: new Map(), isFile: false }
  for (const p of paths) {
    const parts = p.split('/')
    let node = root
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1
      let child = node.children.get(part)
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join('/'), children: new Map(), isFile }
        node.children.set(part, child)
      }
      node = child
    })
  }
  return root
}

function sortedChildren(node: TreeNode): TreeNode[] {
  return [...node.children.values()].sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
    return a.name.localeCompare(b.name)
  })
}

function statusMaps(status: RepoStatus | null): {
  byPath: Map<string, 'added' | 'modified' | 'deleted'>
  dirtyDirs: Set<string>
} {
  const byPath = new Map<string, 'added' | 'modified' | 'deleted'>()
  const dirtyDirs = new Set<string>()
  for (const f of status?.files ?? []) {
    const t = f.status.includes('D')
      ? 'deleted'
      : f.status.includes('A') || f.status.includes('?')
        ? 'added'
        : 'modified'
    byPath.set(f.path, t)
    const parts = f.path.split('/')
    for (let i = 1; i < parts.length; i++) dirtyDirs.add(parts.slice(0, i).join('/'))
  }
  return { byPath, dirtyDirs }
}

interface RootData {
  path: string
  name: string
  files: string[]
  status: RepoStatus | null
}

type Creating = { root: string; parent: string; type: 'file' | 'folder' } | null
type Clipboard = { root: string; paths: string[]; op: 'cut' | 'copy' } | null
type Row =
  | { kind: 'root'; root: string; name: string }
  | { kind: 'node'; root: string; node: TreeNode; depth: number }
  | { kind: 'create'; root: string; depth: number }

const ROW_H = 24
const OVERSCAN = 6
const SEP = '\n' // radbrytning – förekommer ej i git-spårade sökvägar
const ck = (root: string, p: string): string => `${root}${SEP}${p}`
const badgeLetter: Record<'added' | 'modified' | 'deleted', string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D'
}

// Virtualiserat, multi-root filträd. En rot per repo i arbetsytan (rot-rubrik
// visas bara när fler än en). Fullt stöd: multi-select, drag-flytt (inom rot),
// kontextmenyer (skapa/byt namn/radera/klipp ut/kopiera/klistra in), git-status.
export function FileTree({ onOpenEditor }: { onOpenEditor: () => void }): JSX.Element {
  const { repos, repo, revision, switchRepo, previewFile, selectPath, activePath, refresh } =
    useRepo()
  const { notify } = useToast()
  const confirm = useConfirm()

  const [rootsData, setRootsData] = useState<RootData[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set()) // ck(root, folder)
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(() => new Set())
  const [renaming, setRenaming] = useState<string | null>(null) // ck(root, path)
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState<Creating>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set()) // ck-nycklar
  const anchorRef = useRef<string | null>(null)
  const selRootRef = useRef<string | null>(null) // roten som urvalet tillhör
  const dragRef = useRef<{ root: string; path: string } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  const [loaded, setLoaded] = useState(false)

  const showHeaders = rootsData.length > 1

  // Visa bara det AKTIVA repot – ett projekt i taget. Byte av aktivt repo i
  // arbetsyte-väljaren högst upp byter hela filträdet. (Arbetsytan kan fortsatt
  // innehålla flera repon; de andra vilar tills man växlar till dem.)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!repo) {
        setRootsData([])
        setLoaded(true)
        return
      }
      const [f, s] = await Promise.all([
        window.api.git.listFiles(repo.path),
        window.api.git.status(repo.path)
      ])
      if (!cancelled) {
        setRootsData([
          {
            path: repo.path,
            name: repo.name,
            files: f.ok ? f.data : [],
            status: s.ok ? s.data : null
          }
        ])
        setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [repo, revision])

  // Nya rötter börjar expanderade
  useEffect(() => {
    setExpandedRoots((prev) => {
      const next = new Set(prev)
      for (const r of repos) if (!prev.has(r.path)) next.add(r.path)
      return next
    })
  }, [repos])

  // Auto-expandera mappar upp till aktiv fil (i aktiva repot)
  useEffect(() => {
    if (!activePath || !repo) return
    const parts = activePath.split('/')
    if (parts.length < 2) return
    setExpanded((prev) => {
      const next = new Set(prev)
      for (let i = 1; i < parts.length; i++) next.add(ck(repo.path, parts.slice(0, i).join('/')))
      return next
    })
  }, [activePath, repo])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setViewportH(el.clientHeight)
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const trees = useMemo(() => {
    const m = new Map<string, TreeNode>()
    for (const rd of rootsData) m.set(rd.path, buildTree(rd.files))
    return m
  }, [rootsData])

  const maps = useMemo(() => {
    const m = new Map<string, ReturnType<typeof statusMaps>>()
    for (const rd of rootsData) m.set(rd.path, statusMaps(rd.status))
    return m
  }, [rootsData])

  // Platt lista över synliga rader (för virtualisering)
  const rows = useMemo(() => {
    const out: Row[] = []
    for (const rd of rootsData) {
      if (showHeaders) out.push({ kind: 'root', root: rd.path, name: rd.name })
      const open = !showHeaders || expandedRoots.has(rd.path)
      if (!open) continue
      const base = showHeaders ? 1 : 0
      if (creating?.root === rd.path && creating.parent === '')
        out.push({ kind: 'create', root: rd.path, depth: base })
      const tree = trees.get(rd.path)
      if (!tree) continue
      const walk = (node: TreeNode, depth: number): void => {
        for (const c of sortedChildren(node)) {
          out.push({ kind: 'node', root: rd.path, node: c, depth })
          if (!c.isFile && expanded.has(ck(rd.path, c.path))) {
            if (creating?.root === rd.path && creating.parent === c.path)
              out.push({ kind: 'create', root: rd.path, depth: depth + 1 })
            walk(c, depth + 1)
          }
        }
      }
      walk(tree, base)
    }
    return out
  }, [rootsData, trees, expanded, expandedRoots, creating, showHeaders])

  const visibleKeys = useMemo(
    () =>
      rows
        .filter(
          (r): r is { kind: 'node'; root: string; node: TreeNode; depth: number } =>
            r.kind === 'node'
        )
        .map((r) => ck(r.root, r.node.path)),
    [rows]
  )

  const totalFiles = rootsData.reduce((n, rd) => n + rd.files.length, 0)

  const toggle = (root: string, p: string): void =>
    setExpanded((prev) => {
      const key = ck(root, p)
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  const toggleRoot = (root: string): void =>
    setExpandedRoots((prev) => {
      const n = new Set(prev)
      n.has(root) ? n.delete(root) : n.add(root)
      return n
    })

  // Multi-select hålls inom EN rot (byte av rot nollställer urvalet)
  const handleSelectClick = (root: string, path: string, e: React.MouseEvent): boolean => {
    const key = ck(root, path)
    if (e.ctrlKey || e.metaKey) {
      if (selRootRef.current && selRootRef.current !== root) {
        setSelected(new Set([key]))
      } else {
        setSelected((prev) => {
          const n = new Set(prev)
          n.has(key) ? n.delete(key) : n.add(key)
          return n
        })
      }
      selRootRef.current = root
      anchorRef.current = key
      return true
    }
    if (e.shiftKey && anchorRef.current && selRootRef.current === root) {
      const a = visibleKeys.indexOf(anchorRef.current)
      const b = visibleKeys.indexOf(key)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelected(new Set(visibleKeys.slice(lo, hi + 1)))
      }
      return true
    }
    setSelected(new Set([key]))
    selRootRef.current = root
    anchorRef.current = key
    return false
  }

  const openFile = async (root: string, rel: string, pin: boolean): Promise<void> => {
    if (root !== repo?.path) {
      await switchRepo(root)
      const name = rootsData.find((r) => r.path === root)?.name ?? root
      notify(`Aktivt repo: ${name}`, 'info')
    }
    pin ? selectPath(rel) : previewFile(rel)
    onOpenEditor()
  }

  const startCreate = (root: string, parent: string, type: 'file' | 'folder'): void => {
    if (parent) setExpanded((p) => new Set(p).add(ck(root, parent)))
    setExpandedRoots((p) => new Set(p).add(root))
    setCreating({ root, parent, type })
    setDraft('')
  }
  const submitCreate = async (): Promise<void> => {
    if (!creating || !draft.trim()) {
      setCreating(null)
      return
    }
    const { root, parent, type } = creating
    const rel = parent ? `${parent}/${draft.trim()}` : draft.trim()
    const res =
      type === 'file'
        ? await window.api.fs.createFile(rel, root)
        : await window.api.fs.createFolder(rel, root)
    setCreating(null)
    if (res.ok) {
      await refresh()
      if (type === 'file') openFile(root, rel, true)
    } else notify(res.error, 'error')
  }

  const startRename = (root: string, path: string, name: string): void => {
    setRenaming(ck(root, path))
    setDraft(name)
  }
  const submitRename = async (root: string, oldPath: string): Promise<void> => {
    const name = draft.trim()
    setRenaming(null)
    if (!name || name === oldPath.split('/').pop()) return
    const dir = oldPath.split('/').slice(0, -1).join('/')
    const newRel = dir ? `${dir}/${name}` : name
    const res = await window.api.fs.rename(oldPath, newRel, root)
    if (res.ok) await refresh()
    else notify(res.error, 'error')
  }

  const delMany = async (root: string, paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    const ok = await confirm({
      message: paths.length === 1 ? `Radera ${paths[0]}?` : `Radera ${paths.length} objekt?`,
      confirmLabel: 'Radera',
      danger: true
    })
    if (!ok) return
    for (const p of paths) {
      const res = await window.api.fs.delete(p, root)
      if (!res.ok) notify(res.error, 'error')
    }
    setSelected(new Set())
    await refresh()
  }

  const moveInto = async (root: string, src: string, destFolder: string): Promise<void> => {
    const name = src.split('/').pop()!
    const dest = destFolder ? `${destFolder}/${name}` : name
    if (dest === src) return
    if (destFolder === src || destFolder.startsWith(`${src}/`)) {
      notify('Kan inte flytta en mapp in i sig själv', 'error')
      return
    }
    const res = await window.api.fs.rename(src, dest, root)
    if (res.ok) await refresh()
    else notify(res.error, 'error')
  }

  const pasteInto = async (root: string, destFolder: string): Promise<void> => {
    if (!clipboard) return
    if (clipboard.root !== root) {
      notify('Klistra in stöds inom samma repo', 'error')
      return
    }
    for (const src of clipboard.paths) {
      const name = src.split('/').pop()!
      const dest = destFolder ? `${destFolder}/${name}` : name
      if (dest === src) continue
      const res =
        clipboard.op === 'cut'
          ? await window.api.fs.rename(src, dest, root)
          : await window.api.fs.copy(src, dest, root)
      if (!res.ok) notify(res.error, 'error')
    }
    if (clipboard.op === 'cut') setClipboard(null)
    await refresh()
  }

  // Markerade sökvägar i en rot (eller bara den klickade)
  const targetsFor = (root: string, path: string): string[] => {
    const key = ck(root, path)
    if (selected.has(key) && selected.size > 1) {
      return [...selected]
        .filter((k) => k.startsWith(root + SEP))
        .map((k) => k.slice(root.length + 1))
    }
    setSelected(new Set([key]))
    return [path]
  }

  const openMenu = (e: React.MouseEvent, items: MenuState['items']): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, items })
  }
  const fileMenu = (root: string, node: TreeNode) => (e: React.MouseEvent): void => {
    const t = targetsFor(root, node.path)
    openMenu(e, [
      ...(t.length === 1
        ? [{ label: 'Öppna', onClick: () => openFile(root, node.path, true) }, { separator: true }]
        : []),
      { label: t.length > 1 ? `Klipp ut (${t.length})` : 'Klipp ut', onClick: () => setClipboard({ root, paths: t, op: 'cut' }) },
      { label: t.length > 1 ? `Kopiera (${t.length})` : 'Kopiera', onClick: () => setClipboard({ root, paths: t, op: 'copy' }) },
      { separator: true },
      ...(t.length === 1 ? [{ label: 'Byt namn', onClick: () => startRename(root, node.path, node.name) }] : []),
      { label: t.length > 1 ? `Radera (${t.length})` : 'Radera', danger: true, onClick: () => delMany(root, t) }
    ])
  }
  const folderMenu = (root: string, node: TreeNode) => (e: React.MouseEvent): void => {
    const t = targetsFor(root, node.path)
    openMenu(e, [
      { label: 'Ny fil', onClick: () => startCreate(root, node.path, 'file') },
      { label: 'Ny mapp', onClick: () => startCreate(root, node.path, 'folder') },
      { separator: true },
      { label: t.length > 1 ? `Klipp ut (${t.length})` : 'Klipp ut', onClick: () => setClipboard({ root, paths: t, op: 'cut' }) },
      { label: t.length > 1 ? `Kopiera (${t.length})` : 'Kopiera', onClick: () => setClipboard({ root, paths: t, op: 'copy' }) },
      ...(clipboard ? [{ label: 'Klistra in', onClick: () => pasteInto(root, node.path) }] : []),
      { separator: true },
      ...(t.length === 1 ? [{ label: 'Byt namn', onClick: () => startRename(root, node.path, node.name) }] : []),
      { label: t.length > 1 ? `Radera (${t.length})` : 'Radera', danger: true, onClick: () => delMany(root, t) }
    ])
  }
  const rootMenu = (root: string) => (e: React.MouseEvent): void =>
    openMenu(e, [
      { label: 'Ny fil', onClick: () => startCreate(root, '', 'file') },
      { label: 'Ny mapp', onClick: () => startCreate(root, '', 'folder') },
      ...(clipboard ? [{ separator: true }, { label: 'Klistra in', onClick: () => pasteInto(root, '') }] : [])
    ])

  // Slå upp {root, node} för en markerad rad-nyckel
  const nodeForKey = (key: string): { root: string; node: TreeNode } | null => {
    for (const r of rows) if (r.kind === 'node' && ck(r.root, r.node.path) === key) return r
    return null
  }
  const scrollKeyIntoView = (key: string): void => {
    const ri = rows.findIndex((r) => r.kind === 'node' && ck(r.root, r.node.path) === key)
    const el = scrollRef.current
    if (ri < 0 || !el) return
    const top = ri * ROW_H
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight
  }
  // Tangentbordsnavigering (pilar/Enter) med den enkla markeringen som fokus
  const navKey = (key: string): void => {
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      if (!visibleKeys.length) return
      let idx = anchorRef.current ? visibleKeys.indexOf(anchorRef.current) : -1
      idx = key === 'ArrowDown' ? Math.min(idx + 1, visibleKeys.length - 1) : Math.max(idx - 1, 0)
      if (idx < 0) idx = 0
      const k = visibleKeys[idx]
      setSelected(new Set([k]))
      anchorRef.current = k
      selRootRef.current = k.slice(0, k.indexOf(SEP))
      scrollKeyIntoView(k)
      return
    }
    const cur = anchorRef.current
    const r = cur ? nodeForKey(cur) : null
    if (!r) return
    const { root, node } = r
    if (key === 'Enter') node.isFile ? openFile(root, node.path, false) : toggle(root, node.path)
    else if (key === 'ArrowRight' && !node.isFile && !expanded.has(ck(root, node.path)))
      toggle(root, node.path)
    else if (key === 'ArrowLeft' && !node.isFile && expanded.has(ck(root, node.path)))
      toggle(root, node.path)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter'].includes(e.key)) {
      e.preventDefault()
      navKey(e.key)
      return
    }
    const root = selRootRef.current
    if (selected.size === 0 || !root) return
    const paths = [...selected]
      .filter((k) => k.startsWith(root + SEP))
      .map((k) => k.slice(root.length + 1))
    if (e.key === 'Delete') {
      e.preventDefault()
      delMany(root, paths)
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
      setClipboard({ root, paths, op: 'cut' })
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      setClipboard({ root, paths, op: 'copy' })
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      const first = paths[0]
      const dest = first
        ? rootsData.find((r) => r.path === root)?.files.includes(first)
          ? first.split('/').slice(0, -1).join('/')
          : first
        : ''
      pasteInto(root, dest)
    }
  }

  const renderInput = (
    placeholder: string,
    onSubmit: () => void,
    onCancel: () => void
  ): JSX.Element => (
    <input
      autoFocus
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={onSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit()
        if (e.key === 'Escape') onCancel()
      }}
      style={{ width: '100%' }}
    />
  )

  const renderRow = (row: Row, index: number): JSX.Element => {
    const style: React.CSSProperties = {
      position: 'absolute',
      top: index * ROW_H,
      left: 0,
      right: 0,
      height: ROW_H,
      paddingLeft: 8 + (row.kind === 'root' ? 0 : row.depth) * 12
    }

    if (row.kind === 'root') {
      const isOpen = expandedRoots.has(row.root)
      return (
        <div
          key={`root:${row.root}`}
          className="row tree-row ws-root-header"
          style={style}
          title={row.root}
          onClick={() => toggleRoot(row.root)}
          onContextMenu={rootMenu(row.root)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (dragRef.current?.root === row.root) moveInto(row.root, dragRef.current.path, '')
            dragRef.current = null
          }}
        >
          <span className="icon">{isOpen ? '▾' : '▸'}</span>
          <span className="fname">{row.name}</span>
          {row.root === repo?.path && <span className="ws-active-badge">aktiv</span>}
        </div>
      )
    }

    if (row.kind === 'create') {
      return (
        <div className="row tree-row" style={style} key={`create-${index}`}>
          <span className="icon">
            <Icon name={creating?.type === 'folder' ? 'folder' : 'file'} size={14} />
          </span>
          {renderInput(
            creating?.type === 'folder' ? 'mappnamn' : 'filnamn.ext',
            submitCreate,
            () => setCreating(null)
          )}
        </div>
      )
    }

    const { root, node } = row
    const m = maps.get(root)
    if (renaming === ck(root, node.path)) {
      return (
        <div className="row tree-row" style={style} key={ck(root, node.path)}>
          {renderInput(node.name, () => submitRename(root, node.path), () => setRenaming(null))}
        </div>
      )
    }

    const isSel = selected.has(ck(root, node.path))
    if (node.isFile) {
      const gs = m?.byPath.get(node.path)
      return (
        <div
          key={ck(root, node.path)}
          className={`row tree-row file-row ${
            activePath === node.path && root === repo?.path ? 'active' : ''
          } ${isSel ? 'selected' : ''}`}
          style={style}
          title={node.path}
          onClick={(e) => {
            if (!handleSelectClick(root, node.path, e)) openFile(root, node.path, false)
          }}
          onDoubleClick={() => openFile(root, node.path, true)}
          onContextMenu={fileMenu(root, node)}
          draggable
          onDragStart={() => (dragRef.current = { root, path: node.path })}
        >
          <span className="icon">
            <Icon name="file" size={14} />
          </span>
          <span className={`fname ${gs ? `git-${gs}` : ''}`}>{node.name}</span>
          {gs && <span className={`git-badge git-${gs}`}>{badgeLetter[gs]}</span>}
        </div>
      )
    }

    const isOpen = expanded.has(ck(root, node.path))
    return (
      <div
        key={ck(root, node.path)}
        className={`row tree-row ${isSel ? 'selected' : ''}`}
        style={style}
        onClick={(e) => {
          if (!handleSelectClick(root, node.path, e)) toggle(root, node.path)
        }}
        onContextMenu={folderMenu(root, node)}
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          dragRef.current = { root, path: node.path }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const d = dragRef.current
          if (d && d.root === root) moveInto(root, d.path, node.path)
          else if (d) notify('Flytt mellan repon stöds ej', 'error')
          dragRef.current = null
        }}
      >
        <span className="icon">{isOpen ? '▾' : '▸'}</span>
        <span className={`fname ${m?.dirtyDirs.has(node.path) ? 'dirty-folder' : ''}`}>
          {node.name}
        </span>
        {m?.dirtyDirs.has(node.path) && <span className="git-dot" />}
      </div>
    )
  }

  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const endIdx = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN)
  const slice: JSX.Element[] = []
  for (let i = startIdx; i < endIdx; i++) slice.push(renderRow(rows[i], i))

  return (
    <div
      className="file-tree"
      tabIndex={0}
      ref={scrollRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onKeyDown={onKeyDown}
      onContextMenu={repo ? rootMenu(repo.path) : undefined}
    >
      {!loaded ? (
        <div className="hint">Läser filer…</div>
      ) : totalFiles === 0 && !creating ? (
        <div className="hint">Högerklicka för att skapa filer</div>
      ) : (
        <div style={{ height: rows.length * ROW_H, position: 'relative' }}>{slice}</div>
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
