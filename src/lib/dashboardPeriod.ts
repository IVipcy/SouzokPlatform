// ダッシュボード共通の期間切替に関する型・ユーティリティ。
// 'use client' を持たない純粋ロジックモジュール。サーバ/クライアントどちらからも import できる。

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

export function getPeriodLabel(period: DashboardPeriod): string {
  return PERIOD_OPTIONS.find(p => p.value === period)?.label ?? '本日'
}
