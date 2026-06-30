import { join, dirname } from 'path'
import { mkdir, rename, rm, writeFile, access, cp } from 'fs/promises'
import { getRepoPath } from './git'

// Fil-/mappoperationer relativt det öppnade repot. Används av filträdet.

function abs(rel: string): string {
  const root = getRepoPath()
  if (!root) throw new Error('Inget repo är öppnat')
  // Enkel skyddsspärr mot att bryta ut ur repot
  if (rel.includes('..')) throw new Error('Ogiltig sökväg')
  return join(root, rel)
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function createFile(rel: string): Promise<void> {
  const path = abs(rel)
  if (await exists(path)) throw new Error('Filen finns redan')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, '', 'utf-8')
}

export async function createFolder(rel: string): Promise<void> {
  const path = abs(rel)
  if (await exists(path)) throw new Error('Mappen finns redan')
  await mkdir(path, { recursive: true })
}

export async function renamePath(oldRel: string, newRel: string): Promise<void> {
  const from = abs(oldRel)
  const to = abs(newRel)
  if (await exists(to)) throw new Error('Målet finns redan')
  await mkdir(dirname(to), { recursive: true })
  await rename(from, to)
}

export async function deletePath(rel: string): Promise<void> {
  await rm(abs(rel), { recursive: true, force: true })
}

export async function copyPath(srcRel: string, destRel: string): Promise<void> {
  const to = abs(destRel)
  if (await exists(to)) throw new Error('Målet finns redan')
  await mkdir(dirname(to), { recursive: true })
  await cp(abs(srcRel), to, { recursive: true })
}
