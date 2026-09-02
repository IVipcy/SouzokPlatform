// 金融資産の「調査禁止指定」まわりの共通ロジック。
// 調査禁止は口座ではなく調査先（金融機関）の話なので、financial_institutions に持つ（migration 271）。
//   調査禁止指定 = 指定なし / 指定あり
//   指定あり → 禁止方法 = 期間指定 / お客さんからの連絡待ち
//     期間指定  … survey_prohibited_start/end（終了日まで凍結・調査をホールド）
//     連絡待ち  … prohibition_released_at が入るまでホールド（お客様OKで解除）
//   禁止理由（survey_prohibited_reason）は 指定あり（両方）で入力。
// この「ホールド」が外れると、凍結してよいか確認 → 凍結依頼 → 調査 へ進める。

import type { FinancialInstitutionRow } from '@/types'

export const SURVEY_BAN_DESIGNATIONS = ['指定なし', '指定あり'] as const
export const SURVEY_BAN_METHODS = ['期間指定', 'お客さんからの連絡待ち'] as const

// 今、調査禁止ホールドがアクティブか（＝凍結・調査を止めるべきか）。
export function isSurveyBanActive(r: Pick<FinancialInstitutionRow, 'survey_prohibited_designation' | 'survey_prohibited_method' | 'survey_prohibited_end' | 'prohibition_released_at'>, todayYmd: string): boolean {
  if (r.survey_prohibited_designation !== '指定あり') return false   // 指定なし/未設定＝ホールドなし
  if (r.survey_prohibited_method === '期間指定') {
    return !!r.survey_prohibited_end && todayYmd < r.survey_prohibited_end  // 終了日まではホールド
  }
  // お客さんからの連絡待ち → 解除日が入るまでホールド
  return !r.prohibition_released_at
}

// ホールドが「解除されたばかり（人の目視確認を促したい）」か。着手OK提案の requiresConfirmation 用。
//   指定あり かつ（期間指定の終了日を過ぎた or 連絡待ちを解除した）状態。
export function isSurveyBanReleased(r: Pick<FinancialInstitutionRow, 'survey_prohibited_designation' | 'survey_prohibited_method' | 'survey_prohibited_end' | 'prohibition_released_at'>, todayYmd: string): boolean {
  if (r.survey_prohibited_designation !== '指定あり') return false
  if (isSurveyBanActive(r, todayYmd)) return false
  if (r.survey_prohibited_method === '期間指定') return !!r.survey_prohibited_end && todayYmd >= r.survey_prohibited_end
  return !!r.prohibition_released_at
}
