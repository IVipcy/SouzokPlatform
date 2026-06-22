// === 案件 ===
// 「架電案件化（新規）」は廃止。案件は「面談設定済」から開始する。
export type CaseStatus = '面談設定済' | '検討中' | '検討中（契約書待ち）' | '受注' | '対応中' | '保留・長期' | '完了' | '失注' | '紹介のみ'

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
export type WorkRole = 'manager' | 'assistant' | 'accounting' | 'sales'

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
  lp_case_number: string | null   // LP案件管理番号（相続ステーション側の元番号）
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
  service_category: string | null  // 受注区分①（migration 090）
  service_category_2: string | null  // 受注区分②（検認①→手続き一式②のコンボ。migration 093）
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
  deceased_postal_code: string | null   // 被相続人 郵便番号（migration 101）
  deceased_address: string | null
  deceased_registered_address: string | null
  // 遺産分割
  division_policy: string | null
  division_proposal: string | null
  division_proposal_presence: string | null   // 分配方針の提案 有無（migration 105）
  agreement_signing_method: string | null
  agreement_dispatch_method: string | null     // 協議書の送付・調印（migration 105）
  inheritance_risk: string | null
  real_estate_evaluation_method: string | null // 不動産の評価方法（migration 105）
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
  meeting_executed_date: string | null      // migration 049: 面談実施日
  client_response_due_date: string | null   // migration 049: お客様回答予定日
  consideration_period: string | null        // migration 092: 検討期間区分(1週間/2週間/1ヶ月/見込み不明)
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
  // 手続き詳細（面談時の受領書類状況・役割分担。migration 083）
  intake_documents: { name: string; status: string; arrival_date: string | null; note: string }[] | null
  intake_roles: { gyomu: string; sagyou: string; owner: string; note: string; status?: string; due?: string | null; kind?: 'task' | 'doc'; rid?: string }[] | null
  // 家裁手続き（放棄/調停/検認/後見）の共通情報。業務(gyomu)をキーに保持。migration 108
  // applicant_heir_id/opponent_heir_ids/claim は調停の当事者・争点（任意）。
  court_procedure_info: Record<string, {
    court?: string
    case_number?: string
    filed_date?: string | null
    hearing_date?: string | null
    result?: string
    applicant_heir_id?: string | null
    opponent_heir_ids?: string[]
    claim?: string
  }> | null
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
  // 被相続人年齢（相続ステーション連携で受信。生年月日と併存）
  deceased_age: number | null
  // 相続ステーション連携：伺い先（訪問面談時の訪問先情報）
  visit_address: string | null
  visit_notes: string | null
  // 相続ステーション連携：相談事前情報（LP担当が面談前にヒアリングで取得）
  hearing_content: string | null
  special_notes: string | null
  other_needs: string | null
  // 相続ステーション連携：紹介元の屋号管理番号（例：KN02）
  referral_partner_number: string | null
  // LP担当の追いかけ運用（連携②廃止に伴う）
  lp_followup_allowed: boolean | null
  lp_followup_method: string | null
  lp_followup_method_other: string | null
  lp_followup_due_date: string | null
  // 面談内容（面談で聞き取った内容のメモ・備考。事前情報とは別）
  meeting_hearing_memo: string | null
  meeting_other_notes: string | null
  // 不動産査定
  real_estate_appraisal_status: string | null
  // 財産目録・財産調査
  inventory_categories: string[] | null
  financial_survey_start_condition: string | null
  financial_survey_prohibited_period: string | null
  financial_survey_prohibited_start: string | null  // 財産調査禁止期間 開始日（migration 097）
  financial_survey_prohibited_end: string | null    // 財産調査禁止期間 終了日（migration 097）
  financial_survey_prohibited_reason: string | null
  // 請求関連
  invoice_status: string | null
  advance_payment: number | null
  advance_payment_administrative: number | null  // 前受金（行政・migration 119）
  advance_payment_judicial: number | null         // 前受金（司法・migration 119）
  invoice_date: string | null
  payment_due_date: string | null
  payment_confirmed_date: string | null
  payment_amount: number | null
  partner_compensation: number | null
  invoice_memo: string | null
  // 依頼者情報タブ
  client_trait: 'smile' | 'neutral' | 'angry' | null
  client_trait_detail: string | null
  has_complaint: boolean
  complaint_detail: string | null
  // オーダーシート完成日時（NULL=未作成）。実務タブ解禁・対応中遷移の条件。
  order_sheet_completed_at: string | null
  // 相続登記の任意項目（列名）定義（migration 066）
  registration_columns: string[] | null
  created_at: string
  updated_at: string
  clients?: ClientRow | null
}

// 他事業者紹介（業者別の紹介情報）— 「他事業者紹介」タブの業者サブタブ1件
export const CASE_REFERRAL_PARTNERS = ['税理士', '弁護士', '不動産', '遺品整理'] as const
export type CaseReferralPartner = typeof CASE_REFERRAL_PARTNERS[number]

export type CaseReferralRow = {
  id: string
  case_id: string
  partner_type: CaseReferralPartner | string
  firm_name: string | null        // 紹介先法人名
  referred_date: string | null    // 紹介日付（YYYY-MM-DD）
  content: string | null          // 紹介内容
  estimated_fee: number | null    // 見込み報酬
  billing_status: string | null   // 報酬請求状態
  created_at: string
  updated_at: string
}

// 依頼者とのやり取り履歴
export type ClientCommunicationRow = {
  id: string
  case_id: string
  communicated_at: string  // YYYY-MM-DD
  communication_type: string
  detail: string | null
  status: 'お客様待ち' | '完了'
  created_at: string
  updated_at: string
}

// 案件の依頼者（同行者含む・複数人）
export type CaseClientRow = {
  id: string
  case_id: string
  name: string
  furigana: string | null
  priority: 'main' | 'companion' | string  // メイン依頼人 / 同行者
  birth_date: string | null                // 生年月日（YYYY-MM-DD）。年齢は算出。
  relationship: string | null              // 被相続人との続柄
  phone: string | null                     // TEL①
  email: string | null
  mobile_phone: string | null              // TEL②（携帯。migration 089）
  preferred_contact: string[] | null       // 連絡先希望（migration 089）
  has_special_chars: boolean               // 外字有無（migration 089）
  sort_order: number
  created_at: string
  updated_at: string
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
  transfer_name_kana: string | null  // 振込名義人カナ（入金CSV突合キー。migration 114）
}

export type MemberRow = {
  id: string
  name: string
  email: string | null
  avatar_color: string
  is_active: boolean
  team_id?: string | null
  job_type?: string | null
  joined_at?: string | null
  primary_role?: 'sales' | 'manager' | 'assistant' | 'lp' | 'accounting' | null
  avatar_url?: string | null
  phone?: string | null
  bio?: string | null
  hobbies?: string[] | null
  specialties?: string[] | null
  hometown?: string | null
  favorite_food?: string | null
}

export type CaseMemberRow = {
  id: string
  case_id: string
  member_id: string
  role: RoleKey
  members?: MemberRow
}

/** タスクの種別。
 *  - case   : 案件タスク (Phase別、前後関係あり、手動作成)
 *  - system : システムタスク (案件運用前後の自動生成タスク、前後関係なし) */
export type TaskKind = 'case' | 'system'

/** システムタスクの担当区分。
 *  - sales   : 受注担当
 *  - manager : 管理担当
 *  - both    : 両担当（受注担当＋管理担当の2人を自動アサイン） */
export type AssignRole = 'sales' | 'manager' | 'both'

export type TaskRow = {
  id: string
  case_id: string
  task_kind: TaskKind   // migration 046
  template_key: string | null
  title: string
  phase: string
  category: string | null
  status: string
  priority: string
  work_role: WorkRole | null
  assign_role: AssignRole | null   // migration 056: 担当区分（受注担当/管理担当/両担当）
  team_id: string | null           // migration 057: 担当チーム（チームタスク欄の基盤）
  due_date: string | null
  procedure_text: string | null
  wcheck_by: string | null
  started_by: string | null
  started_at: string | null
  sort_order: number
  source_rid: string | null        // migration 109: 生成元の実施タスク(intake_roles[].rid)
  ext_data: Record<string, unknown> | null
  issued_date: string | null
  notes: string | null
  remarks: string | null
  // 作業完了予定日 / 完了日（migration 043 で追加）
  expected_completion_date: string | null
  completed_at: string | null
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
// migration 045 でシンプル化: 未請求 / 作成済 / 入金待ち / 入金済 の4種類
// 「前受金 / 確定請求」の区別は invoice_type 列で表現する
export type InvoiceStatus = '未請求' | '作成済' | '入金待ち' | '入金済'

export type InvoiceRow = {
  id: string
  case_id: string
  invoice_number: string | null
  invoice_type: '前受金' | '確定請求'
  firm_type: 'gyosei' | 'shiho' | null   // migration 059: 発行法人（行政書士/司法書士）
  amount: number             // 請求総額（fee_amount + expenses_amount − advance_deduction）
  fee_amount: number         // 報酬部分
  expenses_amount: number    // 立替実費部分
  advance_deduction: number  // 前受金控除額（確定請求のみ）。migration 060
  status: InvoiceStatus
  issued_date: string | null
  due_date: string | null
  notes: string | null
  generated_file_path: string | null  // migration 113: 公式請求書Excelのパス（documentsバケット）
  overdue_notified_at: string | null   // migration 115: 未入金アラートを受注担当へ送信した日時
  receipt_issued_date: string | null   // migration 118: 領収書を発行（生成）した日
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
  matched_by: string | null   // migration 112: 'ai'（CSV自動突合）/ 'human'
  match_note: string | null
  is_refund: boolean          // migration 122: 返金行（amountはマイナス）
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
  relationship_type: string | null   // 被相続人との続柄（法定相続人・代襲まで網羅。migration 103でCHECK撤去）
  is_applicant: boolean
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// === 戸籍請求（請求単位） ===
export type KosekiRequestRow = {
  id: string
  case_id: string
  request_to: string | null       // 請求先（市区町村/本籍地役所）
  target_person: string | null    // 対象者（誰の戸籍か。被相続人/相続人から選択）
  range_text: string | null       // 範囲（出生から死亡まで/現在戸籍 等。migration 099）
  doc_types: string | null        // 種別（戸籍/除籍/原戸籍/附票 など）
  purpose: string | null          // 取得目的
  request_reason: string | null       // 戸籍請求理由
  request_reason_other: string | null // 戸籍請求理由（その他）
  request_date: string | null     // 請求日
  arrival_date: string | null     // 到着日（受領日）
  acquirer: string | null         // 取得区分（自社/依頼者。migration 085）
  expected_arrival_date: string | null // 到着予定日（見込み。migration 085）
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// === 契約手続き 受領書類（migration 086。受信簿と連動） ===
export type ContractDocumentRow = {
  id: string
  case_id: string
  name: string | null
  status: string | null                 // その場で受領/後日郵送/依頼者が取得/不要
  category: string | null               // migration 094: 区分（契約/戸籍/財産/登記/その他）
  expected_arrival_date: string | null   // 到着予定日（見込み）
  arrival_date: string | null            // 到着日（受信簿で受信＝受信済）
  case_document_id: string | null
  // 受領書類のスキャンファイル等（任意・migration 121）。原本のみでスキャン無しのこともある
  file_path: string | null
  file_bucket: string | null
  file_name: string | null
  file_type: string | null
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// === 作業に紐づく必要書類（請求・受領・受信簿連動） migration 091 ===
export type SagyoDocumentRow = {
  id: string
  case_id: string
  gyomu: string                  // 業務（intake_roles[].gyomu と一致）
  sagyou: string                 // 作業（intake_roles[].sagyou と一致）
  name: string | null            // 書類名
  requested_to: string | null    // 請求先
  requested_date: string | null  // 請求日
  received_date: string | null   // 受領日（受信簿連動 or 手入力）
  receipt_id: string | null      // 受信簿(document_receipts)へのFK
  status: string | null          // 未請求/請求済/受領/不要 等
  note: string | null
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
  rank: 'S' | 'A' | 'B' | 'C' | '確認中' | null
  appraisal_status: '未対応' | '対応中' | '完了' | '不要' | null
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
  // 相続登記（migration 066 / 071）
  title_change_required: string | null            // 名義変更要否（要/不要/確認中）
  title_change_date: string | null                // 名義変更実施日
  title_change_request_date: string | null        // 必要情報の請求日
  title_change_arrival_date: string | null        // 必要情報の到着日
  title_change_done: boolean                      // 名義変更完了
  registration_data: Record<string, string> | null // 任意項目の値（{列名:値}）
  // 名寄せ・取得物（migration 069）
  name_consolidation_arrival_date: string | null  // 名寄せ到着日
  admin_sq_required: string | null                // 行政SQ要否
  judicial_sq_required: string | null             // 司法SQ要否
  ref_nayose: boolean                             // 名寄せ参照
  ref_title_deed: boolean                         // 権利書参照
  ref_tax_notice: boolean                         // 納税通知書参照
  registry_required: string | null                // 登記情報 要否
  cadastral_required: string | null               // 公図 要否
  survey_map_required: string | null              // 地積測量図 要否
  route_price_required: string | null             // 路線価 要否
  eval_cert_required: string | null               // 評価証明 要否
  eval_cert_obtained: boolean                     // 評価証明 取得済
  // 取得物ごとの請求日・受領日（migration 072）
  registry_request_date: string | null            // 登記情報 請求日
  registry_receipt_date: string | null            // 登記情報 受領日
  cadastral_request_date: string | null           // 公図 請求日
  cadastral_receipt_date: string | null           // 公図 受領日
  survey_map_request_date: string | null          // 地積測量図 請求日
  survey_map_receipt_date: string | null          // 地積測量図 受領日
  route_price_request_date: string | null         // 路線価 請求日
  route_price_receipt_date: string | null         // 路線価 受領日
  eval_cert_request_date: string | null           // 評価証明 請求日
  eval_cert_receipt_date: string | null           // 評価証明 受領日
  acquirer: string | null                          // 取得区分（自社/依頼者。migration 085）
  expected_arrival_date: string | null             // 到着予定日（見込み。migration 085）
  sale_expected_date: string | null
  kaoku_bango: string | null                       // 家屋番号（固定資産申請書の家屋行。migration 098）
  near_land_price: string | null                   // 近傍宅地価格の要否（要/不要。migration 098）
  // 相続登記（migration 100）
  registration_types: string[] | null              // 相続登記の種別（複数選択）
  registration_cause: string | null                // 登記原因
  registration_office: string | null               // 管轄法務局
  registration_status: string | null               // ステータス
  registration_apply_date: string | null           // 申請日
  registration_complete_date: string | null        // 完了日
  registration_notes: string | null                // 備考
  notes: string | null
  created_at: string
}

// 不動産の取得資料管理（migration 102）。請求・参照を問わず取得物を案件単位で管理。
export type RealEstateAcquisitionRow = {
  id: string
  case_id: string
  item_type: string | null            // 登記情報/公図/地積測量図/評価証明/名寄帳/路線価
  target_property_id: string | null   // 物件単位の対象
  target_municipality: string | null  // 市区町村単位の対象
  request_to: string | null
  request_date: string | null
  expected_arrival_date: string | null
  arrival_date: string | null
  received: boolean
  amount: number | null
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
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
  // 解約手続（migration 065）
  cancellation_required: string | null      // 解約有無（有/無/確認中）
  cancellation_date: string | null          // 解約予定日
  cancellation_restrictions: string | null  // 解約時の禁止事項
  cancellation_request_date: string | null  // 解約書類の請求日（migration 070）
  cancellation_arrival_date: string | null  // 解約書類の到着日（migration 070）
  cancellation_done: boolean                // 解約完了（migration 070）
  // 調査・進捗（migration 068）
  all_branch_survey: string | null          // 全店調査要否（預金）
  balance_cert_required: string | null      // 残高証明要否（預金/証券）
  accrued_interest_required: string | null  // 経過利息要否（預金）
  share_cert_required: string | null        // 所有株式数証明要否（信託）
  unclaimed_dividend_required: string | null // 未受領配当金要否（信託）
  survey_period_type: string | null         // 相続開始日 / 任意指定
  survey_date: string | null                // 調査基準日（任意指定時）
  request_date: string | null               // 請求日（進捗）
  arrival_date: string | null               // 到着日（進捗）
  acquirer: string | null                    // 取得区分（自社/依頼者。migration 085）
  expected_arrival_date: string | null       // 到着予定日（見込み。migration 085）
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

// === 遺産分割協議書の送付・受領（相続人単位） ===
export type AgreementDispatchRow = {
  id: string
  case_id: string
  heir_id: string | null
  sent_date: string | null
  received_date: string | null
  received: boolean
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
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
  /** 課税区分（true=課税 / false=非課税 / null=未設定）。migration 060 */
  taxable: boolean | null
  /** どの請求書で請求済みか（null = 未請求） */
  billed_invoice_id: string | null
  created_at: string
}

// === 案件書類（旧 document_dispatches / documents の統合） ===
export type CaseDocumentRow = {
  id: string
  case_id: string
  task_id: string | null
  document_name: string
  // 発送情報
  sent_date: string | null
  sent_to: string | null
  quantity: number
  // 受領情報
  received_date: string | null
  // 自社控えファイル（AI生成や手動アップロード）
  outbound_file_path: string | null
  outbound_file_name: string | null
  outbound_file_type: string | null
  outbound_file_bucket: string | null
  // 受領ファイル
  received_file_path: string | null
  received_file_name: string | null
  received_file_type: string | null
  received_file_bucket: string | null
  generated_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
  cases?: { id: string; case_number: string; deal_name: string } | null
  tasks?: { id: string; title: string } | null
}

// === 書類受信簿 ===
export type DocumentReceiptItemRow = {
  id: string
  receipt_id: string
  item_name: string         // 戸籍 / 住民票 / 名古屋戸籍 など
  quantity: number | null   // 通数
  received_from: string | null  // 受領先
  sort_order: number
  // 取得物への任意リンク（migration 073）
  linked_kind: string | null    // 'financial_asset' | 'real_estate' | 'koseki'
  linked_id: string | null      // 取得物テーブルの行ID
  linked_field: string | null   // 受領日を書き込む対象カラム名
  // 書類タブ(case_documents)の受領書類レコードへの紐づけ（migration 082）
  case_document_id: string | null
  created_at: string
}

export type DocumentReceiptRow = {
  id: string
  case_id: string
  received_date: string     // YYYY-MM-DD
  sequence_no: number       // 当日の連番
  dual_check_member_id: string | null
  dual_checked_at: string | null
  started_by_member_id: string | null
  started_at: string | null
  created_at: string
  updated_at: string
  // join 用
  cases?: { id: string; case_number: string; deal_name: string } | null
  items?: DocumentReceiptItemRow[]
  dual_check_member?: { id: string; name: string; avatar_color: string; avatar_url: string | null; primary_role: string | null } | null
  started_by_member?: { id: string; name: string; avatar_color: string; avatar_url: string | null; primary_role: string | null } | null
}

/** 旧名（後方互換用エイリアス） */
export type DocumentDispatchRow = CaseDocumentRow

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

// === 入金状況の確認依頼（経理/管理担当 → 受注担当） ===
export type PaymentCheckStatus = '依頼中' | '確認済'

export type PaymentCheckRequestRow = {
  id: string
  invoice_id: string
  case_id: string
  requester_id: string   // 依頼した経理/管理担当
  confirmer_id: string   // 確認する受注担当
  status: PaymentCheckStatus
  result_note: string | null   // 受注担当が入れる確認結果
  requested_date: string
  confirmed_date: string | null
  auto_closed: boolean
  created_at: string
  updated_at: string
}

// === 進捗報告（進捗確認依頼） ===
export type ProgressReportStatus = '依頼中' | '確認済'

export type ProgressReportRow = {
  id: string
  case_id: string
  requester_id: string   // 依頼した管理担当
  confirmer_id: string   // 確認者
  requested_date: string // 進捗確認依頼日
  status: ProgressReportStatus
  confirmed_date: string | null // 確認日付
  created_at: string
  updated_at: string
}
