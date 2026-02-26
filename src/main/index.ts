import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import axios from 'axios'
import fs from 'fs'
import * as dotenv from 'dotenv'

// Carrega as variáveis de ambiente do .env
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
  electronApp.setAppUserModelId('com.voxcount.app')

  // Configura e inicia o auto-updater
  autoUpdater.on('update-available', () => {
    console.log('Atualização disponível.')
  })
  autoUpdater.on('update-downloaded', () => {
    console.log('Atualização baixada. O aplicativo será atualizado ao reiniciar.')
  })
  autoUpdater.checkForUpdatesAndNotify()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // [1] Busca Segura no CNPJA (com fallback para token secundário)
  ipcMain.handle('fetch-cnpj', async (_, cnpj: string) => {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    const url = `https://api.cnpja.com/office/${cleanCnpj}`;

    const tryFetch = async (token: string): Promise<{ success: true; data: unknown } | { success: false; error: string }> => {
      const response = await axios.get(url, {
        headers: { Authorization: token },
        validateStatus: () => true // não lança exceção em nenhum status HTTP
      });

      if (response.status >= 200 && response.status < 300) {
        return { success: true, data: response.data };
      }

      // Retorna o status para que o caller decida se tenta o fallback
      return { success: false, error: `HTTP ${response.status}: ${JSON.stringify(response.data)}` };
    };

    const token1 = process.env.CNPJA_API_TOKEN;
    const token2 = process.env.CNPJA_API_TOKEN2;

    if (!token1 && !token2) {
      return { success: false, error: 'Nenhum token da API CNPJA configurado no ambiente.' };
    }

    // Tentativa 1 — token principal
    if (token1) {
      try {
        const result = await tryFetch(token1);
        if (result.success) return result;
        console.warn(`[CNPJA] Token principal falhou (${result.error}). Tentando token secundário...`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        console.warn(`[CNPJA] Token principal lançou exceção: ${msg}. Tentando token secundário...`);
      }
    }

    // Tentativa 2 — token de contingência
    if (token2) {
      try {
        const result = await tryFetch(token2);
        if (result.success) return result;
        console.error(`[CNPJA] Token secundário também falhou: ${result.error}`);
        return { success: false, error: 'Ambos os tokens CNPJA falharam. Verifique seus limites de requisição.' };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        console.error(`[CNPJA] Token secundário lançou exceção: ${msg}`);
        return { success: false, error: msg };
      }
    }

    return { success: false, error: 'Token principal falhou e token secundário não está configurado.' };
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      console.error('Erro ao salvar PDF:', message);
      return { success: false, error: message };
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
