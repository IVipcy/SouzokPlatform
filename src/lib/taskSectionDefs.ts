/**
 * タスク詳細画面 — カテゴリ別セクション定義
 * 出典: docs/画面項目一覧_統合版_ver1.2.xlsx「タスク詳細画面」シート
 */

export type FieldType = 'text' | 'date' | 'picklist' | 'checkbox' | 'currency' | 'textarea'

export type SectionField = {
  key: string
  label: string
  type: FieldType
  options?: string[]   // picklist用選択肢
  full?: boolean       // true=2カラム全幅
}

export type SectionDef = {
  id: string
  icon: string
  title: string
  showWhen: (category: string | null) => boolean
  fields: SectionField[]
}

// v1.2 セクション4: 財産調査（預貯金）
const depositSection: SectionDef = {
  id: 'deposit',
  icon: '🏦',
  title: '財産調査（預貯金）',
  showWhen: (cat) => cat === '財産調査(預貯金)',
  fields: [
    { key: 'bank', label: '金融機関名', type: 'text' },
    { key: 'branch', label: '支店', type: 'text' },
    { key: 'investigationType', label: '調査種別', type: 'picklist', options: ['現存確認', '残高証明', '残高証明(相続開始日)', '取引履歴', '経過利息', '全店調査'] },
    { key: 'investigationBaseDate', label: '調査基準日', type: 'text' },
    { key: 'mailType', label: '郵便種別', type: 'picklist', options: ['普通', '速達', '書留', 'レターパック青', 'レターパック赤', '特定記録'] },
    { key: 'frozen', label: '凍結済', type: 'checkbox' },
    { key: 'reservation', label: '要予約', type: 'checkbox' },
    { key: 'preparedBy', label: '準備した人', type: 'text' },
    { key: 'visitedBy', label: '行った担当者', type: 'text' },
    { key: 'originalLocation', label: '原本所在', type: 'text' },
    { key: 'reqDate', label: '郵送・窓口請求日', type: 'date' },
    { key: 'arrDate', label: '書類到着日（完了日）', type: 'date' },
    { key: 'memo', label: 'メモ', type: 'textarea', full: true },
  ],
}

// v1.2 セクション5: 財産調査（証券・信託）
const securitiesSection: SectionDef = {
  id: 'securities',
  icon: '📈',
  title: '財産調査（証券・信託）',
  showWhen: (cat) => cat === '財産調査(証券)',
  fields: [
    { key: 'company', label: '証券会社名/信託銀行名', type: 'text' },
    { key: 'branch', label: '支店', type: 'text' },
    { key: 'stock', label: '銘柄名', type: 'text' },
    { key: 'investigationType', label: '調査種別', type: 'picklist', options: ['残高照会', '所有株式数証明', '所有株式数証明(特別口座)', '未受領配当金', '配当金支払通知書', 'ほふり照会'] },
    { key: 'investigationBaseDate', label: '調査基準日', type: 'text' },
    { key: 'mailType', label: '郵便種別', type: 'picklist', options: ['普通', '速達', '書留', 'レターパック青', 'レターパック赤', '特定記録'] },
    { key: 'reqDate', label: '郵送・窓口請求日', type: 'date' },
    { key: 'arrDate', label: '書類到着日（完了日）', type: 'date' },
    { key: 'memo', label: 'メモ', type: 'textarea', full: true },
  ],
}

// v1.2 セクション6: 解約手続き
const cancellationSection: SectionDef = {
  id: 'cancellation',
  icon: '🔒',
  title: '解約手続き',
  showWhen: (cat) => cat === '解約手続き',
  fields: [
    { key: 'bank', label: '金融機関名/証券会社名', type: 'text' },
    { key: 'branch', label: '支店', type: 'text' },
    { key: 'accountType', label: '口座種別', type: 'picklist', options: ['預貯金', '証券', '信託銀行'] },
    { key: 'frozen', label: '凍結済', type: 'checkbox' },
    { key: 'reservation', label: '要予約', type: 'checkbox' },
    { key: 'checkSheet', label: '確認シートチェック', type: 'checkbox' },
    { key: 'idDocs', label: '本人確認書類', type: 'checkbox' },
    { key: 'transferTo', label: '解約金振込先', type: 'text', full: true },
    { key: 'processDate', label: '手続日', type: 'date' },
    { key: 'completeDate', label: '完了日', type: 'date' },
    { key: 'memo', label: 'メモ', type: 'textarea', full: true },
  ],
}

// v1.2 セクション7: 郵送管理
const postalSection: SectionDef = {
  id: 'postal',
  icon: '✉️',
  title: '郵送管理',
  showWhen: (cat) => cat === '郵便処理',
  fields: [
    { key: 'mailType', label: '郵便種別', type: 'picklist', options: ['普通', '速達', '書留', 'レターパック青', 'レターパック赤', '特定記録'] },
    { key: 'sendTo', label: '送付先', type: 'text' },
    { key: 'sendDate', label: '発送日', type: 'date' },
    { key: 'arrDate', label: '到着日', type: 'date' },
    { key: 'tracking', label: '追跡番号', type: 'text' },
    { key: 'docs', label: '同封書類', type: 'textarea', full: true },
  ],
}

// v1.2 セクション8: 不動産
const realEstateSection: SectionDef = {
  id: 'realestate',
  icon: '🏠',
  title: '不動産',
  showWhen: (cat) => cat === '不動産' || cat === '登記申請書作成',
  fields: [
    { key: 'addr', label: '不動産所在地', type: 'text', full: true },
    { key: 'propType', label: '物件種別', type: 'picklist', options: ['土地', '建物', 'マンション', 'その他'] },
    { key: 'agent', label: '査定依頼先', type: 'text' },
    { key: 'agentReqDate', label: '査定依頼日', type: 'date' },
    { key: 'amount', label: '査定金額', type: 'currency' },
    { key: 'applyDate', label: '登記申請日', type: 'date' },
    { key: 'completeDate', label: '登記完了日', type: 'date' },
    { key: 'memo', label: 'メモ', type: 'textarea', full: true },
  ],
}

// v1.2 セクション9: 相続税・税理士連携
const taxSection: SectionDef = {
  id: 'tax',
  icon: '🧾',
  title: '相続税・税理士連携',
  showWhen: (cat) => cat === '税理士連携',
  fields: [
    { key: 'taxAdvisor', label: '税理士名', type: 'text' },
    { key: 'contactDate', label: '連絡日', type: 'date' },
    { key: 'instruction', label: '指示内容', type: 'textarea', full: true },
    { key: 'deadline', label: '申告期限', type: 'date' },
    { key: 'memo', label: 'メモ', type: 'textarea', full: true },
  ],
}

// v1.2 セクション10: 戸籍・相続人調査
const kosekiSection: SectionDef = {
  id: 'koseki',
  icon: '📜',
  title: '戸籍・相続人調査',
  showWhen: (cat) => cat === '戸籍',
  fields: [
    { key: 'city', label: '請求先市区町村', type: 'text' },
    { key: 'kosekiType', label: '請求した戸籍の種類', type: 'picklist', options: ['全部事項証明', '除籍謄本', '改製原戸籍', '戸籍の附票', '住民票'] },
    { key: 'reqDate', label: '請求日', type: 'date' },
    { key: 'arrDate', label: '到着日', type: 'date' },
    { key: 'shortage', label: '不足有無', type: 'picklist', options: ['なし', 'あり（追加請求要）'] },
    { key: 'memo', label: 'メモ', type: 'textarea', full: true },
  ],
}

// v1.2 セクション11: 名寄せ・評価証明
const nayoseSection: SectionDef = {
  id: 'nayose',
  icon: '🗂️',
  title: '名寄せ・評価証明',
  showWhen: (cat) => cat === '名寄せ' || cat === '評価証明',
  fields: [
    { key: 'city', label: '請求先市区町村', type: 'text' },
    { key: 'reqType', label: '請求種別', type: 'picklist', options: ['名寄帳', '評価証明書', '両方'] },
    { key: 'reqDate', label: '請求日', type: 'date' },
    { key: 'arrDate', label: '到着日', type: 'date' },
    { key: 'newProp', label: '新規不動産判明', type: 'picklist', options: ['なし', 'あり'] },
    { key: 'memo', label: 'メモ', type: 'textarea', full: true },
  ],
}

// v1.2 セクション12: 財産目録・協議書
const agreementSection: SectionDef = {
  id: 'agreement',
  icon: '📋',
  title: '財産目録・協議書',
  showWhen: (cat) => cat === '協議書' || cat === '財産目録',
  fields: [
    { key: 'sendMethod', label: '送付方法', type: 'picklist', options: ['郵送', 'メール', '対面', '依頼者から各相続人へ', 'OCから各相続人へ'] },
    { key: 'sendDate', label: '送付日', type: 'date' },
    { key: 'replyDue', label: '回答期限', type: 'date' },
    { key: 'collectStatus', label: '署名回収状況', type: 'textarea', full: true },
    { key: 'allCollected', label: '全員回収完了', type: 'checkbox' },
    { key: 'memo', label: 'メモ', type: 'textarea', full: true },
  ],
}

// v1.2 セクション13: 経理・精算
const accountingSection: SectionDef = {
  id: 'accounting',
  icon: '💰',
  title: '経理・精算',
  showWhen: (cat) => cat === '経理' || cat === '精算',
  fields: [
    { key: 'settleStatus', label: '精算ステータス', type: 'picklist', options: ['実費集計中', '請求書作成中', '請求済', '入金待ち', '入金確認済', '完了'] },
    { key: 'deliveryDate', label: '原本納品日', type: 'date' },
    { key: 'receiptCollected', label: '原本受領書回収', type: 'checkbox' },
    { key: 'memo', label: 'メモ', type: 'textarea', full: true },
  ],
}

/** 全カテゴリ別セクション定義（表示順） */
export const TASK_SECTION_DEFS: SectionDef[] = [
  depositSection,      // 4. 財産調査（預貯金）
  securitiesSection,   // 5. 財産調査（証券・信託）
  cancellationSection, // 6. 解約手続き
  postalSection,       // 7. 郵送管理
  realEstateSection,   // 8. 不動産
  taxSection,          // 9. 相続税・税理士連携
  kosekiSection,       // 10. 戸籍・相続人調査
  nayoseSection,       // 11. 名寄せ・評価証明
  agreementSection,    // 12. 財産目録・協議書
  accountingSection,   // 13. 経理・精算
]

/** タスクカテゴリのピックリスト選択肢（v1.2 項目#8） */
export const TASK_CATEGORIES = [
  '戸籍', '名寄せ', '評価証明', '登記情報', '登記申請書作成',
  '財産調査(預貯金)', '財産調査(証券)', '解約手続き',
  '財産目録', '協議書', 'その他作成物', '郵便処理',
  '税理士連携', '経理', '精算',
]

/** タスクステータス（v1.2 項目#4 — 7値に拡張） */
export const TASK_STATUSES_V12 = [
  { key: '未着手', color: '#6B7280' },
  { key: '対応中', color: '#2563EB' },
  { key: 'Wチェック待ち', color: '#7C3AED' },
  { key: '差戻し', color: '#DC2626' },
  { key: '完了', color: '#059669' },
  { key: '保留', color: '#D97706' },
  { key: 'キャンセル', color: '#9CA3AF' },
]

/** ステータスフロー表示用（メインの4ステップ） */
export const STATUS_FLOW_STEPS = ['未着手', '対応中', 'Wチェック待ち', '完了']
