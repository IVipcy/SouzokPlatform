// アラートセンター用の共通型。ライブ計算アラート（API）とベル表示で共有する。

import { evaluateCaseAlerts, caseColorOf, type CaseAlertInput } from '@/lib/alertRules'

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

// 案件詳細ヘッダー用：1案件の有効アラート（種別＋重大度）。
// 判定は src/lib/alertRules.ts に集約したので、ここはその結果を受け取るだけ。
// 案件本来の状態に基づくので、閲覧者のロールに関わらず同じものを表示する。

export type CaseColorFlag = 'purple' | 'red' | 'yellow' | 'blue'
export function caseFlagFromAlerts(chips: CaseAlertChip[]): CaseColorFlag {
  return caseColorOf(chips)
}

export type CaseAlertChip = { severity: AlertSeverity; category: string }

export function computeCaseAlerts(
  c: CaseAlertInput,
  ctx: {
    managerExists: boolean
    advanceInvoiceStatus: string | null
    advanceInvoiceCreatedAt?: string | null
    recentWeeklyConfirmed: boolean
    overdueTaskCount: number
    overdueTaskHigh?: boolean
    responseCheckDone?: boolean
    hasCaseTasks?: boolean
    contractPending?: boolean
    billOverdue?: AlertSeverity | null
  },
  today: Date,
): CaseAlertChip[] {
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return evaluateCaseAlerts(c, {
    managerExists: ctx.managerExists,
    advanceInvoiceStatus: ctx.advanceInvoiceStatus,
    advanceInvoiceCreatedAt: ctx.advanceInvoiceCreatedAt,
    recentWeeklyConfirmed: ctx.recentWeeklyConfirmed,
    responseCheckDone: ctx.responseCheckDone,
    hasCaseTasks: ctx.hasCaseTasks,
    contractPending: ctx.contractPending,
    taskOverdue: ctx.overdueTaskCount > 0 ? (ctx.overdueTaskHigh ? 'high' : 'mid') : null,
    billOverdue: ctx.billOverdue ?? null,
  }, ymd).map(h => ({ severity: h.severity, category: h.category }))
}
