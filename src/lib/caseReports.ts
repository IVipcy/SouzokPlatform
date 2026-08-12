// 報連相（case_reports）まわりの共通ルール。表示ラベルと、要対応の放置判定を1か所に置く。
//
// 種別は2つ。
//   情報共有 … 見ておいてほしいもの。放置してもアラートには出さない（通知だけ）
//   要対応   … 回答が無いと作業が進まないもの。放置するとアラートに出る
// 放置の判定は送信日からの営業日数。1営業日超過＝要確認（mid）、3営業日超過＝要注意（high）。
// 「確認中」にしても超過は進む（止まるのは回答済＝確認済になったときだけ）。

import { bizDaysOverdue } from '@/lib/overdue'
import type { CaseReportKind, CaseReportStatus } from '@/types'

/** 画面に出す言葉。DBの値（依頼中/確認中/確認済）とは別に持つ。 */
export const CASE_REPORT_STATUS_LABEL: Record<string, string> = {
  '依頼中': '未回答',
  '確認中': '確認中',
  '確認済': '回答済',
}

export const CASE_REPORT_KIND_STYLE: Record<string, string> = {
  '要対応': 'bg-amber-50 text-amber-800 border-amber-200',
  '情報共有': 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

/** 未回答／確認中／回答済 のサブタブ。DBのステータス値と1:1。 */
export const CASE_REPORT_TABS: { key: CaseReportStatus; label: string }[] = [
  { key: '依頼中', label: '未回答' },
  { key: '確認中', label: '確認中' },
  { key: '確認済', label: '回答済' },
]

export const REPORT_KAKUNIN_BIZ_DAYS = 1   // 1営業日超過 → 要確認
export const REPORT_CHUI_BIZ_DAYS = 3      // 3営業日超過 → 要注意

type ReportLike = { kind: string; status: string; requested_date: string | null }

/** 要対応が放置されている深刻度。情報共有・回答済は null（アラートに出さない）。 */
export function caseReportSeverity(r: ReportLike, todayStr: string): 'kakunin' | 'chui' | null {
  if (r.kind !== '要対応') return null
  if (r.status === '確認済') return null
  if (!r.requested_date) return null
  const n = bizDaysOverdue(r.requested_date, todayStr)
  if (n >= REPORT_CHUI_BIZ_DAYS) return 'chui'
  if (n >= REPORT_KAKUNIN_BIZ_DAYS) return 'kakunin'
  return null
}

/** 経過した営業日数（表示用。「3営業日超過」のバッジに使う） */
export const caseReportOverdueDays = (r: ReportLike, todayStr: string): number =>
  r.requested_date ? bizDaysOverdue(r.requested_date, todayStr) : 0

export const isActionReport = (kind: string): kind is CaseReportKind => kind === '要対応'
