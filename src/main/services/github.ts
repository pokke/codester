import type {
  CheckState,
  CheckStatus,
  DeviceCodeInfo,
  EditRelease,
  GhComment,
  GhNotification,
  GitHubRepo,
  GitHubUser,
  Gist,
  Issue,
  NewPullRequest,
  NewRelease,
  PrFile,
  PrReview,
  PullRequest,
  PullRequestDetail,
  RateLimit,
  Release,
  RepoInsights,
  RepoLabel,
  SearchIssueResult,
  SearchRepoResult,
  WorkflowJob,
  WorkflowRun
} from '../../shared/types'
import {
  loadToken,
  saveToken,
  clearToken,
  loadClientId,
  saveClientId
} from './store'

// GitHub-integration via REST API. Anropen sker i main-processen, så de
// påverkas inte av renderns CSP och token läcker aldrig till sidan.

const API = 'https://api.github.com'

// OBS: safeStorage (Windows DPAPI) är bara tillgänglig EFTER app 'ready'. Den
// här modulen importeras före whenReady, så vi får INTE läsa token vid import –
// då skulle en giltig token dekrypteras som null och användaren tvingas logga
// in på nytt vid varje omstart/uppdatering. Ladda den lat vid första användning
// (som alltid sker efter ready via IPC).
let token: string | null = null
let tokenLoaded = false
let clientId: string | null = null
let clientIdLoaded = false

function ensureTokenLoaded(): void {
  if (!tokenLoaded) {
    token = loadToken()
    tokenLoaded = true
  }
}

function ensureClientIdLoaded(): void {
  if (!clientIdLoaded) {
    clientId = loadClientId()
    clientIdLoaded = true
  }
}

// fetch med timeout – annars kan ett anrop pendra för evigt (proxy/DNS/offline)
// och få appen att verka låst.
async function timedFetch(
  url: string,
  init: RequestInit = {},
  ms = 15000
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Tidsgräns nådd – kunde inte nå GitHub')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Codester',
    ...extra
  }
}

// Bygger ett läsbart fel av ett misslyckat svar. Mappar 403 till antingen
// slut-på-kvot eller saknad OAuth-scope så användaren förstår varför.
async function ghError(res: Response): Promise<Error> {
  const text = await res.text()
  let msg = text.slice(0, 300)
  try {
    const j = JSON.parse(text)
    msg =
      j.message +
      (j.errors
        ? `: ${j.errors.map((e: { message?: string }) => e.message).filter(Boolean).join(', ')}`
        : '')
  } catch {
    /* behåll rå text */
  }
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    if (remaining === '0') {
      const reset = res.headers.get('x-ratelimit-reset')
      const when = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : null
      return new Error(
        `GitHub API-kvoten är slut${when ? ` – återställs ${when}` : ' – försök igen senare'}`
      )
    }
    const retry = res.headers.get('retry-after')
    if (retry) return new Error(`GitHub bad om paus – försök igen om ${retry}s`)
    const accepted = res.headers.get('x-accepted-oauth-scopes')
    const have = res.headers.get('x-oauth-scopes')
    if (accepted && accepted.trim()) {
      return new Error(
        `Token saknar behörighet. Kräver scope: ${accepted}${have !== null ? ` (du har: ${have || 'inga'})` : ''}`
      )
    }
  }
  return new Error(`GitHub ${res.status}: ${msg}`)
}

async function ghReq<T>(method: string, path: string, body?: unknown): Promise<T> {
  ensureTokenLoaded()
  if (!token) throw new Error('Ingen GitHub-token angiven')
  const res = await timedFetch(`${API}${path}`, {
    method,
    headers: authHeaders(body ? { 'Content-Type': 'application/json' } : undefined),
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) throw await ghError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// GET med villkorlig ETag-cache: sparar kvot genom att skicka If-None-Match och
// återanvända cachad kropp vid 304. Cachas per exakt path.
const etagCache = new Map<string, { etag: string; data: unknown }>()

async function gh<T>(path: string): Promise<T> {
  ensureTokenLoaded()
  if (!token) throw new Error('Ingen GitHub-token angiven')
  const cached = etagCache.get(path)
  const res = await timedFetch(`${API}${path}`, {
    headers: authHeaders(cached ? { 'If-None-Match': cached.etag } : undefined)
  })
  if (res.status === 304 && cached) return cached.data as T
  if (!res.ok) throw await ghError(res)
  const data = (await res.json()) as T
  const etag = res.headers.get('etag')
  if (etag) etagCache.set(path, { etag, data })
  return data
}

// Följer Link-headerns rel="next" och slår ihop alla sidor (upp till ett tak
// så en jättelista inte hänger appen). per_page=100 tvingas om det saknas.
function nextLink(link: string | null): string | null {
  if (!link) return null
  const m = link.match(/<([^>]+)>;\s*rel="next"/)
  return m ? m[1] : null
}

async function ghPaged<T>(path: string, maxPages = 10): Promise<T[]> {
  ensureTokenLoaded()
  if (!token) throw new Error('Ingen GitHub-token angiven')
  const sep = path.includes('?') ? '&' : '?'
  let url: string | null = /[?&]per_page=/.test(path)
    ? `${API}${path}`
    : `${API}${path}${sep}per_page=100`
  const items: T[] = []
  let pages = 0
  while (url && pages < maxPages) {
    const res: Response = await timedFetch(url, { headers: authHeaders() })
    if (!res.ok) throw await ghError(res)
    const batch = (await res.json()) as T[]
    items.push(...batch)
    url = nextLink(res.headers.get('link'))
    pages++
  }
  return items
}

export function hasToken(): boolean {
  ensureTokenLoaded()
  return !!token
}

export async function setToken(value: string): Promise<GitHubUser> {
  token = value.trim()
  tokenLoaded = true
  // Validera direkt genom att hämta användaren
  const user = await getUser()
  saveToken(token)
  return user
}

export function signOut(): void {
  token = null
  tokenLoaded = true
  clearToken()
}

// --- OAuth Device Flow ---
// Kräver en registrerad GitHub OAuth App (med "Device Flow" aktiverat) – bara
// ett publikt client ID behövs, ingen client secret (säkert för skrivbordsappar).

export function getClientId(): string | null {
  ensureClientIdLoaded()
  return clientId
}

export function setClientId(id: string): void {
  clientId = id.trim()
  clientIdLoaded = true
  saveClientId(clientId)
}

export async function deviceStart(): Promise<DeviceCodeInfo> {
  ensureClientIdLoaded()
  if (!clientId) throw new Error('Inget client ID konfigurerat')
  const res = await timedFetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      scope: 'repo read:user notifications gist workflow'
    })
  })
  if (!res.ok) throw new Error(`Device flow ${res.status}`)
  const d = (await res.json()) as {
    device_code: string
    user_code: string
    verification_uri: string
    interval: number
    expires_in: number
  }
  return {
    deviceCode: d.device_code,
    userCode: d.user_code,
    verificationUri: d.verification_uri,
    interval: d.interval,
    expiresIn: d.expires_in
  }
}

export async function devicePoll(deviceCode: string, interval: number): Promise<GitHubUser> {
  ensureClientIdLoaded()
  if (!clientId) throw new Error('Inget client ID konfigurerat')
  let wait = Math.max(interval, 5)
  const deadline = Date.now() + 15 * 60 * 1000

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, wait * 1000))
    const res = await timedFetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })
    const d = (await res.json()) as {
      access_token?: string
      error?: string
    }
    if (d.access_token) {
      token = d.access_token
      tokenLoaded = true
      const user = await getUser()
      saveToken(token)
      return user
    }
    if (d.error === 'authorization_pending') continue
    if (d.error === 'slow_down') {
      wait += 5
      continue
    }
    throw new Error(d.error ?? 'Inloggning avbröts')
  }
  throw new Error('Inloggningen tog för lång tid')
}

export async function getUser(): Promise<GitHubUser> {
  const u = await gh<{ login: string; name: string | null; avatar_url: string }>('/user')
  return { login: u.login, name: u.name, avatarUrl: u.avatar_url }
}

export async function listRepos(): Promise<GitHubRepo[]> {
  const repos = await ghPaged<{
    full_name: string
    name: string
    clone_url: string
    private: boolean
    description: string | null
    default_branch: string
    html_url: string
    stargazers_count: number
    language: string | null
    pushed_at: string
    updated_at: string
  }>('/user/repos?sort=updated')
  return repos.map((r) => ({
    fullName: r.full_name,
    name: r.name,
    cloneUrl: r.clone_url,
    private: r.private,
    description: r.description,
    defaultBranch: r.default_branch,
    htmlUrl: r.html_url,
    stars: r.stargazers_count ?? 0,
    language: r.language,
    updatedAt: r.pushed_at ?? r.updated_at
  }))
}

export async function listPullRequests(
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open'
): Promise<PullRequest[]> {
  const prs = await ghPaged<{
    number: number
    title: string
    user: { login: string }
    state: string
    html_url: string
    draft?: boolean
    head: { ref: string }
    base: { ref: string }
  }>(`/repos/${owner}/${repo}/pulls?state=${state}&sort=updated&direction=desc`, state === 'open' ? 10 : 3)
  return prs.map((p) => ({
    number: p.number,
    title: p.title,
    author: p.user.login,
    state: p.state,
    url: p.html_url,
    draft: p.draft ?? false,
    headRef: p.head.ref,
    baseRef: p.base.ref
  }))
}

export async function getPullRequest(
  owner: string,
  repo: string,
  number: number
): Promise<PullRequestDetail> {
  const p = await gh<{
    number: number
    title: string
    body: string | null
    user: { login: string }
    state: string
    html_url: string
    draft: boolean
    merged: boolean
    mergeable: boolean | null
    head: { ref: string; sha: string }
    base: { ref: string }
    additions: number
    deletions: number
    changed_files: number
    comments: number
    created_at: string
    updated_at: string
  }>(`/repos/${owner}/${repo}/pulls/${number}`)
  return {
    number: p.number,
    title: p.title,
    body: p.body,
    author: p.user.login,
    state: p.state,
    url: p.html_url,
    draft: p.draft,
    merged: p.merged,
    mergeable: p.mergeable,
    headRef: p.head.ref,
    headSha: p.head.sha,
    baseRef: p.base.ref,
    additions: p.additions,
    deletions: p.deletions,
    changedFiles: p.changed_files,
    comments: p.comments,
    createdAt: p.created_at,
    updatedAt: p.updated_at
  }
}

export async function getPullRequestFiles(
  owner: string,
  repo: string,
  number: number
): Promise<PrFile[]> {
  const files = await ghPaged<{
    filename: string
    previous_filename?: string
    status: string
    additions: number
    deletions: number
    patch?: string
  }>(`/repos/${owner}/${repo}/pulls/${number}/files`)
  return files.map((f) => ({
    filename: f.filename,
    previousFilename: f.previous_filename ?? null,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch ?? null
  }))
}

export async function createPullRequest(
  owner: string,
  repo: string,
  pr: NewPullRequest
): Promise<PullRequest> {
  const p = await ghReq<{
    number: number
    title: string
    user: { login: string }
    state: string
    html_url: string
    head: { ref: string }
    base: { ref: string }
  }>('POST', `/repos/${owner}/${repo}/pulls`, {
    title: pr.title,
    body: pr.body,
    head: pr.head,
    base: pr.base
  })
  return {
    number: p.number,
    title: p.title,
    author: p.user.login,
    state: p.state,
    url: p.html_url,
    headRef: p.head.ref,
    baseRef: p.base.ref
  }
}

export async function getRepoDefaultBranch(owner: string, repo: string): Promise<string> {
  const r = await gh<{ default_branch: string }>(`/repos/${owner}/${repo}`)
  return r.default_branch
}

export async function createReview(
  owner: string,
  repo: string,
  number: number,
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
  body: string
): Promise<void> {
  await ghReq('POST', `/repos/${owner}/${repo}/pulls/${number}/reviews`, {
    event,
    body: body || undefined
  })
}

export async function mergePullRequest(
  owner: string,
  repo: string,
  number: number,
  method: 'merge' | 'squash' | 'rebase'
): Promise<void> {
  await ghReq('PUT', `/repos/${owner}/${repo}/pulls/${number}/merge`, { merge_method: method })
}

export async function addIssueComment(
  owner: string,
  repo: string,
  number: number,
  body: string
): Promise<void> {
  await ghReq('POST', `/repos/${owner}/${repo}/issues/${number}/comments`, { body })
}

export async function setIssueState(
  owner: string,
  repo: string,
  number: number,
  state: 'open' | 'closed'
): Promise<void> {
  await ghReq('PATCH', `/repos/${owner}/${repo}/issues/${number}`, { state })
}

// Stäng/återöppna en PR via pulls-endpointen (funkar ej på redan mergad PR).
export async function setPullState(
  owner: string,
  repo: string,
  number: number,
  state: 'open' | 'closed'
): Promise<void> {
  await ghReq('PATCH', `/repos/${owner}/${repo}/pulls/${number}`, { state })
}

// Konversationskommentarer (issues-endpointen gäller även PR:er).
export async function listIssueComments(
  owner: string,
  repo: string,
  number: number
): Promise<GhComment[]> {
  const cs = await ghPaged<{
    id: number
    user: { login: string } | null
    body: string
    created_at: string
  }>(`/repos/${owner}/${repo}/issues/${number}/comments`)
  return cs.map((c) => ({
    id: c.id,
    author: c.user?.login ?? 'okänd',
    body: c.body ?? '',
    createdAt: c.created_at
  }))
}

// Inlämnade reviews på en PR (godkänn/begär ändringar/kommentar).
export async function listPrReviews(
  owner: string,
  repo: string,
  number: number
): Promise<PrReview[]> {
  const rs = await ghPaged<{
    id: number
    user: { login: string } | null
    state: string
    body: string
    submitted_at: string | null
  }>(`/repos/${owner}/${repo}/pulls/${number}/reviews`)
  return rs
    .filter((r) => r.state !== 'PENDING')
    .map((r) => ({
      id: r.id,
      author: r.user?.login ?? 'okänd',
      state: r.state,
      body: r.body ?? '',
      submittedAt: r.submitted_at ?? ''
    }))
}

// Användare som kan tilldelas issues/PR:er i repot (för assignee-väljaren).
export async function listAssignees(owner: string, repo: string): Promise<string[]> {
  const us = await ghPaged<{ login: string }>(`/repos/${owner}/${repo}/assignees`)
  return us.map((u) => u.login)
}

// --- Notiser ---

function notifHtml(subjectUrl: string | null, type: string, repoHtml: string): string {
  const m = subjectUrl?.match(/\/(\d+)$/)
  const n = m ? m[1] : null
  if (type === 'PullRequest' && n) return `${repoHtml}/pull/${n}`
  if (type === 'Issue' && n) return `${repoHtml}/issues/${n}`
  return repoHtml
}

export async function listNotifications(): Promise<GhNotification[]> {
  const items = await gh<
    Array<{
      id: string
      reason: string
      updated_at: string
      subject: { title: string; url: string | null; type: string }
      repository: { full_name: string; html_url: string }
    }>
  >('/notifications?all=false&per_page=30')
  return items.map((n) => ({
    id: n.id,
    title: n.subject.title,
    type: n.subject.type,
    repo: n.repository.full_name,
    reason: n.reason,
    url: notifHtml(n.subject.url, n.subject.type, n.repository.html_url),
    updatedAt: n.updated_at
  }))
}

export async function notificationCount(): Promise<number> {
  try {
    const items = await gh<unknown[]>('/notifications?all=false&per_page=50')
    return items.length
  } catch {
    return 0
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await ghReq('PATCH', `/notifications/threads/${id}`)
}

// --- Sök ---

export async function searchRepositories(q: string): Promise<SearchRepoResult[]> {
  if (!q.trim()) return []
  const r = await gh<{
    items: Array<{
      full_name: string
      description: string | null
      stargazers_count: number
      language: string | null
      html_url: string
      clone_url: string
      private: boolean
    }>
  }>(`/search/repositories?q=${encodeURIComponent(q)}&per_page=25`)
  return r.items.map((i) => ({
    fullName: i.full_name,
    description: i.description,
    stars: i.stargazers_count,
    language: i.language,
    htmlUrl: i.html_url,
    cloneUrl: i.clone_url,
    private: i.private
  }))
}

// --- Releaser ---

type RawRelease = {
  id: number
  tag_name: string
  name: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  html_url: string
  published_at: string | null
  author: { login: string } | null
  assets?: Array<{
    id: number
    name: string
    size: number
    download_count: number
    browser_download_url: string
  }>
}

function mapRelease(r: RawRelease): Release {
  return {
    id: r.id,
    tagName: r.tag_name,
    name: r.name || r.tag_name,
    body: r.body,
    draft: r.draft,
    prerelease: r.prerelease,
    htmlUrl: r.html_url,
    publishedAt: r.published_at,
    author: r.author?.login ?? '',
    assets: (r.assets ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      downloadCount: a.download_count,
      downloadUrl: a.browser_download_url
    }))
  }
}

export async function listReleases(owner: string, repo: string): Promise<Release[]> {
  const rs = await ghPaged<RawRelease>(`/repos/${owner}/${repo}/releases`, 3)
  return rs.map(mapRelease)
}

export async function createRelease(owner: string, repo: string, rel: NewRelease): Promise<Release> {
  const r = await ghReq<RawRelease>('POST', `/repos/${owner}/${repo}/releases`, {
    tag_name: rel.tagName,
    name: rel.name || rel.tagName,
    body: rel.body,
    draft: rel.draft,
    prerelease: rel.prerelease,
    ...(rel.target ? { target_commitish: rel.target } : {})
  })
  return mapRelease(r)
}

export async function updateRelease(
  owner: string,
  repo: string,
  id: number,
  patch: EditRelease
): Promise<Release> {
  const r = await ghReq<RawRelease>('PATCH', `/repos/${owner}/${repo}/releases/${id}`, patch)
  return mapRelease(r)
}

export async function deleteRelease(owner: string, repo: string, id: number): Promise<void> {
  await ghReq('DELETE', `/repos/${owner}/${repo}/releases/${id}`)
}

// --- Actions / workflow-körningar ---

export async function listWorkflowRuns(owner: string, repo: string): Promise<WorkflowRun[]> {
  const res = await gh<{
    workflow_runs: Array<{
      id: number
      name: string | null
      status: string
      conclusion: string | null
      head_branch: string
      event: string
      html_url: string
      created_at: string
      run_number: number
    }>
  }>(`/repos/${owner}/${repo}/actions/runs?per_page=25`)
  return res.workflow_runs.map((r) => ({
    id: r.id,
    name: r.name || 'Workflow',
    status: r.status,
    conclusion: r.conclusion,
    branch: r.head_branch,
    event: r.event,
    htmlUrl: r.html_url,
    createdAt: r.created_at,
    runNumber: r.run_number
  }))
}

export async function rerunWorkflow(owner: string, repo: string, runId: number): Promise<void> {
  await ghReq('POST', `/repos/${owner}/${repo}/actions/runs/${runId}/rerun`)
}

export async function rerunFailedJobs(owner: string, repo: string, runId: number): Promise<void> {
  await ghReq('POST', `/repos/${owner}/${repo}/actions/runs/${runId}/rerun-failed-jobs`)
}

export async function cancelWorkflowRun(owner: string, repo: string, runId: number): Promise<void> {
  await ghReq('POST', `/repos/${owner}/${repo}/actions/runs/${runId}/cancel`)
}

export async function listWorkflowJobs(
  owner: string,
  repo: string,
  runId: number
): Promise<WorkflowJob[]> {
  const res = await gh<{
    jobs: Array<{
      id: number
      name: string
      status: string
      conclusion: string | null
      html_url: string | null
      steps?: Array<{
        name: string
        status: string
        conclusion: string | null
        number: number
      }>
    }>
  }>(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`)
  return res.jobs.map((j) => ({
    id: j.id,
    name: j.name,
    status: j.status,
    conclusion: j.conclusion,
    htmlUrl: j.html_url ?? '',
    steps: (j.steps ?? []).map((s) => ({
      name: s.name,
      status: s.status,
      conclusion: s.conclusion,
      number: s.number
    }))
  }))
}

// --- Rate limit ---

export async function getRateLimit(): Promise<RateLimit> {
  const r = await gh<{ resources: { core: { remaining: number; limit: number; reset: number } } }>(
    '/rate_limit'
  )
  const c = r.resources.core
  return { remaining: c.remaining, limit: c.limit, resetAt: c.reset }
}

// --- Gists ---

export async function listGists(): Promise<Gist[]> {
  const gs = await gh<
    Array<{
      id: string
      description: string | null
      public: boolean
      html_url: string
      updated_at: string
      files: Record<string, unknown>
    }>
  >('/gists?per_page=30')
  return gs.map((g) => ({
    id: g.id,
    description: g.description || '(utan beskrivning)',
    public: g.public,
    htmlUrl: g.html_url,
    files: Object.keys(g.files),
    updatedAt: g.updated_at
  }))
}

export async function createGist(
  description: string,
  filename: string,
  content: string,
  isPublic: boolean
): Promise<Gist> {
  const g = await ghReq<{
    id: string
    description: string | null
    public: boolean
    html_url: string
    updated_at: string
    files: Record<string, unknown>
  }>('POST', '/gists', {
    description,
    public: isPublic,
    files: { [filename || 'gist.txt']: { content } }
  })
  return {
    id: g.id,
    description: g.description || '(utan beskrivning)',
    public: g.public,
    htmlUrl: g.html_url,
    files: Object.keys(g.files),
    updatedAt: g.updated_at
  }
}

// --- Repo-insikter ---

export async function getRepoInsights(owner: string, repo: string): Promise<RepoInsights> {
  const [langs, contribs] = await Promise.all([
    gh<Record<string, number>>(`/repos/${owner}/${repo}/languages`).catch(() => ({})),
    gh<Array<{ login: string; avatar_url: string; contributions: number }>>(
      `/repos/${owner}/${repo}/contributors?per_page=10`
    ).catch(() => [])
  ])
  return {
    languages: Object.entries(langs)
      .map(([name, bytes]) => ({ name, bytes }))
      .sort((a, b) => b.bytes - a.bytes),
    contributors: contribs.map((c) => ({
      login: c.login,
      avatarUrl: c.avatar_url,
      contributions: c.contributions
    }))
  }
}

export async function searchIssuesPrs(q: string): Promise<SearchIssueResult[]> {
  if (!q.trim()) return []
  const r = await gh<{
    items: Array<{
      number: number
      title: string
      state: string
      html_url: string
      user: { login: string }
      pull_request?: unknown
      repository_url: string
    }>
  }>(`/search/issues?q=${encodeURIComponent(q)}&per_page=25`)
  return r.items.map((i) => ({
    number: i.number,
    title: i.title,
    repo: i.repository_url.replace('https://api.github.com/repos/', ''),
    state: i.state,
    isPr: !!i.pull_request,
    htmlUrl: i.html_url,
    author: i.user.login
  }))
}

// Sammanställer både "combined status" (legacy) och "check runs" till ett läge.
export async function getChecks(owner: string, repo: string, ref: string): Promise<CheckStatus> {
  let passed = 0
  let failed = 0
  let pending = 0
  try {
    const status = await gh<{
      statuses: { state: string }[]
    }>(`/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/status`)
    for (const s of status.statuses ?? []) {
      if (s.state === 'success') passed++
      else if (s.state === 'failure' || s.state === 'error') failed++
      else pending++
    }
  } catch {
    /* ref saknas på remote e.d. */
  }
  try {
    const runs = await gh<{
      check_runs: { status: string; conclusion: string | null }[]
    }>(`/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/check-runs`)
    for (const c of runs.check_runs ?? []) {
      if (c.status !== 'completed') pending++
      else if (c.conclusion === 'success' || c.conclusion === 'neutral' || c.conclusion === 'skipped')
        passed++
      else if (c.conclusion === 'failure' || c.conclusion === 'timed_out' || c.conclusion === 'cancelled')
        failed++
      else pending++
    }
  } catch {
    /* inga check runs */
  }
  const total = passed + failed + pending
  const state: CheckState =
    total === 0 ? 'none' : failed > 0 ? 'failure' : pending > 0 ? 'pending' : 'success'
  return { state, passed, failed, pending, total }
}

function mapIssue(i: {
  number: number
  title: string
  body: string | null
  user: { login: string }
  state: string
  html_url: string
  comments: number
  created_at: string
  labels: { name: string; color: string }[]
}): Issue {
  return {
    number: i.number,
    title: i.title,
    body: i.body,
    author: i.user.login,
    state: i.state,
    url: i.html_url,
    comments: i.comments,
    createdAt: i.created_at,
    labels: (i.labels ?? []).map((l) => ({ name: l.name, color: l.color }))
  }
}

export async function listIssues(
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open'
): Promise<Issue[]> {
  // Filtrera bort pull requests (GitHub listar PRs som issues)
  const issues = await ghPaged<
    Parameters<typeof mapIssue>[0] & { pull_request?: unknown }
  >(`/repos/${owner}/${repo}/issues?state=${state}&sort=updated&direction=desc`, state === 'open' ? 10 : 3)
  return issues.filter((i) => !i.pull_request).map(mapIssue)
}

export async function getIssue(owner: string, repo: string, number: number): Promise<Issue> {
  const i = await gh<Parameters<typeof mapIssue>[0]>(`/repos/${owner}/${repo}/issues/${number}`)
  return mapIssue(i)
}

export async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels: string[] = [],
  assignees: string[] = []
): Promise<Issue> {
  const i = await ghReq<Parameters<typeof mapIssue>[0]>('POST', `/repos/${owner}/${repo}/issues`, {
    title,
    body,
    ...(labels.length ? { labels } : {}),
    ...(assignees.length ? { assignees } : {})
  })
  return mapIssue(i)
}

export async function listLabels(owner: string, repo: string): Promise<RepoLabel[]> {
  const ls = await ghPaged<{ name: string; color: string }>(
    `/repos/${owner}/${repo}/labels`
  )
  return ls.map((l) => ({ name: l.name, color: l.color }))
}
