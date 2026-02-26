import { useState, useRef, useEffect, type ReactElement } from 'react'
import { ChevronLeft, ChevronRight, Calendar, ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const MONTHS_FULL = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
]

interface MonthPickerProps {
  /** Valor no formato MM/YYYY */
  value: string
  onChange: (value: string) => void
  /** Classe extra para o container do trigger */
  className?: string
  /** Cor de destaque: 'indigo' | 'blue' */
  accent?: 'indigo' | 'blue'
}

function parseValue(value: string): { month: number; year: number } {
  const parts = value.split('/')
  const month = parseInt(parts[0], 10)
  const year = parseInt(parts[1], 10)
  return {
    month: isNaN(month) ? new Date().getMonth() + 1 : month,
    year: isNaN(year) ? new Date().getFullYear() : year
  }
}

function formatValue(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${year}`
}

export function MonthPicker({
  value,
  onChange,
  className,
  accent = 'indigo'
}: MonthPickerProps): ReactElement {
  const { month, year } = parseValue(value)
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(year)
  const ref = useRef<HTMLDivElement>(null)

  // fecha ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // sincroniza viewYear quando value muda externamente
  useEffect(() => {
    setViewYear(parseValue(value).year)
  }, [value])

  const goMonth = (dir: number): void => {
    let m = month + dir
    let y = year
    if (m > 12) {
      m = 1
      y++
    }
    if (m < 1) {
      m = 12
      y--
    }
    onChange(formatValue(m, y))
  }

  const selectMonth = (m: number): void => {
    onChange(formatValue(m, viewYear))
    setOpen(false)
  }

  const isSelected = (m: number): boolean => m === month && viewYear === year

  const ring = accent === 'indigo' ? 'focus-within:ring-indigo-500' : 'focus-within:ring-blue-500'
  const selectedBg = accent === 'indigo' ? 'bg-indigo-600 text-white' : 'bg-blue-600 text-white'
  const hoverBg =
    accent === 'indigo'
      ? 'hover:bg-indigo-50 hover:text-indigo-700'
      : 'hover:bg-blue-50 hover:text-blue-700'
  const iconColor = accent === 'indigo' ? 'text-indigo-400' : 'text-blue-400'
  const arrowHover =
    accent === 'indigo'
      ? 'hover:bg-indigo-50 hover:text-indigo-600'
      : 'hover:bg-blue-50 hover:text-blue-600'

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Trigger row */}
      <div
        className={cn(
          'flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg shadow-sm overflow-hidden focus-within:ring-2 transition-all',
          ring
        )}
      >
        {/* Prev arrow */}
        <button
          type="button"
          onClick={() => goMonth(-1)}
          className={cn('p-1.5 text-slate-400 transition-colors cursor-pointer', arrowHover)}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Label / open button */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 px-1 py-1.5 text-slate-700 font-semibold text-sm select-none whitespace-nowrap cursor-pointer"
        >
          <Calendar className={cn('w-3.5 h-3.5', iconColor)} />
          {MONTHS_FULL[month - 1]} {year}
          <ChevronDown
            className={cn('w-3 h-3 text-slate-400 transition-transform', open && 'rotate-180')}
          />
        </button>

        {/* Next arrow */}
        <button
          type="button"
          onClick={() => goMonth(1)}
          className={cn('p-1.5 text-slate-400 transition-colors cursor-pointer', arrowHover)}
          aria-label="Próximo mês"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-64 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className={cn('p-1 rounded-md text-slate-400 transition-colors cursor-pointer', arrowHover)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-800 text-sm">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className={cn('p-1 rounded-md text-slate-400 transition-colors cursor-pointer', arrowHover)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-4 gap-1">
            {MONTHS.map((label, idx) => {
              const m = idx + 1
              const sel = isSelected(m)
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => selectMonth(m)}
                  className={cn(
                    'rounded-lg py-1.5 text-xs font-medium transition-colors cursor-pointer',
                    sel ? selectedBg : `text-slate-600 ${hoverBg}`
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
