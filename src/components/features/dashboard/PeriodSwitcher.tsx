'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { PERIOD_OPTIONS, parsePeriod, type DashboardPeriod } from '@/lib/dashboardPeriod'

/**
 * ダッシュボード共通の期間切替コンポーネント。
 * 4ビュー: 本日 / 当月 / 年度累計 / 月別
 * URL の ?period= で状態を保持。
 * 型・パーサは src/lib/dashboardPeriod.ts に分離（サーバから安全に import するため）。
 */
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
