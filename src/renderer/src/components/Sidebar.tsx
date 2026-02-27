import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Users, DollarSign, FileText, FileBadge, BarChart2, Mail } from 'lucide-react'
import { cn } from '../lib/utils'
import iconLogo from '../../../../resources/icon.png'

// whatsapp SVG since lucide-react doesn't include it
function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M16.65 13.83c-.26-.13-1.55-.77-1.79-.86-.24-.09-.42-.13-.6.13-.17.26-.64.86-.78 1.04-.14.17-.28.19-.54.07-.26-.13-1.1-.4-2.1-1.3-.78-.7-1.3-1.57-1.44-1.83-.14-.26-.02-.4.11-.53.12-.12.26-.28.39-.42.13-.14.17-.24.26-.4.09-.17.04-.32-.02-.45-.07-.13-.6-1.44-.82-1.98-.22-.52-.44-.46-.6-.46h-.51c-.17 0-.45.06-.69.32-.24.26-.93.9-.93 2.2 0 1.3.95 2.57 1.08 2.75.13.17 1.86 2.88 4.5 4.04.63.27 1.12.43 1.5.55.63.19 1.21.16 1.67.1.51-.07 1.55-.63 1.77-1.24.22-.61.22-1.13.15-1.24-.07-.12-.26-.19-.55-.32zm-4.65 8.17c-4.14 0-7.5-3.36-7.5-7.5s3.36-7.5 7.5-7.5 7.5 3.36 7.5 7.5-3.36 7.5-7.5 7.5zm0-18c-5.23 0-9.5 4.27-9.5 9.5s4.27 9.5 9.5 9.5 9.5-4.27 9.5-9.5-4.27-9.5-9.5-9.5z"/>
    </svg>
  )
}

export function Sidebar() {
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion)
  }, [])

  const routes = [
    { label: 'Gestão de Clientes', path: '/', icon: Users },
    { label: 'Financeiro', path: '/financeiro', icon: DollarSign },
    { label: 'Pró-Labore', path: '/pro-labore', icon: FileText },
    { label: 'Holerite', path: '/holerite', icon: FileBadge },
    { label: 'Relatórios', path: '/relatorios', icon: BarChart2 }
  ]

  return (
    <aside className="w-64 h-screen fixed left-0 top-0 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-20">
      <div className="h-16 flex items-center px-6 bg-slate-950 font-bold text-xl tracking-wide border-b border-slate-800">
        <img src={iconLogo} alt="logo" className="w-8 h-8 object-contain mr-2" />
        <span className="text-blue-400">Vox</span><span className="text-orange-400">Count</span>
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
      <div className="mt-auto px-6 py-4 text-sm text-slate-300 space-y-2">
        <a
          href="https://api.whatsapp.com/send?phone=556696067576"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:text-white transition-colors"
        >
          <WhatsappIcon className="w-5 h-5 text-green-400" />
          Suporte WhatsApp
        </a>
        <a
          href="mailto:voxbitinformatica@gmail.com"
          className="flex items-center gap-2 hover:text-white transition-colors"
        >
          <Mail className="w-5 h-5 text-slate-300" />
          Suporte por E-mail
        </a>
      </div>
      <div className="p-4 text-xs text-slate-500 border-t border-slate-800 text-center">
        {appVersion ? `Versão ${appVersion}` : ''}
      </div>
    </aside>
  )
}
