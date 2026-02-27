import { Timestamp } from 'firebase/firestore'

// ─── Entidade Cliente (espelha a coleção Firestore "clientes") ────────────────
export interface Cliente {
  id: string
  cnpj: string
  razaoSocial: string
  nomeFantasia: string
  status: 'Ativo' | 'Pendente' | 'Inativo' | 'Baixada' | 'Inapta' | 'Suspensa' | 'Cancelada'
  telefone: string
  email?: string
  atividadePrincipal?: string
  optanteSimples?: boolean
  enderecoCompleto?: string
  dataAbertura?: string
  situacaoCadastral?: string
  naturezaJuridica?: string
  createdAt: Timestamp
  userId: string
}

// ─── Resposta da API de CNPJ (via window.api.fetchCnpj) ──────────────────────
export interface CnpjApiResult {
  alias?: string
  founded?: string
  status?: { text?: string }
  simples?: { optant?: boolean }
  phones?: { area: string; number: string }[]
  emails?: { address: string }[]
  mainActivity?: { id: string; text: string }
  address?: {
    street?: string
    number?: string
    details?: string
    district?: string
    city?: string
    state?: string
    zip?: string
  }
  company?: {
    name?: string
    size?: { acronym?: string }
    nature?: { id?: number; text?: string }
  }
}
