import chokidar, { type FSWatcher } from 'chokidar'
import type { WebContents } from 'electron'

// Bevakar arbetsytans repo-mappar och meddelar renderern (debouncat) när något
// ändras, så att git-status uppdateras automatiskt. Multi-root: en watcher per
// rot. Ignorerar tunga mappar men behåller .git/HEAD, index och refs så
// branch-byten/commits fångas.

const watchers = new Map<string, FSWatcher>()
let debounce: NodeJS.Timeout | null = null
let currentSender: WebContents | null = null

const IGNORE =
  /(^|[\\/])node_modules([\\/]|$)|[\\/]\.git[\\/](objects|lfs|modules)([\\/]|$)|[\\/](out|dist|release)([\\/]|$)/

function ping(): void {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
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
    const w = chokidar.watch(p, {
      ignoreInitial: true,
      ignored: (x: string) => IGNORE.test(x),
      persistent: true
    })
    w.on('all', ping)
    watchers.set(p, w)
  }
}

export function stopWatch(): void {
  for (const w of watchers.values()) w.close()
  watchers.clear()
  if (debounce) {
    clearTimeout(debounce)
    debounce = null
  }
  currentSender = null
}
