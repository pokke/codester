import { simpleGit, type SimpleGit } from 'simple-git'
import { basename, join } from 'path'
import { tmpdir } from 'os'
import { readFile, writeFile, unlink } from 'fs/promises'
import type {
  BranchInfo,
  BlameLine,
  CommitLogEntry,
  DiffResult,
  FileChange,
  LineChange,
  RepoStatus,
  SearchHit,
  StashEntry
} from '../../shared/types'

// Git-motorn för Codester. All git-logik bor i main-processen och nås via IPC.
// Vi håller ett aktivt repo i taget i Fas 1.

let git: SimpleGit | null = null
let repoPath: string | null = null

export function getRepoPath(): string | null {
  return repoPath
}

function requireGit(): SimpleGit {
     if (!git) throw new Error('Inget repo är öppnat')
  return git
}

export async function openRepo(path: string): Promise<{ path: string; name: string }> {
  const candidate = simpleGit(path)
  const isRepo = await candidate.checkIsRepo()
  if (!isRepo) throw new Error('Mappen är inte ett git-repo')
  git = candidate
  repoPath = path
  return { path, name: basename(path) }
}

export async function cloneRepo(url: string, parentDir: string): Promise<string> {
  // Härled målmapp av repo-namnet
  const name = url
    .split('/')
    .pop()!
    .replace(/\.git$/, '')
  const target = join(parentDir, name)
  await simpleGit(parentDir).clone(url, target)
  await openRepo(target)
  return target
}

export async function status(): Promise<RepoStatus> {
  const g = requireGit()
  const s = await g.status()
  const files = s.files.map((f) => ({
    path: f.path,
    status: (f.index + f.working_dir).trim() || f.index || f.working_dir,
    // staged om index-kolumnen har något annat än mellanslag/'?'
    staged: f.index !== ' ' && f.index !== '?'
  }))
  return {
    current: s.current ?? '(detached)',
    tracking: s.tracking ?? null,
    ahead: s.ahead,
    behind: s.behind,
    files,
    conflicted: s.conflicted
  }
}

export async function listFiles(): Promise<string[]> {
  // Alla spårade + ej ignorerade filer (respekterar .gitignore).
  const g = requireGit()
  const out = await g.raw(['ls-files', '--cached', '--others', '--exclude-standard'])
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
}

export async function resolveSide(file: string, side: 'ours' | 'theirs'): Promise<void> {
  const g = requireGit()
  await g.raw(['checkout', `--${side}`, '--', file])
  await g.add(file)
}

export async function branches(): Promise<BranchInfo[]> {
  const g = requireGit()
  const b = await g.branchLocal()
  return b.all.map((name) => ({ name, current: name === b.current }))
}

export async function checkout(name: string): Promise<void> {
  await requireGit().checkout(name)
}

export async function createBranch(name: string): Promise<void> {
  await requireGit().checkoutLocalBranch(name)
}

export async function deleteBranch(name: string, force: boolean): Promise<void> {
  await requireGit().deleteLocalBranch(name, force)
}

export async function diff(file: string, staged: boolean): Promise<DiffResult> {
  const g = requireGit()
  const args = staged ? ['--staged', '--', file] : ['--', file]
  const patch = await g.diff(args)
  return { patch, binary: patch.includes('Binary files') }
}

export async function stage(file: string): Promise<void> {
  await requireGit().add(file)
}

export async function unstage(file: string): Promise<void> {
  await requireGit().reset(['HEAD', '--', file])
}

export async function stageAll(): Promise<void> {
  await requireGit().add('.')
}

export async function discard(file: string): Promise<void> {
  await requireGit().checkout(['--', file])
}

export async function commit(message: string, amend = false): Promise<string> {
  const res = await requireGit().commit(message, [], amend ? { '--amend': null } : {})
  return res.commit
}

export async function lastCommitMessage(): Promise<string> {
  try {
    return (await requireGit().raw(['log', '-1', '--format=%B'])).trim()
  } catch {
    return ''
  }
}

// ── Hunk-nivå staging ─────────────────────────────────────────────────
// Delar upp en fils diff i hunkar och applicerar en enskild hunk mot index
// (stage/unstage) eller arbetsträdet (discard) via `git apply`.

function splitDiff(patch: string): { header: string; hunks: string[] } {
  const lines = patch.split('\n')
  const header: string[] = []
  let i = 0
  while (i < lines.length && !lines[i].startsWith('@@')) header.push(lines[i++])
  const hunks: string[] = []
  let cur: string[] | null = null
  for (; i < lines.length; i++) {
    if (lines[i].startsWith('@@')) {
      if (cur) hunks.push(cur.join('\n'))
      cur = [lines[i]]
    } else if (cur) {
      cur.push(lines[i])
    }
  }
  if (cur) hunks.push(cur.join('\n'))
  return { header: header.join('\n'), hunks }
}

async function applyHunk(
  file: string,
  index: number,
  staged: boolean,
  flags: string[]
): Promise<void> {
  const g = requireGit()
  const patch = await diff(file, staged)
  const { header, hunks } = splitDiff(patch.patch)
  if (index < 0 || index >= hunks.length) throw new Error('Hunk saknas')
  const content = `${header}\n${hunks[index]}\n`
  const tmp = join(tmpdir(), `codester-hunk-${Date.now()}.patch`)
  await writeFile(tmp, content, 'utf-8')
  try {
    await g.raw(['apply', ...flags, tmp])
  } finally {
    await unlink(tmp).catch(() => {})
  }
}

export async function stageHunk(file: string, index: number): Promise<void> {
  await applyHunk(file, index, false, ['--cached'])
}
export async function unstageHunk(file: string, index: number): Promise<void> {
  await applyHunk(file, index, true, ['--cached', '--reverse'])
}
export async function discardHunk(file: string, index: number): Promise<void> {
  await applyHunk(file, index, false, ['--reverse'])
}

export async function push(): Promise<void> {
  await requireGit().push()
}

export async function pull(): Promise<void> {
  await requireGit().pull()
}

export async function fetchAll(): Promise<void> {
  await requireGit().fetch(['--all', '--prune'])
}

export async function log(limit = 100): Promise<CommitLogEntry[]> {
  const g = requireGit()
  const res = await g.log({
    maxCount: limit,
    format: {
      hash: '%H',
      shortHash: '%h',
      message: '%s',
      author: '%an',
      email: '%ae',
      date: '%ai',
      refs: '%D',
      parents: '%P'
    }
  })
  return res.all.map((c) => ({
    ...c,
    parents: c.parents ? c.parents.split(' ').filter(Boolean) : []
  }))
}

export async function fileContent(file: string): Promise<string> {
  if (!repoPath) throw new Error('Inget repo är öppnat')
  return readFile(join(repoPath, file), 'utf-8')
}

export async function saveFile(file: string, content: string): Promise<void> {
  if (!repoPath) throw new Error('Inget repo är öppnat')
  await writeFile(join(repoPath, file), content, 'utf-8')
}

export async function commitFiles(hash: string): Promise<FileChange[]> {
  // Filer som ändrades i en commit, med status (M/A/D/R…).
  const raw = await requireGit().raw(['show', '--name-status', '--format=', '-M', hash])
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split('\t')
      const status = parts[0]
      const path = parts[parts.length - 1]
      return { path, status, staged: false }
    })
    .filter((f) => f.path)
}

export async function showFile(rev: string, file: string): Promise<string> {
  // Filens innehåll vid en viss revision (tom sträng om den inte finns där).
  try {
    return await requireGit().show([`${rev}:${file}`])
  } catch {
    return ''
  }
}

export async function searchRepo(query: string): Promise<SearchHit[]> {
  if (!query.trim()) return []
  try {
    // -I hoppar över binärfiler, -F literal, -i skiftlägesokänsligt
    const raw = await requireGit().raw([
      'grep',
      '-n',
      '-I',
      '-F',
      '-i',
      '--max-count=20',
      '-e',
      query
    ])
    return raw
      .split('\n')
      .filter(Boolean)
      .slice(0, 500)
      .map((line) => {
        const m = line.match(/^(.+?):(\d+):(.*)$/)
        return m ? { file: m[1], line: Number(m[2]), text: m[3] } : null
      })
      .filter((h): h is SearchHit => h !== null)
  } catch {
    // git grep returnerar exit 1 när inget matchar
    return []
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function replaceInRepo(
  query: string,
  replacement: string
): Promise<{ files: number; count: number }> {
  if (!query || !repoPath) return { files: 0, count: 0 }
  let list: string[] = []
  try {
    const raw = await requireGit().raw(['grep', '-l', '-I', '-F', '-i', '-e', query])
    list = raw.split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {
    return { files: 0, count: 0 } // inga träffar
  }
  const re = new RegExp(escapeRegExp(query), 'gi')
  let files = 0
  let count = 0
  for (const rel of list) {
    const full = join(repoPath, rel)
    const content = await readFile(full, 'utf-8')
    const matches = content.match(re)
    if (!matches) continue
    await writeFile(full, content.replace(re, replacement), 'utf-8')
    files++
    count += matches.length
  }
  return { files, count }
}

export async function lineChanges(file: string): Promise<LineChange[]> {
  // Rad-ändringar mot HEAD (för gutter-markering), via git diff -U0.
  try {
    const raw = await requireGit().diff(['--unified=0', 'HEAD', '--', file])
    const changes: LineChange[] = []
    const re = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm
    let m: RegExpExecArray | null
    while ((m = re.exec(raw)) !== null) {
      const oldCount = m[1] === undefined ? 1 : Number(m[1])
      const newStart = Number(m[2])
      const newCount = m[3] === undefined ? 1 : Number(m[3])
      if (newCount === 0) {
        changes.push({ start: newStart, end: newStart, type: 'del' })
      } else {
        changes.push({
          start: newStart,
          end: newStart + newCount - 1,
          type: oldCount === 0 ? 'add' : 'mod'
        })
      }
    }
    return changes
  } catch {
    return []
  }
}

export async function headContent(file: string): Promise<string> {
  // Innehållet i filen som det ligger i senaste commit (HEAD).
  // Returnerar tom sträng för nya filer som inte finns i HEAD.
  try {
    return await requireGit().show([`HEAD:${file}`])
  } catch {
    return ''
  }
}

export async function stashSave(message?: string): Promise<void> {
  const args = message ? ['push', '-m', message] : ['push']
  await requireGit().stash(args)
}

export async function stashList(): Promise<StashEntry[]> {
  const g = requireGit()
  const raw = await g.raw(['stash', 'list', '--format=%gd|%ci|%s'])
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [, date, message] = line.split('|')
      return { index: i, message: message ?? line, date: date ?? '' }
    })
}

export async function stashApply(index: number, pop: boolean): Promise<void> {
  await requireGit().stash([pop ? 'pop' : 'apply', `stash@{${index}}`])
}

export async function stashDrop(index: number): Promise<void> {
  await requireGit().stash(['drop', `stash@{${index}}`])
}

export async function remoteOwnerRepo(): Promise<{ owner: string; repo: string } | null> {
  const g = requireGit()
  const remotes = await g.getRemotes(true)
  const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0]
  const url = origin?.refs?.fetch
  if (!url) return null
  // Stöd både https och ssh-form
  const m = url.match(/[/:]([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

export async function blame(file: string): Promise<BlameLine[]> {
  const g = requireGit()
  // Porslin-format ger stabil parsning
  const raw = await g.raw(['blame', '--line-porcelain', '--', file])
  const lines: BlameLine[] = []
  const blocks = raw.split('\n')
  let cur: Partial<BlameLine> = {}
  let lineNo = 0
  for (const ln of blocks) {
    if (/^[0-9a-f]{40} /.test(ln)) {
      cur = { hash: ln.slice(0, 8) }
      lineNo++
      cur.line = lineNo
    } else if (ln.startsWith('author ')) {
      cur.author = ln.slice('author '.length)
    } else if (ln.startsWith('author-time ')) {
      const t = Number(ln.slice('author-time '.length)) * 1000
      cur.date = new Date(t).toISOString().slice(0, 10)
    } else if (ln.startsWith('\t')) {
      cur.content = ln.slice(1)
      lines.push(cur as BlameLine)
    }
  }
  return lines
}
