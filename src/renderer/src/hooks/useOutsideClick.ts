import { useEffect } from 'react'

/**
 * Registra um listener de clique no documento para detectar cliques fora
 * de um elemento. Útil para fechar menus de contexto e dropdowns.
 *
 * @param handler Função chamada quando qualquer clique ocorre no documento.
 *                Passe uma função estável (useCallback) para evitar re-registros.
 */
export function useOutsideClick(handler: () => void): void {
  useEffect(() => {
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [handler])
}
