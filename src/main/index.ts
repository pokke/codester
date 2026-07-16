import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { registerIpc } from './ipc'
import { initUpdater, quitAndInstall, checkNow } from './services/updater'
import { killAll as killLsp } from './services/lsp'
import { killAllTerminals } from './services/terminal'

// Fönstertillstånd (storlek/position/maximerat) sparas mellan körningar.
interface WinState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}
function stateFile(): string {
  return join(app.getPath('userData'), 'window-state.json')
}
function loadWinState(): WinState {
  try {
    return { ...{ width: 1280, height: 800 }, ...JSON.parse(readFileSync(stateFile(), 'utf-8')) }
  } catch {
    return { width: 1280, height: 800 }
  }
}

function createWindow(): void {
  const saved = loadWinState()
  let normalBounds = { width: saved.width, height: saved.height, x: saved.x, y: saved.y }

  const mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e1e',
    icon: join(__dirname, '../../build/icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e1e1e',
      symbolColor: '#cccccc',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Visa fönstret så fort något av flera event inträffar – garanterar att
  // det alltid dyker upp, även om ready-to-show dröjer eller renderern fallerar.
  const reveal = (): void => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  }
  mainWindow.once('ready-to-show', () => {
    if (saved.maximized) mainWindow.maximize()
    reveal()
  })
  mainWindow.webContents.once('did-finish-load', reveal)
  mainWindow.webContents.on('did-fail-load', reveal)
  setTimeout(reveal, 2500) // sista utväg

  // Spåra normalstorlek (när ej maximerat) och spara tillståndet vid stängning
  const trackBounds = (): void => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      normalBounds = mainWindow.getBounds()
    }
  }
  mainWindow.on('resize', trackBounds)
  mainWindow.on('move', trackBounds)
  mainWindow.on('close', () => {
    try {
      writeFileSync(
        stateFile(),
        JSON.stringify({ ...normalBounds, maximized: mainWindow.isMaximized() })
      )
    } catch {
      /* ignorera */
    }
  })

  // Öppna externa länkar i systemets webbläsare, inte i appen. Endast säkra
  // scheman (skydd mot file:// m.m. från renderad markdown/GitHub-innehåll).
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const scheme = new URL(details.url).protocol
      if (scheme === 'https:' || scheme === 'http:' || scheme === 'mailto:') {
        shell.openExternal(details.url)
      }
    } catch {
      /* ogiltig URL – ignorera */
    }
    return { action: 'deny' }
  })

  // Ladda renderern: dev-server i utveckling, byggd fil i produktion
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Stabilt AppUserModelID som matchar genvägens (appId) – krävs för att
  // taskbar-fästning och gruppering ska överleva uppdateringar på Windows.
  app.setAppUserModelId('com.codester.app')

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:install', () => quitAndInstall())
  ipcMain.handle('update:check', () => checkNow())
  // Blinka i aktivitetsfältet när något kräver uppmärksamhet (t.ex. en agent i
  // terminalen) och fönstret inte är fokuserat.
  ipcMain.on('window:flash', () => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w && !w.isFocused()) w.flashFrame(true)
  })
  registerIpc()

  createWindow()

  // Auto-uppdatering: meddela renderern om nya versioner
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    initUpdater((channel, ...args) => {
      if (!win.isDestroyed()) win.webContents.send(channel, ...args)
    })
    // Leta efter uppdateringar igen när fönstret får fokus (strypt i updater)
    win.on('focus', () => {
      win.flashFrame(false) // sluta blinka när användaren är tillbaka
      checkNow()
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  killLsp()
  killAllTerminals()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
