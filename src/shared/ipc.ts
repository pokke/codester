// IPC-kontraktet: varje invoke-kanal → argument och (upplöst) returtyp.
// Enda stället typerna skrivs. main kontrolleras mot det (handlers satisfies
// IpcHandlerMap i main/ipc.ts) och preload härleder sina anrop härifrån – så en
// felstavad kanal, fel argument eller en returtyp som glidit isär blir ett
// kompileringsfel. Ren typfil: importerar bara delade typer.
import type {
  BlameLine,
  BranchInfo,
  CheckStatus,
  CommitLogEntry,
  DeviceCodeInfo,
  DiffResult,
  EditRelease,
  FileChange,
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
  RepoStatus,
  SearchHit,
  SearchIssueResult,
  SearchRepoResult,
  StashEntry,
  TsProject,
  WorkflowJob,
  WorkflowRun
} from './types'

export interface IpcContract {
  'repo:openDialog': () => RepoInfo | null
  'repo:open': (path: string) => RepoInfo
  'repo:current': () => string | null
  'repo:add': (path: string) => RepoInfo
  'repo:addDialog': () => RepoInfo | null
  'repo:pickFolder': () => string | null
  'repo:isGit': (path: string) => boolean
  'repo:init': (path: string) => RepoInfo
  'clipboard:write': (text: string) => void
  'clipboard:read': () => string
  'system:hasCommand': (cmd: string) => boolean
  'repo:list': () => RepoInfo[]
  'repo:remote': () => { owner: string; repo: string } | null
  'repo:setActive': (path: string) => RepoInfo | null
  'repo:close': (path: string) => void
  'repo:cloneDialog': (url: string) => string | null
  'git:status': (root?: string) => RepoStatus
  'git:branches': (root?: string) => BranchInfo[]
  'git:checkout': (name: string, root?: string) => void
  'git:createBranch': (name: string, root?: string) => void
  'git:deleteBranch': (name: string, force: boolean) => void
  'git:deleteRemoteBranch': (name: string, root?: string) => void
  'git:diff': (file: string, staged: boolean) => DiffResult
  'git:stage': (file: string, root?: string) => void
  'git:unstage': (file: string, root?: string) => void
  'git:stageAll': (root?: string) => void
  'git:discard': (file: string, root?: string) => void
  'git:commit': (message: string, amend?: boolean, root?: string) => string
  'git:lastCommitMessage': (root?: string) => string
  'git:stageHunk': (file: string, index: number) => void
  'git:unstageHunk': (file: string, index: number) => void
  'git:discardHunk': (file: string, index: number) => void
  'git:push': (root?: string) => void
  'git:pull': (root?: string) => void
  'git:fetch': (root?: string) => void
  'git:log': (limit?: number) => CommitLogEntry[]
  'git:fileLog': (file: string) => CommitLogEntry[]
  'git:fileContent': (file: string) => string
  'git:headContent': (file: string) => string
  'git:commitFiles': (hash: string) => FileChange[]
  'git:showFile': (rev: string, file: string) => string
  'git:search': (query: string) => SearchHit[]
  'git:replace': (query: string, replacement: string) => { files: number; count: number }
  'git:lineChanges': (file: string) => LineChange[]
  'git:saveFile': (file: string, content: string) => void
  'git:blame': (file: string) => BlameLine[]
  'git:listFiles': (root?: string) => string[]
  'git:resolveSide': (file: string, side: "ours" | "theirs", root?: string) => void
  'git:stashSave': (message?: string, root?: string) => void
  'git:stashList': (root?: string) => StashEntry[]
  'git:stashApply': (index: number, pop: boolean, root?: string) => void
  'git:stashDrop': (index: number, root?: string) => void
  'fs:createFile': (rel: string, root?: string) => void
  'fs:createFolder': (rel: string, root?: string) => void
  'fs:rename': (oldRel: string, newRel: string, root?: string) => void
  'fs:delete': (rel: string, root?: string) => void
  'fs:copy': (srcRel: string, destRel: string, root?: string) => void
  'config:read': (name: string) => string | null
  'config:write': (name: string, content: string) => void
  'config:dir': () => string
  'lang:tsProject': () => TsProject | null
  'langserver:list': () => LangServerStatus[]
  'github:hasToken': () => boolean
  'github:setToken': (token: string) => GitHubUser
  'github:signOut': () => void
  'github:getClientId': () => string | null
  'github:setClientId': (id: string) => void
  'github:deviceStart': () => DeviceCodeInfo
  'github:devicePoll': (deviceCode: string, interval: number) => GitHubUser
  'github:user': () => GitHubUser
  'github:repos': () => GitHubRepo[]
  'github:pulls': (state?: "open" | "closed" | "all") => PullRequest[]
  'github:pr': (number: number) => PullRequestDetail
  'github:prFiles': (number: number) => PrFile[]
  'github:checks': (ref: string) => CheckStatus
  'github:createPr': (title: string, body: string, base?: string) => PullRequest
  'github:defaultBranch': () => string
  'github:issues': (state?: "open" | "closed" | "all") => Issue[]
  'github:issue': (number: number) => Issue
  'github:createIssue': (title: string, body: string, labels?: string[], assignees?: string[]) => Issue
  'github:labels': () => RepoLabel[]
  'github:review': (number: number, event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT", body: string) => void
  'github:mergePr': (number: number, method: "merge" | "squash" | "rebase") => void
  'github:issueComment': (number: number, body: string) => void
  'github:setIssueState': (number: number, state: "open" | "closed") => void
  'github:setPrState': (number: number, state: "open" | "closed") => void
  'github:issueComments': (number: number) => GhComment[]
  'github:prReviews': (number: number) => PrReview[]
  'github:assignees': () => string[]
  'git:checkoutPr': (number: number, branch: string) => void
  'github:notifications': () => GhNotification[]
  'github:notificationCount': () => number
  'github:markNotifRead': (id: string) => void
  'github:searchRepos': (q: string) => SearchRepoResult[]
  'github:searchIssues': (q: string) => SearchIssueResult[]
  'github:releases': () => Release[]
  'github:createRelease': (rel: NewRelease) => Release
  'github:updateRelease': (id: number, patch: EditRelease) => Release
  'github:deleteRelease': (id: number) => void
  'github:runs': () => WorkflowRun[]
  'github:runJobs': (runId: number) => WorkflowJob[]
  'github:rerun': (runId: number) => void
  'github:rerunFailed': (runId: number) => void
  'github:cancelRun': (runId: number) => void
  'github:rateLimit': () => RateLimit
  'github:gists': () => Gist[]
  'github:createGist': (description: string, filename: string, content: string, isPublic: boolean) => Gist
  'github:insights': () => RepoInsights
  'github:publish': (name: string, description: string, isPrivate: boolean) => { fullName: string; cloneUrl: string; htmlUrl: string; owner: string }
}

// Det main-hanterarna ska uppfylla: samma argument, returtypen får vara async.
export type IpcHandlerMap = {
  [K in keyof IpcContract]: (
    ...args: Parameters<IpcContract[K]>
  ) => ReturnType<IpcContract[K]> | Promise<ReturnType<IpcContract[K]>>
}
