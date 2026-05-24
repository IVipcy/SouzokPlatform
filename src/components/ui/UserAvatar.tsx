'use client'

import { colorsForRole, type AvatarRole } from '@/lib/roleColors'

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASS: Record<Size, string> = {
  xs: 'w-4 h-4 text-[9px]',
  sm: 'w-5 h-5 text-[10px]',
  md: 'w-6 h-6 text-[11px]',
  lg: 'w-8 h-8 text-[13px]',
  xl: 'w-16 h-16 text-2xl',
}

// 達成リング用の外枠サイズ
const RING_PAD_CLASS: Record<Size, string> = {
  xs: 'p-[2px]',
  sm: 'p-[2px]',
  md: 'p-[2px]',
  lg: 'p-[3px]',
  xl: 'p-[4px]',
}

type Props = {
  name: string
  // 新方式: ロールに紐づく色を使う（推奨）
  role?: AvatarRole | null
  // 旧方式: 明示的に色を渡す（互換用、徐々に廃止）
  color?: string
  url?: string | null
  size?: Size
  // 個人目標を達成しているとレインボーリングが表示される
  achievedFrame?: boolean
  // リング（白の縁取り）の表示を強制 / 抑制
  showRing?: boolean
  className?: string
}

export default function UserAvatar({
  name,
  role,
  color,
  url,
  size = 'md',
  achievedFrame = false,
  showRing = true,
  className = '',
}: Props) {
  const sizeCls = SIZE_CLASS[size]
  const initial = name?.charAt(0) ?? '?'

  // 色決定: role > color > フォールバック
  const { bg, fg } = role
    ? colorsForRole(role)
    : color
      ? { bg: color, fg: '#ffffff' }
      : colorsForRole(null)

  // 内側の本体（写真 or 文字）
  const ringStyle = showRing
    ? { boxShadow: `0 0 0 2px white, 0 0 0 3px ${bg}` }
    : undefined

  const inner = url ? (
    <img
      src={url}
      alt={name}
      className={`${sizeCls} rounded-full object-cover flex-shrink-0`}
      style={ringStyle}
      draggable={false}
    />
  ) : (
    <span
      className={`${sizeCls} rounded-full flex items-center justify-center font-bold flex-shrink-0`}
      style={{ backgroundColor: bg, color: fg, ...ringStyle }}
    >
      {initial}
    </span>
  )

  // 達成時はレインボーリングで包む
  if (achievedFrame) {
    return (
      <span
        className={`inline-flex achievement-avatar-ring rounded-full flex-shrink-0 ${RING_PAD_CLASS[size]} ${className}`}
        title="今月の新規受注目標を達成！"
      >
        {inner}
      </span>
    )
  }

  return <span className={`inline-flex flex-shrink-0 ${className}`}>{inner}</span>
}
