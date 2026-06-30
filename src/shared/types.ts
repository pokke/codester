// Delade typer mellan main-, preload- och renderer-processerna.

export interface RepoInfo {
  path: string
  name: string
}

export interface BranchInfo {
  name: string
  current: boolean
}

export interface FileChange {
  path: string
  /** index/working status, t.ex. 'M', 'A', 'D', '??' */
  status: string
  staged: boolean
}

export interface RepoStatus {
  current: string
  tracking: string | null
  ahead: number
  behind: number
  files: FileChange[]
  conflicted: string[]
}

export interface CommitLogEntry {
  hash: string
  shortHash: string
  message: string
  author: string
  email: string
  date: string
  refs: string
  parents: string[]
}

export interface DiffResult {
  /** rå unified diff-text */
  patch: string
  binary: boolean
}

export interface GitHubUser {
  login: string
  name: string | null
  avatarUrl: string
}

export interface DeviceCodeInfo {
  deviceCode: string
  userCode: string
  verificationUri: string
  interval: number
  expiresIn: number
}

export interface GitHubRepo {
  fullName: string
  name: string
  cloneUrl: string
  private: boolean
  description: string | null
  defaultBranch: string
}

export interface PullRequest {
  number: number
  title: string
  author: string
  state: string
  url: string
  headRef: string
  baseRef: string
}

export interface SearchHit {
  file: string
  line: number
  text: string
}

export interface LineChange {
  start: number
  end: number
  type: 'add' | 'mod' | 'del'
}

export interface StashEntry {
  index: number
  message: string
  date: string
}

export interface BlameLine {
  line: number
  hash: string
  author: string
  date: string
  content: string
}

/** Resultatkuvert för IPC – fel bubblar upp som { ok:false, error } */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
