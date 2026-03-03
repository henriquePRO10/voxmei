import { useState, useRef, useEffect } from 'react'
import {
  Bell,
  UserCircle,
  LogOut,
  Settings,
  Upload,
  X,
  Check,
  AlertTriangle,
  UserX,
  FileX2,
  CheckCircle2,
  RefreshCw,
  Download,
  ArrowUpCircle
} from 'lucide-react'
import { useAuth } from '../contexts/useAuth'
import { db, storage } from '../services/firebaseConfig'
import { collection, query, where, getDocs, setDoc, doc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useNotificacoes, type TipoNotificacao } from '../hooks/useNotificacoes'
import { useAppUpdate } from '../hooks/useAppUpdate'

interface ContadorPerfil {
  id?: string
  userId: string
  nomeCompleto: string
  crc: string
  assinaturaUrl: string
}

function formatNomeBotao(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length === 0 || !partes[0]) return nome
  const primeiro = partes[0]
  const segundo = partes[1] ? `${partes[1][0].toUpperCase()}.` : ''
  return segundo ? `${primeiro} ${segundo}` : primeiro
}

export function Header() {
  const { logout, currentUser } = useAuth()
  const [showConfirm, setShowConfirm] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showPerfil, setShowPerfil] = useState(false)
  const [perfilDocId, setPerfilDocId] = useState<string | null>(null)
  const [nomeCompleto, setNomeCompleto] = useState('')
  const [crc, setCrc] = useState('')
  const [assinaturaUrl, setAssinaturaUrl] = useState('')
  const [assinaturaPreview, setAssinaturaPreview] = useState<string | null>(null)
  const [assinaturaFile, setAssinaturaFile] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [salvouOk, setSalvouOk] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [perfilNome, setPerfilNome] = useState('')
  const [perfilData, setPerfilData] = useState<ContadorPerfil | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notifPanelRef = useRef<HTMLDivElement>(null)

  const [showNotificacoes, setShowNotificacoes] = useState(false)
  const { notificacoes, total, loading, refresh } = useNotificacoes(currentUser?.uid)
  const { updateAvailable, updateDownloaded, version, installUpdate } = useAppUpdate()
  const [showUpdateModal, setShowUpdateModal] = useState(false)

  // Fecha painel de notificações ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node)) {
        setShowNotificacoes(false)
      }
    }
    if (showNotificacoes) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNotificacoes])

  // Carrega o nome do perfil ao montar para exibir no botão
  useEffect(() => {
    if (!currentUser) return
    const loadNome = async () => {
      const q = query(collection(db, 'contador_perfil'), where('userId', '==', currentUser.uid))
      const snap = await getDocs(q)
      if (!snap.empty) {
        const data = snap.docs[0].data() as ContadorPerfil
        setPerfilData(data)
        setPerfilDocId(snap.docs[0].id)
        if (data.nomeCompleto) setPerfilNome(data.nomeCompleto)
      }
    }
    loadNome()
  }, [currentUser])

  // Fecha o menu ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

  const handleOpenPerfil = async () => {
    setShowUserMenu(false)
    if (!currentUser) return

    if (perfilData) {
      setNomeCompleto(perfilData.nomeCompleto || '')
      setCrc(perfilData.crc || '')
      setAssinaturaUrl(perfilData.assinaturaUrl || '')
      setAssinaturaPreview(perfilData.assinaturaUrl || null)
    } else {
      setPerfilDocId(null)
      setNomeCompleto('')
      setCrc('')
      setAssinaturaUrl('')
      setAssinaturaPreview(null)
    }
    setAssinaturaFile(null)
    setSalvouOk(false)
    setShowPerfil(true)
  }

  const handleAssinaturaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAssinaturaFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setAssinaturaPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSalvarPerfil = async () => {
    if (!currentUser) return
    setSalvando(true)
    try {
      let urlFinal = assinaturaUrl
      if (assinaturaFile) {
        const ext = assinaturaFile.name.split('.').pop()?.toLowerCase() || 'png'
        const storageRef = ref(storage, `assinaturas/${currentUser.uid}/assinatura.${ext}`)
        await uploadBytes(storageRef, assinaturaFile)
        urlFinal = await getDownloadURL(storageRef)
      }
      const docId = perfilDocId || currentUser.uid
      await setDoc(doc(db, 'contador_perfil', docId), {
        userId: currentUser.uid,
        nomeCompleto,
        crc,
        assinaturaUrl: urlFinal
      })
      setAssinaturaUrl(urlFinal)
      setPerfilDocId(docId)
      setPerfilNome(nomeCompleto)
      setSalvouOk(true)
      setTimeout(() => setSalvouOk(false), 2500)
      // Toast de confirmação — fecha automaticamente após 500 ms
      setShowToast(true)
      setTimeout(() => setShowToast(false), 500)
    } catch (err) {
      console.error('Erro ao salvar perfil:', err)
    } finally {
      setSalvando(false)
    }
  }

  const handleLogoutConfirmed = async () => {
    setShowConfirm(false)
    try {
      await logout()
    } catch (error) {
      console.error('Falha ao deslogar', error)
    }
  }

  return (
    <>
      <header className="h-16 w-full bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm relative z-10 transition-all">
        <div className="flex items-center">
          <h1 className="text-xl font-semibold text-slate-800">Olá, Contador! 👋</h1>
        </div>
        <div className="flex items-center gap-4 text-slate-500">
          {/* Botão de notificações */}
          <div className="relative" ref={notifPanelRef}>
            <button
              onClick={() => {
                setShowNotificacoes((v) => !v)
                if (!showNotificacoes) refresh()
              }}
              className="p-2 hover:bg-slate-100 rounded-full transition relative cursor-pointer"
            >
              <Bell className="w-5 h-5" />
              {total > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full border border-white flex items-center justify-center px-0.5">
                  {total > 99 ? '99+' : total}
                </span>
              )}
            </button>

            {showNotificacoes && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden">
                {/* Cabeçalho do painel */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-700">Notificações</span>
                    {total > 0 && (
                      <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {total}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={refresh}
                    disabled={loading}
                    className="p-1 hover:bg-slate-200 rounded-lg transition cursor-pointer disabled:opacity-40"
                    title="Atualizar"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* Corpo */}
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                  {loading ? (
                    // Skeleton
                    <div className="p-4 space-y-3">
                      {[1, 2].map((i) => (
                        <div key={i} className="flex items-start gap-3 animate-pulse">
                          <div className="w-8 h-8 bg-slate-100 rounded-xl shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 bg-slate-100 rounded w-3/4" />
                            <div className="h-3 bg-slate-100 rounded w-full" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : notificacoes.length === 0 ? (
                    // Estado vazio
                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400">
                      <CheckCircle2 className="w-9 h-9 text-emerald-400" />
                      <p className="text-sm font-medium text-slate-500">Tudo em dia!</p>
                      <p className="text-xs text-slate-400">Nenhum alerta no momento.</p>
                    </div>
                  ) : (
                    notificacoes.map((n) => {
                      const iconMap: Record<TipoNotificacao, { icon: React.ReactNode; cls: string }> = {
                        'sem-lancamento': {
                          icon: <AlertTriangle className="w-4 h-4" />,
                          cls: 'bg-amber-50 text-amber-500'
                        },
                        pendente: {
                          icon: <UserX className="w-4 h-4" />,
                          cls: 'bg-orange-50 text-orange-500'
                        },
                        'pro-labore': {
                          icon: <FileX2 className="w-4 h-4" />,
                          cls: 'bg-rose-50 text-rose-500'
                        }
                      }
                      const { icon, cls } = iconMap[n.tipo]
                      return (
                        <div key={n.id} className="flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 transition">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
                            {icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 leading-tight">{n.titulo}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{n.descricao}</p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tag de atualização disponível */}
          {updateAvailable && !updateDownloaded && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-600 text-xs font-semibold rounded-full cursor-default select-none">
              <Download className="w-3.5 h-3.5 animate-pulse" />
              Baixando atualização…
            </div>
          )}
          {updateDownloaded && (
            <button
              onClick={() => setShowUpdateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-full transition cursor-pointer"
              title="Clique para instalar a atualização"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              {version ? `v${version} disponível` : 'Atualização disponível'}
            </button>
          )}

          <div className="h-8 w-px bg-slate-200" />

          {/* Botão de usuário com dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-2 hover:bg-slate-100 py-1.5 px-3 rounded-lg transition cursor-pointer"
            >
              <UserCircle className="w-6 h-6 text-slate-600" />
              <span className="text-sm font-medium text-slate-700 hidden md:block">
                {perfilNome
                  ? formatNomeBotao(perfilNome)
                  : currentUser?.email?.split('@')[0] || 'Contador'}
              </span>
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50">
                <button
                  onClick={handleOpenPerfil}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  Configurações de Perfil
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            title="Sair do sistema"
            className="p-2 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition ml-2 cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Modal de confirmação de atualização */}
      {showUpdateModal && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowUpdateModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                <ArrowUpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 text-base">Atualização disponível</h3>
                <p className="text-sm text-slate-500">
                  {version ? `Versão ${version} pronta para instalar.` : 'Nova versão pronta para instalar.'}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-3 leading-relaxed">
              O aplicativo será <span className="font-medium text-slate-700">reiniciado automaticamente</span> para aplicar a atualização. Salve qualquer trabalho antes de continuar.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowUpdateModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowUpdateModal(false)
                  installUpdate()
                }}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm shadow-emerald-500/30 transition cursor-pointer"
              >
                <ArrowUpCircle className="w-4 h-4" />
                Reiniciar e instalar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de logout */}
      {showConfirm && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-rose-50 rounded-xl text-rose-600">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 text-base">Sair do sistema</h3>
                <p className="text-sm text-slate-500">Você será redirecionado para o login.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleLogoutConfirmed}
                className="px-5 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm shadow-rose-500/30 transition cursor-pointer"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configurações de Perfil */}
      {showPerfil && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowPerfil(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-base">
                    Configurações de Perfil
                  </h3>
                  <p className="text-xs text-slate-500">Dados do contador para os relatórios</p>
                </div>
              </div>
              <button
                onClick={() => setShowPerfil(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(e.target.value)}
                  placeholder=""
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">CRC</label>
                <input
                  type="text"
                  value={crc}
                  onChange={(e) => setCrc(e.target.value)}
                  placeholder="CRC/MT nº: 00000/00"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Assinatura (imagem)
                </label>
                <div
                  className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {assinaturaPreview ? (
                    <img
                      src={assinaturaPreview}
                      alt="assinatura"
                      className="max-h-24 object-contain rounded"
                    />
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-300" />
                      <p className="text-xs text-slate-400 text-center">
                        Clique para selecionar uma imagem
                        <br />
                        (PNG, JPG recomendado)
                      </p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAssinaturaChange}
                />
                {assinaturaPreview && (
                  <button
                    onClick={() => {
                      setAssinaturaPreview(null)
                      setAssinaturaFile(null)
                    }}
                    className="mt-1.5 text-xs text-rose-500 hover:text-rose-700 transition cursor-pointer"
                  >
                    Remover imagem
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowPerfil(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarPerfil}
                disabled={salvando}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl shadow-sm shadow-blue-500/30 transition cursor-pointer"
              >
                {salvando ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : salvouOk ? (
                  <Check className="w-4 h-4" />
                ) : null}
                {salvouOk ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de confirmação — aparece no canto superior direito e some em 500 ms */}
      {showToast && (
        <div className="fixed top-5 right-5 z-100 flex items-center gap-2.5 bg-emerald-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg shadow-emerald-500/30 pointer-events-none">
          <Check className="w-4 h-4 shrink-0" />
          Alterações salvas
        </div>
      )}
    </>
  )
}
