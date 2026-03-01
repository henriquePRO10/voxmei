import { ElectronAPI } from '@electron-toolkit/preload'

interface CustomAPI {
  getAppVersion: () => Promise<string>
  fetchCnpj: (cnpj: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  savePdf: (
    buffer: Uint8Array,
    defaultPath: string
  ) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>
  selectFolder: () => Promise<{
    success: boolean
    canceled?: boolean
    folderPath?: string
    error?: string
  }>
  savePdfToFolder: (
    buffer: Uint8Array,
    fileName: string,
    folderPath: string
  ) => Promise<{ success: boolean; filePath?: string; error?: string }>
  // Updater
  onUpdateAvailable: (callback: (payload: { version: string }) => void) => void
  onUpdateDownloaded: (callback: (payload: { version: string }) => void) => void
  getUpdateStatus: () => Promise<{ available: boolean; downloaded: boolean; version: string | null }>
  installUpdate: () => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
