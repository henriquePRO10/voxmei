/**
 * Deteccao de ambiente: Electron vs Web (navegador puro).
 *
 * No Electron, o preload injeta window.electron e window.api via contextBridge.
 * No navegador comum, essas propriedades nao existem.
 */

export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && !!window.electron && !!window.api
}

export const isWeb = (): boolean => !isElectron()