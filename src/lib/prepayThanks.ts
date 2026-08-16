// 前受金の入金御礼連絡まわりの定数と遅れ判定。
// サーバー（アラートAPI・案件一覧）からも読むので、Supabaseクライアントには依存させない。

import { bizDaysOverdue } from '@/lib/overdue'

/** 自動生成する御礼タスクの名前。アラート判定でもこの名前で拾う。 */
export const PREPAY_THANKS_TITLE = '前受金入金御礼連絡'

/**
 * 入金御礼連絡の遅れ。期限＝入金を確認した日。
 * 1営業日たっても終わっていなければ要確認(mid)、2営業日で要注意(high)。
 * お礼の連絡が遅れるのは目に見えて印象が悪いので、他のタスク（5営業日）より早く鳴らす。
 */
export function prepayThanksSeverity(dueDate: string | null | undefined, todayStr: string): 'high' | 'mid' | null {
  if (!dueDate) return null
  const n = bizDaysOverdue(dueDate, todayStr)
  if (n >= 2) return 'high'
  if (n >= 1) return 'mid'
  return null
}
