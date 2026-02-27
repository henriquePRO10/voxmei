import { useState, useEffect } from 'react'
import { LogIn, Lock, Mail, Loader2, Check, X, UserPlus } from 'lucide-react'
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  createUserWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import { auth } from '../services/firebaseConfig'
import { useForm } from 'react-hook-form'
import iconLogo from '../../../../resources/icon.png'

interface LoginForm {
  email: string
  pass: string
  rememberMe: boolean
}

export function Login() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion)
  }, [])

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSuccess, setResetSuccess] = useState<boolean | null>(null)

  // Register states
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regConfirmPass, setRegConfirmPass] = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [regErrorMsg, setRegErrorMsg] = useState('')
  const [regSuccess, setRegSuccess] = useState(false)

  const { register, handleSubmit } = useForm<LoginForm>()

  const switchTab = (tab: 'login' | 'register') => {
    setActiveTab(tab)
    // Clear login states
    setErrorMsg('')
    setShowReset(false)
    setResetEmail('')
    setResetMsg('')
    setResetSuccess(null)
    // Clear register states
    setRegEmail('')
    setRegPass('')
    setRegConfirmPass('')
    setRegErrorMsg('')
    setRegSuccess(false)
  }

  // Password validation
  const passLengthValid = regPass.length >= 8 && regPass.length <= 40
  const passUpperValid = /[A-Z]/.test(regPass)
  const passLowerValid = /[a-z]/.test(regPass)
  const passNumberValid = /[0-9]/.test(regPass)
  const passSpecialValid = /[^A-Za-z0-9]/.test(regPass)
  const isPassValid = passLengthValid && passUpperValid && passLowerValid && passNumberValid && passSpecialValid

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegErrorMsg('')

    if (regPass !== regConfirmPass) {
      setRegErrorMsg('As senhas não coincidem.')
      return
    }

    if (!isPassValid) {
      setRegErrorMsg('A senha não atende a todos os requisitos.')
      return
    }

    setRegLoading(true)
    try {
      await createUserWithEmailAndPassword(auth, regEmail, regPass)
      setRegSuccess(true)
    } catch (error: unknown) {
      const code = error instanceof FirebaseError ? error.code : ''
      if (code === 'auth/email-already-in-use') {
        setRegErrorMsg('Este e-mail já está em uso.')
      } else if (code === 'auth/invalid-email') {
        setRegErrorMsg('E-mail inválido.')
      } else if (code === 'auth/weak-password') {
        setRegErrorMsg('A senha é muito fraca.')
      } else {
        setRegErrorMsg('Erro ao criar conta. Tente novamente.')
      }
    } finally {
      setRegLoading(false)
    }
  }

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    setErrorMsg('')
    try {
      // Define a persistência com base no checkbox
      const persistenceType = data.rememberMe ? browserLocalPersistence : browserSessionPersistence
      await setPersistence(auth, persistenceType)

      await signInWithEmailAndPassword(auth, data.email, data.pass)
      // O listener do AuthContext capturará e navegará via regras de rotas Privadas
    } catch (error: unknown) {
      const code = error instanceof FirebaseError ? error.code : ''
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password'
      ) {
        setErrorMsg('E-mail ou senha incorretos.')
      } else {
        setErrorMsg('Erro de conexão ou sistema. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="flex justify-center flex-col items-center">
          <div className="mb-6">
            <img src={iconLogo} alt="VoxCount Logo" className="w-20 h-20 object-contain drop-shadow-lg" />
          </div>
          <h2 className="text-center text-3xl font-extrabold tracking-tight">
            <span className="text-blue-600">Vox</span><span className="text-orange-500">Count</span>
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500 font-medium">
            Gerenciamento Premium para MEIs
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-150 relative z-10">
        <div className="bg-white py-10 px-8 sm:rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-orange-200 transition-colors">
          
          {/* Tabs */}
          <div className="flex border-b border-slate-200 mb-6">
            <button
              className={`flex-1 py-2 text-center font-medium text-sm cursor-pointer transition-colors ${activeTab === 'login' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => switchTab('login')}
            >
              Entrar
            </button>
            <button
              className={`flex-1 py-2 text-center font-medium text-sm cursor-pointer transition-colors ${activeTab === 'register' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => switchTab('register')}
            >
              Criar conta
            </button>
          </div>

          {activeTab === 'login' ? (
            <>
              <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
                {errorMsg && (
                  <div className="bg-rose-50 text-rose-600 p-3 rounded-lg text-sm text-center font-medium border border-rose-100">
                    {errorMsg}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    E-mail Profissional
                  </label>
                  <div className="mt-1 relative rounded-xl shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="email"
                      {...register('email', { required: true })}
                      className="w-full pl-10 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow text-slate-900"
                      placeholder="contador@voxcount.com.br"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Senha Segura</label>
                  <div className="mt-1 relative rounded-xl shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="password"
                      {...register('pass', { required: true })}
                      className="w-full pl-10 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow text-slate-900"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      id="remember-me"
                      type="checkbox"
                      {...register('rememberMe')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-500">
                      Lembrar acesso
                    </label>
                  </div>

                  <div className="text-sm">
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setShowReset(true)
                        setResetMsg('')
                        setResetEmail('')
                        setResetSuccess(null)
                      }}
                      className="font-medium text-blue-600 hover:text-blue-500 transition-colors cursor-pointer"
                    >
                      Esqueceu a senha?
                    </a>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-lg shadow-blue-500/30 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0 cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-5 h-5" /> Entrar no Painel
                    </>
                  )}
                </button>
              </form>

              {showReset && (
                <div className="mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-800 mb-2">
                    Redefinir senha
                  </h3>
                  {resetMsg && (
                    <div className={`mb-2 text-sm ${resetSuccess ? 'text-green-600' : 'text-red-600'}`}>                
                      {resetMsg}
                    </div>
                  )}
                  {resetSuccess === true && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => setShowReset(false)}
                        className="mt-2 px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 cursor-pointer"
                      >
                        OK
                      </button>
                    </div>
                  )}
                  {resetSuccess !== true && (
                    <div className="space-y-3">
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="seu e-mail"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setShowReset(false)
                          }}
                          className="px-3 py-2 text-sm text-gray-600 hover:underline cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={async () => {
                          
                            const normalizedEmail = resetEmail.trim()

                            if (!normalizedEmail) {
                              setResetMsg('Informe o e-mail.')
                              setResetSuccess(false)
                              return
                            }

                            // checar formato básico de e-mail
                            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                            if (!emailRegex.test(normalizedEmail)) {
                              setResetMsg('E-mail inválido. Confira o formato.')
                              setResetSuccess(false)
                              return
                            }

                            setResetLoading(true)
                            try {
                              const signInMethods = await fetchSignInMethodsForEmail(auth, normalizedEmail)
                              if (signInMethods.length === 0) {
                                setResetMsg('Não encontramos uma conta com este e-mail.')
                                setResetSuccess(false)
                                return
                              }

                              await sendPasswordResetEmail(auth, normalizedEmail)
                              setResetMsg('Link enviado. Verifique sua caixa de entrada. Consulte também seu SPAM.')
                              setResetSuccess(true)
                            } catch (err: unknown) {
                              setResetMsg('Falha ao enviar. Confira o e-mail e tente novamente.')
                              setResetSuccess(false)
                            } finally {
                              setResetLoading(false)
                            }
                          }}
                          disabled={resetLoading}
                          className="px-3 py-2 bg-blue-600 text-white rounded-md disabled:opacity-60"
                        >
                          {resetLoading ? 'Enviando...' : 'Enviar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="animate-in fade-in duration-500">
              {regSuccess ? (
                <div className="text-center py-6">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                    <Check className="h-6 w-6 text-green-600" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">Conta criada com sucesso!</h3>
                  <p className="text-sm text-slate-500 mb-6">
                    Sua conta foi registrada. Agora você pode fazer login.
                  </p>
                  <button
                    onClick={() => switchTab('login')}
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-lg shadow-blue-500/30 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all cursor-pointer"
                  >
                    Ir para o Login
                  </button>
                </div>
              ) : (
                <form className="space-y-5" onSubmit={handleRegister}>
                  {regErrorMsg && (
                    <div className="bg-rose-50 text-rose-600 p-3 rounded-lg text-sm text-center font-medium border border-rose-100">
                      {regErrorMsg}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      E-mail
                    </label>
                    <div className="mt-1 relative rounded-xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="w-full pl-10 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow text-slate-900"
                        placeholder="seu@email.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Senha</label>
                    <div className="mt-1 relative rounded-xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type="password"
                        required
                        value={regPass}
                        onChange={(e) => setRegPass(e.target.value)}
                        className="w-full pl-10 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow text-slate-900"
                        placeholder="••••••••"
                      />
                    </div>
                    
                    {/* Password Rules Indicators */}
                    <div className="mt-3 text-xs space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div className={`flex items-center gap-2 ${passLengthValid ? 'text-green-600' : 'text-slate-500'}`}>
                        {passLengthValid ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5 text-rose-400" />} 
                        <span>Mínimo 8 e máximo 40 caracteres</span>
                      </div>
                      <div className={`flex items-center gap-2 ${passUpperValid ? 'text-green-600' : 'text-slate-500'}`}>
                        {passUpperValid ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5 text-rose-400" />} 
                        <span>Letra maiúscula</span>
                      </div>
                      <div className={`flex items-center gap-2 ${passLowerValid ? 'text-green-600' : 'text-slate-500'}`}>
                        {passLowerValid ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5 text-rose-400" />} 
                        <span>Letra minúscula</span>
                      </div>
                      <div className={`flex items-center gap-2 ${passNumberValid ? 'text-green-600' : 'text-slate-500'}`}>
                        {passNumberValid ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5 text-rose-400" />} 
                        <span>Número</span>
                      </div>
                      <div className={`flex items-center gap-2 ${passSpecialValid ? 'text-green-600' : 'text-slate-500'}`}>
                        {passSpecialValid ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5 text-rose-400" />} 
                        <span>Caractere especial (!@#$...)</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Confirmar Senha</label>
                    <div className="mt-1 relative rounded-xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type="password"
                        required
                        value={regConfirmPass}
                        onChange={(e) => setRegConfirmPass(e.target.value)}
                        className="w-full pl-10 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow text-slate-900"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={regLoading || !isPassValid}
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-lg shadow-blue-500/30 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0 cursor-pointer"
                  >
                    {regLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="w-5 h-5" /> Criar Conta
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

        </div>
      </div>

      {appVersion && (
        <p className="mt-4 text-center text-xs text-slate-400 relative z-10">
          v{appVersion}
        </p>
      )}

      {/* Decorative Blob & Background Logo */}
      <div className="fixed top-0 max-w-7xl mx-auto inset-x-0 h-full w-full overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-linear-to-br from-blue-300/30 to-indigo-100/10 blur-3xl rounded-full"></div>
        <div className="absolute -bottom-1/2 -left-1/2 w-[80%] h-[80%] bg-linear-to-tr from-slate-200/50 to-emerald-50/10 blur-3xl rounded-full"></div>
        
        {/* Background Logo with high transparency */}
        <img 
          src={iconLogo} 
          alt="" 
          className="absolute w-[150vw] h-[150vh] max-w-none object-cover opacity-[0.1] grayscale" 
        />
      </div>
    </div>
  )
}
