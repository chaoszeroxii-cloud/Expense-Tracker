import Icon from '@mdi/react'
import { getMdiIconPath } from '../../utils/iconMap'

interface IconDisplayProps {
  icon: string
  color?: string
  size?: 'sm' | 'md' | 'lg' | number
  className?: string
}

export default function IconDisplay({ icon, color, size = 'md', className }: IconDisplayProps) {
  const iconPath = getMdiIconPath(icon)
  
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
      color={color}
      className={className}
    />
  )
}
