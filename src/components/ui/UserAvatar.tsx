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

// 達成リング用の外枠 padding（レインボーが見えるよう、ホワイト縁取り＋αの余白を確保）
const RING_PAD_CLASS: Record<Size, string> = {
  xs: 'p-[3px]',
  sm: 'p-[3px]',
  md: 'p-[3px]',
  lg: 'p-[4px]',
  xl: 'p-[5px]',
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

  // 通常時のリング（ホワイト + ロール色の二重リング）
  // 達成時は外側がレインボーなので、内側のホワイト縁取りだけにする
  const ringStyle = achievedFrame
    ? { boxShadow: `0 0 0 1.5px white` }
    : showRing
      ? { boxShadow: `0 0 0 2px white, 0 0 0 3px ${bg}` }
      : undefined

  // 内側の本体（写真 or 文字）
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

  // 達成時はレインボーリングで包む。
  //   - 回転するのは「内側の絶対配置レイヤー（背景レイヤー）」だけ
  //   - アバター本体は relative で前面に配置 → 回転しない
  if (achievedFrame) {
    return (
      <span
        className={`relative inline-flex flex-shrink-0 rounded-full ${RING_PAD_CLASS[size]} ${className}`}
        title="今月の新規受注目標を達成！"
      >
        <span
          className="achievement-avatar-ring absolute inset-0 rounded-full pointer-events-none"
          aria-hidden
        />
        <span className="relative inline-flex">{inner}</span>
      </span>
    )
  }

  return <span className={`inline-flex flex-shrink-0 ${className}`}>{inner}</span>
}
