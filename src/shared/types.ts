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
  htmlUrl: string
  stars: number
  language: string | null
  updatedAt: string
}

export interface PullRequest {
  number: number
  title: string
  author: string
  state: string
  url: string
  headRef: string
  baseRef: string
  draft?: boolean
}

export interface PullRequestDetail extends PullRequest {
  body: string | null
  merged: boolean
  mergeable: boolean | null
  headSha: string
  additions: number
  deletions: number
  changedFiles: number
  comments: number
  createdAt: string
  updatedAt: string
}

export interface PrFile {
  filename: string
  previousFilename: string | null
  status: string // added | modified | removed | renamed
  additions: number
  deletions: number
  patch: string | null
}

// En kommentar i konversationen (samma form för issues och PR:er).
export interface GhComment {
  id: number
  author: string
  body: string
  createdAt: string
}

// En inlämnad review på en PR (godkänd/ändringar begärda/kommentar).
export interface PrReview {
  id: number
  author: string
  state: string // APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED | PENDING
  body: string
  submittedAt: string
}

export type CheckState = 'success' | 'failure' | 'pending' | 'none'
export interface CheckStatus {
  state: CheckState
  passed: number
  failed: number
  pending: number
  total: number
}

export interface IssueLabel {
  name: string
  color: string
}
export interface Issue {
  number: number
  title: string
  body: string | null
  author: string
  state: string
  url: string
  comments: number
  createdAt: string
  labels: IssueLabel[]
}

export interface NewPullRequest {
  title: string
  body: string
  head: string
  base: string
}

export interface GhNotification {
  id: string
  title: string
  type: string // PullRequest | Issue | Commit | Release | Discussion …
  repo: string // owner/name
  reason: string
  url: string // härledd html-url
  updatedAt: string
}

export interface SearchRepoResult {
  fullName: string
  description: string | null
  stars: number
  language: string | null
  htmlUrl: string
  cloneUrl: string
  private: boolean
}

export interface SearchIssueResult {
  number: number
  title: string
  repo: string
  state: string
  isPr: boolean
  htmlUrl: string
  author: string
}

export interface Release {
  id: number
  tagName: string
  name: string
  body: string | null
  draft: boolean
  prerelease: boolean
  htmlUrl: string
  publishedAt: string | null
  author: string
}

export interface NewRelease {
  tagName: string
  name: string
  body: string
  draft: boolean
  prerelease: boolean
  target?: string
}

export interface WorkflowRun {
  id: number
  name: string
  status: string // queued | in_progress | completed
  conclusion: string | null // success | failure | cancelled | ...
  branch: string
  event: string
  htmlUrl: string
  createdAt: string
  runNumber: number
}

export interface RateLimit {
  remaining: number
  limit: number
  resetAt: number // unix-sekunder
}

export interface Gist {
  id: string
  description: string
  public: boolean
  htmlUrl: string
  files: string[]
  updatedAt: string
}

export interface RepoInsights {
  languages: { name: string; bytes: number }[]
  contributors: { login: string; avatarUrl: string; contributions: number }[]
}

export interface RepoLabel {
  name: string
  color: string
}

export interface SearchHit {
  file: string
  line: number
  text: string
}

export interface LangServerStatus {
  id: string
  name: string
  description: string
  installCmd: string | null
  manualHint: string | null
  installed: boolean
  prereqOk: boolean
  prereq: string | null
}

export interface TsProject {
  compilerOptions: Record<string, unknown>
  files: { path: string; content: string }[]
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
