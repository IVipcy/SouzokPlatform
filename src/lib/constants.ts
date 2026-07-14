import { isMinimalMode } from '@/lib/featureMode'

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
// label = 表示名（改称はここだけ）。受注の獲得区分（即受注/面談なし受注）は order_win_type で
//         表現し、ステータスkeyは「受注」1本のまま（B案）。バッジで即受注/面談なし受注を表示。
// 表示は getCaseStatusLabel(key) を使い、key を直接画面に出さない。
// 「新規（架電案件化）」は廃止。案件は必ず「面談設定済」から開始する。
// 並び順は案件ライフサイクル＝相談案件→個別管理案件→管理案件の順。
export const CASE_STATUSES = [
  // 相談案件（受注担当が受注に至るまで）
  { key: '面談設定済', label: '面談設定済', color: '#3B82F6' },
  { key: '検討中', label: '検討中', color: '#D97706' },
  { key: '検討中（契約書待ち）', label: '依頼確定待ち', color: '#F59E0B' },
  { key: '受注', label: '受注', color: '#16A34A' },
  { key: '戻り受注', label: '戻り受注', color: '#10B981' },
  { key: '失注', label: '失注', color: '#DC2626' },
  // 個別管理案件（受注せず紹介のみ。戻り受注の可能性あり）
  { key: '紹介のみ', label: '受注なし＋パートナー紹介', color: '#0891B2' },
  // 管理案件（受注後、管理担当が引き継ぎ対応）
  { key: '対応中', label: '作業進行中', color: '#7C3AED' },
  { key: '完了', label: '完了', color: '#059669' },
] as const

// 案件ステータスの表示ラベルを取得（未知キーはそのまま返す）
export const getCaseStatusLabel = (key: string | null | undefined): string =>
  CASE_STATUSES.find(s => s.key === key)?.label ?? key ?? ''

// === 案件分類（相談案件 / 個別管理案件 / 管理案件） ===
// 相談案件      : 受注担当が「受注」に至るまでの状態（面談〜検討〜即受注/戻り受注/失注）
// 個別管理案件  : 受託に至らず紹介のみ（裁判解決後などに「戻り受注」になり得る）
// 管理案件      : 受託後、管理担当へ引き継がれ対応中〜完了
export const CONSULT_STATUSES = ['面談設定済', '検討中', '検討中（契約書待ち）', '受注', '戻り受注', '失注'] as const
export const REFERRAL_STATUSES = ['紹介のみ'] as const
export const MANAGEMENT_STATUSES = ['対応中', '完了'] as const

// 案件作成・面談情報タブで選択可能なステータス（相談案件＋個別管理案件）。
// 対応中・完了はオーダーシート作成／管理フロー経由でのみ遷移するため、ここでは選べない。
export const MEETING_SELECTABLE_STATUSES = [...CONSULT_STATUSES, ...REFERRAL_STATUSES] as const

// === 面談分類（旧「面談内容」。相談案件登録の選択式・既定「新規面談」） ===
export const MEETING_CATEGORIES = ['新規面談', '既存面談', '見積もり対応', '過去客面談'] as const

// === 受注の獲得区分（order_win_type。status='受注' のときのみ意味を持つ） ===
// 即受注     : 面談設定済からその場で受注（面談結果で「即受注」を選択）
// 面談なし受注 : 税理士/過去客ルート等、面談なしで受注（面談結果で「面談なし受注」を選択）
// null       : 依頼確定待ち→受注 で確定した通常受注（戻り受注は別ステータスkey）
export const ORDER_WIN_TYPES = ['即受注', '面談なし受注'] as const

// === 相談案件登録画面「面談結果」の選択肢 ===
// value=フォーム上の選択値。status=保存する案件ステータスkey。winType=受注の獲得区分（受注以外はnull）。
// 即受注/面談なし受注 はどちらも status='受注'。獲得区分(order_win_type)で区別しバッジ表示する（B案）。
export const MEETING_RESULT_OPTIONS = [
  { value: '検討中',       label: '検討中',                   status: '検討中',               winType: null as string | null },
  { value: '依頼確定待ち', label: '依頼確定待ち',             status: '検討中（契約書待ち）', winType: null as string | null },
  { value: '即受注',       label: '即受注',                   status: '受注',                 winType: '即受注' as string | null },
  { value: '面談なし受注', label: '面談なし受注',             status: '受注',                 winType: '面談なし受注' as string | null },
  { value: '紹介のみ',     label: '受注なし＋パートナー紹介', status: '紹介のみ',             winType: null as string | null },
  { value: '失注',         label: '失注',                     status: '失注',                 winType: null as string | null },
] as const
export type MeetingResultOption = typeof MEETING_RESULT_OPTIONS[number]

export const getMeetingResultOption = (value: string | null | undefined): MeetingResultOption | undefined =>
  MEETING_RESULT_OPTIONS.find(o => o.value === value)

// 面談ルートが「面談なし」前提のもの（税理士経由・過去客経由）。
// これらを選んだら面談結果は「面談なし受注／失注」のみに絞る。
export const NO_MEETING_ROUTES = new Set(['税理士経由', '過去客経由'])
export const NO_MEETING_RESULT_VALUES = ['面談なし受注', '失注'] as const

// ヒアリング内容メモの記入サンプル（入力欄プレースホルダ）。面談で押さえる観点の雛形。
export const HEARING_MEMO_SAMPLE = `【相談の経緯】紹介元・相談のきっかけ／急ぎ度
【被相続人】氏名・依頼者との続柄・死亡日・最後の住所
【相続人】人数・続柄・関係性（円満/対立）・遠方/海外/連絡不通の有無
【財産概要】不動産（所在・自宅/収益）／預貯金（主な金融機関）／有価証券・保険／負債・借入
【依頼者の希望】依頼したい範囲（戸籍/分割/登記/解約 等）・売却希望・期限
【懸念・特記】認知症/未成年/疎遠の相続人・相続税の要否・もめ事の兆候
【次アクション】見積提示／必要書類の案内／回答予定（期限）`

// 検討期間区分。相続ステーションの「提案・検討中（◯）」と1:1で対応させ、LP担当の転記を正確にする。
// 選んだ期間が「お客様回答予定日」の上限になる（その期間内に回答する前提）。
export const CONSIDERATION_PERIODS = ['1週間', '2週間', '1ヶ月', '見込み不明'] as const
// 期間区分 → 回答予定日の上限（YYYY-MM-DD ローカル）。見込み不明・未選択は上限なし(null)。
export function considerationDueMax(period: string | null | undefined, from: Date = new Date()): string | null {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  switch (period) {
    case '1週間': d.setDate(d.getDate() + 7); break
    case '2週間': d.setDate(d.getDate() + 14); break
    case '1ヶ月': d.setMonth(d.getMonth() + 1); break
    default: return null
  }
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 案件ステータスの遷移ルール（現在ステータス → 変更できる先）。
// 前進を基本に、運用上ありえない「戻り」を抑止する。基本ルール:
//   ・面談設定済へは戻さない（受託/検討中/対応中 などから）
//   ・対応中→面談設定済/受託/検討中 へは戻さない
//   ・紹介のみ/失注 からの復活（→受注）は可
//   ・対応中⇄完了（完了の再開）は可
// ※「対応中・完了」へ遷移できるのは別途ゲート（OS完成＋管理担当アサイン）を満たす時のみ。
// 恒久ルール:
//   ・検討中 からは「受注」に直接できず「戻り受注」のみ（検討の末の受注は戻り受注）
//   ・受注 / 依頼確定待ち（検討中（契約書待ち）） からは「紹介のみ」へ遷移できない
//   ・受注の獲得区分（即受注/面談なし受注/通常）は order_win_type で表現し、ステータスは「受注」
export const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  '面談設定済': ['検討中', '検討中（契約書待ち）', '受注', '失注', '紹介のみ'],
  '検討中': ['戻り受注', '失注', '紹介のみ'],
  '検討中（契約書待ち）': ['検討中', '受注', '失注'],
  '受注': ['対応中', '失注'],
  '戻り受注': ['対応中', '失注'],
  '失注': ['紹介のみ', '受注', '戻り受注'],
  '紹介のみ': ['受注', '戻り受注', '失注'],
  '対応中': ['完了'],
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
  kentouContractReady = true,  // 検討中（契約書待ち）→受注 のゲート（契約残手続き＋全タスク完了）
): string[] => {
  if (!currentStatus) return [...MEETING_SELECTABLE_STATUSES]
  const isManagementNow = (MANAGEMENT_STATUSES as readonly string[]).includes(currentStatus)
  // ミニマム運用モードでは「前提を満たさないと次に進めない」ハードゲートを無効化（手動で自由に変更）
  const gatesOff = isMinimalMode()
  // 初期対応タスク完了ゲートは撤去（初期対応はアラートで通知し、タスク管理はしない）。
  // 対応中への前提は オーダーシート完成 ＆ 管理担当アサイン ＆ 契約手続き完了。
  void initialTasksDone
  const canManage = gatesOff || (orderSheetCompleted && managerAssigned && contractProcDone) || isManagementNow
  const targets = ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [...MEETING_SELECTABLE_STATUSES]
  const filtered = targets.filter(t => {
    if ((MANAGEMENT_STATUSES as readonly string[]).includes(t)) return canManage
    // 検討中（契約書待ち）→受注 は、契約残手続き＋この段階の全タスク完了が条件
    if (currentStatus === '検討中（契約書待ち）' && t === '受注') return gatesOff || kentouContractReady
    return true
  })
  return [currentStatus, ...filtered.filter(t => t !== currentStatus)]
}

// 検討中（契約書待ち）→受注 のゲート用：受託の前提となる「受注担当/管理担当タスク(system)」が完了か。
// 戸籍・財産調査などの事務管理(業務=case)タスクは対応中で着手するため、受託のゲートには含めない。
export const isAllTasksDone = (
  tasks: { task_kind?: string | null; status: string }[],
): boolean => {
  const gating = tasks.filter(t => t.task_kind === 'system')
  return !gating.some(t => t.status !== '完了' && t.status !== 'キャンセル')
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

// === 立替実費の名目（請求タブ。名目選択で課税/非課税を自動セット） ===
export const EXPENSE_NONTAX_ITEMS = [
  '市役所等で取得した戸籍や住民票', '収入印紙代', 'JTN', '家庭裁判所', '定款認証手数料',
  '民事法務協会', '登録免許税', '事前調査費用', '古物営業許可費用',
] as const
export const EXPENSE_TAX_ITEMS = [
  '金融機関で取得した残高証明・取引履歴・経過利息等', '郵送料', '切手代', '交通費', '小為替手数料',
  'その他立替実費', '証券保管振替機構手数料', '全国銀行個人信用情報センター手数料',
  '日本信用情報機構（JICC）手数料', '指定信用情報機関（CIC）手数料', '官報広告費',
] as const
// 名目 → 課税か（true=課税/false=非課税/undefined=未知）
export const expenseItemTaxable = (label: string): boolean | undefined => {
  if ((EXPENSE_TAX_ITEMS as readonly string[]).includes(label)) return true
  if ((EXPENSE_NONTAX_ITEMS as readonly string[]).includes(label)) return false
  return undefined
}

// === 他事業者紹介 ===
// 「他事業者紹介」タブの業者サブタブ（case_referrals.partner_type）。
export const REFERRAL_PARTNER_TYPES = ['税理士', '弁護士', '不動産', '遺品整理', '生命保険'] as const
// 紹介先ごとの「依頼／引継ぎ」タスク名（タスク一括生成で使用）。不動産のみ社内事業部への引継ぎ。
export const REFERRAL_TASK_LABEL: Record<string, string> = {
  '税理士': '税理士依頼',
  '不動産': '不動産事業部引継ぎ',
  '弁護士': '弁護士依頼',
  '遺品整理': '遺品整理業者依頼',
  '生命保険': '生命保険会社依頼',
  '解体': '解体業者依頼',
  '自動車': '自動車売買・処分依頼',
  '鑑定': '鑑定業者依頼',
  '特殊清掃': '特殊清掃業者依頼',
}
// 報酬請求状態の選択肢。
export const REFERRAL_BILLING_STATUSES = ['未請求', '請求済', '入金済'] as const

// 税理士紹介の依頼理由（相談案件登録・他事業者紹介）。「その他」選択時は自由入力を content_detail に保存。
export const TAX_ADVISOR_REFERRAL_REASONS = [
  '相見積もりあり（価格調整が対応可能な税理士手配）',
  '専門性高い（土地や資産の評価の難易度が高い）',
  '提案金額注意（自分で申告したい等の要望あり）',
  'その他（自由入力）',
] as const

// 不動産査定のランク（相談案件登録・他事業者紹介）。「その他」選択時は自由入力を content_detail に保存。
export const REAL_ESTATE_APPRAISAL_RANKS = [
  'S（今すぐ売りたい、兄弟相続物件あり）',
  'A（空き家になっている等）',
  'B（近々空き家になる可能性等あり）',
  'C（査定のみ、地方物件、一般仲介困難等）',
  'その他（自由入力）',
] as const

// その他紹介（相談案件登録・アコーディオン）。key=case_referrals.partner_type、label=表示名。あり/なし＋備考。
export const OTHER_REFERRAL_PARTNERS = [
  { key: '弁護士', label: '弁護士紹介' },
  { key: '遺品整理', label: '遺品整理業者紹介' },
  { key: '解体', label: '解体業者紹介' },
  { key: '自動車', label: '自動車（売買・処分）' },
  { key: '鑑定', label: '鑑定業者紹介' },
  { key: '特殊清掃', label: '特殊清掃業者紹介' },
] as const

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
// 戸籍の取得目的＝戸籍請求書の使用目的（出力でそのまま反映）
export const KOSEKI_PURPOSES = [
  '正確な相続人の把握と、相続関係図の作成',
  '遺言書作成の前段として推定相続人の調査',
  '民事信託契約書作成の前段として推定相続人の調査',
] as const

// 戸籍の範囲（どこからどこまでの戸籍か）。戸籍請求書の備考にプリセット。
export const KOSEKI_RANGES = [
  '出生から死亡まで',
  '現在戸籍のみ',
  '婚姻まで',
  '改製から現在まで',
  'その他',
] as const

// 被相続人との続柄（相続人視点）。法定相続人＋代襲相続まで網羅。いとこ等は除外。
export const HEIR_RELATIONSHIPS = [
  '配偶者',
  '長男', '長女', '次男', '次女', '三男', '三女', '養子',
  '孫', 'ひ孫',
  '父', '母', '祖父', '祖母',
  '兄', '姉', '弟', '妹',
  '甥', '姪',
  'その他',
] as const

// 相続登記の種別（物件ごとに複数選択）
export const REGISTRATION_TYPES = [
  '所有権移転（相続）',
  '所有権移転（遺贈）',
  '相続人申告登記',
  '登記名義人 住所・氏名変更',
  '抵当権抹消',
  '持分移転',
  'その他',
] as const

// 登記原因
export const REGISTRATION_CAUSES = [
  '法定相続分',
  '遺産分割協議',
  '特定財産承継遺言',
  '遺贈',
] as const

// 相続登記ステータス
export const REGISTRATION_STATUSES = [
  '未着手',
  '必要書類収集中',
  '申請準備中',
  '申請済',
  '補正中',
  '完了',
] as const

// 不動産の取得資料（取得物）。method=請求は請求先・請求日・到着日を管理、method=参照（路線価）は取得済のみ。
// target=物件 は物件を選択、target=市区町村 は市区町村を入力。
export const ACQUISITION_ITEMS = [
  { key: '登記情報', method: '請求', target: '物件', office: '法務局' },
  { key: '所有者事項', method: '請求', target: '物件', office: '法務局' },
  { key: '公図', method: '請求', target: '物件', office: '法務局' },
  { key: '地積測量図', method: '請求', target: '物件', office: '法務局' },
  { key: '評価証明', method: '請求', target: '市区町村', office: '市区町村役所' },
  { key: '名寄帳', method: '請求', target: '市区町村', office: '市区町村役所' },
  { key: '路線価', method: '参照', target: '物件', office: '' },
] as const

export const ACQUISITION_ITEM_KEYS = ACQUISITION_ITEMS.map(i => i.key)

// === 受注ルート（＝面談ルート。新規案件登録フォームでは「面談ルート」と表記） ===
// 葬儀社経由は「主要取引先葬儀社／その他葬儀社」に分割（はせがわ等のLP直/OC直を面談ルートで識別するため）。
export const ORDER_ROUTES = ['LP経由', '主要取引先葬儀社', 'その他葬儀社', 'HP経由', '過去客経由', '税理士経由', 'その他'] as const

// LP担当の追いかけ連絡方法（連携②廃止に伴うLP追いかけ運用）
export const LP_FOLLOWUP_METHODS = ['電話', 'メール', 'SMS', 'LINE'] as const

// 不動産登記の発生有無（LP案件一覧・他事業者紹介(不動産)の依頼内容として共有）
export const REAL_ESTATE_REGISTRATION_OPTIONS = [
  '登記申請あり(OC依頼予定)',
  '登記申請あり(その他)',
] as const

// 税理士業務の発生有無（LP案件一覧・他事業者紹介(税理士)の依頼内容として共有）
export const TAX_ADVISOR_BUSINESS_OPTIONS = [
  '相続税申告あり',
  '相続税申告・財産調査次第',
  '相続税申告・準確定申告あり',
  '相続税申告あり・その他申告あり',
  '準確定申告あり',
  'その他申告あり',
] as const

// 相続税申告の発生有無を他事業者紹介から判定する。
// 「あり」＝税理士の紹介行があり、その依頼内容が「相続税申告」を含む選択肢
//（相続税申告あり / 相続税申告・財産調査次第 / 相続税申告・準確定申告あり / 相続税申告あり・その他申告あり）。
export function hasInheritanceTaxFiling(
  referrals: { partner_type: string; content: string | null }[] | null | undefined
): boolean {
  return (referrals ?? []).some(
    r => r.partner_type === '税理士' && !!r.content && r.content.includes('相続税申告')
  )
}

// 案件番号の経路コード（YYMM + コード + 当日連番4桁）
export const ORDER_ROUTE_CODES: Record<string, string> = {
  'LP経由': 'LP',
  '主要取引先葬儀社': 'SD',   // 主要/その他とも案件番号コードは SD を共用（集計は order_route 列で区別）
  'その他葬儀社': 'SD',
  '葬儀社経由': 'SD',         // 旧ルート（互換・既存データ用）
  'HP経由': 'HP',
  '過去客経由': 'PC',
  '税理士経由': 'ZE',
  'その他': 'OT',
}

// 過去客経由は紹介元マスタではなく既存依頼者を参照する
export const PAST_CLIENT_ROUTE = '過去客経由'

// === 面談ルート別 紹介元マスタ ===
export const FUNERAL_COMPANIES = [
  '公益社', '伊藤典範', '横浜セレモ',
  '株式会社えにし', '株式会社浅野葬儀社', '株式会社新生葬祭', '有限会社曽根葬祭',
  '横浜葬祭株式会社', '株式会社横濱聖苑', '株式会社旭', '株式会社鎌倉信書',
  'ひかりセレモニー', 'サポート湘南', '総本山善通寺関東別院',
  '株式会社羽根澤屋本店', '有限会社横浜典礼', '和光葬儀社',
  'サンセット葬祭', '株式会社港南葬祭',
  '京王メモリアル（京王フェアウェルサポート株式会社）', 'ふれあいの杜',
  '平田葬祭', '善通寺　関東別院', '羽根澤屋', '祭典サービス',
  '創世（ライフワークス社）', 'セレモニーホールときわ', 'セレモニー　上郷',
  'ファミリーホール', '牧野葬儀店',
] as const

// 主要取引先葬儀社（OC直の面談ルート）。はせがわはLP経由のパートナーでもあるが、
// 従業員経由でOC直となるケースがあるためここに含める（面談ルートでLP直/OC直を識別）。
export const MAIN_FUNERAL_COMPANIES = ['はせがわ', '公益社', '伊藤典範', '横浜セレモ'] as const
// その他葬儀社 = 葬儀社マスタから主要取引先（マスタ内の3社）を除いた残り。
const _MAIN_FUNERAL_IN_MASTER = ['公益社', '伊藤典範', '横浜セレモ']
export const OTHER_FUNERAL_COMPANIES: string[] = FUNERAL_COMPANIES.filter(c => !_MAIN_FUNERAL_IN_MASTER.includes(c))

export const TAX_ADVISOR_COMPANIES = [
  'ランドマーク税理士法人', '中央総合会計事務所', '税理士法人チェスター',
  'イデアコンサルティング', 'キリサワ税理士法人', '辻・本郷税理士法人　湘南',
  '倉田淳一税理士事務所', '辻・本郷税理士法人　横浜', 'TAO税理士法人',
  '税理士法人ともに', 'さいとう税理士法人', 'マルイシ税理士法人（スターズ）',
  '税理士澤田明久事務所', '税理士法人風神会計事務所', '東戸公認会計士事務所',
  'マルイシ税理士法人', 'コルディアーレ税理士事務所', 'アミエル税理士法人',
  'アイネックス税理士法人', '湘南フロンティア', '税理士法人TOTAL',
  '岡野雄志税理士事務所', '税理士法人りんく', 'フジ相続税理士法人',
  'いわみ会計事務所', '東京メトロポリタン税理士法人', '税理士法人YFPクレア',
  'アンバーパートナーズ', '尾﨑会計', '行政書士　越智先生',
  '東京シティ税理士事務所', '横浜総合', 'ふくみず税理士事務所',
  '吉澤会計事務所', '税理士法人グランサーズ', '会計事務所湘南アカウンティング',
  '大幸税理士法人', '山口敬三郎事務所', '米森公認会計士事務所', '響き税理士法人',
  '藤井先生', '税理士法人タックスウェイズ', '税理士法人スーゴル',
  '税理士法人アクア', '税理士法人ネイチャー', 'セブンセンス税理士法人',
  '株式会社湘南フロンティア',
] as const

export const HP_SOURCES = ['相続遺言相談センター', '相続手続き相談プラザ', '自社公式HP'] as const

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

// === 請求パターン（案件単位。cases.billing_pattern・migration 166） ===
//   ②③の「一括」＝前受金に確定請求ぶんを含めて一度に受領（＝確定請求という独立ステップがない）
export type BillingPattern = 'staged' | 'lump_expense' | 'lump_only'
// finalInvoiceLabel … 後日の請求書ボタン名（null=③はなし）。②は前受金＝報酬なので確定請求書は実質「立替のみ」。
// hasExpense … 立替実費セクションの要否（①②あり/③なし）。lumpNote … 一括の補足チップ（①はなし）。
export const BILLING_PATTERNS: { value: BillingPattern; no: string; label: string; desc: string; finalInvoiceLabel: string | null; finalLegLabel: string; hasExpense: boolean; lumpNote: string | null }[] = [
  { value: 'staged',       no: '①', label: '段階請求（通常）', desc: '前受金 → 確定請求 → 立替実費', finalInvoiceLabel: '確定請求書を作成（報酬＋立替）', finalLegLabel: '確定請求', hasExpense: true,  lumpNote: null },
  { value: 'lump_expense', no: '②', label: '一括＋実費',       desc: '前受金で確定分も受領・立替実費は後日', finalInvoiceLabel: '立替実費の請求書を作成', finalLegLabel: '立替実費', hasExpense: true,  lumpNote: '報酬は前受金に含む（一括）' },
  { value: 'lump_only',    no: '③', label: '一括のみ',         desc: '前受金で完結・立替実費なし', finalInvoiceLabel: null, finalLegLabel: '確定請求', hasExpense: false, lumpNote: '前受金で完結（確定請求・立替なし）' },
]
export const billingPatternOf = (v: string | null | undefined) =>
  BILLING_PATTERNS.find(p => p.value === v) ?? BILLING_PATTERNS[0]

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

// === 検討中・失注の理由（旧 LOST_REASONS の置換、migration 125 で導入）===
// 面談結果が「検討中」または「失注」のとき選択。【検討】/【失注】プレフィックス付き。
export const CONSIDERATION_DECLINE_REASONS = [
  '【検討】費用',
  '【検討】相続人・親族に相談したい',
  '【検討】他社と比較検討したい',
  '【検討】四十九日まで未着手予定',
  '【検討】その他（面談内容詳細に記載）',
  '【失注】費用が高い',
  '【失注】親族と相談した結果',
  '【失注】他社に依頼',
  '【失注】財産なく手続き不要',
  '【失注】お客様ご自身で進める',
  '【失注】とりあえず相談したかった',
  '【失注】その他（面談内容詳細に記載）',
] as const

// === 請求書ステータス（migration 045 で4種類に統一） ===
// '未請求' は請求書未作成のプレースホルダー（invoices 行はあるが請求書未発行）
export const INVOICE_STATUSES = [
  '未請求', '作成済', '入金待ち', '入金済',
] as const

// 請求書のステータススタイル
export const INVOICE_STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  '未請求': { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-transparent', dot: '#9AA1AC' },
  '作成済': { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-transparent', dot: '#6B7280' },
  '入金待ち': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-transparent', dot: '#D99A2B' },
  '入金済': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-transparent', dot: '#3A9B72' },
}

// === 請求分類 (invoice_type) ===
// DB上は「確定請求」のままだが、UI表記は「確定売上」に統一
export const INVOICE_TYPES = ['前受金', '確定請求'] as const
export const INVOICE_TYPE_LABEL: Record<string, string> = {
  '前受金': '前受金',
  '確定請求': '確定売上',
}
export const INVOICE_TYPE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  '前受金':   { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-transparent' },
  '確定請求': { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-transparent' },
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

// === 遺産分割方針（オーダーシート準拠の3択） ===
export const DIVISION_POLICIES = [
  '法定相続分', '2次相続を踏まえて', 'その他',
] as const

// 不動産の評価方法（財産目録）
export const REAL_ESTATE_EVAL_METHODS = ['固定資産評価額', '路線価'] as const

// 有無（分配方針の提案 等）
export const PRESENCE_OPTIONS = ['有', '無'] as const

// 遺産分割協議書の送付・調印
export const AGREEMENT_DISPATCH_METHODS = [
  '依頼者から各相続人へ', 'OCから各相続人へ', 'オーシャンで調印', 'その他',
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
