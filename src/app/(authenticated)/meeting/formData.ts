// 面談入力ウィザード（相談案件の作成・面談情報入力）のフォームデータ。
// 受託後の遺産系詳細（被相続人/相続人/不動産/金融/分割・遺言）はオーダーシートで入力するため、
// このウィザードは「面談情報のみ」に絞っている。
import { DEFAULT_DOCS, DEFAULT_ROLES, type DocRow, type RoleRow } from '@/components/features/cases/ProcedureIntakeSection'

// 依頼者（同行者含む）1人分
export type ClientPerson = {
  priority: 'main' | 'companion'  // メイン依頼人 / 同行者
  name: string
  kana: string
  birthday: string                // 生年月日（年齢は算出）
  relationship: string            // 被相続人との続柄
  phone: string                   // 固定電話
  mobilePhone: string             // 携帯電話
  email: string
}

export const EMPTY_CLIENT: ClientPerson = {
  priority: 'companion', name: '', kana: '', birthday: '', relationship: '', phone: '', mobilePhone: '', email: '',
}

export type FormData = {
  // 基本情報（案件番号は自動採番のため入力欄なし）
  caseStatus: string        // 面談結果（旧・案件ステータス。key）
  meetingType: string       // 面談内容（フリーテキスト。既定「新規面談」）
  proposalNote: string      // 提案金額（フリーテキスト。例「提案せず」）
  meetingDate: string       // 面談実施日
  orderRoute: string        // 面談ルート（＝受注ルート）
  orderRouteDetail: string  // 詳細（紹介元名 or 過去客の依頼者名）
  pastClientId: string      // 過去客経由で既存依頼者を選択した場合の client_id
  meetingPlace: string      // 面談場所
  clientResponseDueDate: string  // お客様回答予定日（検討中/検討中（契約書待ち）で必須）
  considerationPeriod: string    // 検討期間区分（1週間/2週間/1ヶ月/見込み不明）
  followUpCallNeeded: string  // 追い電話の必要性（不要/要。検討中のとき入力）
  // 他事業者紹介：依頼内容（partner_type が 税理士/不動産 のとき選択肢、それ以外はフリー）
  taxAdvisorBusinessType: string  // 税理士業務（依頼内容） — case_referrals(partner_type='税理士').content と連動
  realEstateRegistrationType: string  // 不動産登記（依頼内容） — case_referrals(partner_type='不動産').content と連動
  // 依頼者（複数人）
  clients: ClientPerson[]
  // メイン依頼者の住所・郵送・特徴（案件詳細の依頼者タブと同じ項目。メイン依頼者のみ）
  postalCode: string          // メイン依頼者 郵便番号
  address: string             // メイン依頼者 住所
  transferNameKana: string    // 振込名義人カナ（入金CSV突合キー。本人振込なら依頼者ふりがな）
  transferNameKana2: string   // 振込名義人カナ2（任意）
  transferNameKana3: string   // 振込名義人カナ3（任意）
  mailingDestination: string  // 顧客郵送先（依頼者住所 / その他）
  mailingAddressOther: string // 郵送先住所（その他）
  clientTrait: string         // 依頼者特徴（smile / neutral / angry）
  clientTraitDetail: string   // 依頼者特徴詳細
  // 被相続人情報（検討中段階で契約書・委任状にプリセットするため面談時に入力）
  deceasedName: string
  deceasedKana: string
  deceasedBirthday: string          // 被相続人 生年月日
  dateOfDeath: string               // 相続開始日（死亡日）
  deceasedPostalCode: string        // 被相続人 郵便番号
  deceasedAddress: string           // 被相続人 住所
  deceasedRegisteredAddress: string // 被相続人 本籍
  deceasedHasSpecialChars: boolean  // 被相続人 外字有無
  // 面談内容
  hearingMemo: string       // ヒアリング内容メモ
  serviceCategory: string   // 受注区分①（後方互換＝先頭パート。serviceMaster の ORDER_CATEGORIES）
  serviceCategory2: string  // 受注区分②（後方互換＝2つ目パート）
  serviceCategories: string[] // 受注区分パート（順序付き・複数選択。source of truth）
  referralPartners: string[] // 他事業者紹介要否（税理士/弁護士/不動産/遺品整理）
  contractType: string      // 契約形態（行政書士法人単独/司法書士法人単独/行・司連名）
  considerationDeclineReason: string  // 検討中・失注理由（面談結果が検討中／失注のとき入力）
  considerationDeclineReasonDetail: string  // その他理由詳細（フリーテキスト）
  otherNotes: string        // その他備考
  difficulty: string        // 難易度（高/中/低）
  expectedCompletionDate: string  // 完了予定日
  // 手続き詳細（受注見込み手続き区分の次に入力）
  intakeRoles: RoleRow[]        // ②役割分担（自社/依頼者）
  intakeDocuments: DocRow[]     // ①契約関連書類の受け取り
}

export const INITIAL_DATA: FormData = {
  caseStatus: '検討中',
  meetingType: '新規面談',
  proposalNote: '',
  meetingDate: '',
  orderRoute: '',
  orderRouteDetail: '',
  pastClientId: '',
  meetingPlace: '',
  clientResponseDueDate: '',
  considerationPeriod: '',
  followUpCallNeeded: '',
  taxAdvisorBusinessType: '',
  realEstateRegistrationType: '',
  clients: [{ priority: 'main', name: '', kana: '', birthday: '', relationship: '', phone: '', mobilePhone: '', email: '' }],
  postalCode: '',
  address: '',
  transferNameKana: '',
  transferNameKana2: '',
  transferNameKana3: '',
  mailingDestination: '',
  mailingAddressOther: '',
  clientTrait: '',
  clientTraitDetail: '',
  deceasedName: '',
  deceasedKana: '',
  deceasedBirthday: '',
  dateOfDeath: '',
  deceasedPostalCode: '',
  deceasedAddress: '',
  deceasedRegisteredAddress: '',
  deceasedHasSpecialChars: false,
  hearingMemo: '',
  serviceCategory: '',
  serviceCategory2: '',
  serviceCategories: [],
  referralPartners: [],
  contractType: '',
  considerationDeclineReason: '',
  considerationDeclineReasonDetail: '',
  otherNotes: '',
  difficulty: '',
  expectedCompletionDate: '',
  intakeRoles: DEFAULT_ROLES.map(r => ({ ...r })),
  intakeDocuments: DEFAULT_DOCS.map(d => ({ ...d })),
}

// 新規面談登録は1ページ（報告書式の項目のみ）。詳細はオーダーシート／各タブで入力。
export const STEPS = [
  { id: 'basic', label: '相談案件登録', icon: '📋' },
]
