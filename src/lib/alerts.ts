// アラートセンター用の共通型。ライブ計算アラート（API）とベル表示で共有する。

import { bizDaysOverdue } from '@/lib/overdue'

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

// 案件詳細ヘッダー用：1案件の有効アラート（種別＋重大度）を算出する。
// 案件本来の状態に基づくので、閲覧者のロールに関わらず同じものを表示する。
const ACTIVE_STATUSES_A = new Set(['受注', '戻り受注', '作業着手準備', '対応中'])
const PENDING_ANSWER_A = new Set(['面談設定済', '検討中', '検討中（契約書待ち）'])
// 受注〜作業着手準備（作業進行中に入る前）。管理担当の割振り・前受金請求はこの段階で行う。
const PREP_STATUSES_A = new Set(['受注', '戻り受注', '作業着手準備'])

// アラート群の最大深刻度から案件色を決める（紫 > 赤 > 黄 > 青）。
export type CaseColorFlag = 'purple' | 'red' | 'yellow' | 'blue'
export function caseFlagFromAlerts(chips: CaseAlertChip[]): CaseColorFlag {
  if (chips.some(c => c.severity === 'claim')) return 'purple'
  if (chips.some(c => c.severity === 'high')) return 'red'
  if (chips.some(c => c.severity === 'mid')) return 'yellow'
  return 'blue'
}

export type CaseAlertChip = { severity: AlertSeverity; category: string }

export function computeCaseAlerts(
  c: {
    status: string
    has_complaint?: boolean | null
    expected_completion_date?: string | null
    meeting_date?: string | null
    meeting_executed_date?: string | null
    client_response_due_date?: string | null
    order_received_date?: string | null
    manager_assign_skipped?: boolean | null
    last_opened_at?: string | null   // 未対応日数（最終接触）用
    created_at?: string | null
  },
  ctx: {
    managerExists: boolean
    advanceInvoiceStatus: string | null   // 前受金請求書のステータス（無ければ null）
    recentWeeklyConfirmed: boolean        // 直近7日に確認済の進捗報告があるか
    overdueTaskCount: number              // 期限超過の未完了タスク数
    responseCheckDone?: boolean           // 「検討状況の確認」タスク(sys_review_status)が完了済みか
  },
  today: Date,
): CaseAlertChip[] {
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + 2)
  const horizonStr = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, '0')}-${String(horizon.getDate()).padStart(2, '0')}`

  const active = ACTIVE_STATUSES_A.has(c.status)
  const out: CaseAlertChip[] = []

  const prep = PREP_STATUSES_A.has(c.status)

  if (c.has_complaint && active) out.push({ severity: 'claim', category: 'クレーム' })
  if (ctx.overdueTaskCount > 0) out.push({ severity: 'high', category: `タスク期限超過${ctx.overdueTaskCount > 1 ? `(${ctx.overdueTaskCount})` : ''}` })
  // 管理担当 未アサイン：受注〜作業着手準備 かつ 管理担当未設定 かつ 受注から2営業日超過（要割振り）。
  if (prep && !ctx.managerExists && !c.manager_assign_skipped && c.order_received_date && bizDaysOverdue(c.order_received_date, ymd) >= 2) {
    out.push({ severity: 'high', category: '管理担当 未アサイン' })
  }
  // 前受金 未請求：受注〜作業着手準備 かつ 前受金請求書 未発行 かつ 受注から5営業日超過。
  if (prep && ctx.advanceInvoiceStatus === null && c.order_received_date && bizDaysOverdue(c.order_received_date, ymd) >= 5) {
    out.push({ severity: 'high', category: '前受金 未請求' })
  }
  if (active && (ctx.advanceInvoiceStatus === '作成済' || ctx.advanceInvoiceStatus === '入金待ち')) out.push({ severity: 'high', category: '前受金 未入金' })
  if (c.expected_completion_date && c.expected_completion_date < ymd && c.status !== '完了' && c.status !== '失注') out.push({ severity: 'high', category: '完了予定日 超過' })
  if (active && !ctx.recentWeeklyConfirmed) out.push({ severity: 'mid', category: '週次報告の漏れ' })
  if (c.meeting_date && c.meeting_date < ymd && !c.meeting_executed_date && PENDING_ANSWER_A.has(c.status)) out.push({ severity: 'mid', category: '面談メモ未記載' })
  if (PENDING_ANSWER_A.has(c.status) && c.client_response_due_date && c.client_response_due_date <= horizonStr && !ctx.responseCheckDone) {
    out.push({ severity: 'mid', category: c.client_response_due_date < ymd ? '回答予定日 超過' : '回答予定日 間近' })
  }
  // 未対応日数（最終接触＝案件を最後に開いた日）：5営業日超過→要確認(黄)、10営業日超過→要注意(赤)。
  if (active) {
    const ref = (c.last_opened_at ?? c.created_at ?? '').slice(0, 10)
    if (ref) {
      const biz = bizDaysOverdue(ref, ymd)
      if (biz >= 10) out.push({ severity: 'high', category: '未対応 10営業日超' })
      else if (biz >= 5) out.push({ severity: 'mid', category: '未対応 5営業日超' })
    }
  }
  return out
}
