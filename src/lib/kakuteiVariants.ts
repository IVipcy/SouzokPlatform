/**
 * 確定請求書＋立替実費明細（1ファイル2シート）バリエーション定義
 *
 * 各変種は public/templates/kakutei/<key>.xlsx に対応（split_kakutei_templates.py で生成）。
 * 1枚目=確定請求書、2枚目=立替実費明細。行＝行政書士法人／司＝司法書士法人。
 * 報酬・立替実費は税込入力、内消費税はテンプレ数式を除去済みのため生成時に計算して流し込む。
 */

import { type StampLaw } from '@/lib/ininjoVariants'

/** 確定請求書シート（1枚目）の流し込みセル */
export const KAKUTEI_FIELDS = {
  caseNo: ['B3', 'C3', 'E3', 'F3'] as [string, string, string, string],
  clientName: 'B8',
  kenmei: ['D10', 'B18'] as string[],
  fee: 'R18',                  // 報酬（税込）
  feeTax: 'V18',               // 報酬の内消費税
  advanceNeg: 'V21',           // 前受金（マイナス）
  taxableExpense: 'R23',       // 立替実費代（課税分・税込）
  taxableExpenseTax: 'V23',
  nonTaxExpense: 'R24',        // 立替実費代（非課税分）
  subtotal: 'R26',            // 小計（税込）
  taxableBase: 'R27',         // 10%対象額
  taxTotal: 'R28',            // 内消費税計
  billAmount: 'R29',          // 請求額
  amountTop: 'D14',           // 上部「金額」
  caseNoClear: ['C3', 'D3', 'E3', 'F3'],  // 案件番号は B3 に1セルで表示し、旧・分割セルは消す
  address1: 'Q11',            // 事務所住所1（選択した拠点で上書き）
  address2: 'Q12',            // 事務所住所2
  repName: 'Q13',             // 担当者（代表社員 氏名）
  tel: 'Q14',                 // 電話（拠点＋事業部で上書き）
  fax: 'Q15',                 // FAX（拠点＋事業部で上書き）
  sealCell: 'T10',            // 社印（法人名の行に重ねる）
}

/** 立替実費明細シート（2枚目）の流し込みセル */
export const TATEKAE_FIELDS = {
  caseNoConcat: 'A2',
  clientName: 'A7',
  totalTop: 'A12',
  nameCol: 'A',
  qtyCol: 'E',    // 数量
  unitCol: 'F',   // 単価
  amountCol: 'G', // 金額
  nonTaxRows: [19, 21, 23, 25, 27, 29, 31, 33, 35, 37],
  nonTaxSubtotal: 'G39',
  taxRows: [43, 45, 47, 49, 51, 53, 55, 57, 59, 61],
  taxSubtotal: 'G63',
  grandTotal: 'I65',
}

export type KakuteiVariant = { key: string; office: StampLaw; officeLabel: string }

export const KAKUTEI_VARIANTS: KakuteiVariant[] = [
  { key: 'kakutei_gyosei', office: 'gyosei', officeLabel: '行政書士法人オーシャン' },
  { key: 'kakutei_shiho', office: 'shiho', officeLabel: '司法書士法人オーシャン' },
]

export function getKakuteiVariant(key: string): KakuteiVariant | undefined {
  return KAKUTEI_VARIANTS.find(v => v.key === key)
}

export function recommendKakuteiOffice(contractType: string | null | undefined): StampLaw {
  return contractType === '司法書士法人単独' ? 'shiho' : 'gyosei'
}

export type ExpenseItem = { name: string; amount: number; taxable: boolean; quantity?: number | null; unitPrice?: number | null }

/** 税込金額から内消費税（10%）を算出。X円(税込)の内税 = round(X/11)。 */
export function innerTax(amountTaxIncluded: number): number {
  return Math.round(amountTaxIncluded / 11)
}

/** 確定請求の各金額を計算（すべて税込ベース、前受金は消費税対象外で差引）。 */
export function computeKakutei(fee: number, advanceReceived: number, expenses: ExpenseItem[]) {
  const nonTaxItems = expenses.filter(e => !e.taxable && e.amount > 0)
  const taxItems = expenses.filter(e => e.taxable && e.amount > 0)
  const nonTaxSubtotal = nonTaxItems.reduce((s, e) => s + e.amount, 0)
  const taxSubtotal = taxItems.reduce((s, e) => s + e.amount, 0)
  const subtotal = fee + taxSubtotal + nonTaxSubtotal       // R26 小計（税込）
  const taxableBase = fee + taxSubtotal                     // R27 10%対象額
  // 内消費税は「10%対象額の合計」から1回だけ丸める。行ごとに丸めて足すと ¥1 ずれる
  // （例: 報酬 55,555 と立替 5,555 → 個別丸め 5,050+505=5,555 / 合計丸め round(61,110/11)=5,555 は一致するが
  //   端数の組み合わせで合わない）。報酬の内税を先に出し、立替の内税は差額で最終行として調整する。
  const taxTotal = innerTax(taxableBase)                    // R28 内消費税計
  const feeTax = innerTax(fee)
  const taxExpTax = taxSubtotal > 0 ? taxTotal - feeTax : 0
  // 立替が無いときは報酬側で全額を持つ（差額を捨てない）
  const feeTaxAdj = taxSubtotal > 0 ? feeTax : taxTotal
  const billAmount = subtotal - advanceReceived             // R29 請求額
  const expenseGrand = nonTaxSubtotal + taxSubtotal         // 立替合計（明細シート）
  return { nonTaxItems, taxItems, nonTaxSubtotal, taxSubtotal, feeTax: feeTaxAdj, taxExpTax, subtotal, taxableBase, taxTotal, billAmount, expenseGrand }
}
