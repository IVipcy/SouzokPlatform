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
export const CASE_STATUSES = [
  { key: '架電案件化', color: '#6B7280' },
  { key: '面談設定済', color: '#3B82F6' },
  { key: '検討中', color: '#D97706' },
  { key: '受注', color: '#16A34A' },
  { key: '対応中', color: '#7C3AED' },
  { key: '保留・長期', color: '#EA580C' },
  { key: '完了', color: '#059669' },
  { key: '失注', color: '#DC2626' },
] as const

// === タスクステータス（3段階のみ） ===
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
  { key: 'lp', label: 'LP担当' },
  { key: 'accounting', label: '経理担当' },
] as const

// === タスク優先度 ===
export const TASK_PRIORITIES = [
  { key: '通常', label: '通常', style: 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50' },
  { key: '急ぎ', label: '🚨 急ぎ', style: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' },
] as const

// === 拠点 ===
export const LOCATIONS = ['クレアトール', '共同ビル', '藤沢'] as const

// === チーム ===
export const TEAMS = ['LP等'] as const

// === 手続区分 ===
export const PROCEDURE_TYPES = [
  '手続一式', '登記', '遺言', '放棄', '調停', '検認', '後見', '手紙', '契約書', '執行', 'コンサル',
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

// === 戸籍請求書パターン ===
export const KOSEKI_REQUEST_PATTERNS = [
  '行政書士', '司法書士', 'いきいき', 'いきいき検認', 'EAJ復代理', 'LM復代理',
] as const

// === 請求の種別 ===
export const KOSEKI_REQUEST_TYPES = [
  '戸籍', '除籍', '原戸籍', '謄本', '抄本', '住民票', '除票', '戸籍の附票',
] as const

// === 受注ルート ===
export const ORDER_ROUTES = ['LP', '公益社', 'その他'] as const

// === 顧客郵送先 ===
export const MAILING_DESTINATIONS = ['依頼者住所', 'その他'] as const

// === 財産調査使用書類 ===
export const INVESTIGATION_DOCUMENTS = ['委任状', '契約書'] as const

// === 契約形態 ===
export const CONTRACT_TYPES = ['行政書士法人単独', '司法書士法人単独', '行・司連名'] as const

// === 入金ステータス ===
export const PAYMENT_STATUSES = [
  '未請求', '前受金請求済', '前受金入金済', '確定請求済', '入金済', '一部入金',
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

// === 請求書ステータス ===
export const INVOICE_STATUSES = [
  '下書き', '実費集計中', '確認待ち', '発行済', '入金待ち', '入金確認済', '完了',
] as const

// === 立替実費・費目 ===
export const EXPENSE_CATEGORIES = [
  '戸籍取得費', '登記印紙代', '郵送費（普通）', '郵送費（速達）', '郵送費（書留）',
  '郵送費（レターパック）', '残高証明取得費', '登記情報取得費', '公図取得費',
  '評価証明取得費', '交通費', 'その他',
] as const
