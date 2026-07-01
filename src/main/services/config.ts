import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'

// Läser/skriver redigerbara config-filer (settings.json, keybindings.json,
// snippets/<lang>.json) i appens userData-mapp.

function safePath(name: string): string {
  // Tillåt enkel fil eller en nivå av undermapp; inga utbrott.
  if (!/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?$/.test(name) || name.includes('..')) {
    throw new Error('Ogiltigt config-namn')
  }
  return join(app.getPath('userData'), name)
}

export function configDir(): string {
  return app.getPath('userData')
}

export async function readConfig(name: string): Promise<string | null> {
  try {
    return await readFile(safePath(name), 'utf-8')
  } catch {
    return null // saknas
  }
}

export async function writeConfig(name: string, content: string): Promise<void> {
  const path = safePath(name)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf-8')
}
