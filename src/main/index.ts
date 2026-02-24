import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import axios from 'axios'
import fs from 'fs'
import * as dotenv from 'dotenv'

dotenv.config()

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.voxcontador.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // [1] Busca Segura no CNPJA
  ipcMain.handle('fetch-cnpj', async (_, cnpj: string) => {
    try {
      const token = process.env.CNPJA_API_TOKEN;
      if (!token) throw new Error('API Token do CNPJA ausente no ambiente.');

      const cleanCnpj = cnpj.replace(/\D/g, ''); // Garante que foi apenas os números
      
      const response = await axios.get(`https://api.cnpja.com/office/${cleanCnpj}`, {
        headers: { Authorization: token } // Node.js lidando com a segurança 
      });

      return { success: true, data: response.data };
    } catch (error: any) {
      console.error('Erro CNPJA:', error.message);
      return { success: false, error: error.message || 'Erro desconhecido' };
    }
  });

  // [2] Rotina Segura para Salvar Arquivos no SO
  ipcMain.handle('save-pdf', async (_, { buffer, defaultPath }: { buffer: Uint8Array, defaultPath: string }) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Baixar Holerite',
        defaultPath: defaultPath || 'Holerite.pdf',
        filters: [{ name: 'Documento PDF', extensions: ['pdf'] }]
      });

      if (canceled || !filePath) return { success: false, canceled: true };

      fs.writeFileSync(filePath, Buffer.from(buffer));
      // Abre o PDF no navegador padrão do sistema
      shell.openExternal(`file://${filePath}`);
      return { success: true, filePath };
    } catch (error: any) {
      console.error('Erro ao salvar PDF:', error.message);
      return { success: false, error: error.message };
    }
  });

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
