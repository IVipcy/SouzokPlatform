import type { LucideIcon } from 'lucide-react'

type Props = {
  /** 上部の英字ラベル（uppercase + tracking-wider で表示） */
  eyebrow: string
  /** メインタイトル（日本語） */
  title: string
  /** タイトルの左に表示するアイコン */
  icon?: LucideIcon
  /** タイトル下の説明文 */
  description?: React.ReactNode
  /** タイトル（名前）のすぐ右に置く要素（アラートベル etc） */
  afterTitle?: React.ReactNode
  /** 右側に置く要素（ボタン・検索 etc） */
  right?: React.ReactNode
  className?: string
}

/**
 * ページ上部の統一ヘッダー。
 *
 * <PageHeader
 *   eyebrow="Document Ledger"
 *   title="書類発着管理簿"
 *   icon={Send}
 *   description="..."
 *   right={<button>...</button>}
 * />
 */
export default function PageHeader({
  eyebrow,
  title,
  icon: Icon,
  description,
  afterTitle,
  right,
  className = '',
}: Props) {
  return (
    <div className={`mb-5 flex items-end justify-between gap-4 flex-wrap ${className}`}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-brand-600 tracking-wider uppercase">{eyebrow}</p>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            {Icon && <Icon className="w-6 h-6 text-brand-600 flex-shrink-0" strokeWidth={2} />}
            <span className="truncate">{title}</span>
          </h1>
          {afterTitle}
        </div>
        {description && (
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        )}
      </div>
      {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
  )
}
