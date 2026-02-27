import { useState, useEffect } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../services/firebaseConfig'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export type TipoNotificacao = 'sem-lancamento' | 'pendente' | 'pro-labore'

export interface Notificacao {
  id: TipoNotificacao
  tipo: TipoNotificacao
  titulo: string
  descricao: string
  count: number
}

interface UseNotificacoesReturn {
  notificacoes: Notificacao[]
  total: number
  loading: boolean
  refresh: () => void
}

export function useNotificacoes(userId: string | undefined): UseNotificacoesReturn {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  const refresh = (): void => setTick((t) => t + 1)

  useEffect(() => {
    if (!userId) {
      setNotificacoes([])
      return
    }

    const run = async (): Promise<void> => {
      setLoading(true)
      try {
        const hoje = new Date()
        const mesAnoKey = format(hoje, 'yyyy-MM') // '2026-02'
        const mesAnoProLabore = format(hoje, 'MM/yyyy') // '02/2026'

        // ── 1. Buscar todos os clientes ativos ─────────────────────────
        const clientesSnap = await getDocs(
          query(
            collection(db, 'clientes'),
            where('userId', '==', userId),
            where('status', '==', 'Ativo')
          )
        )
        const clientesAtivos = clientesSnap.docs.map((d) => ({
          id: d.id,
          nomeFantasia: d.data().nomeFantasia as string
        }))

        // ── 2. Buscar clientes pendentes ───────────────────────────────
        const pendenteSnap = await getDocs(
          query(
            collection(db, 'clientes'),
            where('userId', '==', userId),
            where('status', '==', 'Pendente')
          )
        )
        const clientesPendentes = pendenteSnap.docs.map((d) => ({
          id: d.id,
          nomeFantasia: d.data().nomeFantasia as string
        }))

        // ── 3. Buscar receitas do mês atual ────────────────────────────
        const financeiroSnap = await getDocs(
          query(
            collection(db, 'financeiro'),
            where('userId', '==', userId),
            where('tipo', '==', 'Receita')
          )
        )
        // IDs de clientes que JÁ têm receita no mês
        const clientesComReceita = new Set<string>()
        financeiroSnap.docs.forEach((d) => {
          const data = d.data()
          const dataStr = data.data as string // 'YYYY-MM-DD'
          if (dataStr && dataStr.startsWith(mesAnoKey)) {
            clientesComReceita.add(data.clienteId as string)
          }
        })

        // ── 4. Clientes sem lançamento no mês ─────────────────────────
        const semLancamento = clientesAtivos.filter((c) => !clientesComReceita.has(c.id))

        // ── 5. Pro-labore do mês atual ─────────────────────────────────
        const proLaboreSnap = await getDocs(
          query(
            collection(db, 'pro_labores'),
            where('userId', '==', userId),
            where('mesAno', '==', mesAnoProLabore)
          )
        )
        const proLaboreGerado = !proLaboreSnap.empty

        // ── Montar lista de notificações ───────────────────────────────
        const resultado: Notificacao[] = []

        if (semLancamento.length > 0) {
          const mesLabel = format(hoje, 'MMM/yy', { locale: ptBR }).replace('.', '')
          resultado.push({
            id: 'sem-lancamento',
            tipo: 'sem-lancamento',
            titulo: 'Clientes sem receita no mês',
            descricao: `${semLancamento.length} cliente${semLancamento.length > 1 ? 's' : ''} ainda não ${semLancamento.length > 1 ? 'têm' : 'tem'} receita registrada em ${mesLabel}`,
            count: semLancamento.length
          })
        }

        if (clientesPendentes.length > 0) {
          resultado.push({
            id: 'pendente',
            tipo: 'pendente',
            titulo: 'Clientes com cadastro pendente',
            descricao: `${clientesPendentes.length} cliente${clientesPendentes.length > 1 ? 's' : ''} com status Pendente aguardando regularização`,
            count: clientesPendentes.length
          })
        }

        if (!proLaboreGerado && clientesAtivos.length > 0) {
          const mesLabel = format(hoje, 'MMM/yy', { locale: ptBR }).replace('.', '')
          resultado.push({
            id: 'pro-labore',
            tipo: 'pro-labore',
            titulo: 'Pro-labore não gerado',
            descricao: `Nenhum holerite foi gerado para ${mesLabel}`,
            count: 1
          })
        }

        setNotificacoes(resultado)
      } catch (err) {
        console.error('Erro ao carregar notificações:', err)
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [userId, tick])

  const total = notificacoes.reduce((s, n) => s + n.count, 0)

  return { notificacoes, total, loading, refresh }
}
