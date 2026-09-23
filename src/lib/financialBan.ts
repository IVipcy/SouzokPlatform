// 金融資産の「調査禁止指定」まわりの共通ロジック。
// 調査禁止は口座ではなく調査先（金融機関）の話なので、financial_institutions に持つ（migration 271）。
//   調査禁止指定 = 指定なし / 指定あり
//   指定あり → 禁止方法 = 期間指定 / お客さんからの連絡待ち
//     期間指定  … survey_prohibited_start/end（終了日まで凍結・調査をホールド。終了日当日もまだ止める）
//     連絡待ち  … prohibition_released_at が入るまでホールド（お客様OKで解除）
//   禁止理由（survey_prohibited_reason）は 指定あり（両方）で入力。
// この「ホールド」が外れると、凍結してよいか確認 → 凍結依頼 → 調査 へ進める。
//
// 判定はここ1か所。financialWorkflow.isSurveyOnHold（右上の「次の対応」・状況バッジ）と
// nextTaskCandidates.isSurveyOnHold（完了モーダルの候補）はこれを呼ぶ。別々に条件式を持つと
// 「候補は出るのに画面は禁止中」のように食い違う（文言の不一致・終了日当日の扱いで実際にずれていた）。

import type { FinancialInstitutionRow } from '@/types'

export const SURVEY_BAN_DESIGNATIONS = ['指定なし', '指定あり'] as const
export const SURVEY_BAN_METHODS = ['期間指定', 'お客さんからの連絡待ち'] as const

export type SurveyBanFields = Pick<FinancialInstitutionRow, 'survey_prohibited_designation' | 'survey_prohibited_method' | 'survey_prohibited_end' | 'prohibition_released_at'> & {
  survey_prohibited_start?: string | null
}

/**
 * 今、調査禁止ホールドがアクティブか（＝凍結・調査を止めるべきか）。
 *   ・指定なし／未設定 → 止めない
 *   ・解除日（prohibition_released_at）が入っていれば、方法に関係なく止めない（お客様からOKが来た）
 *   ・期間指定 … 開始日前は「まだ禁止に入っていない」ので止めない。終了日当日までは止める（画面の「◯/◯まで」と同じ）。
 *                開始も終了も空なら、指定ありなのに期間が無い＝安全側で止める
 *   ・連絡待ち（方法が空のときも含む）… 解除日が入るまで止める
 */
export function isSurveyBanActive(r: SurveyBanFields, todayYmd: string): boolean {
  if (r.survey_prohibited_designation !== '指定あり') return false
  if (r.prohibition_released_at) return false
  if (r.survey_prohibited_method === '期間指定') {
    const end = (r.survey_prohibited_end ?? '').trim()
    const start = (r.survey_prohibited_start ?? '').trim()
    if (!end && !start) return true
    if (end && todayYmd > end) return false
    if (start && todayYmd < start) return false
    return true
  }
  // 連絡待ち（または方法未選択）→ 解除日が入るまでホールド
  return true
}

/** isSurveyBanActive の別名（financialWorkflow・nextTaskCandidates が使ってきた名前） */
export const isSurveyOnHold = isSurveyBanActive

// ホールドが「解除されたばかり（人の目視確認を促したい）」か。着手OK提案の requiresConfirmation 用。
//   指定あり かつ（期間指定の終了日を過ぎた or 解除日が入った）状態。
export function isSurveyBanReleased(r: SurveyBanFields, todayYmd: string): boolean {
  if (r.survey_prohibited_designation !== '指定あり') return false
  if (isSurveyBanActive(r, todayYmd)) return false
  if (r.prohibition_released_at) return true
  if (r.survey_prohibited_method === '期間指定') return !!r.survey_prohibited_end && todayYmd > r.survey_prohibited_end
  return false   // 連絡待ちで解除日が無ければ、まだ止まっている（上で active と判定済み）
}
