import { useMemo, useState } from 'react'
import { useRepo } from '../state/RepoContext'
import { useToast } from '../ui/Toast'

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState<Creating>(null)

  const tree = useMemo(() => buildTree(files), [files])

  // Git-status per fil + vilka mappar som innehåller ändringar
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
    if (!confirm(`Radera ${path}?`)) return
    const res = await window.api.fs.delete(path)
    if (res.ok) await refresh()
    else notify(res.error, 'error')
  }

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
        >
          <span className="icon">📄</span>
          <span className={`fname ${gs ? `git-${gs}` : ''}`}>{node.name}</span>
          {gs && <span className={`git-badge git-${gs}`}>{badgeLetter[gs]}</span>}
          <span className="row-actions">
            <button
              className="btn ghost icon"
              title="Byt namn"
              onClick={(e) => {
                e.stopPropagation()
                setRenaming(node.path)
                setDraft(node.name)
              }}
            >
              ✎
            </button>
            <button
              className="btn ghost icon"
              title="Radera"
              onClick={(e) => {
                e.stopPropagation()
                del(node.path)
              }}
            >
              🗑
            </button>
          </span>
        </div>
      )
    }

    const isOpen = expanded.has(node.path)
    return (
      <div key={node.path}>
        <div className="row tree-row" style={pad} onClick={() => toggle(node.path)}>
          <span className="icon">{isOpen ? '▾' : '▸'}</span>
          <span className={`fname ${dirtyDirs.has(node.path) ? 'dirty-folder' : ''}`}>
            {node.name}
          </span>
          {dirtyDirs.has(node.path) && <span className="git-dot" />}
          <span className="row-actions">
            <button
              className="btn ghost icon"
              title="Ny fil här"
              onClick={(e) => {
                e.stopPropagation()
                startCreate(node.path, 'file')
              }}
            >
              +
            </button>
            <button
              className="btn ghost icon"
              title="Byt namn"
              onClick={(e) => {
                e.stopPropagation()
                setRenaming(node.path)
                setDraft(node.name)
              }}
            >
              ✎
            </button>
            <button
              className="btn ghost icon"
              title="Radera"
              onClick={(e) => {
                e.stopPropagation()
                del(node.path)
              }}
            >
              🗑
            </button>
          </span>
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
    <div className="file-tree">
      <div className="tree-toolbar">
        <button className="btn ghost icon" title="Ny fil" onClick={() => startCreate('', 'file')}>
          📄+
        </button>
        <button className="btn ghost icon" title="Ny mapp" onClick={() => startCreate('', 'folder')}>
          📁+
        </button>
      </div>
      {creating?.parent === '' && createInput(0)}
      {files.length === 0 && !creating && <div className="hint">Inga filer</div>}
      {sortedChildren(tree).map((c) => renderNode(c, 0))}
    </div>
  )
}
