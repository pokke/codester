import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { Result } from '../shared/types'
import * as git from './services/git'
import * as github from './services/github'
import * as terminal from './services/terminal'
import * as watcher from './services/watcher'
import * as files from './services/files'

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
  handle('git:commit', (message: string) => git.commit(message))
  handle('git:push', () => git.push())
  handle('git:pull', () => git.pull())
  handle('git:fetch', () => git.fetchAll())
  handle('git:log', (limit?: number) => git.log(limit))
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

  // --- Terminal (strömmande, ej Result-kuvert) ---
  ipcMain.on('terminal:start', (e) => terminal.startTerminal(e.sender, git.getRepoPath()))
  ipcMain.on('terminal:ensure', (e) => terminal.ensureStarted(e.sender, git.getRepoPath()))
  ipcMain.on('terminal:input', (_e, data: string) => terminal.writeTerminal(data))
  ipcMain.on('terminal:kill', () => terminal.killTerminal())

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
