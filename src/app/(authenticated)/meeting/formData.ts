// 面談入力ウィザード（相談案件の作成・面談情報入力）のフォームデータ。
// 受託後の遺産系詳細（被相続人/相続人/不動産/金融/分割・遺言）はオーダーシートで入力するため、
// このウィザードは「面談情報のみ」に絞っている。
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
  // 基本情報
  caseNumber: string        // 案件管理番号（空なら自動採番）
  caseStatus: string        // 案件ステータス（key）
  meetingDate: string       // 面談実施日
  meetingPlace: string      // 面談場所
  clientResponseDueDate: string  // お客様回答予定日（検討中/検討中（契約書待ち）で必須）
  // 依頼者（複数人）
  clients: ClientPerson[]
  // 面談内容
  hearingMemo: string       // ヒアリング内容メモ
  procedureType: string[]   // 受注見込み手続き区分
  referralPartners: string[] // 他事業者紹介要否（税理士/弁護士/不動産/遺品整理）
  lostReason: string        // 失注理由
  otherNotes: string        // その他備考
  difficulty: string        // 難易度（高/中/低）
  expectedCompletionDate: string  // 完了予定日
}

export const INITIAL_DATA: FormData = {
  caseNumber: '',
  caseStatus: '検討中',
  meetingDate: '',
  meetingPlace: '',
  clientResponseDueDate: '',
  clients: [{ priority: 'main', name: '', kana: '', birthday: '', relationship: '', phone: '', email: '' }],
  hearingMemo: '',
  procedureType: [],
  referralPartners: [],
  lostReason: '',
  otherNotes: '',
  difficulty: '',
  expectedCompletionDate: '',
}

export const STEPS = [
  { id: 'basic', label: '基本情報', icon: '📋' },
  { id: 'client', label: '依頼者', icon: '👤' },
  { id: 'meeting', label: '面談内容', icon: '📝' },
  { id: 'confirm', label: '確認', icon: '✅' },
]
