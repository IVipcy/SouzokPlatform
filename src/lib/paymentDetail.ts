// 入金明細（独自Excel）のデータ構築ロジック。
// 現行の請求・入金タブの「入金」を、経理テンプレ（銀行別シート・司/行内訳）で出力する。
// 1行=1入金(payment)。シート=入金銀行(payments.bank)。司/行はinvoice.firm_typeで判定。

export type PaymentDetailRaw = {
  amount: number | null
  payment_date: string | null
  bank: string | null
  is_refund?: boolean | null
  notes: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoices?: any
}

export type PaymentRow = {
  firmMark: '司' | '行' | ''  // A 司/行
  date: string                // B 入金日
  caseNumber: string          // C 案件番号
  client: string              // D 依頼者
  amount: number              // E 入金額
  diff: number                // F 差額（入金額 − 内訳計）
  breakdown: number           // G 内訳計
  shihoAdvance: number        // H 司前受金
  shihoReward: number         // I 司報酬
  shihoExpense: number        // J 司実費
  gyoseiAdvance: number       // K 行前受金
  gyoseiReward: number        // L 行報酬
  gyoseiExpense: number       // M 行実費
  payer: string               // O 振込人名（≠依頼者のとき）
  sales: string               // P 受注
  manager: string             // Q 管理
  route: string               // R 受注ルート
  referral: string            // S 紹介元
  hasInvoice: string          // T 請求書（有）
  note: string                // X 備考
}

export type PaymentSheet = {
  key: string
  bank: string                // '' = 未設定
  title: string
  rows: PaymentRow[]
  totals: { amount: number; breakdown: number; diff: number }
}

export type RefundRow = {
  date: string
  caseNumber: string
  client: string
  amount: number              // 返金額（正の値）
  note: string
}

export type PaymentDetail = {
  sheets: PaymentSheet[]
  refunds: RefundRow[]
}

function toArr<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}
function firstOf<T>(v: T | T[] | null | undefined): T | null {
  const a = toArr(v)
  return a.length ? a[0] : null
}

/**
 * 入金一覧を銀行別シート＋返金一覧に整形。
 * @param payments payments（invoices/cases 埋め込み）
 * @param month '入金月' YYYY-MM or 'all'
 */
export function buildPaymentDetail(payments: PaymentDetailRaw[], month: string): PaymentDetail {
  const sheetMap = new Map<string, PaymentSheet>()
  const refunds: RefundRow[] = []

  for (const p of payments) {
    const date = p.payment_date ?? ''
    if (month !== 'all' && !date.startsWith(month)) continue

    const inv = p.invoices
    const c = inv?.cases
    const client = firstOf<{ name?: string }>(c?.clients)?.name ?? c?.deceased_name ?? ''
    const caseNumber = c?.case_number ?? ''

    // 返金は別シート
    if (p.is_refund) {
      refunds.push({ date, caseNumber, client, amount: Math.abs(p.amount ?? 0), note: p.notes ?? '' })
      continue
    }

    const amount = p.amount ?? 0
    const isShiho = inv?.firm_type === 'shiho'
    const firmMark: '司' | '行' | '' = inv?.firm_type === 'shiho' ? '司' : inv?.firm_type === 'gyosei' ? '行' : ''

    // 内訳：前受金→前受金列、確定請求→報酬(fee)+実費(expenses)。司/行で列を振り分け。
    let shihoAdvance = 0, shihoReward = 0, shihoExpense = 0, gyoseiAdvance = 0, gyoseiReward = 0, gyoseiExpense = 0
    const fee = inv?.fee_amount ?? 0
    const exp = inv?.expenses_amount ?? 0
    if (inv?.invoice_type === '前受金') {
      const adv = inv?.amount ?? amount
      if (isShiho) shihoAdvance = adv; else gyoseiAdvance = adv
    } else if (inv?.invoice_type === '確定請求') {
      if (isShiho) { shihoReward = fee; shihoExpense = exp } else { gyoseiReward = fee; gyoseiExpense = exp }
    }
    const breakdown = shihoAdvance + shihoReward + shihoExpense + gyoseiAdvance + gyoseiReward + gyoseiExpense

    const members = toArr<{ role?: string; members?: { name?: string } }>(c?.case_members)
    const sales = members.find(m => m.role === 'sales')?.members?.name ?? ''
    const manager = members.find(m => m.role === 'manager')?.members?.name ?? ''

    const row: PaymentRow = {
      firmMark, date, caseNumber, client,
      amount, breakdown, diff: amount - breakdown,
      shihoAdvance, shihoReward, shihoExpense, gyoseiAdvance, gyoseiReward, gyoseiExpense,
      payer: '', // 振込人名（≠依頼者）は突合メモから未確定のため空
      sales, manager,
      route: c?.order_route ?? '',
      referral: c?.order_route_detail ?? '',
      hasInvoice: inv ? '有' : '',
      note: p.notes ?? '',
    }

    const bank = p.bank || ''
    const key = bank || '__unassigned'
    if (!sheetMap.has(key)) {
      sheetMap.set(key, {
        key, bank,
        title: bank ? `${bank}入金` : '未設定（銀行不明）',
        rows: [], totals: { amount: 0, breakdown: 0, diff: 0 },
      })
    }
    sheetMap.get(key)!.rows.push(row)
  }

  const sheets = [...sheetMap.values()]
    .map(s => {
      const totals = s.rows.reduce(
        (t, r) => ({ amount: t.amount + r.amount, breakdown: t.breakdown + r.breakdown, diff: t.diff + r.diff }),
        { amount: 0, breakdown: 0, diff: 0 },
      )
      return { ...s, totals }
    })
    .sort((a, b) => {
      if (!a.bank && b.bank) return 1
      if (a.bank && !b.bank) return -1
      return a.title.localeCompare(b.title, 'ja')
    })

  refunds.sort((a, b) => (a.date < b.date ? -1 : 1))
  return { sheets, refunds }
}
