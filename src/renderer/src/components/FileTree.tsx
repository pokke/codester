import { useEffect, useMemo, useRef, useState } from 'react'
import { useRepo } from '../state/RepoContext'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/Confirm'
import { ContextMenu, type MenuState } from '../ui/ContextMenu'

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

type Creating = { parent: string; type: 'file' | 'folder' } | null
type Clipboard = { paths: string[]; op: 'cut' | 'copy' } | null

export function FileTree({ onOpenEditor }: { onOpenEditor: () => void }): JSX.Element {
  const { files, activePath, selectPath, previewFile, refresh, status } = useRepo()
  const { notify } = useToast()
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState<Creating>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchorRef = useRef<string | null>(null)
  const dragRef = useRef<string | null>(null)

  const tree = useMemo(() => buildTree(files), [files])
  const fileSet = useMemo(() => new Set(files), [files])

  // Synliga rader i visningsordning (för Shift-intervallval)
  const visiblePaths = useMemo(() => {
    const out: string[] = []
    const walk = (node: TreeNode): void => {
      for (const c of sortedChildren(node)) {
        out.push(c.path)
        if (!c.isFile && expanded.has(c.path)) walk(c)
      }
    }
    walk(tree)
    return out
  }, [tree, expanded])

  useEffect(() => {
    if (!activePath) return
    const parts = activePath.split('/')
    if (parts.length < 2) return
    setExpanded((prev) => {
      const next = new Set(prev)
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'))
      return next
    })
  }, [activePath])

  const { statusByPath, dirtyDirs } = useMemo(() => {
    const map = new Map<string, 'added' | 'modified' | 'deleted'>()
    const dirs = new Set<string>()
    for (const f of status?.files ?? []) {
      const t = f.status.includes('D')
        ? 'deleted'
        : f.status.includes('A') || f.status.includes('?')
          ? 'added'
          : 'modified'
      map.set(f.path, t)
      const parts = f.path.split('/')
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
    }
    return { statusByPath: map, dirtyDirs: dirs }
  }, [status])

  const badgeLetter: Record<'added' | 'modified' | 'deleted', string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D'
  }

  const toggle = (p: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })

  // Hantera markering vid klick. Returnerar true om klicket konsumerades
  // (modifierare) så att anroparen inte ska öppna/fälla ut.
  const handleSelectClick = (path: string, e: React.MouseEvent): boolean => {
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const n = new Set(prev)
        n.has(path) ? n.delete(path) : n.add(path)
        return n
      })
      anchorRef.current = path
      return true
    }
    if (e.shiftKey && anchorRef.current) {
      const a = visiblePaths.indexOf(anchorRef.current)
      const b = visiblePaths.indexOf(path)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelected(new Set(visiblePaths.slice(lo, hi + 1)))
      }
      return true
    }
    setSelected(new Set([path]))
    anchorRef.current = path
    return false
  }

  const startCreate = (parent: string, type: 'file' | 'folder'): void => {
    if (parent) setExpanded((p) => new Set(p).add(parent))
    setCreating({ parent, type })
    setDraft('')
  }

  const submitCreate = async (): Promise<void> => {
    if (!creating || !draft.trim()) {
      setCreating(null)
      return
    }
    const rel = creating.parent ? `${creating.parent}/${draft.trim()}` : draft.trim()
    const res =
      creating.type === 'file'
        ? await window.api.fs.createFile(rel)
        : await window.api.fs.createFolder(rel)
    setCreating(null)
    if (res.ok) {
      await refresh()
      if (creating.type === 'file') {
        selectPath(rel)
        onOpenEditor()
      }
    } else {
      notify(res.error, 'error')
    }
  }

  const submitRename = async (oldPath: string): Promise<void> => {
    const name = draft.trim()
    setRenaming(null)
    if (!name || name === oldPath.split('/').pop()) return
    const dir = oldPath.split('/').slice(0, -1).join('/')
    const newRel = dir ? `${dir}/${name}` : name
    const res = await window.api.fs.rename(oldPath, newRel)
    if (res.ok) await refresh()
    else notify(res.error, 'error')
  }

  const startRename = (path: string, name: string): void => {
    setRenaming(path)
    setDraft(name)
  }

  const delMany = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    const ok = await confirm({
      message:
        paths.length === 1 ? `Radera ${paths[0]}?` : `Radera ${paths.length} objekt?`,
      confirmLabel: 'Radera',
      danger: true
    })
    if (!ok) return
    for (const p of paths) {
      const res = await window.api.fs.delete(p)
      if (!res.ok) notify(res.error, 'error')
    }
    setSelected(new Set())
    await refresh()
  }

  const moveInto = async (src: string, destFolder: string): Promise<void> => {
    const name = src.split('/').pop()!
    const dest = destFolder ? `${destFolder}/${name}` : name
    if (dest === src) return
    if (destFolder === src || destFolder.startsWith(`${src}/`)) {
      notify('Kan inte flytta en mapp in i sig själv', 'error')
      return
    }
    const res = await window.api.fs.rename(src, dest)
    if (res.ok) await refresh()
    else notify(res.error, 'error')
  }

  const pasteInto = async (destFolder: string): Promise<void> => {
    if (!clipboard) return
    for (const src of clipboard.paths) {
      const name = src.split('/').pop()!
      const dest = destFolder ? `${destFolder}/${name}` : name
      if (dest === src) continue
      const res =
        clipboard.op === 'cut'
          ? await window.api.fs.rename(src, dest)
          : await window.api.fs.copy(src, dest)
      if (!res.ok) notify(res.error, 'error')
    }
    if (clipboard.op === 'cut') setClipboard(null)
    await refresh()
  }

  // Vid högerklick: agera på markeringen om objektet ingår i den, annars enbart objektet
  const targetsFor = (path: string): string[] => {
    if (selected.has(path) && selected.size > 1) return [...selected]
    setSelected(new Set([path]))
    return [path]
  }

  const openMenu = (e: React.MouseEvent, items: MenuState['items']): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, items })
  }
  const fileMenu = (node: TreeNode) => (e: React.MouseEvent): void => {
    const t = targetsFor(node.path)
    openMenu(e, [
      ...(t.length === 1
        ? [{ label: 'Öppna', onClick: () => { selectPath(node.path); onOpenEditor() } }, { separator: true }]
        : []),
      { label: t.length > 1 ? `Klipp ut (${t.length})` : 'Klipp ut', onClick: () => setClipboard({ paths: t, op: 'cut' }) },
      { label: t.length > 1 ? `Kopiera (${t.length})` : 'Kopiera', onClick: () => setClipboard({ paths: t, op: 'copy' }) },
      { separator: true },
      ...(t.length === 1 ? [{ label: 'Byt namn', onClick: () => startRename(node.path, node.name) }] : []),
      { label: t.length > 1 ? `Radera (${t.length})` : 'Radera', danger: true, onClick: () => delMany(t) }
    ])
  }
  const folderMenu = (node: TreeNode) => (e: React.MouseEvent): void => {
    const t = targetsFor(node.path)
    openMenu(e, [
      { label: 'Ny fil', onClick: () => startCreate(node.path, 'file') },
      { label: 'Ny mapp', onClick: () => startCreate(node.path, 'folder') },
      { separator: true },
      { label: t.length > 1 ? `Klipp ut (${t.length})` : 'Klipp ut', onClick: () => setClipboard({ paths: t, op: 'cut' }) },
      { label: t.length > 1 ? `Kopiera (${t.length})` : 'Kopiera', onClick: () => setClipboard({ paths: t, op: 'copy' }) },
      ...(clipboard ? [{ label: 'Klistra in', onClick: () => pasteInto(node.path) }] : []),
      { separator: true },
      ...(t.length === 1 ? [{ label: 'Byt namn', onClick: () => startRename(node.path, node.name) }] : []),
      { label: t.length > 1 ? `Radera (${t.length})` : 'Radera', danger: true, onClick: () => delMany(t) }
    ])
  }
  const rootMenu = (e: React.MouseEvent): void =>
    openMenu(e, [
      { label: 'Ny fil', onClick: () => startCreate('', 'file') },
      { label: 'Ny mapp', onClick: () => startCreate('', 'folder') },
      ...(clipboard ? [{ separator: true }, { label: 'Klistra in', onClick: () => pasteInto('') }] : [])
    ])

  // Tangentbord på trädet: Delete, Ctrl+X/C/V
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (selected.size === 0 && e.key !== 'v') return
    if (e.key === 'Delete') {
      e.preventDefault()
      delMany([...selected])
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
      setClipboard({ paths: [...selected], op: 'cut' })
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      setClipboard({ paths: [...selected], op: 'copy' })
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      // Klistra in i markerad mapp, annars i den markerade filens mapp
      const sel = [...selected]
      let dest = ''
      if (sel.length >= 1) {
        const p = sel[0]
        dest = fileSet.has(p) ? p.split('/').slice(0, -1).join('/') : p
      }
      pasteInto(dest)
    }
  }

  const renderNode = (node: TreeNode, depth: number): JSX.Element => {
    const pad = { paddingLeft: 8 + depth * 12 }
    const isSel = selected.has(node.path)

    if (renaming === node.path) {
      return (
        <div className="row tree-row" style={pad} key={node.path}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => submitRename(node.path)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename(node.path)
              if (e.key === 'Escape') setRenaming(null)
            }}
            style={{ width: '100%' }}
          />
        </div>
      )
    }

    if (node.isFile) {
      const gs = statusByPath.get(node.path)
      return (
        <div
          key={node.path}
          className={`row tree-row file-row ${activePath === node.path ? 'active' : ''} ${
            isSel ? 'selected' : ''
          }`}
          style={pad}
          title={node.path}
          onClick={(e) => {
            if (!handleSelectClick(node.path, e)) {
              previewFile(node.path)
              onOpenEditor()
            }
          }}
          onDoubleClick={() => {
            selectPath(node.path)
            onOpenEditor()
          }}
          onContextMenu={fileMenu(node)}
          draggable
          onDragStart={() => (dragRef.current = node.path)}
        >
          <span className="icon">📄</span>
          <span className={`fname ${gs ? `git-${gs}` : ''}`}>{node.name}</span>
          {gs && <span className={`git-badge git-${gs}`}>{badgeLetter[gs]}</span>}
        </div>
      )
    }

    const isOpen = expanded.has(node.path)
    return (
      <div key={node.path}>
        <div
          className={`row tree-row ${isSel ? 'selected' : ''}`}
          style={pad}
          onClick={(e) => {
            if (!handleSelectClick(node.path, e)) toggle(node.path)
          }}
          onContextMenu={folderMenu(node)}
          draggable
          onDragStart={(e) => {
            e.stopPropagation()
            dragRef.current = node.path
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (dragRef.current) moveInto(dragRef.current, node.path)
            dragRef.current = null
          }}
        >
          <span className="icon">{isOpen ? '▾' : '▸'}</span>
          <span className={`fname ${dirtyDirs.has(node.path) ? 'dirty-folder' : ''}`}>
            {node.name}
          </span>
          {dirtyDirs.has(node.path) && <span className="git-dot" />}
        </div>
        {isOpen && (
          <>
            {creating?.parent === node.path && createInput(depth + 1)}
            {sortedChildren(node).map((c) => renderNode(c, depth + 1))}
          </>
        )}
      </div>
    )
  }

  const createInput = (depth: number): JSX.Element => (
    <div className="row tree-row" style={{ paddingLeft: 8 + depth * 12 }}>
      <span className="icon">{creating?.type === 'folder' ? '📁' : '📄'}</span>
      <input
        autoFocus
        placeholder={creating?.type === 'folder' ? 'mappnamn' : 'filnamn.ext'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={submitCreate}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitCreate()
          if (e.key === 'Escape') setCreating(null)
        }}
        style={{ width: '100%' }}
      />
    </div>
  )

  return (
    <div
      className="file-tree"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onContextMenu={rootMenu}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => {
        if (dragRef.current) moveInto(dragRef.current, '')
        dragRef.current = null
      }}
    >
      {creating?.parent === '' && createInput(0)}
      {files.length === 0 && !creating && <div className="hint">Högerklicka för att skapa filer</div>}
      {sortedChildren(tree).map((c) => renderNode(c, 0))}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
