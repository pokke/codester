import { join } from 'path'
import { readFile, readdir } from 'fs/promises'
import { getRepoPath, listFiles } from './git'
import type { TsProject } from '../../shared/types'

// Bygger ett "TS-projekt" åt Monaco: compilerOptions från tsconfig, projektets
// egna käll-filer, och typdeklarationer från node_modules (storleksbegränsat).
// Detta ger projektmedveten IntelliSense utan en separat språkserver.

const CODE_EXT = /\.(ts|tsx|js|jsx|mts|cts)$/
const MAX_TYPE_BYTES = 3 * 1024 * 1024 // tak för d.ts från node_modules

// Enkel tolerant tsconfig-parser (kommentarer + trailing commas)
function parseJsonc(s: string): Record<string, unknown> {
  const noComments = s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(noComments)
}

export async function tsProject(): Promise<TsProject | null> {
  const root = getRepoPath()
  if (!root) return null

  // 1) compilerOptions
  let compilerOptions: Record<string, unknown> = {}
  try {
    const parsed = parseJsonc(await readFile(join(root, 'tsconfig.json'), 'utf-8'))
    compilerOptions = (parsed.compilerOptions as Record<string, unknown>) ?? {}
  } catch {
    /* inget tsconfig – Monaco använder defaults */
  }

  const files: { path: string; content: string }[] = []

  // 2) projektets egna käll-filer (respekterar .gitignore via git ls-files)
  let rels: string[] = []
  try {
    rels = (await listFiles()).filter((r) => CODE_EXT.test(r))
  } catch {
    /* inget repo */
  }
  if (rels.length === 0) return { compilerOptions, files } // ingen JS/TS
  for (const rel of rels) {
    try {
      files.push({ path: rel, content: await readFile(join(root, rel), 'utf-8') })
    } catch {
      /* hoppa över oläsbara */
    }
  }

  // 3) typdeklarationer (.d.ts) från node_modules – @types + direkta beroenden,
  //    begränsat av en byte-budget så stora projekt inte fryser.
  let budget = MAX_TYPE_BYTES
  const addDts = async (dir: string, vbase: string): Promise<void> => {
    if (budget <= 0) return
    let entries: import('fs').Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (budget <= 0) return
      const full = join(dir, e.name)
      const vpath = `${vbase}/${e.name}`
      if (e.isDirectory()) {
        await addDts(full, vpath)
      } else if (e.name.endsWith('.d.ts')) {
        try {
          const c = await readFile(full, 'utf-8')
          budget -= c.length
          files.push({ path: vpath, content: c })
        } catch {
          /* hoppa över */
        }
      }
    }
  }

  const nm = join(root, 'node_modules')
  await addDts(join(nm, '@types'), 'node_modules/@types')
  try {
    const pkg = parseJsonc(await readFile(join(root, 'package.json'), 'utf-8'))
    const deps = Object.keys({
      ...((pkg.dependencies as object) ?? {}),
      ...((pkg.devDependencies as object) ?? {})
    })
    for (const d of deps) {
      if (budget <= 0) break
      await addDts(join(nm, d), `node_modules/${d}`)
    }
  } catch {
    /* ingen package.json */
  }

  return { compilerOptions, files }
}
