// === フェーズ定義 ===
export const PHASES = [
  { key: 'Phase1:相続人調査', label: 'Phase1: 相続人調査', color: '#2563EB' },
  { key: 'Phase2:財産調査', label: 'Phase2: 財産調査', color: '#7C3AED' },
  { key: 'Phase3:不動産・相続税', label: 'Phase3: 不動産・相続税', color: '#D97706' },
  { key: 'Phase4:遺産分割', label: 'Phase4: 遺産分割', color: '#059669' },
  { key: 'Phase5:登記・解約', label: 'Phase5: 登記・解約', color: '#EA580C' },
  { key: 'Phase6:完了・精算', label: 'Phase6: 完了・精算', color: '#DC2626' },
] as const

// === 案件ステータス ===
// key = 内部キー（DB値・既存ロジックの比較に使用。絶対に変更しない）
// label = 表示名（改称はここだけ。受注→受託 / 失注→不受託 / 保留・長期→長期保留）
// 表示は getCaseStatusLabel(key) を使い、key を直接画面に出さない。
// 「新規（架電案件化）」は廃止。案件は必ず「面談設定済」から開始する。
// 並び順は案件ライフサイクル＝相談案件→個別管理案件→管理案件の順。
export const CASE_STATUSES = [
  // 相談案件（受注担当が受託に至るまで）
  { key: '面談設定済', label: '面談設定済', color: '#3B82F6' },
  { key: '検討中', label: '検討中', color: '#D97706' },
  { key: '検討中（契約書待ち）', label: '検討中（契約書待ち）', color: '#F59E0B' },
  { key: '受注', label: '受託', color: '#16A34A' },
  { key: '失注', label: '不受託', color: '#DC2626' },
  // 個別管理案件（受託せず紹介のみ／長期保留。戻り受注の可能性あり）
  { key: '紹介のみ', label: '紹介のみ', color: '#0891B2' },
  { key: '保留・長期', label: '長期保留', color: '#EA580C' },
  // 管理案件（受託後、管理担当が引き継ぎ対応）
  { key: '対応中', label: '対応中', color: '#7C3AED' },
  { key: '完了', label: '完了', color: '#059669' },
] as const

// 案件ステータスの表示ラベルを取得（未知キーはそのまま返す）
export const getCaseStatusLabel = (key: string | null | undefined): string =>
  CASE_STATUSES.find(s => s.key === key)?.label ?? key ?? ''

// === 案件分類（相談案件 / 個別管理案件 / 管理案件） ===
// 相談案件      : 受注担当が「受託」に至るまでの状態（面談〜検討〜受託/不受託）
// 個別管理案件  : 受託に至らず紹介のみ・長期保留（裁判解決後などに「戻り受注」になり得る）
// 管理案件      : 受託後、管理担当へ引き継がれ対応中〜完了
export const CONSULT_STATUSES = ['面談設定済', '検討中', '検討中（契約書待ち）', '受注', '失注'] as const
export const REFERRAL_STATUSES = ['紹介のみ', '保留・長期'] as const
export const MANAGEMENT_STATUSES = ['対応中', '完了'] as const

// 案件作成・面談情報タブで選択可能なステータス（相談案件＋個別管理案件）。
// 対応中・完了はオーダーシート作成／管理フロー経由でのみ遷移するため、ここでは選べない。
export const MEETING_SELECTABLE_STATUSES = [...CONSULT_STATUSES, ...REFERRAL_STATUSES] as const

// 案件ステータスの遷移ルール（現在ステータス → 変更できる先）。
// 前進を基本に、運用上ありえない「戻り」を抑止する。基本ルール:
//   ・面談設定済へは戻さない（受託/検討中/対応中 などから）
//   ・対応中→面談設定済/受託/検討中 へは戻さない（ただし保留・長期は可）
//   ・紹介のみ/長期保留/不受託 からの復活（→受託）は可
//   ・対応中⇄完了（完了の再開）は可
// ※「対応中・完了」へ遷移できるのは別途ゲート（OS完成＋管理担当アサイン）を満たす時のみ。
export const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  '面談設定済': ['検討中', '検討中（契約書待ち）', '受注', '失注', '紹介のみ', '保留・長期'],
  '検討中': ['検討中（契約書待ち）', '受注', '失注', '紹介のみ', '保留・長期'],
  '検討中（契約書待ち）': ['検討中', '受注', '失注', '紹介のみ', '保留・長期'],
  '受注': ['対応中', '失注'],
  '失注': ['紹介のみ', '受注'],
  '紹介のみ': ['受注', '保留・長期', '失注'],
  '保留・長期': ['受注', '紹介のみ'],
  '対応中': ['完了', '保留・長期'],
  '完了': ['対応中'],
}

// 案件ステータスとして選択可能なkey一覧を返す（遷移ルール＋対応中ガード）。
// ・現在ステータスから ALLOWED_STATUS_TRANSITIONS で許可された先のみ
// ・対応中/完了へ進めるのは「オーダーシート完成済 ＋ 管理担当アサイン済」両方が揃った時のみ
//   （既に管理ステータスの案件はゲート通過済み扱い）
// ・現在のステータスは常に先頭に含める（表示崩れ防止）
// ・現在ステータス不明（新規作成等）は相談＋個別管理ステータスを返す
export const getSelectableCaseStatuses = (
  orderSheetCompleted: boolean,
  currentStatus?: string | null,
  managerAssigned = true,
  initialTasksDone = true,
  contractProcDone = true,
): string[] => {
  if (!currentStatus) return [...MEETING_SELECTABLE_STATUSES]
  const isManagementNow = (MANAGEMENT_STATUSES as readonly string[]).includes(currentStatus)
  const canManage = (orderSheetCompleted && managerAssigned && initialTasksDone && contractProcDone) || isManagementNow
  const targets = ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [...MEETING_SELECTABLE_STATUSES]
  const filtered = targets.filter(t =>
    (MANAGEMENT_STATUSES as readonly string[]).includes(t) ? canManage : true,
  )
  return [currentStatus, ...filtered.filter(t => t !== currentStatus)]
}

// 初期対応タスク（受託時に生成される system かつ category=初期対応）が全完了か。
// 受託→対応中の移行ゲート（getSelectableCaseStatuses の initialTasksDone）に使う。
export const isInitialTasksDone = (
  tasks: { task_kind?: string | null; category?: string | null; status: string }[],
): boolean =>
  !tasks.some(t => t.task_kind === 'system' && t.category === '初期対応' && t.status !== '完了' && t.status !== 'キャンセル')

// 契約残手続き（契約関連書類の受け取り）が完了か。
// 受領状況が「後日郵送 / 依頼者が取得」で未受信（到着日なし）の書類が無ければ完了。
// 受託→対応中の移行ゲート（getSelectableCaseStatuses の contractProcDone）に使う。
export const CONTRACT_PENDING_STATUSES = ['後日郵送', '依頼者が取得']
export const isContractProcDone = (
  docs: { status?: string | null; arrival_date?: string | null }[],
): boolean =>
  !docs.some(d => CONTRACT_PENDING_STATUSES.includes(d.status ?? '') && !d.arrival_date)

// === 他事業者紹介 ===
// 「他事業者紹介」タブの業者サブタブ（case_referrals.partner_type）。
export const REFERRAL_PARTNER_TYPES = ['税理士', '弁護士', '不動産', '遺品整理'] as const
// 報酬請求状態の選択肢。
export const REFERRAL_BILLING_STATUSES = ['未請求', '請求済', '入金済'] as const

export type CaseCategory = 'consult' | 'referral' | 'management'

/** ステータスkeyから案件分類を判定（未知/該当なしは null） */
export const getCaseCategory = (status: string | null | undefined): CaseCategory | null => {
  if (!status) return null
  if ((CONSULT_STATUSES as readonly string[]).includes(status)) return 'consult'
  if ((REFERRAL_STATUSES as readonly string[]).includes(status)) return 'referral'
  if ((MANAGEMENT_STATUSES as readonly string[]).includes(status)) return 'management'
  return null
}

// === システムタスクの担当区分（assign_role） ===
// migration 056。チームタスク欄やタスク一覧で「誰が拾うべきか」のラベルに使う。
export const ASSIGN_ROLES = [
  { key: 'sales',   label: '受注担当', pill: 'bg-brand-100 text-brand-700 border-brand-300' },
  { key: 'manager', label: '管理担当', pill: 'bg-purple-100 text-purple-700 border-purple-300' },
  { key: 'both',    label: '両担当',   pill: 'bg-amber-100 text-amber-700 border-amber-300' },
] as const

export const getAssignRoleDef = (key: string | null | undefined) =>
  ASSIGN_ROLES.find(r => r.key === key)

export const getAssignRoleLabel = (key: string | null | undefined): string =>
  getAssignRoleDef(key)?.label ?? ''

// === タスクステータス ===
// メインフローは 3段階（着手前 / 対応中 / 完了）。差戻しは廃止。
// （既存データに残る「差戻し」は各画面の正規化で「対応中」として扱う）
export const TASK_STATUSES = [
  { key: '着手前', color: '#6B7280' },
  { key: '対応中', color: '#2563EB' },
  { key: '完了', color: '#059669' },
] as const

// === ロール ===
// 注: 'assistant' はタスクテンプレートの default_role で使用されるためDB/型からは削除しない。
//     案件担当者割当UIにのみ表示しない（BasicInfoTab/OverviewTab の ROLES 依存箇所）
export const ROLES = [
  { key: 'sales', label: '受注担当' },
  { key: 'manager', label: '管理担当' },
  { key: 'sub_manager', label: 'サブ管理担当' },
] as const

// === タスク担当区分（work_role） ===
// タスクを「誰がやる作業か」で分類。タスク一覧でフィルタ・視覚化するために使う。
import { Compass, Puzzle, Banknote, Megaphone, type LucideIcon } from 'lucide-react'

type WorkRoleDef = {
  key: 'manager' | 'assistant' | 'accounting' | 'sales'
  label: string
  shortLabel: string
  Icon: LucideIcon
  pill: string
  solid: string
  bar: string
}

export const WORK_ROLES: readonly WorkRoleDef[] = [
  {
    key: 'manager',
    label: '管理担当',
    shortLabel: '管理',
    Icon: Compass,
    pill: 'bg-purple-100 text-purple-700 border-purple-300',
    solid: 'bg-purple-600 text-white',
    bar: '#9333EA',
  },
  {
    key: 'assistant',
    label: '事務管理',
    shortLabel: '事務',
    Icon: Puzzle,
    pill: 'bg-green-100 text-green-700 border-green-300',
    solid: 'bg-green-600 text-white',
    bar: '#16A34A',
  },
  {
    key: 'accounting',
    label: '経理担当',
    shortLabel: '経理',
    Icon: Banknote,
    pill: 'bg-orange-100 text-orange-700 border-orange-300',
    solid: 'bg-orange-600 text-white',
    bar: '#EA580C',
  },
  {
    key: 'sales',
    label: '受注担当',
    shortLabel: '受注',
    Icon: Megaphone,
    pill: 'bg-brand-100 text-brand-700 border-brand-300',
    solid: 'bg-brand-600 text-white',
    bar: '#2563EB',
  },
] as const

export type WorkRoleKey = WorkRoleDef['key']

export const getWorkRoleDef = (key: string | null | undefined) =>
  WORK_ROLES.find(r => r.key === key)

// === タスク優先度 ===
export const TASK_PRIORITIES = [
  { key: '通常', label: '通常',  style: 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50' },
  { key: '急ぎ', label: '急ぎ',  style: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' },
] as const

// === 拠点 ===
export const LOCATIONS = ['クレアトール', '共同ビル', '藤沢'] as const

// === チーム ===
export const TEAMS = ['LP等'] as const

// === 面談場所 ===
export const MEETING_PLACES = ['Web', '店舗', '依頼者自宅'] as const

// === 手続区分 ===
export const PROCEDURE_TYPES = [
  '手続一式', '登記', '遺言', '放棄', '調停', '検認', '後見', '遺産承継', '手紙', '契約書', '執行', 'コンサル',
] as const

// === 付帯サービス ===
export const ADDITIONAL_SERVICES = ['相続税申告', '不動産売却', '生命保険'] as const

// === 相続税申告要否 ===
export const TAX_FILING_OPTIONS = ['要', '不要', '確認中'] as const

// === 戸籍請求理由 ===
export const KOSEKI_REQUEST_REASONS = [
  '正確な相続人の把握と相続関係図の作成',
  '遺言書作成の前段として推定相続人の調査',
  'その他',
] as const

// === 戸籍請求書パターン（実費負担者） ===
export const KOSEKI_REQUEST_PATTERNS = ['司法書士', '行政書士', 'いきいき'] as const

// === 請求の種別 ===
export const KOSEKI_REQUEST_TYPES = [
  '戸籍', '除籍', '原戸籍', '謄本', '抄本', '住民票', '除票', '戸籍の附票',
] as const

// === 戸籍の取得目的 ===
export const KOSEKI_PURPOSES = [
  '相続登記', '預貯金解約', '証券移管・解約', '遺産分割協議', '相続税申告',
  '法定相続情報一覧図', '保険金請求', '年金手続', 'その他',
] as const

// === 受注ルート（＝面談ルート。新規案件登録フォームでは「面談ルート」と表記） ===
export const ORDER_ROUTES = ['LP経由', '葬儀社経由', 'HP経由', '過去客経由', '税理士経由', 'その他'] as const

// 案件番号の経路コード（YYMM + コード + 当日連番4桁）
export const ORDER_ROUTE_CODES: Record<string, string> = {
  'LP経由': 'LP',
  '葬儀社経由': 'SD',
  'HP経由': 'HP',
  '過去客経由': 'PC',
  '税理士経由': 'ZE',
  'その他': 'OT',
}

// 過去客経由は紹介元マスタではなく既存依頼者を参照する
export const PAST_CLIENT_ROUTE = '過去客経由'

// === 顧客郵送先 ===
export const MAILING_DESTINATIONS = ['依頼者住所', 'その他'] as const

// === 書類発着管理簿: 書類名候補 ===
export const DISPATCH_DOCUMENT_NAMES = [
  '戸籍謄本',
  '住民票',
  '印鑑証明書',
  '登記事項証明書',
  '固定資産評価証明書',
  '預金残高証明書',
  '相続関係説明図',
  '遺産分割協議書',
  'その他',
] as const

// === 財産調査使用書類 ===
export const INVESTIGATION_DOCUMENTS = ['委任状', '契約書'] as const

// === 不動産: 物件区分 ===
export const PROPERTY_TYPES = [
  '戸建',
  'マンション',
  '土地',
  '農地',
  '山林',
  '駐車場',
  'その他',
] as const

// === 契約形態 ===
// 契約形態（相続案件の受任法人）。いきいきライフ協会は終活サービスの別法人で
// 相続案件の契約形態には含めない（officeProfiles の ikiiki は戸籍/固定資産の遺言執行用途で別途利用）。
export const CONTRACT_TYPES = ['行政書士法人単独', '司法書士法人単独', '行・司連名'] as const

// === 入金ステータス（migration 045 で4種類に統一） ===
export const PAYMENT_STATUSES = [
  '未請求', '作成済', '入金待ち', '入金済',
] as const

// === 遺言種別 ===
export const WILL_TYPES = ['自筆', '公正証書', 'その他'] as const

// === 遺言保管 ===
export const WILL_STORAGE_OPTIONS = [
  'お客様保管', 'ご案内していない', 'ご案内済(検討中)', 'ご依頼',
] as const

// === 遺言執行 ===
export const WILL_EXECUTION_OPTIONS = [
  '執行不要', 'ご案内していない', 'ご案内済(検討中)', 'ご依頼',
] as const

// === 遺言作成場所 ===
export const WILL_CREATION_PLACES = ['公証役場', '訪問', 'オーシャン', 'その他'] as const

// === 信託契約書種別 ===
export const TRUST_CONTRACT_TYPES = [
  '私文書', '私文書(確定日付有)', '公正証書', 'その他',
] as const

// === 生命保険提案有無 ===
export const LIFE_INSURANCE_PROPOSAL_OPTIONS = ['有', '無'] as const

// === 税理士紹介有無 ===
export const TAX_ADVISOR_REFERRAL_OPTIONS = ['有', '無', '検討中'] as const

// === 失注の理由 ===
export const LOST_REASONS = [
  '価格', '他社選択', '手続不要と判断', '連絡不通', 'その他',
] as const

// === 請求書ステータス（migration 045 で4種類に統一） ===
// '未請求' は請求書未作成のプレースホルダー（invoices 行はあるが請求書未発行）
export const INVOICE_STATUSES = [
  '未請求', '作成済', '入金待ち', '入金済',
] as const

// 請求書のステータススタイル
export const INVOICE_STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  '未請求': { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300', dot: '#9CA3AF' },
  '作成済': { bg: 'bg-gray-50',  text: 'text-gray-700', border: 'border-gray-300', dot: '#6B7280' },
  '入金待ち': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: '#D97706' },
  '入金済': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', dot: '#16A34A' },
}

// === 請求分類 (invoice_type) ===
// DB上は「確定請求」のままだが、UI表記は「確定売上」に統一
export const INVOICE_TYPES = ['前受金', '確定請求'] as const
export const INVOICE_TYPE_LABEL: Record<string, string> = {
  '前受金': '前受金',
  '確定請求': '確定売上',
}
export const INVOICE_TYPE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  '前受金':   { bg: 'bg-sky-50',    text: 'text-sky-700',    border: 'border-sky-200' },
  '確定請求': { bg: 'bg-brand-50',  text: 'text-brand-700',  border: 'border-brand-200' },
}

// === 不動産: 売却意向 ===
export const SELLING_INTENTIONS = [
  '売却希望', '保有希望', '検討中', '未定',
] as const

// === 不動産: 住人状況 ===
export const OCCUPANCY_STATUSES = [
  '空き家', '相続人が居住', '第三者が居住（賃貸）', '第三者が居住（無償）', 'その他',
] as const

// === 不動産: 名寄せ請求先 ===
export const NAMEYOSE_TARGETS = [
  '市区町村', '都税事務所', '不要', '確認中',
] as const

// === 不動産: 評価ランク ===
export const PROPERTY_RANKS = ['S', 'A', 'B', 'C', '確認中'] as const

// === 遺産分割方針 ===
export const DIVISION_POLICIES = [
  '法定相続分', '配偶者集中', '代表者集中', '2次相続考慮', '法定相続人間で協議', 'その他',
] as const

// === 遺産分割協議書 署名捺印方法 ===
export const AGREEMENT_SIGNING_METHODS = [
  '持ち回り', '一斉郵送', '対面', 'その他',
] as const

// === 生命保険: 保険種類 ===
export const LIFE_INSURANCE_TYPES = [
  '終身保険', '定期保険', '養老保険', '個人年金', '学資保険', 'その他',
] as const

// === 財産目録: 記載範囲 ===
export const INVENTORY_CATEGORIES = [
  '不動産', '金融資産（預貯金）', '金融資産（証券）', '金融資産（信託銀行）',
  '債務・負債', '諸費用・経費', '生命保険', 'その他',
] as const

// === 信託: 記載内容 ===
export const TRUST_CONTENT_OPTIONS = [
  '不動産', '預貯金', '株・投資信託', '保険', 'その他財産',
] as const

// === 財産調査: 開始条件 ===
export const FINANCIAL_SURVEY_START_CONDITIONS = [
  '必要戸籍が揃ったら即開始', '要確認後開始',
] as const

// === 証券: 端株処理 ===
export const ODD_LOT_HANDLING_OPTIONS = ['移管', '売却', '不要'] as const

// === 証券: 未受領配当金 ===
export const UNCLAIMED_DIVIDEND_OPTIONS = ['要', '不要', '確認中'] as const

// === 金融資産: 解約受注状況 ===
export const DISSOLUTION_STATUSES = ['受注', '未受注', '検討中', '未提案'] as const

// === 金融資産: 通帳取り扱い ===
export const PASSBOOK_STATUSES = ['即日預かり', '送付', '紛失'] as const

// === 不動産: 評価方法 ===
export const PROPERTY_EVALUATION_METHODS = ['固定資産評価額', '路線価'] as const

// === 不動産: 査定対応状況 ===
export const REAL_ESTATE_APPRAISAL_STATUSES = ['未対応', '対応中', '完了', '不要'] as const

// === 遺言: 記載内容 ===
export const WILL_CONTENT_OPTIONS = [
  '祭祀', '予備的遺言', '付言',
  '不動産', '預貯金', '株・投資信託', '保険', 'その他財産', '債務・諸費用',
  '遺贈', 'その他',
] as const

// === 遺産分割: 分割方法 ===
export const DIVISION_METHODS = [
  '現物分割', '代償分割', '換価分割（売却後分配）', '共有', 'その他',
] as const

// === 遺言: 遺贈受贈者資料手配 ===
export const WILL_BEQUEST_HANDLER_OPTIONS = ['手配済', '未手配', '不要'] as const

// === 立替実費・費目 ===
export const EXPENSE_CATEGORIES = [
  '戸籍取得費', '登記印紙代', '郵送費（普通）', '郵送費（速達）', '郵送費（書留）',
  '郵送費（レターパック）', '残高証明取得費', '登記情報取得費', '公図取得費',
  '評価証明取得費', '交通費', 'その他',
] as const

// 立替実費の課税区分の既定推定（官公署手数料・印紙は非課税、それ以外は課税）。
// あくまで初期値で、請求時に1件ずつ上書き可能。
export const NON_TAXABLE_EXPENSE_CATEGORIES = [
  '戸籍取得費', '登記印紙代', '登記情報取得費', '公図取得費', '評価証明取得費',
] as const
export const inferExpenseTaxable = (category: string | null | undefined): boolean =>
  !(NON_TAXABLE_EXPENSE_CATEGORIES as readonly string[]).includes(category ?? '')
