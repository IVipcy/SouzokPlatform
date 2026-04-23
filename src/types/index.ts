// === 案件 ===
export type CaseStatus = '架電案件化' | '面談設定済' | '検討中' | '受注' | '対応中' | '保留・長期' | '完了' | '失注'

export type Case = {
  id: string
  caseId: string           // R7-A00127
  dealName: string
  status: CaseStatus
  clientName: string
  deceasedName: string
  dateOfDeath: string
  orderDate: string
  difficulty: '易' | '普' | '難'
  procedureType: string[]
  additionalServices: string[]
  taxFilingRequired: '要' | '不要' | '確認中'
  totalAssetEstimate: number
  propertyRank: 'S' | 'A' | 'B' | 'C' | '確認中'
}

// === タスク ===
export type TaskStatus = '未着手' | '対応中' | 'Wチェック待ち' | '差戻し' | '完了'
export type TaskPriority = '通常' | '急ぎ'

export type Task = {
  id: string
  caseId: string
  title: string
  phase: string
  category: string
  status: TaskStatus
  priority: TaskPriority
  assignee: string         // 主担当
  subAssignees: string[]   // 副担当
  dueDate: string
  procedure: string
  wcheckBy?: string
  wcheckAt?: string
}

// === メンバー ===
export type RoleKey = 'sales' | 'manager' | 'sub_manager' | 'assistant' | 'lp' | 'accounting'

export type Member = {
  id: string
  name: string
  email: string
  avatarColor: string
  roles: RoleKey[]
  isActive: boolean
}

// === DB行型（Supabaseレスポンス準拠） ===

export type CaseRow = {
  id: string
  case_number: string
  deal_name: string
  status: string
  client_id: string | null
  deceased_name: string | null
  date_of_death: string | null
  order_date: string | null
  completion_date: string | null
  expected_completion_date: string | null
  difficulty: '易' | '普' | '難' | null
  procedure_type: string[] | null
  additional_services: string[] | null
  tax_filing_required: '要' | '不要' | '確認中'
  tax_filing_deadline: string | null
  property_rank: 'S' | 'A' | 'B' | 'C' | '確認中' | null
  total_asset_estimate: number | null
  partner_id: string | null
  referral_destination_id: string | null
  referral_fee: number | null
  notes: string | null
  // 被相続人追加情報
  deceased_furigana: string | null
  deceased_birth_date: string | null
  deceased_address: string | null
  deceased_registered_address: string | null
  // 遺産分割
  division_policy: string | null
  division_proposal: string | null
  agreement_signing_method: string | null
  inheritance_risk: string | null
  // 遺言
  will_type: string | null
  will_storage: string | null
  will_execution: string | null
  // 契約・報酬
  contract_type: string | null
  contract_date: string | null
  fee_administrative: number | null
  fee_judicial: number | null
  fee_total: number | null
  payment_status: string | null
  payment_date: string | null
  fee_real_estate: number | null
  fee_tax_referral: number | null
  total_revenue_estimate: number | null
  // 基本情報追加
  location: string | null
  team: string | null
  probability: number | null
  meeting_date: string | null
  order_received_date: string | null
  lost_reason: string | null
  // 受注内容追加
  other_procedure: string | null
  order_category: string[] | null
  // 戸籍請求関連
  koseki_request_reason: string | null
  koseki_request_reason_other: string | null
  koseki_request_pattern: string | null
  koseki_request_type: string[] | null
  koseki_purpose: string | null
  koseki_notes: string | null
  // 受注ルート・紹介
  order_route: string | null
  order_route_detail: string | null
  order_route_lp_name: string | null
  order_route_person: string | null
  referral_name: string | null
  meeting_place: string | null
  lawyer_name: string | null
  lawyer_office: string | null
  lawyer_referral_fee: number | null
  estate_clearance_company: string | null
  estate_clearance_fee: number | null
  // 郵送・書類管理
  mailing_destination: string | null
  mailing_address_other: string | null
  investigation_document: string | null
  // 相続税申告追加
  tax_advisor_referral: string | null
  tax_advisor_name: string | null
  // 遺言関連追加
  will_remainders_risk: boolean
  will_bequest: boolean
  will_creation_place: string | null
  notary_office_name: string | null
  will_witness: string | null
  will_content: string[] | null
  will_content_details: Record<string, string> | null
  will_bequest_handler: string | null
  will_draft_confirmed_date: string | null
  // 信託関連
  trust_contract_type: string | null
  trust_final_beneficiary: string | null
  trust_creation_place: string | null
  trust_content: string[] | null
  trust_content_details: Record<string, string> | null
  // 生命保険提案
  life_insurance_proposal: string | null
  life_insurance_company: string | null
  life_insurance_type_amount: string | null
  life_insurance_type: string | null
  life_insurance_amount: number | null
  life_insurance_inquiry: boolean
  life_insurance_inquiry_notes: string | null
  // 被相続人追加
  deceased_has_special_chars: boolean
  // 不動産査定
  real_estate_appraisal_status: string | null
  // 財産目録・財産調査
  inventory_categories: string[] | null
  financial_survey_start_condition: string | null
  // 請求関連
  invoice_status: string | null
  advance_payment: number | null
  invoice_date: string | null
  payment_due_date: string | null
  payment_confirmed_date: string | null
  payment_amount: number | null
  partner_compensation: number | null
  invoice_memo: string | null
  created_at: string
  updated_at: string
  clients?: ClientRow | null
}

export type ClientRow = {
  id: string
  name: string
  furigana: string | null
  phone: string | null
  mobile_phone: string | null
  email: string | null
  address: string | null
  postal_code: string | null
  relationship_to_deceased: string | null
  preferred_contact: string[] | null
  customer_no: string | null
  has_special_chars: boolean
  notes: string | null
}

export type MemberRow = {
  id: string
  name: string
  email: string | null
  avatar_color: string
  is_active: boolean
}

export type CaseMemberRow = {
  id: string
  case_id: string
  member_id: string
  role: RoleKey
  members?: MemberRow
}

export type TaskRow = {
  id: string
  case_id: string
  template_key: string | null
  title: string
  phase: string
  category: string | null
  status: string
  priority: string
  due_date: string | null
  procedure_text: string | null
  wcheck_by: string | null
  started_by: string | null
  started_at: string | null
  sort_order: number
  ext_data: Record<string, unknown> | null
  issued_date: string | null
  notes: string | null
  remarks: string | null
  created_at: string
  updated_at: string
  task_assignees?: TaskAssigneeRow[]
  started_by_member?: MemberRow | null
  cases?: CaseRow & { clients?: ClientRow | null }
}

export type TaskAssigneeRow = {
  id: string
  task_id: string
  member_id: string
  role: 'primary' | 'sub'
  members?: MemberRow
}

export type TaskTemplateRow = {
  id: string
  key: string
  label: string
  phase: string
  category: string
  procedure_text: string | null
  default_role: string | null
  sort_order: number
  is_active: boolean
}

// === タスク依存関係 ===
export type TaskDependencyConditionType = 'task_completed' | 'checkpoint'

export type TaskDependencyRow = {
  id: string
  case_id: string
  from_task_id: string
  to_task_id: string
  condition_type: TaskDependencyConditionType
  checkpoint_field: string | null
  label: string | null
  created_at: string
  from_task?: TaskRow
  to_task?: TaskRow
}

// === 案件活動履歴 ===
export type CaseActivityRow = {
  id: string
  case_id: string
  task_id: string | null
  member_id: string | null
  activity_type: 'task_started' | 'task_completed' | 'status_change' | 'note'
  description: string
  activity_date: string
  created_at: string
  members?: MemberRow
  tasks?: { id: string; title: string }
}

// === ドキュメント ===
export type DocumentRow = {
  id: string
  case_id: string
  task_id: string | null
  name: string
  file_path: string | null
  file_type: string | null
  generated_by: string | null
  status: string
  created_at: string
  updated_at: string
  cases?: CaseRow
  tasks?: TaskRow
}

// === 請求・入金 ===
export type InvoiceStatus = '未請求' | '前受金請求済' | '前受金入金済' | '確定請求済' | '入金済' | '一部入金'

export type InvoiceRow = {
  id: string
  case_id: string
  invoice_number: string | null
  invoice_type: '前受金' | '確定請求'
  amount: number
  status: InvoiceStatus
  issued_date: string | null
  due_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
  cases?: CaseRow
  payments?: PaymentRow[]
}

export type PaymentRow = {
  id: string
  invoice_id: string
  amount: number
  payment_date: string
  payment_method: string | null
  notes: string | null
  created_at: string
}

// === 相続人 ===
export type HeirRow = {
  id: string
  case_id: string
  name: string
  furigana: string | null
  relationship: string | null
  address: string | null
  registered_address: string | null
  phone: string | null
  email: string | null
  is_legal_heir: boolean
  birth_date: string | null
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// === 不動産 ===
export type RealEstatePropertyRow = {
  id: string
  case_id: string
  property_type: string | null
  address: string | null
  lot_number: string | null
  resident_status: string | null
  area_evaluation: string | null
  building_age: number | null
  sale_intention: string | null
  has_title_deed: boolean
  has_tax_notice: boolean
  name_consolidation_dest: string | null
  evaluation_cert_dest: string | null
  has_registry_info: boolean
  has_cadastral_map: boolean
  evaluation_method: string | null
  is_condo_land: boolean
  sale_agent_name: string | null
  has_survey_map: boolean
  has_route_price: boolean
  sale_expected_date: string | null
  notes: string | null
  created_at: string
}

// === 金融資産 ===
export type FinancialAssetRow = {
  id: string
  case_id: string
  asset_type: string
  institution_name: string
  branch_name: string | null
  required_docs: string[] | null
  existence_check: string | null
  balance_cert_date: string | null
  transaction_history_period: string | null
  safe_deposit_box: string | null
  dissolution_status: string | null
  passbook_status: string | null
  houri_inquiry: boolean
  odd_lot_handling: string | null
  unclaimed_dividend: string | null
  new_account_found_date: string | null
  stock_name: string | null
  additional_info: Record<string, unknown> | null
  notes: string | null
  created_at: string
}

// === 分割内容 ===
export type DivisionDetailRow = {
  id: string
  case_id: string
  asset_category: string
  division_method: string | null
  recipient: string | null
  share_ratio: string | null
  description: string | null
  created_at: string
}

// === 立替実費 ===
export type ExpenseRow = {
  id: string
  case_id: string
  item_name: string
  amount: number
  expense_date: string | null
  related_task: string | null
  notes: string | null
  category: string | null
  related_task_id: string | null
  created_at: string
}

export type PartnerRow = {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  kickback_rate: number
  notes: string | null
  is_active: boolean
  created_at: string
}

// === スケジュール ===
export type EventType = 'interview' | 'task' | 'deadline' | 'other'

export type EventRow = {
  id: string
  title: string
  event_type: EventType
  event_date: string
  start_time: string | null
  end_time: string | null
  member_id: string | null
  case_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  members?: MemberRow
  cases?: CaseRow
}
