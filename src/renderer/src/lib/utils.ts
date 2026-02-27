import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { QuerySnapshot, DocumentData } from 'firebase/firestore'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Formata um CNPJ para o padrão XX.XXX.XXX/XXXX-XX.
 * Aceita tanto dígitos puros quanto CNPJ já formatado.
 */
export function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length < 14) return value // retorna original se incompleto
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

/**
 * Converte um QuerySnapshot do Firestore em um array tipado.
 * Evita repetir `snap.docs.map(d => ({ id: d.id, ...d.data() })) as T[]` em todo lugar.
 */
export function snapshotTo<T extends { id: string }>(snap: QuerySnapshot<DocumentData>): T[] {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as T[]
}
