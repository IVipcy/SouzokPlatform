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
export type TaskPriority = '通常' | '急ぎ' | '外出タスク'

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
export type RoleKey = 'sales' | 'manager' | 'assistant' | 'lp' | 'accounting'

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
  created_at: string
  updated_at: string
  clients?: ClientRow | null
}

export type ClientRow = {
  id: string
  name: string
  furigana: string | null
  phone: string | null
  email: string | null
  address: string | null
  postal_code: string | null
  relationship_to_deceased: string | null
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
  sort_order: number
  created_at: string
  updated_at: string
  task_assignees?: TaskAssigneeRow[]
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
