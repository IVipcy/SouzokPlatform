// 面談入力ウィザード（相談案件の作成・面談情報入力）のフォームデータ。
// 受託後の遺産系詳細（被相続人/相続人/不動産/金融/分割・遺言）はオーダーシートで入力するため、
// このウィザードは「面談情報のみ」に絞っている。
export type FormData = {
  // 基本情報
  caseNumber: string        // 案件管理番号（空なら自動採番）
  caseStatus: string        // 案件ステータス（key）
  meetingDate: string       // 面談実施日
  meetingPlace: string      // 面談場所
  salesOwner: string        // 受注担当（氏名テキスト）
  // 依頼者
  clientName: string
  clientKana: string
  clientPhone: string
  clientMobile: string
  clientEmail: string
  clientZip: string
  clientAddress: string
  clientBirthday: string
  clientGaiji: string
  contactPreference: string[]
  mailingDestination: string
  altMailingAddress: string
  // 面談内容
  hearingMemo: string       // ヒアリング内容メモ
  procedureType: string[]   // 受注見込み手続き区分
  referralPartners: string[] // 他事業者紹介要否（税理士/弁護士/不動産/遺品整理）
  lostReason: string        // 失注理由
  otherNotes: string        // その他備考
  difficulty: string        // 難易度（高/中/低）
  leadSource: string        // 受注ルート
}

export const INITIAL_DATA: FormData = {
  caseNumber: '',
  caseStatus: '面談設定済',
  meetingDate: '',
  meetingPlace: '',
  salesOwner: '',
  clientName: '',
  clientKana: '',
  clientPhone: '',
  clientMobile: '',
  clientEmail: '',
  clientZip: '',
  clientAddress: '',
  clientBirthday: '',
  clientGaiji: '',
  contactPreference: [],
  mailingDestination: '',
  altMailingAddress: '',
  hearingMemo: '',
  procedureType: [],
  referralPartners: [],
  lostReason: '',
  otherNotes: '',
  difficulty: '',
  leadSource: '',
}

export const STEPS = [
  { id: 'basic', label: '基本情報', icon: '📋' },
  { id: 'client', label: '依頼者', icon: '👤' },
  { id: 'meeting', label: '面談内容', icon: '📝' },
  { id: 'confirm', label: '確認', icon: '✅' },
]
