/**
 * Camada de abstracao que fornece implementacoes diferentes
 * dependendo do ambiente (Electron ou Web / navegador).
 *
 * O codigo do renderer NAO deve acessar window.api diretamente.
 * Em vez disso, importa estas funcoes que delegam para o adapter correto.
 */

import { isElectron } from './environment'
import axios from 'axios'

/* --- Tipos compartilhados --- */

interface SaveResult {
  success: boolean
  canceled?: boolean
  filePath?: string
  error?: string
}

interface FolderResult {
  success: boolean
  canceled?: boolean
  folderPath?: string
  error?: string
}

interface CnpjResult {
  success: boolean
  data?: unknown
  error?: string
}

/* --- Implementacao Electron --- */

const electronAdapter = {
  getAppVersion: (): Promise<string> => window.api.getAppVersion(),

  fetchCnpj: (cnpj: string): Promise<CnpjResult> => window.api.fetchCnpj(cnpj),

  savePdf: (buffer: Uint8Array, defaultPath: string): Promise<SaveResult> =>
    window.api.savePdf(buffer, defaultPath),

  selectFolder: (): Promise<FolderResult> => window.api.selectFolder(),

  savePdfToFolder: (
    buffer: Uint8Array,
    fileName: string,
    folderPath: string
  ): Promise<SaveResult> => window.api.savePdfToFolder(buffer, fileName, folderPath),

  getElectronVersions: (): Record<string, string> =>
    window.electron.process.versions as unknown as Record<string, string>
}

/* --- Implementacao Web (navegador) --- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = window as Record<string, any>

const webAdapter = {
  getAppVersion: async (): Promise<string> => {
    return __APP_VERSION__ ?? 'web'
  },

  fetchCnpj: async (cnpj: string): Promise<CnpjResult> => {
    const cleanCnpj = cnpj.replace(/\D/g, '')
    try {
      const response = await axios.get(`/api/cnpj/${cleanCnpj}`)
      return { success: true, data: response.data }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return { success: false, error: message }
    }
  },

  savePdf: async (buffer: Uint8Array, defaultPath: string): Promise<SaveResult> => {
    try {
      const blob = new Blob([buffer.slice()], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultPath
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return { success: false, error: message }
    }
  },

  selectFolder: async (): Promise<FolderResult> => {
    try {
      if ('showDirectoryPicker' in window) {
        const handle = await win.showDirectoryPicker()
        win.__selectedDirHandle = handle
        return { success: true, folderPath: handle.name as string }
      }
      return { success: false, error: 'Selecao de pasta nao suportada neste navegador.' }
    } catch {
      return { success: false, canceled: true }
    }
  },

  savePdfToFolder: async (
    buffer: Uint8Array,
    fileName: string,
    _folderPath?: string
  ): Promise<SaveResult> => {
    try {
      const dirHandle = win.__selectedDirHandle
      if (dirHandle) {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(buffer)
        await writable.close()
        return { success: true, filePath: fileName }
      }
      return webAdapter.savePdf(buffer, fileName)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return { success: false, error: message }
    }
  },

  getElectronVersions: (): Record<string, string> => ({
    electron: 'N/A',
    chrome: 'N/A',
    node: 'N/A'
  })
}

/* --- Exportacao unificada --- */

type Adapter = typeof electronAdapter

function getAdapter(): Adapter {
  return isElectron() ? electronAdapter : webAdapter
}

export const platform = {
  getAppVersion: (...args: Parameters<Adapter['getAppVersion']>) => getAdapter().getAppVersion(...args),
  fetchCnpj: (...args: Parameters<Adapter['fetchCnpj']>) => getAdapter().fetchCnpj(...args),
  savePdf: (...args: Parameters<Adapter['savePdf']>) => getAdapter().savePdf(...args),
  selectFolder: (...args: Parameters<Adapter['selectFolder']>) => getAdapter().selectFolder(...args),
  savePdfToFolder: (...args: Parameters<Adapter['savePdfToFolder']>) => getAdapter().savePdfToFolder(...args),
  getElectronVersions: () => getAdapter().getElectronVersions()
}

/* --- Variavel global injetada pelo Vite (define) --- */
declare const __APP_VERSION__: string