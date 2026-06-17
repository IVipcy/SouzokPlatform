// 既存の事務管理タスクテンプレ（task_templates・41本）→ 業務 への寄せ（非破壊）。
// DBの phase/category はそのまま温存し、UI上の「業務」分類はここから導出する。
// （受注区分→業務の再設計に合わせ、Phase≒業務・タスク=作業の方針。docs/業務・作業マスタ仕様.md §6）
//
// 値は serviceMaster の業務名（GYOMU_ALL）＋ 区分非依存の '経理' / '相続税'。
// '経理' / '相続税' は受注区分に関係なく常に一括生成の候補に出す。

export const TEMPLATE_GYOMU: Record<string, string> = {
  // 戸籍
  koseki_request_create: '戸籍',
  koseki_mail: '戸籍',
  koseki_arrive_check: '戸籍',
  koseki_additional: '戸籍',
  // 相関図（相続人調査報告書）
  heir_survey_create: '相関図',
  // 法定相続情報取得
  family_tree_create: '法定相続情報取得',
  family_tree_submit: '法定相続情報取得',
  family_tree_receive: '法定相続情報取得',
  // 金融資産（年金・負債照会も③Aで金融資産に畳む）
  bank_balance_request: '金融資産',
  bank_balance_arrive: '金融資産',
  securities_inquiry: '金融資産',
  insurance_inquiry: '金融資産',
  insurance_arrive: '金融資産',
  pension_inquiry: '金融資産',
  debt_inquiry: '金融資産',
  // 不動産
  realestate_research: '不動産',
  realestate_eval: '不動産',
  realestate_appraisal: '不動産',
  realestate_sale_support: '不動産',
  // 目録
  asset_list_create: '目録',
  // 相続税（区分非依存）
  tax_required_check: '相続税',
  tax_doc_prepare: '相続税',
  tax_accountant_handoff: '相続税',
  // 協議書
  division_draft: '協議書',
  division_explain: '協議書',
  division_finalize: '協議書',
  division_sign: '協議書',
  division_collect: '協議書',
  // 登記
  touki_doc_create: '登記',
  touki_submit: '登記',
  touki_complete: '登記',
  // 解約
  bank_cancel_request: '解約',
  securities_cancel: '解約',
  insurance_claim: '解約',
  car_transfer: '解約',
  // 経理（精算・請求・入金・納品・クローズ。区分非依存）
  distribution_calc: '経理',
  invoice_create: '経理',
  payment_confirm: '経理',
  distribution_execute: '経理',
  delivery_create: '経理',
  case_close: '経理',
}

// 受注区分に関係なく常に表示する業務（精算・税務）
export const ALWAYS_GYOMU = ['相続税', '経理'] as const

export function gyomuOfTemplate(key: string): string {
  return TEMPLATE_GYOMU[key] ?? 'その他'
}
