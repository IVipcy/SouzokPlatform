/**
 * タスクテンプレート別の完了条件
 * 「いつ完了ボタンを押していいのか」を分かりやすく記載する
 */

export const TASK_COMPLETION_CONDITIONS: Record<string, string> = {
  // ── Phase 1: 相続人調査 ──
  koseki_request_create:
    '請求書を作成し、全市区町村に提出（郵送または持込）して「提出先」テーブルに提出日を記録したら完了',
  koseki_arrive_check:
    '戸籍が全て届いて、「到着日」を入力し、不足有無を確認したら完了',
  koseki_additional:
    '追加分の戸籍請求書を郵送し終えたら完了',
  heir_survey_create:
    '相続人調査報告書を作成し、管理担当の確認が取れたら完了',
  family_tree_create:
    '法定相続情報一覧図を作成し、管理担当の確認が取れたら完了',
  family_tree_submit:
    '法務局に申請書類を提出したら完了',
  family_tree_receive:
    '法務局から一覧図を受領し、必要枚数を確認したら完了',

  // ── Phase 2: 財産調査 ──
  bank_balance_request:
    '全金融機関に請求 → 書類が届いて、各銀行の「到着日」が全て入力できたら完了',
  securities_inquiry:
    '証券会社から残高照会結果が届き、案件レコードに添付したら完了',
  insurance_inquiry:
    '生命保険協会への照会申請を送付したら完了',
  insurance_arrive:
    '保険協会からの回答が届き、管理担当に報告したら完了',
  pension_inquiry:
    '年金事務所への照会が完了したら完了',
  realestate_research:
    '登記情報・公図・地積測量図を取得し、案件レコードに添付したら完了',
  realestate_eval:
    '不動産の評価額を算出し、案件レコードに記録したら完了',
  debt_inquiry:
    '信用情報機関への照会が完了したら完了',
  asset_list_create:
    '財産目録を作成し、管理担当の確認が取れたら完了',

  // ── Phase 3: 相続税・不動産 ──
  tax_required_check:
    '相続税申告の要否を判定し、案件詳細に記録したら完了',
  tax_doc_prepare:
    '相続税申告に必要な書類を一式準備し終えたら完了',
  tax_accountant_handoff:
    '税理士に案件情報を共有し、連携が開始できたら完了',
  realestate_appraisal:
    '不動産業者からの査定結果が届いたら完了',
  realestate_sale_support:
    '不動産売却サポートが完了したら完了',

  // ── Phase 4: 遺産分割 ──
  division_draft:
    '遺産分割協議書の原案を作成し、管理担当の確認が取れたら完了',
  division_explain:
    '依頼者に分割案を説明し、合意を得たら完了',
  division_finalize:
    '遺産分割協議書の最終版を作成し、管理担当の確認が取れたら完了',
  division_sign:
    '全相続人宛に協議書を郵送したら完了',
  division_collect:
    '全相続人の署名捺印済み協議書を回収し、照合が終わったら完了',

  // ── Phase 5: 登記・解約 ──
  touki_prepare:
    '登記申請書類一式を作成し、管理担当の確認が取れたら完了',
  touki_submit:
    '法務局に申請書類を提出したら完了',
  touki_confirm:
    '登記完了を確認し、謄本を取得したら完了',
  bank_cancel_request:
    '口座解約・名義変更が完了し、入金を確認したら完了',
  securities_cancel:
    '証券口座の移管または解約が完了したら完了',
  insurance_claim:
    '保険金の請求手続きが完了したら完了',
  vehicle_transfer:
    '自動車の名義変更が完了したら完了',

  // ── Phase 6: 完了・精算 ──
  distribution_calc:
    '立替実費を集計し、分配金計算書を作成したら完了',
  invoice_create:
    '依頼者宛の請求書を作成し、受注担当の確認が取れたら完了',
  payment_confirm:
    '依頼者からの入金を確認できたら完了',
  distribution_transfer:
    '各相続人への分配金送金が完了したら完了',
  delivery_create:
    '原本書類一式を依頼者に発送し、送付書を作成したら完了',
  case_close:
    '案件ステータスを「完了」に変更し、クローズ処理が終わったら完了',
}

/**
 * テンプレートキーから完了条件を取得
 * 未定義のテンプレートはnullを返す
 */
export function getCompletionCondition(templateKey: string | null): string | null {
  if (!templateKey) return null
  return TASK_COMPLETION_CONDITIONS[templateKey] ?? null
}
