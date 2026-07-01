import { contextBridge, ipcRenderer } from 'electron'
import type {
  BlameLine,
  BranchInfo,
  CommitLogEntry,
  DeviceCodeInfo,
  DiffResult,
  FileChange,
  GitHubRepo,
  GitHubUser,
  LangServerStatus,
  LineChange,
  PullRequest,
  RepoInfo,
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

  repo: {
    openDialog: () => invoke<RepoInfo | null>('repo:openDialog'),
    open: (path: string) => invoke<RepoInfo>('repo:open', path),
    current: () => invoke<string | null>('repo:current'),
    cloneDialog: (url: string) => invoke<string | null>('repo:cloneDialog', url)
  },

  git: {
    status: () => invoke<RepoStatus>('git:status'),
    branches: () => invoke<BranchInfo[]>('git:branches'),
    checkout: (name: string) => invoke<void>('git:checkout', name),
    createBranch: (name: string) => invoke<void>('git:createBranch', name),
    deleteBranch: (name: string, force: boolean) =>
      invoke<void>('git:deleteBranch', name, force),
    diff: (file: string, staged: boolean) => invoke<DiffResult>('git:diff', file, staged),
    stage: (file: string) => invoke<void>('git:stage', file),
    unstage: (file: string) => invoke<void>('git:unstage', file),
    stageAll: () => invoke<void>('git:stageAll'),
    discard: (file: string) => invoke<void>('git:discard', file),
    commit: (message: string) => invoke<string>('git:commit', message),
    push: () => invoke<void>('git:push'),
    pull: () => invoke<void>('git:pull'),
    fetch: () => invoke<void>('git:fetch'),
    log: (limit?: number) => invoke<CommitLogEntry[]>('git:log', limit),
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
    listFiles: () => invoke<string[]>('git:listFiles'),
    resolveSide: (file: string, side: 'ours' | 'theirs') =>
      invoke<void>('git:resolveSide', file, side),
    stashSave: (message?: string) => invoke<void>('git:stashSave', message),
    stashList: () => invoke<StashEntry[]>('git:stashList'),
    stashApply: (index: number, pop: boolean) =>
      invoke<void>('git:stashApply', index, pop),
    stashDrop: (index: number) => invoke<void>('git:stashDrop', index)
  },

  terminal: {
    start: (): void => ipcRenderer.send('terminal:start'),
    ensure: (): void => ipcRenderer.send('terminal:ensure'),
    input: (data: string): void => ipcRenderer.send('terminal:input', data),
    resize: (cols: number, rows: number): void =>
      ipcRenderer.send('terminal:resize', cols, rows),
    kill: (): void => ipcRenderer.send('terminal:kill'),
    onData: (cb: (data: string) => void): (() => void) => {
      const listener = (_e: unknown, data: string): void => cb(data)
      ipcRenderer.on('terminal:data', listener)
      return () => ipcRenderer.removeListener('terminal:data', listener)
    },
    onMode: (cb: (mode: string) => void): (() => void) => {
      const listener = (_e: unknown, mode: string): void => cb(mode)
      ipcRenderer.on('terminal:mode', listener)
      return () => ipcRenderer.removeListener('terminal:mode', listener)
    }
  },

  fs: {
    createFile: (rel: string) => invoke<void>('fs:createFile', rel),
    createFolder: (rel: string) => invoke<void>('fs:createFolder', rel),
    rename: (oldRel: string, newRel: string) => invoke<void>('fs:rename', oldRel, newRel),
    delete: (rel: string) => invoke<void>('fs:delete', rel),
    copy: (srcRel: string, destRel: string) => invoke<void>('fs:copy', srcRel, destRel)
  },

  lang: {
    tsProject: () => invoke<TsProject | null>('lang:tsProject')
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
    pulls: () => invoke<PullRequest[]>('github:pulls')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type CodesterApi = typeof api
