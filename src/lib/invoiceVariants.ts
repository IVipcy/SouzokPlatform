/**
 * 請求書・領収書（前受金）バリエーション定義
 *
 * 各変種は public/templates/invoice/<key>.xlsx に対応（split_invoice_templates.py で生成）。
 * 行＝行政書士法人／司＝司法書士法人で署名・口座・登録番号がテンプレに静的に含まれる。
 * 前受金は消費税対象外のため、合計＝入力額をそのまま流し込む。
 * 社印はテンプレ埋め込み画像を除去済みのため、生成時に法人別(gyosei/shiho.png)で再配置する。
 */

import { type StampLaw } from '@/lib/ininjoVariants'

/** 全様式共通の流し込みセル */
export const INVOICE_FIELDS = {
  caseNo: ['B3', 'C3', 'E3', 'F3'] as [string, string, string, string],
  clientName: 'B8',
  kenmei: ['D10', 'B18'] as string[], // 件名（ヘッダ・明細行）
  kubun: 'R18',                       // 請求/領収区分
  amount: ['V18', 'V23', 'V30', 'V31', 'D14'] as string[], // 前受金は合計＝入力額
  sealCell: 'T13',                    // 社印アンカー（代表者名の行に重ねる。住所行=11との重なりを避ける）
}

export type InvoiceVariant = {
  key: string
  docType: '請求書' | '領収書'
  office: StampLaw
  officeLabel: string
}

export const INVOICE_VARIANTS: InvoiceVariant[] = [
  { key: 'seikyu_advance_gyosei', docType: '請求書', office: 'gyosei', officeLabel: '行政書士法人オーシャン' },
  { key: 'seikyu_advance_shiho', docType: '請求書', office: 'shiho', officeLabel: '司法書士法人オーシャン' },
  { key: 'ryoshu_advance_gyosei', docType: '領収書', office: 'gyosei', officeLabel: '行政書士法人オーシャン' },
  { key: 'ryoshu_advance_shiho', docType: '領収書', office: 'shiho', officeLabel: '司法書士法人オーシャン' },
]

export function getInvoiceVariant(key: string): InvoiceVariant | undefined {
  return INVOICE_VARIANTS.find(v => v.key === key)
}

/** 発行主体（行/司）の推奨を契約形態から決定 */
export function recommendInvoiceOffice(contractType: string | null | undefined): StampLaw {
  return contractType === '司法書士法人単独' ? 'shiho' : 'gyosei'
}

/** docType + office から変種キーを組み立て */
export function invoiceVariantKey(docType: '請求書' | '領収書', office: StampLaw): string {
  const prefix = docType === '請求書' ? 'seikyu' : 'ryoshu'
  return `${prefix}_advance_${office}`
}
