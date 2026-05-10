import type { ReactNode } from 'react'

type Variant = 'default' | 'elevated' | 'outlined' | 'subtle'
type Padding = 'none' | 'sm' | 'md' | 'lg'

type Props = {
  variant?: Variant
  padding?: Padding
  className?: string
  children: ReactNode
}

const VARIANT_CLS: Record<Variant, string> = {
  default:  'bg-white border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
  elevated: 'bg-white border border-gray-200 shadow-md',
  outlined: 'bg-white border border-gray-300',
  subtle:   'bg-gray-50 border border-gray-200',
}

const PADDING_CLS: Record<Padding, string> = {
  none: '',
  sm:   'p-3',
  md:   'p-4',
  lg:   'p-6',
}

/**
 * 共通カード。ダッシュボード KPI / リスト / セクションラッパーで利用。
 *
 * <Card>...</Card>                                プレーンな白カード
 * <Card variant="elevated" padding="lg">...        強めシャドウ + 余白広め
 * <Card variant="subtle" padding="sm">...          灰背景の控えめカード
 */
export default function Card({ variant = 'default', padding = 'md', className = '', children }: Props) {
  return (
    <div className={`rounded-xl ${VARIANT_CLS[variant]} ${PADDING_CLS[padding]} ${className}`}>
      {children}
    </div>
  )
}

/**
 * Card の中で使うヘッダー行。タイトル + 補助情報 + 右端アクションのレイアウト
 *
 * <Card padding="none">
 *   <CardHeader title="タイトル" sub="補足" right={<Button>...</Button>} />
 *   <div className="px-4 py-3">内容</div>
 * </Card>
 */
export function CardHeader({ title, sub, right, icon }: {
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <h3 className="text-[14px] font-semibold text-gray-900 flex-1">{title}</h3>
      {sub && <span className="text-[12px] text-gray-400">{sub}</span>}
      {right}
    </div>
  )
}
