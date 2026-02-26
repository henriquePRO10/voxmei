import { useState } from 'react';
import { LogIn, Lock, Mail, Loader2 } from 'lucide-react';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from '../services/firebaseConfig';
import { useForm } from 'react-hook-form';

interface LoginForm {
    email: string;
    pass: string;
    rememberMe: boolean;
}

export function Login() {
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const { register, handleSubmit } = useForm<LoginForm>();

    const onSubmit = async (data: LoginForm) => {
        setLoading(true);
        setErrorMsg('');
        try {
            // Define a persistência com base no checkbox
            const persistenceType = data.rememberMe ? browserLocalPersistence : browserSessionPersistence;
            await setPersistence(auth, persistenceType);
            
            await signInWithEmailAndPassword(auth, data.email, data.pass);
            // O listener do AuthContext capturará e navegará via regras de rotas Privadas
        } catch (error: unknown) {
            const code = error instanceof FirebaseError ? error.code : '';
            if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
                setErrorMsg('E-mail ou senha incorretos.');
            } else {
                setErrorMsg('Erro de conexão ou sistema. Tente novamente.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="flex justify-center flex-col items-center">
                    <div className="bg-blue-600 text-white p-4 rounded-3xl shadow-lg shadow-blue-500/30 mb-6">
                        <Lock className="w-10 h-10" />
                    </div>
                    <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight">
                        VoxCount
                    </h2>
                    <p className="mt-2 text-center text-sm text-slate-500 font-medium">
                        Gerenciamento Premium para MEIs
                    </p>
                </div>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-150 relative z-10">
                <div className="bg-white py-10 px-8 sm:rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
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
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Senha Segura
                            </label>
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
                                <a href="#" className="font-medium text-blue-600 hover:text-blue-500 transition-colors">
                                    Esqueceu a senha?
                                </a>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-lg shadow-blue-500/30 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><LogIn className="w-5 h-5" /> Entrar no Painel</>}
                        </button>
                    </form>
                </div>
            </div>

            {/* Decorative Blob */}
            <div className="fixed top-0 max-w-7xl mx-auto inset-x-0 h-full w-full overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-linear-to-br from-blue-300/30 to-indigo-100/10 blur-3xl rounded-full"></div>
                <div className="absolute -bottom-1/2 -left-1/2 w-[80%] h-[80%] bg-linear-to-tr from-slate-200/50 to-emerald-50/10 blur-3xl rounded-full"></div>
            </div>
        </div>
    );
}
