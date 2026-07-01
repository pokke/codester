import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { Result } from '../shared/types'
import * as git from './services/git'
import * as github from './services/github'
import * as terminal from './services/terminal'
import * as watcher from './services/watcher'
import * as files from './services/files'
import * as lang from './services/lang'
import * as lsp from './services/lsp'
import * as langservers from './services/langservers'

function watchRepo(path: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (win) watcher.startWatch(path, win.webContents)
}

// Slår in en handler i ett Result-kuvert så att fel kan visas snyggt i UI:t
// istället för att krascha renderern.
function handle<T>(channel: string, fn: (...args: any[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_e, ...args): Promise<Result<T>> => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

export function registerIpc(): void {
  // --- Repo / dialog ---
  handle('repo:openDialog', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Öppna git-repo'
    })
    if (res.canceled || !res.filePaths[0]) return null
    const info = await git.openRepo(res.filePaths[0])
    watchRepo(info.path)
    return info
  })
  handle('repo:open', async (path: string) => {
    const info = await git.openRepo(path)
    watchRepo(info.path)
    return info
  })
  handle('repo:current', () => git.getRepoPath())
  handle('repo:cloneDialog', async (url: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Välj mapp att klona till'
    })
    if (res.canceled || !res.filePaths[0]) return null
    const path = await git.cloneRepo(url, res.filePaths[0])
    watchRepo(path)
    return path
  })

  // --- Git ---
  handle('git:status', () => git.status())
  handle('git:branches', () => git.branches())
  handle('git:checkout', (name: string) => git.checkout(name))
  handle('git:createBranch', (name: string) => git.createBranch(name))
  handle('git:deleteBranch', (name: string, force: boolean) => git.deleteBranch(name, force))
  handle('git:diff', (file: string, staged: boolean) => git.diff(file, staged))
  handle('git:stage', (file: string) => git.stage(file))
  handle('git:unstage', (file: string) => git.unstage(file))
  handle('git:stageAll', () => git.stageAll())
  handle('git:discard', (file: string) => git.discard(file))
  handle('git:commit', (message: string, amend?: boolean) => git.commit(message, amend))
  handle('git:lastCommitMessage', () => git.lastCommitMessage())
  handle('git:stageHunk', (file: string, index: number) => git.stageHunk(file, index))
  handle('git:unstageHunk', (file: string, index: number) => git.unstageHunk(file, index))
  handle('git:discardHunk', (file: string, index: number) => git.discardHunk(file, index))
  handle('git:push', () => git.push())
  handle('git:pull', () => git.pull())
  handle('git:fetch', () => git.fetchAll())
  handle('git:log', (limit?: number) => git.log(limit))
  handle('git:fileLog', (file: string) => git.fileLog(file))
  handle('git:fileContent', (file: string) => git.fileContent(file))
  handle('git:headContent', (file: string) => git.headContent(file))
  handle('git:commitFiles', (hash: string) => git.commitFiles(hash))
  handle('git:showFile', (rev: string, file: string) => git.showFile(rev, file))
  handle('git:search', (query: string) => git.searchRepo(query))
  handle('git:replace', (query: string, replacement: string) =>
    git.replaceInRepo(query, replacement)
  )
  handle('git:lineChanges', (file: string) => git.lineChanges(file))
  handle('git:saveFile', (file: string, content: string) => git.saveFile(file, content))
  handle('git:blame', (file: string) => git.blame(file))
  handle('git:listFiles', () => git.listFiles())
  handle('git:resolveSide', (file: string, side: 'ours' | 'theirs') =>
    git.resolveSide(file, side)
  )
  handle('git:stashSave', (message?: string) => git.stashSave(message))
  handle('git:stashList', () => git.stashList())
  handle('git:stashApply', (index: number, pop: boolean) => git.stashApply(index, pop))
  handle('git:stashDrop', (index: number) => git.stashDrop(index))

  // --- Filoperationer ---
  handle('fs:createFile', (rel: string) => files.createFile(rel))
  handle('fs:createFolder', (rel: string) => files.createFolder(rel))
  handle('fs:rename', (oldRel: string, newRel: string) => files.renamePath(oldRel, newRel))
  handle('fs:delete', (rel: string) => files.deletePath(rel))
  handle('fs:copy', (srcRel: string, destRel: string) => files.copyPath(srcRel, destRel))

  // --- Språkintelligens ---
  handle('lang:tsProject', () => lang.tsProject())

  // --- LSP (språkservrar) ---
  ipcMain.handle('lsp:ensure', (e, langId: string) => lsp.ensure(langId, e.sender))
  ipcMain.handle('lsp:request', (_e, langId: string, method: string, params: unknown) =>
    lsp.request(langId, method, params)
  )
  ipcMain.on('lsp:didOpen', (_e, langId: string, uri: string, text: string) =>
    lsp.didOpen(langId, uri, text)
  )
  ipcMain.on('lsp:didChange', (_e, langId: string, uri: string, text: string, version: number) =>
    lsp.didChange(langId, uri, text, version)
  )
  ipcMain.on('lsp:didClose', (_e, langId: string, uri: string) => lsp.didClose(langId, uri))

  // --- Installation av språkservrar ---
  handle('langserver:list', () => langservers.list())
  ipcMain.handle('langserver:install', (e, id: string) => langservers.install(id, e.sender))

  // --- Terminal (strömmande, ej Result-kuvert) ---
  ipcMain.on('terminal:start', (e, id: string) => terminal.startTerminal(id, e.sender, git.getRepoPath()))
  ipcMain.on('terminal:ensure', (e, id: string) => terminal.ensureTerminal(id, e.sender, git.getRepoPath()))
  ipcMain.on('terminal:input', (_e, id: string, data: string) => terminal.writeTerminal(id, data))
  ipcMain.on('terminal:resize', (_e, id: string, cols: number, rows: number) =>
    terminal.resizeTerminal(id, cols, rows)
  )
  ipcMain.on('terminal:kill', (_e, id: string) => terminal.killTerminal(id))

  // --- GitHub ---
  handle('github:hasToken', () => github.hasToken())
  handle('github:setToken', (token: string) => github.setToken(token))
  handle('github:signOut', () => github.signOut())
  handle('github:getClientId', () => github.getClientId())
  handle('github:setClientId', (id: string) => github.setClientId(id))
  handle('github:deviceStart', () => github.deviceStart())
  handle('github:devicePoll', (deviceCode: string, interval: number) =>
    github.devicePoll(deviceCode, interval)
  )
  handle('github:user', () => github.getUser())
  handle('github:repos', () => github.listRepos())
  handle('github:pulls', async () => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listPullRequests(or.owner, or.repo)
  })
}
