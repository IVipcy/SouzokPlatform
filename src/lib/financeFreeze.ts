import type { TaskRow } from '@/types'
import { stripGyomu } from '@/lib/kotei'

// 口座凍結ゲート：管理担当が口座凍結を確認するまで「解約（お金を動かす作業）」は着手不可。
// ※調査（金融資産）は凍結ではなく「財産調査禁止期間（最終入金待ち）」で止める（別ゲート）ため、
//   ここには含めない。凍結が要るのは解約だけ。

// 凍結ゲートの対象となる業務区分（解約のみ）。
const FREEZE_GATED_GYOMU = new Set(['解約'])

// そのタスクが凍結ゲートの対象か（業務区分が解約）。
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
