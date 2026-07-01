import type { DeviceCodeInfo, GitHubRepo, GitHubUser, PullRequest } from '../../shared/types'
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

let token: string | null = loadToken()
let clientId: string | null = loadClientId()

async function gh<T>(path: string): Promise<T> {
  if (!token) throw new Error('Ingen GitHub-token angiven')
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Codester'
    }
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

export function hasToken(): boolean {
  return !!token
}

export async function setToken(value: string): Promise<GitHubUser> {
  token = value.trim()
  // Validera direkt genom att hämta användaren
  const user = await getUser()
  saveToken(token)
  return user
}

export function signOut(): void {
  token = null
  clearToken()
}

// --- OAuth Device Flow ---
// Kräver en registrerad GitHub OAuth App (med "Device Flow" aktiverat) – bara
// ett publikt client ID behövs, ingen client secret (säkert för skrivbordsappar).

export function getClientId(): string | null {
  return clientId
}

export function setClientId(id: string): void {
  clientId = id.trim()
  saveClientId(clientId)
}

export async function deviceStart(): Promise<DeviceCodeInfo> {
  if (!clientId) throw new Error('Inget client ID konfigurerat')
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: 'repo read:user' })
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
  if (!clientId) throw new Error('Inget client ID konfigurerat')
  let wait = Math.max(interval, 5)
  const deadline = Date.now() + 15 * 60 * 1000

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, wait * 1000))
    const res = await fetch('https://github.com/login/oauth/access_token', {
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
  const repos = await gh<
    Array<{
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
    }>
  >('/user/repos?per_page=100&sort=updated')
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

export async function listPullRequests(owner: string, repo: string): Promise<PullRequest[]> {
  const prs = await gh<
    Array<{
      number: number
      title: string
      user: { login: string }
      state: string
      html_url: string
      head: { ref: string }
      base: { ref: string }
    }>
  >(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`)
  return prs.map((p) => ({
    number: p.number,
    title: p.title,
    author: p.user.login,
    state: p.state,
    url: p.html_url,
    headRef: p.head.ref,
    baseRef: p.base.ref
  }))
}
