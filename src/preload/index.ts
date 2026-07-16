import { contextBridge, ipcRenderer } from 'electron'
import type {
  BlameLine,
  BranchInfo,
  CommitLogEntry,
  DeviceCodeInfo,
  DiffResult,
  EditRelease,
  FileChange,
  CheckStatus,
  GhComment,
  GhNotification,
  Gist,
  GitHubRepo,
  GitHubUser,
  Issue,
  LangServerStatus,
  LineChange,
  NewRelease,
  PrFile,
  PrReview,
  PullRequest,
  PullRequestDetail,
  RateLimit,
  Release,
  RepoInfo,
  RepoInsights,
  RepoLabel,
  SearchIssueResult,
  SearchRepoResult,
  WorkflowJob,
  WorkflowRun,
  RepoStatus,
  Result,
  SearchHit,
  StashEntry,
  TsProject
} from '../shared/types'

// Säker, typad brygga mellan renderer och main. Allt går via Result-kuvert.
function invoke<T>(channel: string, ...args: unknown[]): Promise<Result<T>> {
  return ipcRenderer.invoke(channel, ...args)
}

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),

  clipboard: {
    write: (text: string) => invoke<void>('clipboard:write', text),
    read: () => invoke<string>('clipboard:read')
  },

  repo: {
    openDialog: () => invoke<RepoInfo | null>('repo:openDialog'),
    open: (path: string) => invoke<RepoInfo>('repo:open', path),
    current: () => invoke<string | null>('repo:current'),
    cloneDialog: (url: string) => invoke<string | null>('repo:cloneDialog', url),
    // Arbetsyta (multi-root)
    add: (path: string) => invoke<RepoInfo>('repo:add', path),
    addDialog: () => invoke<RepoInfo | null>('repo:addDialog'),
    pickFolder: () => invoke<string | null>('repo:pickFolder'),
    isGit: (path: string) => invoke<boolean>('repo:isGit', path),
    init: (path: string) => invoke<RepoInfo>('repo:init', path),
    list: () => invoke<RepoInfo[]>('repo:list'),
    remote: () => invoke<{ owner: string; repo: string } | null>('repo:remote'),
    setActive: (path: string) => invoke<RepoInfo | null>('repo:setActive', path),
    close: (path: string) => invoke<void>('repo:close', path)
  },

  git: {
    status: (root?: string) => invoke<RepoStatus>('git:status', root),
    branches: (root?: string) => invoke<BranchInfo[]>('git:branches', root),
    checkout: (name: string, root?: string) => invoke<void>('git:checkout', name, root),
    checkoutPr: (number: number, branch: string) =>
      invoke<void>('git:checkoutPr', number, branch),
    createBranch: (name: string, root?: string) => invoke<void>('git:createBranch', name, root),
    deleteBranch: (name: string, force: boolean) =>
      invoke<void>('git:deleteBranch', name, force),
    deleteRemoteBranch: (name: string) => invoke<void>('git:deleteRemoteBranch', name),
    diff: (file: string, staged: boolean) => invoke<DiffResult>('git:diff', file, staged),
    stage: (file: string, root?: string) => invoke<void>('git:stage', file, root),
    unstage: (file: string, root?: string) => invoke<void>('git:unstage', file, root),
    stageAll: (root?: string) => invoke<void>('git:stageAll', root),
    discard: (file: string, root?: string) => invoke<void>('git:discard', file, root),
    commit: (message: string, amend?: boolean, root?: string) =>
      invoke<string>('git:commit', message, amend, root),
    lastCommitMessage: (root?: string) => invoke<string>('git:lastCommitMessage', root),
    stageHunk: (file: string, index: number) => invoke<void>('git:stageHunk', file, index),
    unstageHunk: (file: string, index: number) => invoke<void>('git:unstageHunk', file, index),
    discardHunk: (file: string, index: number) => invoke<void>('git:discardHunk', file, index),
    push: (root?: string) => invoke<void>('git:push', root),
    pull: (root?: string) => invoke<void>('git:pull', root),
    fetch: (root?: string) => invoke<void>('git:fetch', root),
    log: (limit?: number) => invoke<CommitLogEntry[]>('git:log', limit),
    fileLog: (file: string) => invoke<CommitLogEntry[]>('git:fileLog', file),
    fileContent: (file: string) => invoke<string>('git:fileContent', file),
    headContent: (file: string) => invoke<string>('git:headContent', file),
    commitFiles: (hash: string) => invoke<FileChange[]>('git:commitFiles', hash),
    showFile: (rev: string, file: string) => invoke<string>('git:showFile', rev, file),
    search: (query: string) => invoke<SearchHit[]>('git:search', query),
    replace: (query: string, replacement: string) =>
      invoke<{ files: number; count: number }>('git:replace', query, replacement),
    lineChanges: (file: string) => invoke<LineChange[]>('git:lineChanges', file),
    saveFile: (file: string, content: string) =>
      invoke<void>('git:saveFile', file, content),
    blame: (file: string) => invoke<BlameLine[]>('git:blame', file),
    listFiles: (root?: string) => invoke<string[]>('git:listFiles', root),
    resolveSide: (file: string, side: 'ours' | 'theirs', root?: string) =>
      invoke<void>('git:resolveSide', file, side, root),
    stashSave: (message?: string, root?: string) => invoke<void>('git:stashSave', message, root),
    stashList: (root?: string) => invoke<StashEntry[]>('git:stashList', root),
    stashApply: (index: number, pop: boolean, root?: string) =>
      invoke<void>('git:stashApply', index, pop, root),
    stashDrop: (index: number, root?: string) => invoke<void>('git:stashDrop', index, root)
  },

  terminal: {
    start: (id: string): void => ipcRenderer.send('terminal:start', id),
    ensure: (id: string): void => ipcRenderer.send('terminal:ensure', id),
    input: (id: string, data: string): void => ipcRenderer.send('terminal:input', id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('terminal:resize', id, cols, rows),
    kill: (id: string): void => ipcRenderer.send('terminal:kill', id),
    hasCommand: (cmd: string) => invoke<boolean>('system:hasCommand', cmd),
    onData: (cb: (d: { id: string; text: string }) => void): (() => void) => {
      const listener = (_e: unknown, d: { id: string; text: string }): void => cb(d)
      ipcRenderer.on('terminal:data', listener)
      return () => ipcRenderer.removeListener('terminal:data', listener)
    },
    onMode: (cb: (d: { id: string; mode: string }) => void): (() => void) => {
      const listener = (_e: unknown, d: { id: string; mode: string }): void => cb(d)
      ipcRenderer.on('terminal:mode', listener)
      return () => ipcRenderer.removeListener('terminal:mode', listener)
    }
  },

  fs: {
    createFile: (rel: string, root?: string) => invoke<void>('fs:createFile', rel, root),
    createFolder: (rel: string, root?: string) => invoke<void>('fs:createFolder', rel, root),
    rename: (oldRel: string, newRel: string, root?: string) =>
      invoke<void>('fs:rename', oldRel, newRel, root),
    delete: (rel: string, root?: string) => invoke<void>('fs:delete', rel, root),
    copy: (srcRel: string, destRel: string, root?: string) =>
      invoke<void>('fs:copy', srcRel, destRel, root)
  },

  lang: {
    tsProject: () => invoke<TsProject | null>('lang:tsProject')
  },

  config: {
    read: (name: string) => invoke<string | null>('config:read', name),
    write: (name: string, content: string) => invoke<void>('config:write', name, content),
    dir: () => invoke<string>('config:dir')
  },

  langServers: {
    list: () => invoke<LangServerStatus[]>('langserver:list'),
    install: (id: string): Promise<{ ok: boolean; code: number }> =>
      ipcRenderer.invoke('langserver:install', id),
    onOutput: (cb: (d: { id: string; text: string }) => void): (() => void) => {
      const listener = (_e: unknown, d: { id: string; text: string }): void => cb(d)
      ipcRenderer.on('langserver:output', listener)
      return () => ipcRenderer.removeListener('langserver:output', listener)
    }
  },

  lsp: {
    ensure: (langId: string): Promise<boolean> => ipcRenderer.invoke('lsp:ensure', langId),
    request: (langId: string, method: string, params: unknown): Promise<unknown> =>
      ipcRenderer.invoke('lsp:request', langId, method, params),
    didOpen: (langId: string, uri: string, text: string): void =>
      ipcRenderer.send('lsp:didOpen', langId, uri, text),
    didChange: (langId: string, uri: string, text: string, version: number): void =>
      ipcRenderer.send('lsp:didChange', langId, uri, text, version),
    didClose: (langId: string, uri: string): void =>
      ipcRenderer.send('lsp:didClose', langId, uri),
    onDiagnostics: (cb: (d: { uri: string; diagnostics: unknown[] }) => void): (() => void) => {
      const listener = (_e: unknown, d: { uri: string; diagnostics: unknown[] }): void => cb(d)
      ipcRenderer.on('lsp:diagnostics', listener)
      return () => ipcRenderer.removeListener('lsp:diagnostics', listener)
    }
  },

  onRepoChanged: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('repo:changed', listener)
    return () => ipcRenderer.removeListener('repo:changed', listener)
  },

  update: {
    install: (): Promise<void> => ipcRenderer.invoke('update:install'),
    check: (): Promise<void> => ipcRenderer.invoke('update:check'),
    on: (cb: (e: { type: string; payload?: unknown }) => void): (() => void) => {
      const channels = [
        'update:status',
        'update:available',
        'update:downloaded',
        'update:progress',
        'update:error'
      ]
      const subs = channels.map((ch) => {
        const fn = (_e: unknown, payload: unknown): void => cb({ type: ch, payload })
        ipcRenderer.on(ch, fn)
        return [ch, fn] as const
      })
      return () => subs.forEach(([ch, fn]) => ipcRenderer.removeListener(ch, fn))
    }
  },

  github: {
    hasToken: () => invoke<boolean>('github:hasToken'),
    setToken: (token: string) => invoke<GitHubUser>('github:setToken', token),
    signOut: () => invoke<void>('github:signOut'),
    getClientId: () => invoke<string | null>('github:getClientId'),
    setClientId: (id: string) => invoke<void>('github:setClientId', id),
    deviceStart: () => invoke<DeviceCodeInfo>('github:deviceStart'),
    devicePoll: (deviceCode: string, interval: number) =>
      invoke<GitHubUser>('github:devicePoll', deviceCode, interval),
    user: () => invoke<GitHubUser>('github:user'),
    repos: () => invoke<GitHubRepo[]>('github:repos'),
    pulls: (state?: 'open' | 'closed' | 'all') => invoke<PullRequest[]>('github:pulls', state),
    pr: (number: number) => invoke<PullRequestDetail>('github:pr', number),
    prFiles: (number: number) => invoke<PrFile[]>('github:prFiles', number),
    prReviews: (number: number) => invoke<PrReview[]>('github:prReviews', number),
    checks: (ref: string) => invoke<CheckStatus>('github:checks', ref),
    createPr: (title: string, body: string, base?: string) =>
      invoke<PullRequest>('github:createPr', title, body, base),
    defaultBranch: () => invoke<string>('github:defaultBranch'),
    issues: (state?: 'open' | 'closed' | 'all') => invoke<Issue[]>('github:issues', state),
    issue: (number: number) => invoke<Issue>('github:issue', number),
    createIssue: (title: string, body: string, labels?: string[], assignees?: string[]) =>
      invoke<Issue>('github:createIssue', title, body, labels, assignees),
    labels: () => invoke<RepoLabel[]>('github:labels'),
    assignees: () => invoke<string[]>('github:assignees'),
    issueComments: (number: number) => invoke<GhComment[]>('github:issueComments', number),
    review: (number: number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body: string) =>
      invoke<void>('github:review', number, event, body),
    mergePr: (number: number, method: 'merge' | 'squash' | 'rebase') =>
      invoke<void>('github:mergePr', number, method),
    issueComment: (number: number, body: string) =>
      invoke<void>('github:issueComment', number, body),
    setIssueState: (number: number, state: 'open' | 'closed') =>
      invoke<void>('github:setIssueState', number, state),
    setPrState: (number: number, state: 'open' | 'closed') =>
      invoke<void>('github:setPrState', number, state),
    notifications: () => invoke<GhNotification[]>('github:notifications'),
    notificationCount: () => invoke<number>('github:notificationCount'),
    markNotifRead: (id: string) => invoke<void>('github:markNotifRead', id),
    searchRepos: (q: string) => invoke<SearchRepoResult[]>('github:searchRepos', q),
    searchIssues: (q: string) => invoke<SearchIssueResult[]>('github:searchIssues', q),
    releases: () => invoke<Release[]>('github:releases'),
    createRelease: (rel: NewRelease) => invoke<Release>('github:createRelease', rel),
    updateRelease: (id: number, patch: EditRelease) =>
      invoke<Release>('github:updateRelease', id, patch),
    deleteRelease: (id: number) => invoke<void>('github:deleteRelease', id),
    runs: () => invoke<WorkflowRun[]>('github:runs'),
    runJobs: (runId: number) => invoke<WorkflowJob[]>('github:runJobs', runId),
    rerun: (runId: number) => invoke<void>('github:rerun', runId),
    rerunFailed: (runId: number) => invoke<void>('github:rerunFailed', runId),
    cancelRun: (runId: number) => invoke<void>('github:cancelRun', runId),
    rateLimit: () => invoke<RateLimit>('github:rateLimit'),
    gists: () => invoke<Gist[]>('github:gists'),
    createGist: (description: string, filename: string, content: string, isPublic: boolean) =>
      invoke<Gist>('github:createGist', description, filename, content, isPublic),
    insights: () => invoke<RepoInsights>('github:insights'),
    publish: (name: string, description: string, isPrivate: boolean) =>
      invoke<{ fullName: string; cloneUrl: string; htmlUrl: string; owner: string }>(
        'github:publish',
        name,
        description,
        isPrivate
      )
  }
}

contextBridge.exposeInMainWorld('api', api)

export type CodesterApi = typeof api
