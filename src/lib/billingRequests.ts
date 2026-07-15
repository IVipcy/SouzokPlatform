// 請求の「確認依頼／返金依頼」ワークフロー用の定数・ラベル（payment_check_requests を拡張）。
//   kind=confirm … 経理→受注/管理 の確認依頼（過入金/不備）。回答に resolution（判定）が付く。
//   kind=refund  … 受注/管理→経理 の返金依頼。理由/手数料負担/金額を持つ。
// 返金確定＝payments に is_refund のマイナス行を記録し、依頼を '完了' にする。

export const REFUND_REASONS = ['過入金', '当初想定より業務量が下回った', '解約', 'その他'] as const
export type RefundReason = (typeof REFUND_REASONS)[number]

export const FEE_BEARERS = [
  { value: 'customer', label: 'お客様' },
  { value: 'self', label: '自社' },
] as const
export const feeBearerLabel = (v: string | null | undefined) => FEE_BEARERS.find(f => f.value === v)?.label ?? '—'

// 確認依頼への回答判定（受注/管理が選ぶ。返金OKフラグ相当）
export const RESOLUTIONS = [
  { value: 'confirm_ok', label: '入金確定でOK', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'need_refund', label: '要返金', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  { value: 'hold', label: '保留', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
] as const
export const resolutionOf = (v: string | null | undefined) => RESOLUTIONS.find(r => r.value === v) ?? null

// 依頼ステータス（既存 '依頼中'/'確認済' に加え、確認依頼の回答待ち/対応済を扱う）
//   依頼中 … 未対応（confirm=回答待ち／refund=経理の返金確定待ち）
//   回答済 … confirm を受注/管理が回答済（経理の対応待ち）
//   完了   … 経理が対応済（入金確定 or 返金確定）
export type BillingRequestStatus = '依頼中' | '回答済' | '完了'
