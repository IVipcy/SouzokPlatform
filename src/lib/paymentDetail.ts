// 入金明細（独自Excel）のデータ構築ロジック。
// 現行の請求・入金タブの「入金」を、経理テンプレ（銀行別シート・司/行内訳）で出力する。
// 1行=1入金(payment)。シート=入金銀行(payments.bank)。司/行はinvoice.firm_typeで判定。

export type PaymentDetailRaw = {
  id?: string
  amount: number | null
  payment_date: string | null
  bank: string | null
  is_refund?: boolean | null
  notes: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoices?: any
}

export type PaymentRow = {
  paymentId: string           // 銀行変更・削除用のID
  invoiceId: string | null    // 請求書リンク・備考編集用
  caseId: string              // 案件フォルダ遷移用
  bank: string                // 現在の銀行（空='未振り分け'）
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
  invoiceFilePath: string | null // T 請求書ファイル(generated_file_path)。null=司法など未生成
  invoiceType: string         // 請求書の種別ラベル(前受金/確定請求)
  invoiceNote: string         // X 備考（invoices.notes・両方向共有）
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

  // 分割入金の按分。請求書全体の内訳（前受金／報酬／実費）を各行に繰り返すと
  // Excelの内訳合計が入金額の倍になるので、入金額の比率で按分する。端数は最後の1本で調整。
  // 月で絞る前の全入金で計算する（前月の入金と当月の入金で1枚を払い終えることがあるため）。
  type Parts = { adv: number; reward: number; exp: number }
  const fullPartsOf = (p: PaymentDetailRaw): Parts => {
    const inv = p.invoices
    if (inv?.invoice_type === '前受金') return { adv: inv?.amount ?? (p.amount ?? 0), reward: 0, exp: 0 }
    if (inv?.invoice_type === '確定請求') return { adv: 0, reward: inv?.fee_amount ?? 0, exp: inv?.expenses_amount ?? 0 }
    return { adv: 0, reward: 0, exp: 0 }
  }
  const byInvoice = new Map<string, number[]>()   // 請求書ID → payments の添字（返金を除く）
  payments.forEach((p, idx) => {
    const invId = p.invoices?.id as string | undefined
    if (!invId || p.is_refund) return
    byInvoice.set(invId, [...(byInvoice.get(invId) ?? []), idx])
  })
  const partsByIndex = new Map<number, Parts>()
  for (const idxs of byInvoice.values()) {
    const full = fullPartsOf(payments[idxs[0]])
    const paidTotal = idxs.reduce((s, i) => s + (payments[i].amount ?? 0), 0)
    if (idxs.length === 1 || paidTotal <= 0) { idxs.forEach(i => partsByIndex.set(i, full)); continue }
    const acc: Parts = { adv: 0, reward: 0, exp: 0 }
    idxs.forEach((i, n) => {
      let part: Parts
      if (n === idxs.length - 1) {
        part = { adv: full.adv - acc.adv, reward: full.reward - acc.reward, exp: full.exp - acc.exp }
      } else {
        const ratio = (payments[i].amount ?? 0) / paidTotal
        part = { adv: Math.round(full.adv * ratio), reward: Math.round(full.reward * ratio), exp: Math.round(full.exp * ratio) }
      }
      acc.adv += part.adv; acc.reward += part.reward; acc.exp += part.exp
      partsByIndex.set(i, part)
    })
  }

  for (const [pIdx, p] of payments.entries()) {
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
    // 分割入金なら上で按分した分（partsByIndex）、1本払いなら請求書全体。
    const { adv: advPart, reward: rewardPart, exp: expPart } = partsByIndex.get(pIdx) ?? fullPartsOf(p)
    let shihoAdvance = 0, shihoReward = 0, shihoExpense = 0, gyoseiAdvance = 0, gyoseiReward = 0, gyoseiExpense = 0
    if (isShiho) { shihoAdvance = advPart; shihoReward = rewardPart; shihoExpense = expPart }
    else { gyoseiAdvance = advPart; gyoseiReward = rewardPart; gyoseiExpense = expPart }
    const breakdown = shihoAdvance + shihoReward + shihoExpense + gyoseiAdvance + gyoseiReward + gyoseiExpense

    const members = toArr<{ role?: string; members?: { name?: string } }>(c?.case_members)
    const sales = members.find(m => m.role === 'sales')?.members?.name ?? ''
    const manager = members.find(m => m.role === 'manager')?.members?.name ?? ''

    const row: PaymentRow = {
      paymentId: p.id ?? '',
      invoiceId: inv?.id ?? null,
      caseId: c?.id ?? '',
      bank: p.bank ?? '',
      firmMark, date, caseNumber, client,
      amount, breakdown, diff: amount - breakdown,
      shihoAdvance, shihoReward, shihoExpense, gyoseiAdvance, gyoseiReward, gyoseiExpense,
      payer: '', // 振込人名（≠依頼者）は突合メモから未確定のため空
      sales, manager,
      route: c?.order_route ?? '',
      referral: c?.order_route_detail ?? '',
      invoiceFilePath: inv?.generated_file_path ?? null,
      invoiceType: inv?.invoice_type ?? '',
      invoiceNote: inv?.notes ?? '',
    }

    const bank = p.bank || ''
    const key = bank || '__unassigned'
    if (!sheetMap.has(key)) {
      sheetMap.set(key, {
        key, bank,
        title: bank ? `${bank}入金` : '未振り分け',
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
