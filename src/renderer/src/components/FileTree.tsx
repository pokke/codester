import { useMemo, useState } from 'react'
import { useRepo } from '../state/RepoContext'

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
        child = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          children: new Map(),
          isFile
        }
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

function Node({
  node,
  depth,
  expanded,
  toggle,
  activePath,
  onSelect,
  changedPaths
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  toggle: (p: string) => void
  activePath: string | null
  onSelect: (p: string) => void
  changedPaths: Set<string>
}): JSX.Element {
  const pad = { paddingLeft: 8 + depth * 12 }

  if (node.isFile) {
    return (
      <div
        className={`row tree-row ${activePath === node.path ? 'active' : ''}`}
        style={pad}
        title={node.path}
        onClick={() => onSelect(node.path)}
      >
        <span className="icon">📄</span>
        <span className="fname">{node.name}</span>
        {changedPaths.has(node.path) && <span className="dot modified" />}
      </div>
    )
  }

  const isOpen = expanded.has(node.path)
  return (
    <>
      <div className="row tree-row" style={pad} onClick={() => toggle(node.path)}>
        <span className="icon">{isOpen ? '▾' : '▸'}</span>
        <span className="fname">{node.name}</span>
      </div>
      {isOpen &&
        sortedChildren(node).map((c) => (
          <Node
            key={c.path}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            activePath={activePath}
            onSelect={onSelect}
            changedPaths={changedPaths}
          />
        ))}
    </>
  )
}

export function FileTree({ onOpenEditor }: { onOpenEditor: () => void }): JSX.Element {
  const { files, activePath, selectPath, status } = useRepo()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const tree = useMemo(() => buildTree(files), [files])
  const changedPaths = useMemo(
    () => new Set((status?.files ?? []).map((f) => f.path)),
    [status]
  )

  const toggle = (p: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })

  if (files.length === 0) {
    return <div className="hint">Inga filer</div>
  }

  return (
    <div className="file-tree">
      {sortedChildren(tree).map((c) => (
        <Node
          key={c.path}
          node={c}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          activePath={activePath}
          onSelect={(p) => {
            selectPath(p)
            onOpenEditor()
          }}
          changedPaths={changedPaths}
        />
      ))}
    </div>
  )
}
