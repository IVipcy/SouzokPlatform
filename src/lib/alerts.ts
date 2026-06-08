// アラートセンター用の共通型。ライブ計算アラート（API）とベル表示で共有する。

export type AlertSeverity = 'claim' | 'high' | 'mid' | 'info'

export const ALERT_SEVERITY_ORDER: Record<AlertSeverity, number> = {
  claim: 0, high: 1, mid: 2, info: 3,
}

export const ALERT_SEVERITY_STYLE: Record<AlertSeverity, { dot: string; chip: string }> = {
  claim: { dot: 'bg-purple-500', chip: 'bg-purple-50 text-purple-700 border-purple-200' },
  high:  { dot: 'bg-red-500',    chip: 'bg-red-50 text-red-700 border-red-200' },
  mid:   { dot: 'bg-amber-500',  chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  info:  { dot: 'bg-sky-500',    chip: 'bg-sky-50 text-sky-700 border-sky-200' },
}

export type AlertItem = {
  id: string           // 一意キー
  severity: AlertSeverity
  category: string     // 種別ラベル（例: タスク期限超過）
  title: string        // 本文（案件名 等）
  body?: string | null
  href: string | null  // クリック時の遷移先
}
