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

type Props = {
  name: string
  // 新方式: ロールに紐づく色を使う（推奨）
  role?: AvatarRole | null
  // 旧方式: 明示的に色を渡す（互換用、徐々に廃止）
  color?: string
  url?: string | null
  size?: Size
  // 個人目標を達成しているとレインボーリング画像が周囲に表示される
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

  // リング（ホワイト + ロール色の二重リング）— achievedFrame 関係なく常に同じ
  const ringStyle = showRing
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

  // 達成時はリング画像で囲む。
  //   - 画像は absolute 配置で z-index 0、scale(2) で拡大してアバターより大きく見せる
  //   - 外枠 span は元のアバターサイズ（レイアウトはずれない）
  //   - overflow: visible で画像が外側へはみ出せるように
  //   - アバター本体は z-index 1 で前面に固定（回転しない）
  if (achievedFrame) {
    return (
      <span
        className={`relative inline-flex flex-shrink-0 items-center justify-center ${sizeCls.split(' ').slice(0, 2).join(' ')} ${className}`}
        title="今月の目標を達成！"
        style={{ overflow: 'visible' }}
      >
        <img
          src="/dashboard-popup/achievement-ring.png"
          alt=""
          aria-hidden
          className="absolute inset-0 pointer-events-none achievement-avatar-img"
          style={{
            width: '100%',
            height: '100%',
            transformOrigin: 'center',
            zIndex: 0,
          }}
          draggable={false}
        />
        <span className="relative inline-flex" style={{ zIndex: 1 }}>
          {inner}
        </span>
      </span>
    )
  }

  return <span className={`inline-flex flex-shrink-0 ${className}`}>{inner}</span>
}
