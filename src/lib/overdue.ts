// 入金期日・タスク期日の超過判定。要確認＝5営業日超過〜2週間未満／要注意＝2週間(14日)以上。
// 営業日＝日曜と祝日を除く日（土曜は営業日）。dueDate/todayStr は 'YYYY-MM-DD'。
import { isNonBusinessDay } from '@/lib/holidays'

export type OverdueSeverity = 'kakunin' | 'chui'

// 期日の翌日〜今日までの営業日数（日曜・祝日を除く）。超過していなければ0。
export function bizDaysOverdue(dueDate: string, todayStr: string): number {
  const due = new Date(dueDate + 'T00:00:00')
  const today = new Date(todayStr + 'T00:00:00')
  if (isNaN(due.getTime()) || isNaN(today.getTime()) || today <= due) return 0
  let n = 0
  const d = new Date(due)
  d.setDate(d.getDate() + 1)
  while (d <= today) { if (!isNonBusinessDay(d)) n++; d.setDate(d.getDate() + 1) }
  return n
}

// カレンダー超過日数（今日 − 期日）。
export function calDaysOverdue(dueDate: string, todayStr: string): number {
  const due = new Date(dueDate + 'T00:00:00')
  const today = new Date(todayStr + 'T00:00:00')
  if (isNaN(due.getTime()) || isNaN(today.getTime())) return 0
  return Math.round((today.getTime() - due.getTime()) / 86400000)
}

// タスク期日の判定：2週間(14日)以上=要注意／5営業日超過=要確認／それ未満=null。
export function overdueSeverity(dueDate: string | null | undefined, todayStr: string): OverdueSeverity | null {
  if (!dueDate) return null
  if (calDaysOverdue(dueDate, todayStr) >= 14) return 'chui'
  if (bizDaysOverdue(dueDate, todayStr) >= 5) return 'kakunin'
  return null
}

// 入金期日の判定。タスク期日と同じ基準（5営業日超過=要確認／14日経過=要注意）。
// 一度3/5営業日に早めたが、督促の実務サイクルに対して早すぎたため元に戻した。
export function billOverdueSeverity(dueDate: string | null | undefined, todayStr: string): OverdueSeverity | null {
  return overdueSeverity(dueDate, todayStr)
}

// 受注日起点の判定（オーダーシート未完成・管理担当未アサイン）：3営業日=要確認／5営業日=要注意。
export const ORDER_KAKUNIN_BIZ_DAYS = 3
export const ORDER_CHUI_BIZ_DAYS = 5
export function fromOrderSeverity(orderDate: string | null | undefined, todayStr: string): OverdueSeverity | null {
  if (!orderDate) return null
  const d = bizDaysOverdue(orderDate, todayStr)
  if (d >= ORDER_CHUI_BIZ_DAYS) return 'chui'
  if (d >= ORDER_KAKUNIN_BIZ_DAYS) return 'kakunin'
  return null
}
