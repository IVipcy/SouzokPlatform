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
  phone: string
  email: string
}

export const EMPTY_CLIENT: ClientPerson = {
  priority: 'companion', name: '', kana: '', birthday: '', relationship: '', phone: '', email: '',
}

export type FormData = {
  // 基本情報（案件番号は自動採番のため入力欄なし）
  caseStatus: string        // 面談結果（旧・案件ステータス。key）
  meetingDate: string       // 面談実施日
  orderRoute: string        // 面談ルート（＝受注ルート）
  orderRouteDetail: string  // 詳細（紹介元名 or 過去客の依頼者名）
  pastClientId: string      // 過去客経由で既存依頼者を選択した場合の client_id
  meetingPlace: string      // 面談場所
  clientResponseDueDate: string  // お客様回答予定日（検討中/検討中（契約書待ち）で必須）
  // 依頼者（複数人）
  clients: ClientPerson[]
  // 面談内容
  hearingMemo: string       // ヒアリング内容メモ
  serviceCategory: string   // 受注区分（単一選択。serviceMaster の ORDER_CATEGORIES）
  referralPartners: string[] // 他事業者紹介要否（税理士/弁護士/不動産/遺品整理）
  lostReason: string        // 失注理由
  otherNotes: string        // その他備考
  difficulty: string        // 難易度（高/中/低）
  expectedCompletionDate: string  // 完了予定日
  // 手続き詳細（受注見込み手続き区分の次に入力）
  intakeRoles: RoleRow[]        // ②役割分担（自社/依頼者）
  intakeDocuments: DocRow[]     // ①契約関連書類の受け取り
}

export const INITIAL_DATA: FormData = {
  caseStatus: '検討中',
  meetingDate: '',
  orderRoute: '',
  orderRouteDetail: '',
  pastClientId: '',
  meetingPlace: '',
  clientResponseDueDate: '',
  clients: [{ priority: 'main', name: '', kana: '', birthday: '', relationship: '', phone: '', email: '' }],
  hearingMemo: '',
  serviceCategory: '',
  referralPartners: [],
  lostReason: '',
  otherNotes: '',
  difficulty: '',
  expectedCompletionDate: '',
  intakeRoles: DEFAULT_ROLES.map(r => ({ ...r })),
  intakeDocuments: DEFAULT_DOCS.map(d => ({ ...d })),
}

export const STEPS = [
  { id: 'basic', label: '基本情報', icon: '📋' },
  { id: 'client', label: '依頼者', icon: '👤' },
  { id: 'meeting', label: '面談内容', icon: '📝' },
  { id: 'confirm', label: '確認', icon: '✅' },
]
