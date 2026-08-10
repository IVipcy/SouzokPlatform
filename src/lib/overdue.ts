// 入金期日・タスク期日の超過判定。
//   タスク期日 … 要確認＝5営業日超過／要注意＝14日以上
//   入金期日   … 5営業日を過ぎたところを起点に、そこから3日で要確認・10日で要注意（3日/10日は暦日）
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

// 日付を 'YYYY-MM-DD' に戻す（ローカル日付のまま。UTCずれを避けるため toISOString は使わない）
const toYmd = (d: Date) => d.toLocaleDateString('sv-SE')

/** その日の1つ前の営業日（日曜・祝日は飛ばす）。月曜なら土曜が返る。 */
export function prevBizDay(fromDate: string): string | null {
  const d = new Date(fromDate + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  do { d.setDate(d.getDate() - 1) } while (isNonBusinessDay(d))
  return toYmd(d)
}

/** その日から n 営業日あとの日付（日曜・祝日は数えない）。n=0 は当日。 */
export function addBizDays(fromDate: string, n: number): string | null {
  const d = new Date(fromDate + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  let counted = 0
  while (counted < n) {
    d.setDate(d.getDate() + 1)
    if (!isNonBusinessDay(d)) counted++
  }
  return toYmd(d)
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

// 入金期日の判定。
// まず「期日から5営業日」を督促の起点とし、そこからさらに 3日で要確認・10日で要注意。
// 3日/10日は暦日（営業日ではない）。入金は先方の振込サイクル待ちで、
// 営業日で刻むより「何日たったか」で見るほうが督促の実務に合うため。
export const BILL_BIZ_DAYS = 5        // 期日 → 督促の起点（営業日）
export const BILL_KAKUNIN_DAYS = 3    // 起点 → 要確認（暦日）
export const BILL_CHUI_DAYS = 10      // 起点 → 要注意（暦日）
export function billOverdueSeverity(dueDate: string | null | undefined, todayStr: string): OverdueSeverity | null {
  if (!dueDate) return null
  const base = addBizDays(dueDate, BILL_BIZ_DAYS)
  if (!base) return null
  const d = calDaysOverdue(base, todayStr)
  if (d >= BILL_CHUI_DAYS) return 'chui'
  if (d >= BILL_KAKUNIN_DAYS) return 'kakunin'
  return null
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
