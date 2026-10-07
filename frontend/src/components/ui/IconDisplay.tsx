import Icon from '@mdi/react'
import { useEffect, useState } from 'react'
import { getMdiIconPath, getPresetIconPath } from '../../utils/iconMap'
import { cachedMdiPath, loadMdiPath } from '../../utils/customIcons'

interface IconDisplayProps {
  icon: string
  color?: string
  size?: 'sm' | 'md' | 'lg' | number
  className?: string
}

export default function IconDisplay({ icon, color, size = 'md', className }: IconDisplayProps) {
  const preset = getPresetIconPath(icon)
  const [resolved, setResolved] = useState<{ icon: string; path: string | null } | null>(null)
  useEffect(() => {
    if (preset || !icon) return
    let active = true
    const load = () => { loadMdiPath(icon).then(path => { if (active) setResolved({ icon, path }) }).catch(() => {}) }
    load()
    window.addEventListener('online', load)
    return () => { active = false; window.removeEventListener('online', load) }
  }, [icon, preset])
  const iconPath = preset || (icon && cachedMdiPath(icon)) || (resolved?.icon === icon ? resolved.path : null) || getMdiIconPath('other')
  
  const sizeMap = {
    sm: 0.6,
    md: 0.85,
    lg: 1.2,
  }
  
  const sizeValue = typeof size === 'number' ? size : sizeMap[size]
  
  return (
    <Icon
      path={iconPath}
      size={sizeValue}
      color={color || 'currentColor'}
      className={`${!color ? 'text-base-theme ' : ''}${className ?? ''}`}
    />
  )
}
