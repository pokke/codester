import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
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
  mainWindow.once('ready-to-show', reveal)
  mainWindow.webContents.once('did-finish-load', reveal)
  mainWindow.webContents.on('did-fail-load', reveal)
  setTimeout(reveal, 2500) // sista utväg

  // Öppna externa länkar i systemets webbläsare, inte i appen
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
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
  ipcMain.handle('app:version', () => app.getVersion())
  registerIpc()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
