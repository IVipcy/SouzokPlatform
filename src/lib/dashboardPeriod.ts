// ダッシュボード共通の期間切替に関する型・ユーティリティ。
// 'use client' を持たない純粋ロジックモジュール。サーバ/クライアントどちらからも import できる。

// ダッシュボード共通の期間: 本日 / 当月 / 年度累計 の3択に統一。
// 年度累計は「各月の数値＋累計を横スクロールで振り返る」ビューとして扱う。
export type DashboardPeriod = 'today' | 'month' | 'ytd'

export const PERIOD_OPTIONS: { value: DashboardPeriod; label: string; description?: string }[] = [
  { value: 'today', label: '本日',     description: '今日の動きだけを集計' },
  { value: 'month', label: '当月',     description: '今月分の数値' },
  { value: 'ytd',   label: '年度累計', description: '各月＋累計を横スクロールで振り返る' },
]

export function parsePeriod(value: string | null | undefined): DashboardPeriod {
  if (value === 'today' || value === 'month' || value === 'ytd') return value
  return 'today' // default
}

export function getPeriodLabel(period: DashboardPeriod): string {
  return PERIOD_OPTIONS.find(p => p.value === period)?.label ?? '本日'
}
