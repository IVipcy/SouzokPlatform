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
 * 拠点マスタ（拠点 × 事業部）。書類の差出人欄に出す連絡先はここで決まる。
 *
 * 同じ拠点でも事業部で電話が変わる（共同ビルの第一／第二）ので、
 * 拠点だけでは連絡先が決まらない。書類を出す前に 拠点 → 事業部 の順で選ぶ。
 * 出典：docs/AI書類作成/拠点情報.xlsx
 */
export const OFFICE_BRANCHES = [
  { office: 'kyodo',    officeLabel: '共同ビル',     division: '第一',   tel: '045-548-9172', fax: '045-548-9173', postalCode: '220-0011', line1: '横浜市西区高島２－１３－２',       line2: '横浜駅前共同ビル', note: '司法書士法人本店／いきいきライフ協会本社' },
  { office: 'kyodo',    officeLabel: '共同ビル',     division: '第二',   tel: '045-628-9990', fax: '045-548-9173', postalCode: '220-0011', line1: '横浜市西区高島２－１３－２',       line2: '横浜駅前共同ビル', note: '' },
  { office: 'kureator', officeLabel: 'クレアトール', division: '第一',   tel: '045-548-3041', fax: '045-548-3081', postalCode: '220-0011', line1: '横浜市西区高島２－１４－１７',     line2: 'クレアトール横浜ビル５階', note: '行政書士法人本店' },
  { office: 'fujisawa', officeLabel: '藤沢',         division: '第一',   tel: '046-653-7992', fax: '0466-53-7993', postalCode: '251-0025', line1: '藤沢市鵠沼石上１丁目１番１号',     line2: '江ノ電第2ビル 4階', note: '' },
  { office: 'shibuya',  officeLabel: '渋谷',         division: '（未定）', tel: '03-6419-7304', fax: '03-6419-7354', postalCode: '150-0002', line1: '東京都渋谷区渋谷１丁目7-5',       line2: '青山セブンハイツ5階 505号室', note: '' },
] as const

export type OfficeBranchId = typeof OFFICE_BRANCHES[number]['office']
export type OfficeBranch = typeof OFFICE_BRANCHES[number]

/** 拠点の一覧（重複を除いた並び。プルダウンはこの順） */
export const OFFICE_BRANCH_OPTIONS: { id: OfficeBranchId; label: string }[] =
  OFFICE_BRANCHES.reduce<{ id: OfficeBranchId; label: string }[]>((acc, b) => {
    if (!acc.some(x => x.id === b.office)) acc.push({ id: b.office, label: b.officeLabel })
    return acc
  }, [])

/** その拠点にある事業部 */
export const divisionsOf = (office: OfficeBranchId): string[] =>
  OFFICE_BRANCHES.filter(b => b.office === office).map(b => b.division)

/** 拠点＋事業部から連絡先を引く。事業部の指定が無ければその拠点の先頭。 */
export const findBranch = (office: OfficeBranchId, division?: string | null): OfficeBranch | undefined =>
  OFFICE_BRANCHES.find(b => b.office === office && (!division || b.division === division))
    ?? OFFICE_BRANCHES.find(b => b.office === office)

/** いきいきライフ協会の既定（拠点情報の3行目＝共同ビル・第一） */
export const IKIIKI_DEFAULT_BRANCH = { office: 'kyodo' as OfficeBranchId, division: '第一' }

/**
 * 戸籍請求書「上記代理人」の請求者所在地（事業所）。出力前に選択する。
 * line1/line2 は請求書の代理人住所欄（F8/F9）にそのまま流し込む。
 * 拠点マスタから作るので、拠点を足せばここにも出る。
 */
export const KOSEKI_AGENT_OFFICES = OFFICE_BRANCH_OPTIONS.map(o => {
  const b = findBranch(o.id)!
  return { id: o.id, label: o.label, line1: b.line1, line2: b.line2 }
})
export type KosekiAgentOfficeId = OfficeBranchId

/**
 * 戸籍請求書の用途バリエーション（行政／司法の2通り。いきいきは廃止）
 */
export type KosekiVariant = 'gyosei' | 'shiho' | 'ikiiki'

/**
 * 戸籍請求書の使用目的（選択肢）。戸籍請求一覧の取得目的と共通（lib/constants）。
 */
export { KOSEKI_PURPOSES } from '@/lib/constants'

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
  // いきいきライフ協会は遺言執行の案件で使う。請求者＝遺言者、代理人＝遺言執行者。
  // 代表社員の住所・生年月日の欄はテンプレートに無い。
  ikiiki: {
    label: 'いきいきライフ協会（遺言執行）',
    office: 'ikiiki',
    requesterLabel: '遺言者',
    agentLabel: '上記遺言執行者',
    purpose: '遺言執行業務の為',
    showRepresentativeDetails: false,
    excludeIninjou: false,
  },
}

/**
 * 契約形態から戸籍請求書バリエーションのデフォルトを決定
 * 行・司連名 → 行を優先
 */
export function defaultKosekiVariant(contractType: string | null | undefined): KosekiVariant {
  switch (contractType) {
    case 'いきいきライフ協会':
      return 'ikiiki'
    case '司法書士法人単独':
      return 'shiho'
    case '行政書士法人単独':
    case '行・司連名':
    default:
      return 'gyosei'
  }
}

/**
 * 固定資産証明等申請書（名寄帳・評価証明）のバリエーション
 * 行政 = 相続財産調査 / 司法 = 相続登記 / いきいき = 遺言執行
 */
export type FixedAssetVariant = 'gyosei' | 'shiho' | 'ikiiki'

export const FIXED_ASSET_VARIANT_PRESETS: Record<FixedAssetVariant, {
  label: string
  office: OfficeKind
  requesterLabel: string        // 「請　求　者」「遺言者」
  agentLabel: string            // 「上記代理人」「遺言執行者」
  purpose: string               // 使用目的
}> = {
  gyosei: {
    label: '行政書士（相続財産調査）',
    office: 'gyosei',
    requesterLabel: '請　求　者',
    agentLabel: '上記代理人',
    purpose: '相続財産調査',
  },
  shiho: {
    label: '司法書士（相続登記）',
    office: 'shiho',
    requesterLabel: '請　求　者',
    agentLabel: '上記代理人',
    purpose: '相続財産調査',
  },
  ikiiki: {
    label: 'いきいきライフ協会（遺言執行）',
    office: 'ikiiki',
    requesterLabel: '遺言者',
    agentLabel: '遺言執行者',
    purpose: '遺言執行業務の為',
  },
}

/**
 * 契約形態から固定資産申請書バリエーションのデフォルトを決定
 * 行・司連名 → 用途により行/司選択（デフォルトは行=相続財産調査）
 */
export function defaultFixedAssetVariant(contractType: string | null | undefined): FixedAssetVariant {
  switch (contractType) {
    case 'いきいきライフ協会':
      return 'ikiiki'
    case '司法書士法人単独':
      return 'shiho'
    case '行政書士法人単独':
    case '行・司連名':
    default:
      return 'gyosei'
  }
}
