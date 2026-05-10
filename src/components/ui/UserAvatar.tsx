'use client'

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASS: Record<Size, string> = {
  xs: 'w-4 h-4 text-[9px]',
  sm: 'w-5 h-5 text-[10px]',
  md: 'w-6 h-6 text-[11px]',
  lg: 'w-8 h-8 text-[13px]',
  xl: 'w-16 h-16 text-2xl',
}

type Props = {
  name: string
  color: string
  url?: string | null
  size?: Size
  className?: string
}

export default function UserAvatar({ name, color, url, size = 'md', className = '' }: Props) {
  const sizeCls = SIZE_CLASS[size]
  const initial = name?.charAt(0) ?? '?'

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${sizeCls} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    )
  }

  return (
    <span
      className={`${sizeCls} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${className}`}
      style={{ backgroundColor: color }}
    >
      {initial}
    </span>
  )
}
