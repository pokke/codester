import { join, dirname } from 'path'
import { mkdir, rename, rm, writeFile, access, cp } from 'fs/promises'
import { getRepoPath } from './git'

// Fil-/mappoperationer relativt ett repo. root default = aktiva repot, men kan
// anges explicit för en annan rot i arbetsytan (multi-root).

function abs(rel: string, root?: string): string {
  const base = root ?? getRepoPath()
  if (!base) throw new Error('Inget repo är öppnat')
  // Enkel skyddsspärr mot att bryta ut ur repot
  if (rel.includes('..')) throw new Error('Ogiltig sökväg')
  return join(base, rel)
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function createFile(rel: string, root?: string): Promise<void> {
  const path = abs(rel, root)
  if (await exists(path)) throw new Error('Filen finns redan')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, '', 'utf-8')
}

export async function createFolder(rel: string, root?: string): Promise<void> {
  const path = abs(rel, root)
  if (await exists(path)) throw new Error('Mappen finns redan')
  await mkdir(path, { recursive: true })
}

export async function renamePath(oldRel: string, newRel: string, root?: string): Promise<void> {
  const from = abs(oldRel, root)
  const to = abs(newRel, root)
  if (await exists(to)) throw new Error('Målet finns redan')
  await mkdir(dirname(to), { recursive: true })
  await rename(from, to)
}

export async function deletePath(rel: string, root?: string): Promise<void> {
  await rm(abs(rel, root), { recursive: true, force: true })
}

export async function copyPath(srcRel: string, destRel: string, root?: string): Promise<void> {
  const to = abs(destRel, root)
  if (await exists(to)) throw new Error('Målet finns redan')
  await mkdir(dirname(to), { recursive: true })
  await cp(abs(srcRel, root), to, { recursive: true })
}
