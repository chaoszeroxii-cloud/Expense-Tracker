import { useState, useRef, useEffect } from 'react'
import Icon from '@mdi/react'
import { mdiChevronDown } from '@mdi/js'

export interface SelectOption {
  value: string
  label: string
}

interface CustomSelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export default function CustomSelect({ options, value, onChange, placeholder = 'เลือก...', className = '' }: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none text-left"
      >
        <span className={selected ? 'text-base-theme' : 'text-muted-theme'}>
          {selected ? selected.label : placeholder}
        </span>
        <span className={`transition-transform duration-200 shrink-0 ml-2 text-muted-theme ${open ? 'rotate-180' : ''}`}>
          <Icon path={mdiChevronDown} size={0.8} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-[var(--border)] rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1 overscroll-contain">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                  ${opt.value === value
                    ? 'bg-brand-600 text-white font-semibold'
                    : 'text-base-theme hover:bg-[var(--input)]'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
