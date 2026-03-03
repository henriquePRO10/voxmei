import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  fetchCnpj: (cnpj: string) => ipcRenderer.invoke('fetch-cnpj', cnpj),
  savePdf: (buffer: Uint8Array, defaultPath: string) =>
    ipcRenderer.invoke('save-pdf', { buffer, defaultPath }),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  savePdfToFolder: (buffer: Uint8Array, fileName: string, folderPath: string) =>
    ipcRenderer.invoke('save-pdf-to-folder', { buffer, fileName, folderPath }),
  // Updater
  onUpdateAvailable: (callback: (payload: { version: string }) => void) =>
    ipcRenderer.on('updater:update-available', (_event, payload) => callback(payload)),
  onUpdateDownloaded: (callback: (payload: { version: string }) => void) =>
    ipcRenderer.on('updater:update-downloaded', (_event, payload) => callback(payload)),
  getUpdateStatus: (): Promise<{ available: boolean; downloaded: boolean; version: string | null }> =>
    ipcRenderer.invoke('updater:get-status'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:install')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
