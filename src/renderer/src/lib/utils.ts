import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Formata um CNPJ para o padrão XX.XXX.XXX/XXXX-XX.
 * Aceita tanto dígitos puros quanto CNPJ já formatado.
 */
export function formatCnpj(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    if (digits.length < 14) return value; // retorna original se incompleto
    return digits.replace(
        /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
        '$1.$2.$3/$4-$5'
    );
}
