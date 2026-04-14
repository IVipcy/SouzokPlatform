/**
 * テンプレート間のフロールール定義
 * タスク一括生成時に依存関係を自動作成するためのマスタデータ
 */

export type FlowCondition = {
  type: 'task_completed' | 'checkpoint'
  checkpointField?: string
  label: string
}

export type TemplateFlowRule = {
  from: string   // 前提タスクの template_key
  to: string     // 次のタスクの template_key
  condition: FlowCondition
}

export const TEMPLATE_FLOW_RULES: TemplateFlowRule[] = [
  // ── Phase 1: 相続人調査 ──
  { from: 'koseki_request_create', to: 'koseki_mail',         condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'koseki_mail',           to: 'koseki_arrive_check', condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'koseki_arrive_check',   to: 'koseki_additional',   condition: { type: 'checkpoint', checkpointField: 'shortage', label: '不足有無が「あり」' } },
  { from: 'koseki_arrive_check',   to: 'heir_survey_create',  condition: { type: 'checkpoint', checkpointField: 'arrDate', label: '到着日が入力済' } },
  { from: 'heir_survey_create',    to: 'family_tree_create',  condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'family_tree_create',    to: 'family_tree_submit',  condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'family_tree_submit',    to: 'family_tree_receive', condition: { type: 'task_completed', label: 'タスク完了' } },

  // ── Phase 1 → Phase 2 ブリッジ ──
  { from: 'family_tree_receive', to: 'bank_balance_request', condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'family_tree_receive', to: 'securities_inquiry',   condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'family_tree_receive', to: 'insurance_inquiry',    condition: { type: 'task_completed', label: 'タスク完了' } },

  // ── Phase 2: 財産調査 ──
  // bank_balance_request は全銀行の到着管理まで含むため、到着確認タスクは不要
  { from: 'bank_balance_request', to: 'asset_list_create',   condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'insurance_inquiry',    to: 'insurance_arrive',    condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'realestate_research',  to: 'realestate_eval',     condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'securities_inquiry',   to: 'asset_list_create',   condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'insurance_arrive',     to: 'asset_list_create',   condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'realestate_eval',      to: 'asset_list_create',   condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'debt_inquiry',         to: 'asset_list_create',   condition: { type: 'task_completed', label: 'タスク完了' } },

  // ── Phase 2 → Phase 3 ──
  { from: 'asset_list_create', to: 'tax_required_check', condition: { type: 'task_completed', label: 'タスク完了' } },

  // ── Phase 3 ──
  { from: 'tax_required_check',  to: 'tax_doc_prepare',        condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'tax_doc_prepare',     to: 'tax_accountant_handoff', condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'realestate_research', to: 'realestate_appraisal',   condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'realestate_research', to: 'realestate_sale_support', condition: { type: 'task_completed', label: 'タスク完了' } },

  // ── Phase 3 → Phase 4 ──
  { from: 'asset_list_create',  to: 'division_draft', condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'tax_required_check', to: 'division_draft', condition: { type: 'task_completed', label: 'タスク完了' } },

  // ── Phase 4: 遺産分割 ──
  { from: 'division_draft',    to: 'division_explain',  condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'division_explain',  to: 'division_finalize', condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'division_finalize', to: 'division_sign',     condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'division_sign',     to: 'division_collect',  condition: { type: 'task_completed', label: 'タスク完了' } },

  // ── Phase 4 → Phase 5 ──
  { from: 'division_collect', to: 'touki_doc_create',       condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'division_collect', to: 'bank_cancel_request',    condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'division_collect', to: 'securities_cancel',      condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'division_collect', to: 'insurance_claim',        condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'division_collect', to: 'car_transfer',           condition: { type: 'task_completed', label: 'タスク完了' } },

  // ── Phase 5 ──
  { from: 'touki_doc_create', to: 'touki_submit',   condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'touki_submit',     to: 'touki_complete', condition: { type: 'task_completed', label: 'タスク完了' } },

  // ── Phase 5 → Phase 6 ──
  { from: 'touki_complete',      to: 'distribution_calc', condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'bank_cancel_request', to: 'distribution_calc', condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'securities_cancel',   to: 'distribution_calc', condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'insurance_claim',     to: 'distribution_calc', condition: { type: 'task_completed', label: 'タスク完了' } },

  // ── Phase 6: 完了・精算 ──
  { from: 'distribution_calc',    to: 'invoice_create',       condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'invoice_create',       to: 'payment_confirm',      condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'payment_confirm',      to: 'distribution_execute', condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'distribution_execute', to: 'delivery_create',      condition: { type: 'task_completed', label: 'タスク完了' } },
  { from: 'delivery_create',      to: 'case_close',           condition: { type: 'task_completed', label: 'タスク完了' } },
]
