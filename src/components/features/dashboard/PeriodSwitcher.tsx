'use client'

import { useRouter, useSearchParams } from 'next/navigation'

/**
 * ダッシュボード共通の期間切替コンポーネント。
 *
 * 4ビュー:
 *   - today    : 本日分
 *   - month    : 当月分（月間目標表示はここのみ）
 *   - ytd      : 年度における累計
 *   - by_month : 年度における当月以前の毎月分（月別グラフ表示用）
 *
 * URL の ?period= で状態を保持。ページ全体でこの値を読んで集計する。
 */

export type DashboardPeriod = 'today' | 'month' | 'ytd' | 'by_month'

export const PERIOD_OPTIONS: { value: DashboardPeriod; label: string; description?: string }[] = [
  { value: 'today',    label: '本日',     description: '今日の動きだけを集計' },
  { value: 'month',    label: '当月',     description: '今月の累計 + 月間目標の進捗表示' },
  { value: 'ytd',      label: '年度累計', description: '当期初月から本日までの累計' },
  { value: 'by_month', label: '月別',     description: '年度の各月の数値を比較' },
]

export function parsePeriod(value: string | null | undefined): DashboardPeriod {
  if (value === 'today' || value === 'month' || value === 'ytd' || value === 'by_month') return value
  return 'today' // default
}

export default function PeriodSwitcher() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = parsePeriod(searchParams.get('period'))

  const handleChange = (next: DashboardPeriod) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'today') params.delete('period')
    else params.set('period', next)
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
  }

  return (
    <div className="inline-flex bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
      {PERIOD_OPTIONS.map(opt => {
        const isActive = current === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleChange(opt.value)}
            title={opt.description}
            className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap ${
              isActive
                ? 'bg-brand-600 text-white font-semibold shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
