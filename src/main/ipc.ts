import { ipcMain, dialog, BrowserWindow, clipboard, app } from 'electron'
import { dirname } from 'path'
import type { Result } from '../shared/types'
import type { IpcHandlerMap } from '../shared/ipc'
import * as git from './services/git'
import * as github from './services/github'
import * as terminal from './services/terminal'
import * as watcher from './services/watcher'
import * as files from './services/files'
import * as config from './services/config'
import * as lang from './services/lang'
import * as lsp from './services/lsp'
import * as langservers from './services/langservers'

// Var mappdialogerna ska börja. Från Electron 43 öppnas Downloads när
// defaultPath saknas (tidigare mindes OS:et senast använda mapp) – för en
// git-klient vill vi i stället landa där projekten ligger: aktiva repots
// föräldermapp, annars hemkatalogen.
function dialogStartDir(): string {
  const root = git.getRepoPath()
  return root ? dirname(root) : app.getPath('home')
}

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

// Alla invoke-kanaler: kanalnamn → hanterare. Kontrolleras mot IPC-kontraktet
// (shared/ipc.ts): saknad, överflödig eller felaktigt typad kanal blir ett
// kompileringsfel.
const handlers = {
  // --- Repo / dialog ---
  'repo:openDialog': async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      defaultPath: dialogStartDir(),
      properties: ['openDirectory'],
      title: 'Öppna git-repo'
    })
    if (res.canceled || !res.filePaths[0]) return null
    const info = await git.openRepo(res.filePaths[0])
    watchWorkspace()
    return info
  },
  'repo:open': async (path: string) => {
    const info = await git.openRepo(path)
    watchWorkspace()
    return info
  },
  'repo:current': () => git.getRepoPath(),
  'repo:add': async (path: string) => {
    const info = await git.addRepo(path)
    watchWorkspace()
    return info
  },
  'repo:addDialog': async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      defaultPath: dialogStartDir(),
      properties: ['openDirectory'],
      title: 'Lägg till mapp i arbetsytan'
    })
    if (res.canceled || !res.filePaths[0]) return null
    const info = await git.addRepo(res.filePaths[0])
    watchWorkspace()
    return info
  },
  // Väljer bara en mapp – ingen git-koll (renderern avgör init vs add).
  'repo:pickFolder': async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      defaultPath: dialogStartDir(),
      properties: ['openDirectory'],
      title: 'Öppna mapp / projekt'
    })
    if (res.canceled || !res.filePaths[0]) return null
    return res.filePaths[0]
  },
  'repo:isGit': (path: string) => git.isGitRepo(path),
  'repo:init': async (path: string) => {
    const info = await git.initRepo(path)
    watchWorkspace()
    return info
  },
  // --- Urklipp (systemets, via Electron) ---
  'clipboard:write': (text: string) => {
    clipboard.writeText(text)
  },
  'clipboard:read': () => clipboard.readText(),
  'system:hasCommand': (cmd: string) => terminal.hasCommand(cmd),
  'repo:list': () => git.listRepos(),
  'repo:remote': () => git.remoteOwnerRepo(),
  'repo:setActive': (path: string) => {
    const info = git.setActiveRepo(path)
    return info
  },
  'repo:close': (path: string) => {
    git.closeRepo(path)
    watchWorkspace()
  },
  'repo:cloneDialog': async (url: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      defaultPath: dialogStartDir(),
      properties: ['openDirectory', 'createDirectory'],
      title: 'Välj mapp att klona till'
    })
    if (res.canceled || !res.filePaths[0]) return null
    const path = await git.cloneRepo(url, res.filePaths[0])
    watchWorkspace()
    return path
  },

  // --- Git ---
  'git:status': (root?: string) => git.status(root),
  'git:branches': (root?: string) => git.branches(root),
  'git:checkout': (name: string, root?: string) => git.checkout(name, root),
  'git:createBranch': (name: string, root?: string) => git.createBranch(name, root),
  'git:deleteBranch': (name: string, force: boolean) => git.deleteBranch(name, force),
  'git:deleteRemoteBranch': (name: string, root?: string) =>
    git.deleteRemoteBranch(github.getToken(), name, root),
  'git:diff': (file: string, staged: boolean) => git.diff(file, staged),
  'git:stage': (file: string, root?: string) => git.stage(file, root),
  'git:unstage': (file: string, root?: string) => git.unstage(file, root),
  'git:stageAll': (root?: string) => git.stageAll(root),
  'git:discard': (file: string, root?: string) => git.discard(file, root),
  'git:commit': (message: string, amend?: boolean, root?: string) =>
    git.commit(message, amend, root),
  'git:lastCommitMessage': (root?: string) => git.lastCommitMessage(root),
  'git:stageHunk': (file: string, index: number) => git.stageHunk(file, index),
  'git:unstageHunk': (file: string, index: number) => git.unstageHunk(file, index),
  'git:discardHunk': (file: string, index: number) => git.discardHunk(file, index),
  'git:push': (root?: string) => git.push(github.getToken(), root),
  'git:pull': (root?: string) => git.pull(github.getToken(), root),
  'git:fetch': (root?: string) => git.fetchAll(github.getToken(), root),
  'git:log': (limit?: number) => git.log(limit),
  'git:fileLog': (file: string) => git.fileLog(file),
  'git:fileContent': (file: string) => git.fileContent(file),
  'git:headContent': (file: string) => git.headContent(file),
  'git:commitFiles': (hash: string) => git.commitFiles(hash),
  'git:showFile': (rev: string, file: string) => git.showFile(rev, file),
  'git:search': (query: string) => git.searchRepo(query),
  'git:replace': (query: string, replacement: string) =>
    git.replaceInRepo(query, replacement),
  'git:lineChanges': (file: string) => git.lineChanges(file),
  'git:saveFile': (file: string, content: string) => git.saveFile(file, content),
  'git:blame': (file: string) => git.blame(file),
  'git:listFiles': (root?: string) => git.listFiles(root),
  'git:resolveSide': (file: string, side: 'ours' | 'theirs', root?: string) =>
    git.resolveSide(file, side, root),
  'git:stashSave': (message?: string, root?: string) => git.stashSave(message, root),
  'git:stashList': (root?: string) => git.stashList(root),
  'git:stashApply': (index: number, pop: boolean, root?: string) =>
    git.stashApply(index, pop, root),
  'git:stashDrop': (index: number, root?: string) => git.stashDrop(index, root),

  // --- Filoperationer ---
  'fs:createFile': (rel: string, root?: string) => files.createFile(rel, root),
  'fs:createFolder': (rel: string, root?: string) => files.createFolder(rel, root),
  'fs:rename': (oldRel: string, newRel: string, root?: string) =>
    files.renamePath(oldRel, newRel, root),
  'fs:delete': (rel: string, root?: string) => files.deletePath(rel, root),
  'fs:copy': (srcRel: string, destRel: string, root?: string) =>
    files.copyPath(srcRel, destRel, root),

  // --- Config (settings.json/keybindings.json/snippets) ---
  'config:read': (name: string) => config.readConfig(name),
  'config:write': (name: string, content: string) => config.writeConfig(name, content),
  'config:dir': () => config.configDir(),

  // --- Språkintelligens ---
  'lang:tsProject': () => lang.tsProject(),

  // --- Installation av språkservrar ---
  'langserver:list': () => langservers.list(),

  // --- GitHub ---
  'github:hasToken': () => github.hasToken(),
  'github:setToken': (token: string) => github.setToken(token),
  'github:signOut': () => github.signOut(),
  'github:getClientId': () => github.getClientId(),
  'github:setClientId': (id: string) => github.setClientId(id),
  'github:deviceStart': () => github.deviceStart(),
  'github:devicePoll': (deviceCode: string, interval: number) =>
    github.devicePoll(deviceCode, interval),
  'github:user': () => github.getUser(),
  'github:repos': () => github.listRepos(),
  'github:pulls': async (state?: 'open' | 'closed' | 'all') => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listPullRequests(or.owner, or.repo, state)
  },
  'github:pr': async (number: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.getPullRequest(or.owner, or.repo, number)
  },
  'github:prFiles': async (number: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.getPullRequestFiles(or.owner, or.repo, number)
  },
  'github:checks': async (ref: string) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.getChecks(or.owner, or.repo, ref)
  },
  'github:createPr': async (title: string, body: string, base?: string) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    const status = await git.status()
    const head = status.current
    if (!head || head === '(detached)') throw new Error('Ingen aktuell branch att skapa PR från')
    const baseBranch = base || (await github.getRepoDefaultBranch(or.owner, or.repo))
    if (head === baseBranch) throw new Error(`Head och bas är samma branch (${head})`)
    return github.createPullRequest(or.owner, or.repo, { title, body, head, base: baseBranch })
  },
  'github:defaultBranch': async () => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.getRepoDefaultBranch(or.owner, or.repo)
  },
  'github:issues': async (state?: 'open' | 'closed' | 'all') => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listIssues(or.owner, or.repo, state)
  },
  'github:issue': async (number: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.getIssue(or.owner, or.repo, number)
  },
  'github:createIssue': async (title: string, body: string, labels?: string[], assignees?: string[]) => {
      const or = await git.remoteOwnerRepo()
      if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
      return github.createIssue(or.owner, or.repo, title, body, labels, assignees)
    },
  'github:labels': async () => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listLabels(or.owner, or.repo)
  },
  'github:review': async (number: number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body: string) => {
      const or = await git.remoteOwnerRepo()
      if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
      return github.createReview(or.owner, or.repo, number, event, body)
    },
  'github:mergePr': async (number: number, method: 'merge' | 'squash' | 'rebase') => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.mergePullRequest(or.owner, or.repo, number, method)
  },
  'github:issueComment': async (number: number, body: string) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.addIssueComment(or.owner, or.repo, number, body)
  },
  'github:setIssueState': async (number: number, state: 'open' | 'closed') => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.setIssueState(or.owner, or.repo, number, state)
  },
  'github:setPrState': async (number: number, state: 'open' | 'closed') => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.setPullState(or.owner, or.repo, number, state)
  },
  'github:issueComments': async (number: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listIssueComments(or.owner, or.repo, number)
  },
  'github:prReviews': async (number: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listPrReviews(or.owner, or.repo, number)
  },
  'github:assignees': async () => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listAssignees(or.owner, or.repo)
  },
  'git:checkoutPr': (number: number, branch: string) =>
    git.checkoutPullRequest(number, branch),
  'github:notifications': () => github.listNotifications(),
  'github:notificationCount': () => github.notificationCount(),
  'github:markNotifRead': (id: string) => github.markNotificationRead(id),
  'github:searchRepos': (q: string) => github.searchRepositories(q),
  'github:searchIssues': (q: string) => github.searchIssuesPrs(q),
  'github:releases': async () => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listReleases(or.owner, or.repo)
  },
  'github:createRelease': async (rel: import('../shared/types').NewRelease) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.createRelease(or.owner, or.repo, rel)
  },
  'github:updateRelease': async (id: number, patch: import('../shared/types').EditRelease) => {
      const or = await git.remoteOwnerRepo()
      if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
      return github.updateRelease(or.owner, or.repo, id, patch)
    },
  'github:deleteRelease': async (id: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.deleteRelease(or.owner, or.repo, id)
  },
  'github:runs': async () => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listWorkflowRuns(or.owner, or.repo)
  },
  'github:runJobs': async (runId: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.listWorkflowJobs(or.owner, or.repo, runId)
  },
  'github:rerun': async (runId: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.rerunWorkflow(or.owner, or.repo, runId)
  },
  'github:rerunFailed': async (runId: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.rerunFailedJobs(or.owner, or.repo, runId)
  },
  'github:cancelRun': async (runId: number) => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.cancelWorkflowRun(or.owner, or.repo, runId)
  },
  'github:rateLimit': () => github.getRateLimit(),
  'github:gists': () => github.listGists(),
  'github:createGist': (description: string, filename: string, content: string, isPublic: boolean) =>
    github.createGist(description, filename, content, isPublic),
  'github:insights': async () => {
    const or = await git.remoteOwnerRepo()
    if (!or) throw new Error('Ingen GitHub-remote hittades för detta repo')
    return github.getRepoInsights(or.owner, or.repo)
  },
  'github:publish': async (name: string, description: string, isPrivate: boolean) => {
    const root = git.getRepoPath()
    if (!root) throw new Error('Inget repo är aktivt att publicera')
    if (!github.hasToken()) throw new Error('Anslut till GitHub först')
    const created = await github.createRepo(name.trim(), description, isPrivate)
    await git.publishToGitHub(github.getToken(), created.cloneUrl, root)
    watchWorkspace()
    return created
  },
} satisfies IpcHandlerMap

export function registerIpc(): void {
  for (const [channel, fn] of Object.entries(handlers)) handle<unknown>(channel, fn)

  // Kanaler som behöver avsändaren (e.sender) registreras direkt.
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
  ipcMain.handle('langserver:install', (e, id: string) => langservers.install(id, e.sender))

  // --- Terminal (strömmande, ej Result-kuvert) ---
  ipcMain.on('terminal:start', (e, id: string) => terminal.startTerminal(id, e.sender, git.getRepoPath()))
  ipcMain.on('terminal:ensure', (e, id: string) => terminal.ensureTerminal(id, e.sender, git.getRepoPath()))
  ipcMain.on('terminal:input', (_e, id: string, data: string) => terminal.writeTerminal(id, data))
  ipcMain.on('terminal:resize', (_e, id: string, cols: number, rows: number) =>
    terminal.resizeTerminal(id, cols, rows)
  )
  ipcMain.on('terminal:kill', (_e, id: string) => terminal.killTerminal(id))
}
