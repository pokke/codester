import { useEffect, useMemo, useState } from 'react'
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

export function FileTree({ onOpenEditor }: { onOpenEditor: () => void }): JSX.Element {
  const { files, activePath, selectPath, previewFile, refresh, status } = useRepo()
  const { notify } = useToast()
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState<Creating>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)

  const tree = useMemo(() => buildTree(files), [files])

  // Auto-reveal: expandera mapparna upp till den aktiva filen
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

  const del = async (path: string): Promise<void> => {
    const ok = await confirm({
      message: `Radera ${path}?`,
      confirmLabel: 'Radera',
      danger: true
    })
    if (!ok) return
    const res = await window.api.fs.delete(path)
    if (res.ok) await refresh()
    else notify(res.error, 'error')
  }

  const startRename = (path: string, name: string): void => {
    setRenaming(path)
    setDraft(name)
  }

  // Högerklicksmenyer
  const openMenu = (e: React.MouseEvent, items: MenuState['items']): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, items })
  }
  const fileMenu = (node: TreeNode) => (e: React.MouseEvent): void =>
    openMenu(e, [
      { label: 'Öppna', onClick: () => { selectPath(node.path); onOpenEditor() } },
      { separator: true },
      { label: 'Byt namn', onClick: () => startRename(node.path, node.name) },
      { label: 'Radera', danger: true, onClick: () => del(node.path) }
    ])
  const folderMenu = (node: TreeNode) => (e: React.MouseEvent): void =>
    openMenu(e, [
      { label: 'Ny fil', onClick: () => startCreate(node.path, 'file') },
      { label: 'Ny mapp', onClick: () => startCreate(node.path, 'folder') },
      { separator: true },
      { label: 'Byt namn', onClick: () => startRename(node.path, node.name) },
      { label: 'Radera', danger: true, onClick: () => del(node.path) }
    ])
  const rootMenu = (e: React.MouseEvent): void =>
    openMenu(e, [
      { label: 'Ny fil', onClick: () => startCreate('', 'file') },
      { label: 'Ny mapp', onClick: () => startCreate('', 'folder') }
    ])

  const renderNode = (node: TreeNode, depth: number): JSX.Element => {
    const pad = { paddingLeft: 8 + depth * 12 }

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
          className={`row tree-row file-row ${activePath === node.path ? 'active' : ''}`}
          style={pad}
          title={node.path}
          onClick={() => {
            previewFile(node.path)
            onOpenEditor()
          }}
          onDoubleClick={() => {
            selectPath(node.path)
            onOpenEditor()
          }}
          onContextMenu={fileMenu(node)}
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
          className="row tree-row"
          style={pad}
          onClick={() => toggle(node.path)}
          onContextMenu={folderMenu(node)}
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
    <div className="file-tree" onContextMenu={rootMenu}>
      {creating?.parent === '' && createInput(0)}
      {files.length === 0 && !creating && <div className="hint">Högerklicka för att skapa filer</div>}
      {sortedChildren(tree).map((c) => renderNode(c, 0))}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
