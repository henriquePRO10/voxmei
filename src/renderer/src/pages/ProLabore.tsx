import { useState, useEffect, useMemo } from 'react'
import {
  Settings,
  PlayCircle,
  Loader2,
  CheckCircle2,
  Search,
  Users,
  Calculator,
  AlertCircle
} from 'lucide-react'
import { MonthPicker } from '../components/MonthPicker'
import { collection, getDocs, writeBatch, doc, query, where, Timestamp } from 'firebase/firestore'
import { db } from '../services/firebaseConfig'
import { format } from 'date-fns'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/useAuth'
import { cn, snapshotTo } from '../lib/utils'
import { type Cliente } from '../types'

interface ConfigValues {
  salarioMinimo?: number
  temInss?: boolean
  inssPerc?: number
}

export function ProLabore() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [success, setSuccess] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [selectedClientes, setSelectedClientes] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoadingClientes, setIsLoadingClientes] = useState(true)

  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'MM/yyyy'))
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [existingCount, setExistingCount] = useState(0)
  const [showToast, setShowToast] = useState(false)
  const [toastCount, setToastCount] = useState(0)
  const { currentUser } = useAuth()

  // start with empty fields so the accountant can define them
  const { register, watch } = useForm<ConfigValues>({
    defaultValues: { temInss: false }
  })

  const temInss = watch('temInss')
  const base = Number(watch('salarioMinimo') || 0)
  const inss = temInss ? Number(watch('inssPerc') || 0) : 0
  const calcInss = (base * inss) / 100
  const liquido = base - calcInss

  // only enable generation when values are provided and clients selected
  const canGenerate = selectedClientes.size > 0 && base > 0 && (!temInss || inss > 0)

  useEffect(() => {
    const fetchClientes = async () => {
      if (!currentUser) return
      setIsLoadingClientes(true)
      try {
        const q = query(
          collection(db, 'clientes'),
          where('userId', '==', currentUser.uid),
          where('status', '==', 'Ativo')
        )
        const snapshot = await getDocs(q)
        const clientesData = snapshotTo<Cliente>(snapshot)

        // Ordenar alfabeticamente
        clientesData.sort((a, b) => a.nomeFantasia.localeCompare(b.nomeFantasia))
        setClientes(clientesData)

        // não seleciona nenhum cliente por padrão
        setSelectedClientes(new Set())
      } catch (error) {
        console.error('Erro ao buscar clientes:', error)
      } finally {
        setIsLoadingClientes(false)
      }
    }

    fetchClientes()
  }, [currentUser])

  const filteredClientes = useMemo(() => {
    return clientes.filter(
      (cliente) =>
        cliente.nomeFantasia.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cliente.cnpj.includes(searchTerm)
    )
  }, [clientes, searchTerm])

  const handleSelectAll = () => {
    if (selectedClientes.size === filteredClientes.length) {
      setSelectedClientes(new Set())
    } else {
      setSelectedClientes(new Set(filteredClientes.map((c) => c.id)))
    }
  }

  const toggleCliente = (id: string) => {
    const newSelected = new Set(selectedClientes)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedClientes(newSelected)
  }

  const handleGenerateValues = async () => {
    if (!currentUser || selectedClientes.size === 0 || base === 0 || (temInss && inss === 0)) return
    setIsGenerating(true)
    setSuccess(false)

    try {
      // Verificar se já existem pró-labores para os clientes selecionados neste mês
      const q2 = query(
        collection(db, 'pro_labores'),
        where('userId', '==', currentUser.uid),
        where('mesAno', '==', currentMonth)
      )
      const existing = await getDocs(q2)

      const existingClientIds = new Set(existing.docs.map((doc) => doc.data().clienteId))
      const selectedAndExisting = Array.from(selectedClientes).filter((id) =>
        existingClientIds.has(id)
      )

      if (selectedAndExisting.length > 0) {
        setExistingCount(selectedAndExisting.length)
        setShowConfirmModal(true)
        setIsGenerating(false)
        return
      }

      await executeGeneration()
    } catch (error) {
      console.error('Erro na verificação:', error)
      alert('Erro ao verificar folhas existentes.')
      setIsGenerating(false)
    }
  }

  const executeGeneration = async () => {
    if (!currentUser) return
    setIsGenerating(true)
    setShowConfirmModal(false)
    try {
      const batch = writeBatch(db)
      const clientesToProcess = clientes.filter((c) => selectedClientes.has(c.id))

      clientesToProcess.forEach((client) => {
        const ref = doc(collection(db, 'pro_labores'))
        batch.set(ref, {
          clienteId: client.id,
          nomeFantasia: client.nomeFantasia,
          razaoSocial: client.razaoSocial || client.nomeFantasia, // Adicionado razaoSocial
          cnpj: client.cnpj,
          endereco: client.enderecoCompleto || '', // Corrigido para enderecoCompleto
          mesAno: currentMonth,
          salarioMinimo: base,
          inssPerc: inss,
          valorInss: calcInss,
          valorLiquido: liquido,
          userId: currentUser.uid,
          geradoEm: Timestamp.now()
        })
      })

      await batch.commit()
      setSuccess(true)
      setToastCount(clientesToProcess.length)
      setShowToast(true)
      setTimeout(() => {
        setSuccess(false)
        setShowToast(false)
      }, 4000)
    } catch (error) {
      console.error('Erro na geração em lote:', error)
      alert('Erro ao processar as folhas.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl shadow-sm border border-slate-100 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 group flex items-center gap-2">
            <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Settings className="w-5 h-5" />
            </div>
            Geração de Pró-Labores
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Configure os valores e selecione os clientes para a competência atual
          </p>
        </div>
        <MonthPicker value={currentMonth} onChange={setCurrentMonth} accent="blue" />
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Coluna Esquerda: Configurações (Span 4) */}
        <div className="lg:col-span-4 flex flex-col gap-4 h-full">
          {/* Card de Parâmetros */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 relative overflow-hidden shrink-0">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Calculator className="w-24 h-24" />
            </div>

            <h2 className="text-base font-bold text-slate-800 mb-4 relative z-10 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-blue-500" />
              Parâmetros Base
            </h2>

            <div className="space-y-4 relative z-10">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Salário Base (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="preencha aqui"
                  {...register('salarioMinimo')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-base font-mono outline-none transition"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="temInss"
                  {...register('temInss')}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label
                  htmlFor="temInss"
                  className="text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Aplicar desconto de INSS
                </label>
              </div>

              {temInss && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Alíquota INSS (%)
                  </label>
                  <input
                    type="number"
                    placeholder="preencha aqui"
                    {...register('inssPerc')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-base font-mono outline-none transition"
                  />
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
                <div className="bg-rose-50 p-2.5 rounded-lg border border-rose-100">
                  <p className="text-[10px] font-medium text-rose-600 mb-0.5">Desconto INSS</p>
                  <h3 className="text-base font-bold text-rose-700 font-mono">
                    R$ {calcInss.toFixed(2)}
                  </h3>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-100">
                  <p className="text-[10px] font-medium text-emerald-600 mb-0.5">Valor Líquido</p>
                  <h3 className="text-base font-bold text-emerald-700 font-mono">
                    R$ {liquido.toFixed(2)}
                  </h3>
                </div>
              </div>
            </div>
          </div>

          {/* Card de Ação */}
          <div className="bg-slate-900 rounded-2xl p-5 text-center relative overflow-hidden shadow-lg flex-1 flex flex-col justify-center">
            <div className="relative z-10 space-y-4">
              <div className="mx-auto w-12 h-12 bg-blue-600/20 backdrop-blur-md rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                <PlayCircle className="w-6 h-6 text-blue-400" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-white tracking-tight mb-1">Processar Lote</h2>
                <p className="text-xs text-slate-400 font-medium px-2">
                  Gerar pró-labore para{' '}
                  <strong className="text-white">{selectedClientes.size}</strong> clientes.
                </p>
              </div>

              <button
                onClick={handleGenerateValues}
                disabled={isGenerating || success || !canGenerate}
                className={cn(
                  'w-full py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all duration-300 flex items-center justify-center gap-2',
                  success
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 hover:-translate-y-0.5',
                  'cursor-pointer disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed'
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processando...
                  </>
                ) : success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Concluído!
                  </>
                ) : (
                  'Gerar Selecionados'
                )}
              </button>

              {selectedClientes.size === 0 && (
                <div className="flex items-center justify-center gap-1 text-[10px] text-amber-400 mt-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>Selecione ao menos um cliente</span>
                </div>
              )}
              {!canGenerate && selectedClientes.size > 0 && (
                <div className="flex items-center justify-center gap-1 text-[10px] text-amber-400 mt-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>Informe o salário base {temInss ? 'e alíquota INSS' : ''}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Coluna Direita: Lista de Clientes (Span 8) */}
        <div className="lg:col-span-8 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">
          {/* Header da Lista */}
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <h2 className="text-base font-bold text-slate-800">Seleção de Clientes</h2>
              <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full ml-1">
                {selectedClientes.size} / {filteredClientes.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar cliente ou CNPJ..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-56 transition-shadow"
                />
              </div>
            </div>
          </div>

          {/* Tabela/Lista com Scroll */}
          <div className="flex-1 overflow-auto p-1">
            {isLoadingClientes ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                <p className="text-sm">Carregando clientes ativos...</p>
              </div>
            ) : filteredClientes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                <Users className="w-10 h-10 opacity-20" />
                <p className="text-sm">Nenhum cliente encontrado.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white/90 backdrop-blur-sm z-10 shadow-sm">
                  <tr className="text-slate-500 font-medium border-b border-slate-100">
                    <th className="p-2 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          selectedClientes.size === filteredClientes.length &&
                          filteredClientes.length > 0
                        }
                        onChange={handleSelectAll}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-2">Nome Fantasia</th>
                    <th className="p-2">CNPJ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredClientes.map((cliente) => (
                    <tr
                      key={cliente.id}
                      onClick={() => toggleCliente(cliente.id)}
                      className={cn(
                        'group cursor-pointer transition-colors hover:bg-slate-50',
                        selectedClientes.has(cliente.id) ? 'bg-blue-50/30' : ''
                      )}
                    >
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedClientes.has(cliente.id)}
                          onChange={() => toggleCliente(cliente.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-2 font-medium text-slate-700 group-hover:text-blue-700 transition-colors">
                        {cliente.nomeFantasia}
                      </td>
                      <td className="p-2 text-slate-500 font-mono text-[10px]">{cliente.cnpj}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Confirmação */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600 mb-4">
              <div className="bg-amber-100 p-2 rounded-full">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Atenção</h3>
            </div>
            <p className="text-slate-600 mb-6">
              <strong className="text-slate-900">{existingCount}</strong> dos clientes selecionados
              já possuem pró-labore gerado para{' '}
              <strong className="text-slate-900">{currentMonth}</strong>. Deseja gerar novamente e
              sobrescrever os registros existentes?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={executeGeneration}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors shadow-sm shadow-amber-200"
              >
                Sim, sobrescrever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de sucesso */}
      {showToast && (
        <div className="fixed top-5 right-5 z-100 flex items-center gap-2.5 bg-emerald-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg shadow-emerald-500/30 pointer-events-none animate-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {toastCount} pró-labore{toastCount !== 1 ? 's' : ''} gerado{toastCount !== 1 ? 's' : ''}{' '}
          com sucesso!
        </div>
      )}
    </div>
  )
}
