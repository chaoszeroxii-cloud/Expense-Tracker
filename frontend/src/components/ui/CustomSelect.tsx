import { useState, useRef, useEffect } from 'react'
import Icon from '@mdi/react'
import { mdiChevronDown } from '@mdi/js'
import IconDisplay from './IconDisplay'

export interface SelectOption {
  value: string
  label: string
  icon?: string
  color?: string
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
  const [openUp, setOpenUp] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setOpenUp(window.innerHeight - rect.bottom < 240)
    }
    setOpen(o => !o)
  }

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--input)] text-base-theme text-sm border border-[var(--border)] outline-none text-left"
      >
        <span className={`flex items-center gap-2 ${selected ? 'text-base-theme' : 'text-muted-theme'}`}>
          {selected?.icon && (
            <span className="w-6 h-6 flex items-center justify-center rounded-lg shrink-0"
              style={{ backgroundColor: (selected.color ?? '#94a3b8') + '22' }}>
              <IconDisplay icon={selected.icon} color={selected.color} size={0.65} />
            </span>
          )}
          {selected ? selected.label : placeholder}
        </span>
        <span className={`transition-transform duration-200 shrink-0 ml-2 text-muted-theme ${open ? 'rotate-180' : ''}`}>
          <Icon path={mdiChevronDown} size={0.8} />
        </span>
      </button>

      {open && (
        <div className={`absolute z-[70] w-full ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'} bg-card border border-[var(--border)] rounded-xl shadow-xl overflow-hidden`}>
          <div className="max-h-56 overflow-y-auto py-1 overscroll-contain">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm transition-colors
                  ${opt.value === value
                    ? 'bg-brand-600 text-white font-semibold'
                    : 'text-base-theme hover:bg-[var(--input)]'
                  }`}
              >
                {opt.icon && (
                  <span className="w-6 h-6 flex items-center justify-center rounded-lg shrink-0"
                    style={{ backgroundColor: opt.value === value ? 'rgba(255,255,255,0.2)' : (opt.color ?? '#94a3b8') + '22' }}>
                    <IconDisplay icon={opt.icon} color={opt.value === value ? '#ffffff' : opt.color} size={0.65} />
                  </span>
                )}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
