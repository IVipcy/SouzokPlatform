/**
 * 事務所マスタ
 * 契約形態・戸籍請求パターン・用途に応じた事務所情報・表記パターンを定義
 */

export type OfficeKind = 'gyosei' | 'shiho' | 'ikiiki'

export type OfficeProfile = {
  kind: OfficeKind
  legalName: string
  representativeTitle: string
  representativeName: string
  representativeAddressLine1: string
  representativeAddressLine2: string
  representativeBirthDate: string | null
  mainOfficeAddress: string
  subOfficeAddresses: string[]
  affiliation: string
  postalCode: string
  telMain: string
  telKoseki: string
  fax: string
  invoiceRegistrationNumber: string
  bankName: string
  bankBranch: string
  accountType: string
  accountNumber: string
  accountHolder: string
  accountHolderKana: string
}

export const OFFICE_PROFILES: Record<OfficeKind, OfficeProfile> = {
  gyosei: {
    kind: 'gyosei',
    legalName: '行政書士法人オーシャン',
    representativeTitle: '代表社員',
    representativeName: '黒田　美菜子',
    representativeAddressLine1: '横浜市西区高島２－１４－１７',
    representativeAddressLine2: 'クレアトール横浜ビル５階',
    representativeBirthDate: '1979-03-15',
    mainOfficeAddress: '横浜市西区高島２丁目１４－１７ クレアトール横浜ビル５階',
    subOfficeAddresses: ['横浜市西区高島２丁目１３－２ 横浜駅前共同ビル'],
    affiliation: '神奈川県行政書士会',
    postalCode: '220-0011',
    telMain: '045-548-3041',
    telKoseki: '045-548-9172',
    fax: '045-548-3081',
    invoiceRegistrationNumber: 'T5-0200-0501-0814',
    bankName: 'みずほ銀行',
    bankBranch: '横浜東口支店',
    accountType: '普通',
    accountNumber: '2167817',
    accountHolder: '行政書士法人オーシャン',
    accountHolderKana: 'ギョウセイショシホウジンオーシャン',
  },
  shiho: {
    kind: 'shiho',
    legalName: '司法書士法人オーシャン',
    representativeTitle: '代表社員',
    representativeName: '山田　哲',
    representativeAddressLine1: '横浜市都筑区勝田南一丁目８番１３号',
    representativeAddressLine2: '',
    representativeBirthDate: '1980-04-30',
    mainOfficeAddress: '横浜市西区高島２丁目１３－２ 横浜駅前共同ビル',
    subOfficeAddresses: [
      '横浜市西区高島２丁目１４番１７号 クレアトール横浜ビル５階',
      '藤沢市鵠沼石上一丁目１番１号 江ノ電第２ビル４階',
    ],
    affiliation: '神奈川県司法書士会',
    postalCode: '220-0011',
    telMain: '045-548-9172',
    telKoseki: '045-548-9172',
    fax: '045-548-9173',
    invoiceRegistrationNumber: 'T8-0200-0501-1099',
    bankName: 'みずほ銀行',
    bankBranch: '横浜東口支店',
    accountType: '普通',
    accountNumber: '2169216',
    accountHolder: '司法書士法人オーシャン　代表社員　山田　哲',
    accountHolderKana: 'シホウショシホウジンオーシャンダイヒョウシャインヤマダサトシ',
  },
  ikiiki: {
    kind: 'ikiiki',
    legalName: '一般社団法人いきいきライフ協会',
    representativeTitle: '代表理事',
    representativeName: '黒田　美菜子',
    representativeAddressLine1: '横浜市西区高島２丁目１３－２',
    representativeAddressLine2: '横浜駅前共同ビル',
    representativeBirthDate: null,
    mainOfficeAddress: '横浜市西区高島２丁目１３－２ 横浜駅前共同ビル',
    subOfficeAddresses: [],
    affiliation: '',
    postalCode: '220-0011',
    telMain: '045-620-6600',
    telKoseki: '045-620-6600',
    fax: '',
    invoiceRegistrationNumber: '',
    bankName: '',
    bankBranch: '',
    accountType: '',
    accountNumber: '',
    accountHolder: '',
    accountHolderKana: '',
  },
}

/**
 * 契約形態（cases.contract_type）→ 使用すべき事務所プロファイルリスト
 * 連名時は行・司の両方。いきいき契約ではいきいきのみ。
 */
export function officesForContractType(contractType: string | null | undefined): OfficeKind[] {
  switch (contractType) {
    case '行政書士法人単独':
      return ['gyosei']
    case '司法書士法人単独':
      return ['shiho']
    case '行・司連名':
      return ['gyosei', 'shiho']
    case 'いきいきライフ協会':
      return ['ikiiki']
    default:
      return ['gyosei']
  }
}

/**
 * 戸籍請求書の用途バリエーション
 */
export type KosekiVariant = 'gyosei' | 'shiho' | 'ikiiki' | 'ikiiki_kennin'

/**
 * 戸籍請求書の用途別プリセット（請求者欄表記・代理人欄表記・使用目的文言）
 */
export const KOSEKI_VARIANT_PRESETS: Record<KosekiVariant, {
  label: string
  office: OfficeKind
  requesterLabel: string       // 「請求者」「遺言者」「請求者(遺言保管者)」
  agentLabel: string | null    // 「上記代理人」「上記遺言執行者」/ null=表示なし
  purpose: string              // 使用目的文言
  showRepresentativeDetails: boolean  // 代表社員住所・生年月日の表示有無
  excludeIninjou: boolean      // 末尾の「委任状及び資格証明書は…」から委任状を除くか
}> = {
  gyosei: {
    label: '行政書士（相続人調査）',
    office: 'gyosei',
    requesterLabel: '請求者',
    agentLabel: '上記代理人',
    purpose: '正確な相続人の把握と、相続関係図の作成',
    showRepresentativeDetails: true,
    excludeIninjou: false,
  },
  shiho: {
    label: '司法書士（相続人確定）',
    office: 'shiho',
    requesterLabel: '請求者',
    agentLabel: '上記代理人',
    purpose: '正確な相続人確定の為',
    showRepresentativeDetails: true,
    excludeIninjou: false,
  },
  ikiiki: {
    label: 'いきいきライフ協会（遺言執行）',
    office: 'ikiiki',
    requesterLabel: '遺言者',
    agentLabel: '上記遺言執行者',
    purpose: '遺言執行業務の為',
    showRepresentativeDetails: false,
    excludeIninjou: false,
  },
  ikiiki_kennin: {
    label: 'いきいきライフ協会（自筆遺言検認）',
    office: 'ikiiki',
    requesterLabel: '請求者（遺言保管者）',
    agentLabel: null,
    purpose: '自筆遺言検認申立ての為＿＿＿＿＿家庭裁判所に提出するため',
    showRepresentativeDetails: false,
    excludeIninjou: true,
  },
}

/**
 * 契約形態から戸籍請求書バリエーションのデフォルトを決定
 * 行・司連名 → 行を優先
 */
export function defaultKosekiVariant(contractType: string | null | undefined): KosekiVariant {
  switch (contractType) {
    case '司法書士法人単独':
      return 'shiho'
    case 'いきいきライフ協会':
      return 'ikiiki'
    case '行政書士法人単独':
    case '行・司連名':
    default:
      return 'gyosei'
  }
}
