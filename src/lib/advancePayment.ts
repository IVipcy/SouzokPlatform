// 前受金の法人別(行政/司法)アクセス。報酬(fee_administrative/fee_judicial)と同じ考え方。
// 旧データ（新列が両方未設定）は単一 advance_payment を行政側に寄せ、合計が変わらないようにする。
type AdvanceCase = {
  advance_payment?: number | null
  advance_payment_administrative?: number | null
  advance_payment_judicial?: number | null
}

// 'gyosei' | 'shiho' | その他(いきいき等)。司法のみ司法ぶん、それ以外は行政ぶんとして扱う。
export type FirmKey = string

export function advanceForFirm(c: AdvanceCase, firm: FirmKey): number {
  const adm = c.advance_payment_administrative
  const jud = c.advance_payment_judicial
  if (adm == null && jud == null) {
    // 旧データ: 単一値は行政に寄せる
    return firm === 'shiho' ? 0 : (c.advance_payment ?? 0)
  }
  return firm === 'shiho' ? (jud ?? 0) : (adm ?? 0)
}

export function advanceTotal(c: AdvanceCase): number {
  const adm = c.advance_payment_administrative
  const jud = c.advance_payment_judicial
  if (adm == null && jud == null) return c.advance_payment ?? 0
  return (adm ?? 0) + (jud ?? 0)
}
