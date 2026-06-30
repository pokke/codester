import { app } from 'electron'
import pkg from 'electron-updater'

// electron-updater är CommonJS – destrukturera autoUpdater från default-exporten.
const { autoUpdater } = pkg

type Send = (channel: string, ...args: unknown[]) => void

// Kontrollerar GitHub Releases för nya versioner, laddar ner i bakgrunden och
// låter användaren starta om för att installera. Körs bara i paketerad app.
export function initUpdater(send: Send): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => send('update:status', 'checking'))
  autoUpdater.on('update-available', (info) => send('update:available', info.version))
  autoUpdater.on('update-not-available', () => send('update:status', 'none'))
  autoUpdater.on('download-progress', (p) => send('update:progress', Math.round(p.percent)))
  autoUpdater.on('update-downloaded', (info) => send('update:downloaded', info.version))
  autoUpdater.on('error', (e) => send('update:error', e == null ? 'okänt fel' : String(e)))

  autoUpdater.checkForUpdates().catch(() => {
    /* nätverksfel m.m. – ignoreras tyst */
  })

  // Kolla igen en gång i timmen om appen är öppen länge
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000)
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}

export function checkNow(): void {
  if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {})
}
