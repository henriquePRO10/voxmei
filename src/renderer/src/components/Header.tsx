import { Bell, UserCircle, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function Header() {
    const { logout, currentUser } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Falha ao deslogar', error);
        }
    }

    return (
        <header className="h-16 w-full bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm relative z-10 transition-all">
            <div className="flex items-center">
                <h1 className="text-xl font-semibold text-slate-800">
                    Olá, Contador! 👋
                </h1>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
                <button className="p-2 hover:bg-slate-100 rounded-full transition relative">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                </button>
                <div className="h-8 w-px bg-slate-200" />
                <button className="flex items-center gap-2 hover:bg-slate-100 py-1.5 px-3 rounded-lg transition">
                    <UserCircle className="w-6 h-6 text-slate-600" />
                    <span className="text-sm font-medium text-slate-700 hidden md:block">
                        {currentUser?.email?.split('@')[0] || 'Contador'}
                    </span>
                </button>
                <button onClick={handleLogout} title="Sair do sistema" className="p-2 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition ml-2">
                    <LogOut className="w-5 h-5" />
                </button>
            </div>
        </header>
    );
}
