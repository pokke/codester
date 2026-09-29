import { contextBridge, ipcRenderer } from 'electron'
import type { IpcContract } from '../shared/ipc'
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
// Kanal, argument och returtyp kommer från IPC-kontraktet (shared/ipc.ts), som
// main också kontrolleras mot – ingen handskriven typ per anrop som kan glida isär.
function invoke<K extends keyof IpcContract>(
  channel: K,
  ...args: Parameters<IpcContract[K]>
): Promise<Result<ReturnType<IpcContract[K]>>> {
  return ipcRenderer.invoke(channel, ...args)
}

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),

  clipboard: {
    write: (text: string) => invoke('clipboard:write', text),
    read: () => invoke('clipboard:read')
  },

  window: {
    flash: (): void => ipcRenderer.send('window:flash')
  },

  repo: {
    openDialog: () => invoke('repo:openDialog'),
    open: (path: string) => invoke('repo:open', path),
    current: () => invoke('repo:current'),
    cloneDialog: (url: string) => invoke('repo:cloneDialog', url),
    // Arbetsyta (multi-root)
    add: (path: string) => invoke('repo:add', path),
    addDialog: () => invoke('repo:addDialog'),
    pickFolder: () => invoke('repo:pickFolder'),
    isGit: (path: string) => invoke('repo:isGit', path),
    init: (path: string) => invoke('repo:init', path),
    list: () => invoke('repo:list'),
    remote: () => invoke('repo:remote'),
    setActive: (path: string) => invoke('repo:setActive', path),
    close: (path: string) => invoke('repo:close', path)
  },

  git: {
    status: (root?: string) => invoke('git:status', root),
    branches: (root?: string) => invoke('git:branches', root),
    checkout: (name: string, root?: string) => invoke('git:checkout', name, root),
    checkoutPr: (number: number, branch: string) =>
      invoke('git:checkoutPr', number, branch),
    createBranch: (name: string, root?: string) => invoke('git:createBranch', name, root),
    deleteBranch: (name: string, force: boolean) =>
      invoke('git:deleteBranch', name, force),
    deleteRemoteBranch: (name: string) => invoke('git:deleteRemoteBranch', name),
    diff: (file: string, staged: boolean) => invoke('git:diff', file, staged),
    stage: (file: string, root?: string) => invoke('git:stage', file, root),
    unstage: (file: string, root?: string) => invoke('git:unstage', file, root),
    stageAll: (root?: string) => invoke('git:stageAll', root),
    discard: (file: string, root?: string) => invoke('git:discard', file, root),
    commit: (message: string, amend?: boolean, root?: string) =>
      invoke('git:commit', message, amend, root),
    lastCommitMessage: (root?: string) => invoke('git:lastCommitMessage', root),
    stageHunk: (file: string, index: number) => invoke('git:stageHunk', file, index),
    unstageHunk: (file: string, index: number) => invoke('git:unstageHunk', file, index),
    discardHunk: (file: string, index: number) => invoke('git:discardHunk', file, index),
    push: (root?: string) => invoke('git:push', root),
    pull: (root?: string) => invoke('git:pull', root),
    fetch: (root?: string) => invoke('git:fetch', root),
    log: (limit?: number) => invoke('git:log', limit),
    fileLog: (file: string) => invoke('git:fileLog', file),
    fileContent: (file: string) => invoke('git:fileContent', file),
    headContent: (file: string) => invoke('git:headContent', file),
    commitFiles: (hash: string) => invoke('git:commitFiles', hash),
    showFile: (rev: string, file: string) => invoke('git:showFile', rev, file),
    search: (query: string) => invoke('git:search', query),
    replace: (query: string, replacement: string) =>
      invoke('git:replace', query, replacement),
    lineChanges: (file: string) => invoke('git:lineChanges', file),
    saveFile: (file: string, content: string) =>
      invoke('git:saveFile', file, content),
    blame: (file: string) => invoke('git:blame', file),
    listFiles: (root?: string) => invoke('git:listFiles', root),
    resolveSide: (file: string, side: 'ours' | 'theirs', root?: string) =>
      invoke('git:resolveSide', file, side, root),
    stashSave: (message?: string, root?: string) => invoke('git:stashSave', message, root),
    stashList: (root?: string) => invoke('git:stashList', root),
    stashApply: (index: number, pop: boolean, root?: string) =>
      invoke('git:stashApply', index, pop, root),
    stashDrop: (index: number, root?: string) => invoke('git:stashDrop', index, root)
  },

  terminal: {
    start: (id: string): void => ipcRenderer.send('terminal:start', id),
    ensure: (id: string): void => ipcRenderer.send('terminal:ensure', id),
    input: (id: string, data: string): void => ipcRenderer.send('terminal:input', id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('terminal:resize', id, cols, rows),
    kill: (id: string): void => ipcRenderer.send('terminal:kill', id),
    hasCommand: (cmd: string) => invoke('system:hasCommand', cmd),
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
    createFile: (rel: string, root?: string) => invoke('fs:createFile', rel, root),
    createFolder: (rel: string, root?: string) => invoke('fs:createFolder', rel, root),
    rename: (oldRel: string, newRel: string, root?: string) =>
      invoke('fs:rename', oldRel, newRel, root),
    delete: (rel: string, root?: string) => invoke('fs:delete', rel, root),
    copy: (srcRel: string, destRel: string, root?: string) =>
      invoke('fs:copy', srcRel, destRel, root)
  },

  lang: {
    tsProject: () => invoke('lang:tsProject')
  },

  config: {
    read: (name: string) => invoke('config:read', name),
    write: (name: string, content: string) => invoke('config:write', name, content),
    dir: () => invoke('config:dir')
  },

  langServers: {
    list: () => invoke('langserver:list'),
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
    hasToken: () => invoke('github:hasToken'),
    setToken: (token: string) => invoke('github:setToken', token),
    signOut: () => invoke('github:signOut'),
    getClientId: () => invoke('github:getClientId'),
    setClientId: (id: string) => invoke('github:setClientId', id),
    deviceStart: () => invoke('github:deviceStart'),
    devicePoll: (deviceCode: string, interval: number) =>
      invoke('github:devicePoll', deviceCode, interval),
    user: () => invoke('github:user'),
    repos: () => invoke('github:repos'),
    pulls: (state?: 'open' | 'closed' | 'all') => invoke('github:pulls', state),
    pr: (number: number) => invoke('github:pr', number),
    prFiles: (number: number) => invoke('github:prFiles', number),
    prReviews: (number: number) => invoke('github:prReviews', number),
    checks: (ref: string) => invoke('github:checks', ref),
    createPr: (title: string, body: string, base?: string) =>
      invoke('github:createPr', title, body, base),
    defaultBranch: () => invoke('github:defaultBranch'),
    issues: (state?: 'open' | 'closed' | 'all') => invoke('github:issues', state),
    issue: (number: number) => invoke('github:issue', number),
    createIssue: (title: string, body: string, labels?: string[], assignees?: string[]) =>
      invoke('github:createIssue', title, body, labels, assignees),
    labels: () => invoke('github:labels'),
    assignees: () => invoke('github:assignees'),
    issueComments: (number: number) => invoke('github:issueComments', number),
    review: (number: number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body: string) =>
      invoke('github:review', number, event, body),
    mergePr: (number: number, method: 'merge' | 'squash' | 'rebase') =>
      invoke('github:mergePr', number, method),
    issueComment: (number: number, body: string) =>
      invoke('github:issueComment', number, body),
    setIssueState: (number: number, state: 'open' | 'closed') =>
      invoke('github:setIssueState', number, state),
    setPrState: (number: number, state: 'open' | 'closed') =>
      invoke('github:setPrState', number, state),
    notifications: () => invoke('github:notifications'),
    notificationCount: () => invoke('github:notificationCount'),
    markNotifRead: (id: string) => invoke('github:markNotifRead', id),
    searchRepos: (q: string) => invoke('github:searchRepos', q),
    searchIssues: (q: string) => invoke('github:searchIssues', q),
    releases: () => invoke('github:releases'),
    createRelease: (rel: NewRelease) => invoke('github:createRelease', rel),
    updateRelease: (id: number, patch: EditRelease) =>
      invoke('github:updateRelease', id, patch),
    deleteRelease: (id: number) => invoke('github:deleteRelease', id),
    runs: () => invoke('github:runs'),
    runJobs: (runId: number) => invoke('github:runJobs', runId),
    rerun: (runId: number) => invoke('github:rerun', runId),
    rerunFailed: (runId: number) => invoke('github:rerunFailed', runId),
    cancelRun: (runId: number) => invoke('github:cancelRun', runId),
    rateLimit: () => invoke('github:rateLimit'),
    gists: () => invoke('github:gists'),
    createGist: (description: string, filename: string, content: string, isPublic: boolean) =>
      invoke('github:createGist', description, filename, content, isPublic),
    insights: () => invoke('github:insights'),
    publish: (name: string, description: string, isPrivate: boolean) =>
      invoke(
        'github:publish',
        name,
        description,
        isPrivate
      )
  }
}

contextBridge.exposeInMainWorld('api', api)

export type CodesterApi = typeof api
