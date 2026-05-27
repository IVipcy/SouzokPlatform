'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { type LucideIcon } from 'lucide-react'

type Tab = {
  value: string
  label: string
  Icon?: LucideIcon
  count?: number
}

type Props = {
  tabs: Tab[]
  current: string
  /** URLパラメータ名（既定: 'view'） */
  paramKey?: string
}

/**
 * ダッシュボード共通のビュー切替タブ。
 * 「受注数値」「面談一覧」のように、同一画面内のサブビューを切り替える。
 *
 * URL の ?view=... で状態を保持。SSR でも値を読めるため、ページ側で
 * `searchParams.view` を見て該当ビューだけレンダーすればよい。
 */
export default function DashboardViewTabs({ tabs, current, paramKey = 'view' }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleClick = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === tabs[0]?.value) {
      params.delete(paramKey)
    } else {
      params.set(paramKey, value)
    }
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
  }

  return (
    <div className="inline-flex bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
      {tabs.map(t => {
        const isActive = current === t.value
        const Icon = t.Icon
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => handleClick(t.value)}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap ${
              isActive
                ? 'bg-brand-600 text-white font-semibold shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={2} />}
            {t.label}
            {t.count !== undefined && (
              <span className={`text-[12px] font-mono ${isActive ? 'opacity-80' : 'opacity-50'}`}>
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

