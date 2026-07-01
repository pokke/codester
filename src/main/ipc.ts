import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { Result } from '../shared/types'
import * as git from './services/git'
import * as github from './services/github'
import * as terminal from './services/terminal'
import * as watcher from './services/watcher'
import * as files from './services/files'
import * as config from './services/config'
import * as lang from './services/lang'
import * as lsp from './services/lsp'
import * as langservers from './services/langservers'

// Bevaka alla arbetsytans repon (multi-root) så ändringar i valfritt repo
// uppdaterar vyerna.
function watchWorkspace(): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (win) watcher.watchAll(git.listRepos().map((r) => r.path), win.webContents)
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
    watchWorkspace()
    return info
  })
  handle('repo:open', async (path: string) => {
    const info = await git.openRepo(path)
    watchWorkspace()
    return info
  })
  handle('repo:current', () => git.getRepoPath())
  handle('repo:add', async (path: string) => {
    const info = await git.addRepo(path)
    watchWorkspace()
    return info
  })
  handle('repo:addDialog', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Lägg till mapp i arbetsytan'
    })
    if (res.canceled || !res.filePaths[0]) return null
    const info = await git.addRepo(res.filePaths[0])
    watchWorkspace()
    return info
  })
  handle('repo:list', () => git.listRepos())
  handle('repo:setActive', (path: string) => {
    const info = git.setActiveRepo(path)
    return info
  })
  handle('repo:close', (path: string) => {
    git.closeRepo(path)
    watchWorkspace()
  })
  handle('repo:cloneDialog', async (url: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Välj mapp att klona till'
    })
    if (res.canceled || !res.filePaths[0]) return null
    const path = await git.cloneRepo(url, res.filePaths[0])
    watchWorkspace()
    return path
  })

  // --- Git ---
  handle('git:status', (root?: string) => git.status(root))
  handle('git:branches', (root?: string) => git.branches(root))
  handle('git:checkout', (name: string, root?: string) => git.checkout(name, root))
  handle('git:createBranch', (name: string, root?: string) => git.createBranch(name, root))
  handle('git:deleteBranch', (name: string, force: boolean) => git.deleteBranch(name, force))
  handle('git:diff', (file: string, staged: boolean) => git.diff(file, staged))
  handle('git:stage', (file: string, root?: string) => git.stage(file, root))
  handle('git:unstage', (file: string, root?: string) => git.unstage(file, root))
  handle('git:stageAll', (root?: string) => git.stageAll(root))
  handle('git:discard', (file: string, root?: string) => git.discard(file, root))
  handle('git:commit', (message: string, amend?: boolean, root?: string) =>
    git.commit(message, amend, root)
  )
  handle('git:lastCommitMessage', (root?: string) => git.lastCommitMessage(root))
  handle('git:stageHunk', (file: string, index: number) => git.stageHunk(file, index))
  handle('git:unstageHunk', (file: string, index: number) => git.unstageHunk(file, index))
  handle('git:discardHunk', (file: string, index: number) => git.discardHunk(file, index))
  handle('git:push', (root?: string) => git.push(root))
  handle('git:pull', (root?: string) => git.pull(root))
  handle('git:fetch', (root?: string) => git.fetchAll(root))
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
  handle('git:listFiles', (root?: string) => git.listFiles(root))
  handle('git:resolveSide', (file: string, side: 'ours' | 'theirs', root?: string) =>
    git.resolveSide(file, side, root)
  )
  handle('git:stashSave', (message?: string, root?: string) => git.stashSave(message, root))
  handle('git:stashList', (root?: string) => git.stashList(root))
  handle('git:stashApply', (index: number, pop: boolean, root?: string) =>
    git.stashApply(index, pop, root)
  )
  handle('git:stashDrop', (index: number, root?: string) => git.stashDrop(index, root))

  // --- Filoperationer ---
  handle('fs:createFile', (rel: string, root?: string) => files.createFile(rel, root))
  handle('fs:createFolder', (rel: string, root?: string) => files.createFolder(rel, root))
  handle('fs:rename', (oldRel: string, newRel: string, root?: string) =>
    files.renamePath(oldRel, newRel, root)
  )
  handle('fs:delete', (rel: string, root?: string) => files.deletePath(rel, root))
  handle('fs:copy', (srcRel: string, destRel: string, root?: string) =>
    files.copyPath(srcRel, destRel, root)
  )

  // --- Config (settings.json/keybindings.json/snippets) ---
  handle('config:read', (name: string) => config.readConfig(name))
  handle('config:write', (name: string, content: string) => config.writeConfig(name, content))
  handle('config:dir', () => config.configDir())

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
  handle('github:pr', async (number: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.getPullRequest(or.owner, or.repo, number)
  })
  handle('github:prFiles', async (number: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.getPullRequestFiles(or.owner, or.repo, number)
  })
  handle('github:checks', async (ref: string) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.getChecks(or.owner, or.repo, ref)
  })
  handle('github:createPr', async (title: string, body: string, base?: string) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    const status = await git.status()
    const head = status.current
    if (!head || head === '(detached)') throw new Error('Ingen aktuell branch att skapa PR från')
    const baseBranch = base || (await github.getRepoDefaultBranch(or.owner, or.repo))
    if (head === baseBranch) throw new Error(`Head och bas är samma branch (${head})`)
    return github.createPullRequest(or.owner, or.repo, { title, body, head, base: baseBranch })
  })
  handle('github:defaultBranch', async () => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.getRepoDefaultBranch(or.owner, or.repo)
  })
  handle('github:issues', async () => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listIssues(or.owner, or.repo)
  })
  handle('github:issue', async (number: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.getIssue(or.owner, or.repo, number)
  })
  handle('github:createIssue', async (title: string, body: string) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.createIssue(or.owner, or.repo, title, body)
  })
  handle(
    'github:review',
    async (number: number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body: string) => {
      const or = await git.remoteOwnerRepo()
      if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
      return github.createReview(or.owner, or.repo, number, event, body)
    }
  )
  handle('github:mergePr', async (number: number, method: 'merge' | 'squash' | 'rebase') => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.mergePullRequest(or.owner, or.repo, number, method)
  })
  handle('github:issueComment', async (number: number, body: string) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.addIssueComment(or.owner, or.repo, number, body)
  })
  handle('github:setIssueState', async (number: number, state: 'open' | 'closed') => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.setIssueState(or.owner, or.repo, number, state)
  })
  handle('git:checkoutPr', (number: number, branch: string) =>
    git.checkoutPullRequest(number, branch)
  )
  handle('github:notifications', () => github.listNotifications())
  handle('github:notificationCount', () => github.notificationCount())
  handle('github:markNotifRead', (id: string) => github.markNotificationRead(id))
  handle('github:searchRepos', (q: string) => github.searchRepositories(q))
  handle('github:searchIssues', (q: string) => github.searchIssuesPrs(q))
  handle('github:releases', async () => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listReleases(or.owner, or.repo)
  })
  handle('github:createRelease', async (rel: import('../shared/types').NewRelease) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.createRelease(or.owner, or.repo, rel)
  })
  handle('github:runs', async () => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listWorkflowRuns(or.owner, or.repo)
  })
  handle('github:rerun', async (runId: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.rerunWorkflow(or.owner, or.repo, runId)
  })
}
