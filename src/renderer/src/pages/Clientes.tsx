import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, Edit2, Trash2, Building2 } from 'lucide-react'
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  Timestamp,
  updateDoc
} from 'firebase/firestore'
import { db } from '../services/firebaseConfig'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/useAuth'
import { formatCnpj, snapshotTo } from '../lib/utils'
import { useOutsideClick } from '../hooks/useOutsideClick'
import { type Cliente, type CnpjApiResult } from '../types'

interface FormValues {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string
  telefone: string
  email: string
  atividadePrincipal: string
  optanteSimples: boolean
  enderecoCompleto: string
  dataAbertura: string
  situacaoCadastral: string
  naturezaJuridica: string
  status: 'Ativo' | 'Pendente' | 'Inativo'
}

export function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false)
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cliente: Cliente } | null>(
    null
  )
  const [confirmDelete, setConfirmDelete] = useState<Cliente | null>(null)
  const { currentUser } = useAuth()

  const { register, handleSubmit, setValue, getValues, reset } = useForm<FormValues>({
    defaultValues: { status: 'Ativo' }
  })

  const fetchClientes = useCallback(async () => {
    if (!currentUser) return
    try {
      const q = query(collection(db, 'clientes'), where('userId', '==', currentUser.uid))
      const querySnapshot = await getDocs(q)
      let data = snapshotTo<Cliente>(querySnapshot)
      // Ordena em memória para evitar a necessidade de criar um Índice Composto no Firebase só para testar
      data = data.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
      setClientes(data)
    } catch (error) {
      console.error('Erro ao buscar clientes:', error)
    }
  }, [currentUser])

  useEffect(() => {
    fetchClientes()
  }, [fetchClientes])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  useOutsideClick(closeContextMenu)

  const handleFetchCnpj = async () => {
    const cnpj = getValues('cnpj')
    if (!cnpj || cnpj.length < 14) return

    setIsFetchingCnpj(true)
    try {
      const result = await window.api.fetchCnpj(cnpj)
      if (result.success && result.data) {
        const d = result.data as CnpjApiResult
        setValue('razaoSocial', d.company?.name || '')
        setValue('nomeFantasia', d.alias || d.company?.name || '')
        if (d.phones && d.phones.length > 0) {
          setValue('telefone', `${d.phones[0].area} ${d.phones[0].number}`)
        }
        if (d.emails && d.emails.length > 0) {
          setValue('email', d.emails[0].address)
        }
        if (d.mainActivity) {
          setValue('atividadePrincipal', `${d.mainActivity.id} - ${d.mainActivity.text}`)
        }
        // marca se api indicar diretamente
        let optant = d.simples?.optant || false
        // fallback: MEI ou natureza jurídica de empresário individual
        if (!optant) {
          const isMei = d.company?.size?.acronym === 'ME'
          const isIndividual = d.company?.nature?.id === 2135
          if (isMei || isIndividual) {
            optant = true
          }
        }
        setValue('optanteSimples', optant)

        if (d.address) {
          setValue(
            'enderecoCompleto',
            `${d.address.street}, ${d.address.number}${d.address.details ? ' - ' + d.address.details : ''}, ${d.address.district}, ${d.address.city} - ${d.address.state}, ${d.address.zip}`
          )
        }
        if (d.founded) {
          setValue('dataAbertura', new Date(d.founded).toLocaleDateString('pt-BR'))
        }
        setValue('situacaoCadastral', d.status?.text || '')
        setValue('naturezaJuridica', d.company?.nature?.text || '')
      } else {
        alert(result.error || 'Erro ao buscar CNPJ.')
      }
    } catch (e) {
      console.error(e)
      alert('Falha na comunicação.')
    } finally {
      setIsFetchingCnpj(false)
    }
  }

  const onSubmit = async (data: FormValues) => {
    if (!currentUser) return
    try {
      const payload = { ...data, cnpj: formatCnpj(data.cnpj) }
      if (editingCliente) {
        await updateDoc(doc(db, 'clientes', editingCliente.id), {
          ...payload,
          userId: currentUser.uid
        })
      } else {
        await addDoc(collection(db, 'clientes'), {
          ...payload,
          userId: currentUser.uid,
          createdAt: Timestamp.now()
        })
      }
      handleCloseModal()
      fetchClientes()
    } catch (error) {
      console.error('Erro ao salvar cliente:', error)
      alert('Erro ao salvar cliente.')
    }
  }

  const handleEdit = (cliente: Cliente) => {
    setEditingCliente(cliente)
    reset({
      cnpj: cliente.cnpj,
      razaoSocial: cliente.razaoSocial,
      nomeFantasia: cliente.nomeFantasia,
      telefone: cliente.telefone,
      email: cliente.email || '',
      atividadePrincipal: cliente.atividadePrincipal || '',
      optanteSimples: cliente.optanteSimples || false,
      enderecoCompleto: cliente.enderecoCompleto || '',
      dataAbertura: cliente.dataAbertura || '',
      situacaoCadastral: cliente.situacaoCadastral || '',
      naturezaJuridica: cliente.naturezaJuridica || '',
      status: cliente.status
    })
    setIsModalOpen(true)
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteDoc(doc(db, 'clientes', confirmDelete.id))
      setConfirmDelete(null)
      fetchClientes()
    } catch (e) {
      console.error(e)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingCliente(null)
    reset({
      cnpj: '',
      razaoSocial: '',
      nomeFantasia: '',
      telefone: '',
      email: '',
      atividadePrincipal: '',
      optanteSimples: false,
      enderecoCompleto: '',
      dataAbertura: '',
      situacaoCadastral: '',
      naturezaJuridica: '',
      status: 'Ativo'
    })
  }

  const handleCopy = async (value: string | undefined, label: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopyToast(`${label} copiado!`)
      setTimeout(() => setCopyToast(null), 1800)
    } catch (error) {
      console.error(`Erro ao copiar ${label}:`, error)
      alert(`Não foi possível copiar ${label}.`)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 group flex items-center gap-3">
            <div className="bg-blue-100 text-blue-600 p-2 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Building2 className="w-6 h-6" />
            </div>
            Clientes MEI
          </h1>
          <p className="text-slate-500 mt-1">Gerencie a carteira de microempreendedores</p>
        </div>
        <button
          onClick={() => {
            setEditingCliente(null)
            reset({
              cnpj: '',
              razaoSocial: '',
              nomeFantasia: '',
              telefone: '',
              email: '',
              atividadePrincipal: '',
              optanteSimples: false,
              enderecoCompleto: '',
              dataAbertura: '',
              situacaoCadastral: '',
              naturezaJuridica: '',
              status: 'Ativo'
            })
            setIsModalOpen(true)
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          Novo Cliente (Busca por CNPJ)
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Empresa / Razão Social</th>
                <th className="px-6 py-4">CNPJ</th>
                <th className="px-6 py-4">Sistema / Receita</th>
                <th className="px-6 py-4">Contato</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clientes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    Nenhum cliente cadastrado. Clique em &ldquo;Novo Cliente&rdquo; para começar.
                  </td>
                </tr>
              ) : null}
              {clientes.map((cliente) => (
                <tr
                  key={cliente.id}
                  className="hover:bg-slate-50/80 transition-colors group select-none"
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, cliente })
                  }}
                >
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">{cliente.nomeFantasia}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{cliente.razaoSocial}</div>
                  </td>
                  <td className="px-6 py-4 font-medium">
                    <button
                      type="button"
                      onClick={() => handleCopy(cliente.cnpj, 'CNPJ')}
                      className="cursor-pointer hover:text-blue-600 hover:underline"
                      title="Clique para copiar o CNPJ"
                    >
                      {cliente.cnpj}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1 items-start">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${
                          cliente.status === 'Ativo'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : cliente.status === 'Pendente'
                              ? 'bg-amber-50 text-amber-600 border-amber-200'
                              : 'bg-rose-50 text-rose-600 border-rose-200'
                        }`}
                      >
                        SISTEMA: {cliente.status}
                      </span>
                      {cliente.optanteSimples && (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border bg-blue-50 text-blue-600 border-blue-200">
                          SIMPLES NACIONAL
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-800">
                      {cliente.telefone ? (
                        <button
                          type="button"
                          onClick={() => handleCopy(cliente.telefone, 'Telefone')}
                          className="cursor-pointer hover:text-blue-600 hover:underline"
                          title="Clique para copiar o telefone"
                        >
                          {cliente.telefone}
                        </button>
                      ) : (
                        'S/ telefone'
                      )}
                    </div>
                    {cliente.email && (
                      <button
                        type="button"
                        onClick={() => handleCopy(cliente.email, 'E-mail')}
                        className="text-xs text-slate-500 mt-0.5 cursor-pointer hover:text-blue-600 hover:underline"
                        title="Clique para copiar o e-mail"
                      >
                        {cliente.email}
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEdit(cliente)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title="Editar Cliente"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(cliente)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Excluir Cliente"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">
                {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 p-2 bg-slate-100 rounded-full cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="p-8 space-y-6 max-h-[80vh] overflow-y-auto"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Primeira Linha */}
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Busca Automática (CNPJ)
                  </label>
                  <div className="flex gap-2">
                    <input
                      {...register('cnpj', { required: true })}
                      placeholder="00.000.000/0000-00"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={handleFetchCnpj}
                      disabled={isFetchingCnpj}
                      className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl transition flex items-center justify-center disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isFetchingCnpj ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Search className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Status Sistema
                  </label>
                  <select
                    {...register('status')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                  >
                    <option value="Ativo">🟢 Ativo</option>
                    <option value="Pendente">🟡 Pendente</option>
                    <option value="Inativo">🔴 Inativo</option>
                  </select>
                </div>

                <div className="col-span-1 md:col-span-3 border-t border-slate-100 mt-2 mb-1"></div>

                {/* Identificação */}
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Razão Social
                  </label>
                  <input
                    {...register('razaoSocial', { required: true })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                  />
                </div>
                <div className="col-span-1 md:col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Data Abertura
                  </label>
                  <input
                    {...register('dataAbertura')}
                    placeholder="DD/MM/AAAA"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                  />
                </div>

                <div className="col-span-1 md:col-span-3">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Nome Fantasia
                  </label>
                  <input
                    {...register('nomeFantasia')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                  />
                </div>

                {/* Classificação */}
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Atividade Principal
                  </label>
                  <input
                    {...register('atividadePrincipal')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-300 outline-none transition"
                  />
                </div>
                <div className="col-span-1 flex items-end">
                  <label className="flex items-center gap-3 cursor-pointer py-3">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        {...register('optanteSimples')}
                        className="peer sr-only"
                      />
                      <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                    </div>
                    <span className="text-sm font-medium text-slate-700">Optante Simples</span>
                  </label>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Natureza Jurídica
                  </label>
                  <input
                    {...register('naturezaJuridica')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-300 outline-none transition"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Situação Cadastral
                  </label>
                  <input
                    {...register('situacaoCadastral')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-300 outline-none transition"
                  />
                </div>

                {/* Contato */}
                <div className="col-span-1 md:col-span-3 border-t border-slate-100 mt-2 mb-1"></div>

                <div className="col-span-1 md:col-span-3">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Endereço Completo
                  </label>
                  <input
                    {...register('enderecoCompleto')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                  />
                </div>

                <div className="col-span-1 md:col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Telefone
                  </label>
                  <input
                    {...register('telefone')}
                    placeholder="(99) 99999-9999"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                  />
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    E-mail de Contato
                  </label>
                  <input
                    type="email"
                    {...register('email')}
                    placeholder="contato@empresa.com"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                  />
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-6 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Building2 className="w-4 h-4" />
                  {editingCliente ? 'Atualizar Cliente' : 'Salvar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-60 bg-white rounded-xl shadow-xl border border-slate-100 py-1 min-w-40 animate-in zoom-in-95 duration-150"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              handleEdit(contextMenu.cliente)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Edit2 className="w-4 h-4 text-slate-400" /> Editar cliente
          </button>
          <div className="h-px bg-slate-100 mx-2" />
          <button
            onClick={() => {
              setConfirmDelete(contextMenu.cliente)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" /> Excluir cliente
          </button>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-rose-50 rounded-xl text-rose-600">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-800">Excluir cliente?</h3>
            </div>
            <p className="text-sm text-slate-500 ml-13">
              &ldquo;
              <span className="font-medium text-slate-700">{confirmDelete.nomeFantasia}</span>
              &rdquo; será removido permanentemente.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm shadow-rose-500/30 transition cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {copyToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {copyToast}
        </div>
      )}
    </div>
  )
}
