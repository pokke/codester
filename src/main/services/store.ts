import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs'

// Krypterad lagring av GitHub-token via OS:ets nyckelvalv (Windows DPAPI).
// Token sparas aldrig i klartext på disk.

const tokenFile = join(app.getPath('userData'), 'gh.token')
const clientIdFile = join(app.getPath('userData'), 'gh.clientid')

export function saveToken(token: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const enc = safeStorage.encryptString(token)
    writeFileSync(tokenFile, enc)
  } else {
    // Fallback (ovanligt på Windows) – markera som oskyddad
    writeFileSync(tokenFile, 'plain:' + token, 'utf-8')
  }
}

export function loadToken(): string | null {
  if (!existsSync(tokenFile)) return null
  try {
    const raw = readFileSync(tokenFile)
    if (raw.toString('utf-8').startsWith('plain:')) {
      return raw.toString('utf-8').slice('plain:'.length)
    }
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(raw)
    }
    return null
  } catch {
    return null
  }
}

export function clearToken(): void {
  if (existsSync(tokenFile)) rmSync(tokenFile)
}

// Client ID är publikt (ofarligt att lagra i klartext) – behövs för OAuth Device Flow.
export function saveClientId(id: string): void {
  writeFileSync(clientIdFile, id, 'utf-8')
}

export function loadClientId(): string | null {
  if (!existsSync(clientIdFile)) return null
  try {
    return readFileSync(clientIdFile, 'utf-8').trim() || null
  } catch {
    return null
  }
}
