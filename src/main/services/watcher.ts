import { watch, type FSWatcher } from 'fs'
import { stat } from 'fs/promises'
import { execFile } from 'child_process'
import { join, relative, sep } from 'path'
import type { WebContents } from 'electron'

// Bevakar arbetsytans repo-mappar och meddelar renderern (debouncat) när något
// ändras, så att git-status uppdateras automatiskt. Multi-root: en rekursiv
// fs.watch per rot – på Windows en enda ReadDirectoryChangesW för hela trädet.
// (chokidar skapade en synkron fs.watch per fil, vilket låste main-processen i
// flera sekunder vid start med flera repon.) Ignorerar tunga mappar men behåller
// .git/HEAD, index och refs så branch-byten/commits fångas.

const watchers = new Map<string, FSWatcher>()
let debounce: NodeJS.Timeout | null = null
let currentSender: WebContents | null = null

// Ignorera även gits kortlivade låsfiler (t.ex. .git/index.lock). De skapas och
// raderas vid varje git-operation och säger inget om arbetsträdets innehåll.
const IGNORE =
  /(^|[\\/])node_modules([\\/]|$)|[\\/]\.git[\\/](objects|lfs|modules)([\\/]|$)|[\\/](out|dist|release)([\\/]|$)|\.lock$/

// Ändrade sökvägar per rot sedan förra utskicket.
const pending = new Map<string, Set<string>>()

// Vilka av de repo-relativa sökvägarna ignoreras av git? En git-process per rot
// och skur. -z så sökvägar med t.ex. å/ä/ö inte citeras om. Kod 1 = inget
// ignorerat. Annat fel (t.ex. en mapp utan git) → räkna allt som relevant.
function gitIgnored(root: string, rels: string[]): Promise<Set<string>> {
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      ['-C', root, 'check-ignore', '--stdin', '-z'],
      { windowsHide: true },
      (err, stdout) => {
        if (err && (err as { code?: number }).code !== 1) return resolve(new Set())
        resolve(new Set(stdout.split('\0').filter(Boolean)))
      }
    )
    child.stdin?.end(rels.join('\0') + '\0')
  })
}

// Har något ändrats som git bryr sig om? Filer inuti .git (commit, branch-byte,
// stage) räknas alltid. Gitignorerade filer räknas inte – annars får en
// ignorerad fil som skrivs ofta (t.ex. en SQLite-WAL från en app som kör) hela
// git-läget att laddas om varannan sekund. Kataloger räknas inte heller: på
// Windows rapporteras en katalog som ändrad så fort en fil i den skapas eller
// raderas – t.ex. .git varje gång git tar sin index.lock – och det ledde till en
// loop där appens egna git-anrop utlöste nya omladdningar. Själva filen ger
// alltid en egen händelse.
async function hasRelevantChange(batch: [string, Set<string>][]): Promise<boolean> {
  for (const [root, paths] of batch) {
    const rels: string[] = []
    for (const fp of paths) {
      const rel = relative(root, fp).split(sep).join('/')
      if (rel === '' || rel.startsWith('.git/')) return true
      // Raderad sökväg (stat misslyckas) kan ha varit en fil – behåll den.
      const isDir = await stat(fp).then(
        (st) => st.isDirectory(),
        () => false
      )
      if (!isDir) rels.push(rel)
    }
    if (rels.length === 0) continue
    const ignored = await gitIgnored(root, rels)
    if (rels.some((r) => !ignored.has(r))) return true
  }
  return false
}

function queue(root: string, fp: string): void {
  let set = pending.get(root)
  if (!set) pending.set(root, (set = new Set()))
  set.add(fp)
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(async () => {
    debounce = null
    const batch = [...pending]
    pending.clear()
    if (!(await hasRelevantChange(batch))) return
    if (currentSender && !currentSender.isDestroyed()) currentSender.send('repo:changed')
  }, 350)
}

// Reconcilar bevakade rötter till exakt `paths` (lägg till nya, stäng borttagna).
export function watchAll(paths: string[], sender: WebContents): void {
  currentSender = sender
  const wanted = new Set(paths)
  for (const [p, w] of watchers) {
    if (!wanted.has(p)) {
      w.close()
      watchers.delete(p)
    }
  }
  for (const p of wanted) {
    if (watchers.has(p)) continue
    let w: FSWatcher
    try {
      w = watch(p, { recursive: true }, (_ev, name) => {
        // name saknas ibland (t.ex. vid överflöd) – räkna då roten som ändrad.
        const full = name ? join(p, name) : p
        if (!IGNORE.test(full)) queue(p, full)
      })
    } catch (err) {
      // T.ex. att mappen inte längre finns. Bevakning är best-effort.
      console.error('[watcher]', err)
      continue
    }
    // Utan en error-lyssnare blir bevakningsfel (t.ex. att roten raderas) ett
    // ohanterat fel i main-processen. Logga och fortsätt.
    w.on('error', (err) => console.error('[watcher]', err))
    watchers.set(p, w)
  }
}
