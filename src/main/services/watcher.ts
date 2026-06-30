import chokidar, { type FSWatcher } from 'chokidar'
import type { WebContents } from 'electron'

// Bevakar repo-mappen och meddelar renderern (debouncat) när något ändras,
// så att git-status uppdateras automatiskt. Vi ignorerar tunga mappar men
// behåller .git/HEAD, index och refs så branch-byten/commits fångas.

let watcher: FSWatcher | null = null
let debounce: NodeJS.Timeout | null = null

const IGNORE =
  /(^|[\\/])node_modules([\\/]|$)|[\\/]\.git[\\/](objects|lfs|modules)([\\/]|$)|[\\/](out|dist|release)([\\/]|$)/

export function startWatch(path: string, sender: WebContents): void {
  stopWatch()
  watcher = chokidar.watch(path, {
    ignoreInitial: true,
    ignored: (p: string) => IGNORE.test(p),
    persistent: true
  })

  const ping = (): void => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      if (!sender.isDestroyed()) sender.send('repo:changed')
    }, 350)
  }
  watcher.on('all', ping)
}

export function stopWatch(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  if (debounce) {
    clearTimeout(debounce)
    debounce = null
  }
}
