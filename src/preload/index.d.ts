import { ElectronAPI } from '@electron-toolkit/preload'

interface CustomAPI {
  fetchCnpj: (cnpj: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  savePdf: (buffer: Uint8Array, defaultPath: string) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
