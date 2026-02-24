import { NavLink } from 'react-router-dom';
import { Users, DollarSign, FileText, FileBadge, BarChart2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function Sidebar() {
    const routes = [
        { label: 'Gestão de Clientes', path: '/', icon: Users },
        { label: 'Financeiro', path: '/financeiro', icon: DollarSign },
        { label: 'Pró-Labore', path: '/pro-labore', icon: FileText },
        { label: 'Holerite', path: '/holerite', icon: FileBadge },
        { label: 'Relatórios', path: '/relatorios', icon: BarChart2 },
    ];

    return (
        <aside className="w-64 h-screen fixed left-0 top-0 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-20">
            <div className="h-16 flex items-center px-6 bg-slate-950 font-bold text-xl text-white tracking-wide border-b border-slate-800">
                VoxCount
            </div>
            <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
                {routes.map((route) => (
                    <NavLink
                        key={route.path}
                        to={route.path}
                        className={({ isActive }) =>
                            cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium',
                                isActive
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                    : 'hover:bg-slate-800 hover:text-white'
                            )
                        }
                    >
                        <route.icon className="w-5 h-5" />
                        {route.label}
                    </NavLink>
                ))}
            </nav>
            <div className="p-4 text-xs text-slate-500 border-t border-slate-800 text-center">
                Versão 1.0.0
            </div>
        </aside>
    );
}
