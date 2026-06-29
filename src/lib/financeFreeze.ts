import type { TaskRow } from '@/types'
import { stripGyomu } from '@/lib/kotei'

// 金融資産の凍結確認（財産調査禁止期間）ゲート。
// 管理担当が口座凍結を確認するまで、金融資産調査・解約の作業は着手不可。

// 凍結ゲートの対象となる業務区分（金融資産・解約）。
const FREEZE_GATED_GYOMU = new Set(['金融資産', '解約'])

// そのタスクが金融凍結ゲートの対象か（業務区分が金融資産 or 解約）。
export function isFinanceFreezeTask(task: Pick<TaskRow, 'phase'>): boolean {
  return FREEZE_GATED_GYOMU.has(stripGyomu(task.phase))
}

// 案件に「凍結未確認の金融資産」があるか。1件でもあれば金融タスクは着手不可。
export function caseHasUnconfirmedFreeze(assets: Array<{ freeze_confirmed?: boolean | null }>): boolean {
  return assets.some(a => a.freeze_confirmed !== true)
}

// このタスクが凍結確認待ちで着手不可か。
//   isFinanceFreezeTask かつ 案件に未確認の金融資産がある場合に true。
export function isFreezeBlocked(task: Pick<TaskRow, 'phase' | 'case_id'>, blockedCaseIds: Set<string>): boolean {
  return isFinanceFreezeTask(task) && blockedCaseIds.has(task.case_id)
}
