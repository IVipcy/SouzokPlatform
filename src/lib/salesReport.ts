// 確定売上表（独自Excel）のデータ構築ロジック。
// book = 司法/行政（invoice.firm_type）、sheet = 営業部(team.division) × 銀行(team.bank)。
// 列はシステムデータから導出：報酬(fee)・内税(×10/110)・立替実費(課税/非課税)・前受金・合計・差引・入金日・担当。

export type SalesReportRaw = {
  id: string
  case_id: string
  invoice_type: string
  firm_type: string | null // 'shiho' | 'gyosei'
  fee_amount: number | null
  expenses_amount: number | null
  amount: number | null
  posted_date: string | null
  issued_date: string | null
  notes: string | null
  status: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payments?: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cases?: any
}

export type ExpenseItem = { case_id: string; shigyo: string | null; taxable: boolean; amount: number }
export type TeamMeta = { id: string; name: string; division: string | null; bank: string | null }

export type SalesRow = {
  invoiceId: string
  caseId: string
  postedDate: string | null
  issuedDate: string | null
  caseNumber: string
  clientName: string
  rewardInclTax: number   // F 報酬額（税込）
  rewardTax: number       // G （消費税）内税
  expNonTax: number       // H 立替実費 非課税分
  expTaxInclTax: number   // I 立替実費 課税分(税込)
  expTax: number          // J （消費税）
  expTotal: number        // K 立替実費計
  dedNonTax: number       // L 立替実費差引額 非課税分
  dedTaxIncl: number      // M 課税分（税込）
  dedTotal: number        // N 差引額計
  total: number           // O 合計
  advance: number         // P 前受金
  billed: number          // Q 差引請求額
  paidDate: string | null // R 入金日（null=未入金）
  note: string            // S 備考
  teamName: string        // T チーム
  salesName: string       // U 受注
  managerName: string     // V 管理
  defect: string          // W 不備内容
}

export type SalesSheet = {
  key: string
  division: string
  bank: string
  title: string           // 例）第一営業部（みずほ入金）
  rows: SalesRow[]
  totals: SalesTotals
}

export type SalesTotals = {
  rewardInclTax: number; rewardTax: number
  expNonTax: number; expTaxInclTax: number; expTax: number; expTotal: number
  dedNonTax: number; dedTaxIncl: number; dedTotal: number
  total: number; advance: number; billed: number
}

export type SalesBook = {
  key: 'shiho' | 'gyosei'
  label: string           // 司法書士法人／行政書士法人
  sheets: SalesSheet[]
}

const innerTax = (inclTax: number) => Math.round((inclTax * 10) / 110)

function toArr<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  const a = toArr(v)
  return a.length ? a[0] : null
}

const BOOK_LABEL: Record<string, string> = { shiho: '司法書士法人　オーシャン', gyosei: '行政書士法人　オーシャン' }

/**
 * 計上月（posted_date が YYYY-MM）で確定請求を絞り、book × sheet に振り分ける。
 * @param invoices 確定請求＋前受金を含む invoices（cases/payments 埋め込み）
 * @param expenses billing_expense_items（案件×司法/行政×課税で立替を集計）
 * @param teams division/bank を持つチーム一覧
 * @param month 'YYYY-MM' or 'all'
 */
export function buildSalesReport(
  invoices: SalesReportRaw[],
  expenses: ExpenseItem[],
  teams: TeamMeta[],
  month: string,
): SalesBook[] {
  const teamById = new Map(teams.map(t => [t.id, t]))

  // 案件ごとの前受金合計（前受金invoiceのamount合計）
  const advanceByCase = new Map<string, number>()
  for (const inv of invoices) {
    if (inv.invoice_type === '前受金') {
      advanceByCase.set(inv.case_id, (advanceByCase.get(inv.case_id) ?? 0) + (inv.amount ?? 0))
    }
  }

  // 案件×司法/行政 の立替（課税/非課税）
  const expKey = (caseId: string, shigyo: string) => `${caseId}__${shigyo}`
  const expNonTaxMap = new Map<string, number>()
  const expTaxMap = new Map<string, number>()
  for (const e of expenses) {
    const shigyo = e.shigyo === '司法' || e.shigyo === '行政' ? e.shigyo : '共通'
    const k = expKey(e.case_id, shigyo)
    if (e.taxable) expTaxMap.set(k, (expTaxMap.get(k) ?? 0) + (e.amount ?? 0))
    else expNonTaxMap.set(k, (expNonTaxMap.get(k) ?? 0) + (e.amount ?? 0))
  }

  const books: Record<'shiho' | 'gyosei', Map<string, SalesSheet>> = { shiho: new Map(), gyosei: new Map() }

  for (const inv of invoices) {
    if (inv.invoice_type !== '確定請求') continue
    if (month !== 'all' && !(inv.posted_date ?? '').startsWith(month)) continue

    const bookKey: 'shiho' | 'gyosei' = inv.firm_type === 'shiho' ? 'shiho' : 'gyosei'
    const shigyoLabel = bookKey === 'shiho' ? '司法' : '行政'

    const c = inv.cases
    const client = firstOf<{ name?: string }>(c?.clients)
    const members = toArr<{ role?: string; members?: { name?: string; team_id?: string } }>(c?.case_members)
    const salesM = members.find(m => m.role === 'sales')?.members ?? null
    const managerM = members.find(m => m.role === 'manager')?.members ?? null
    const team = salesM?.team_id ? teamById.get(salesM.team_id) : undefined
    const division = team?.division || '未設定'
    const bank = team?.bank || '未設定'

    const rewardInclTax = inv.fee_amount ?? 0
    const expNonTax =
      (expNonTaxMap.get(expKey(inv.case_id, shigyoLabel)) ?? 0) +
      (expNonTaxMap.get(expKey(inv.case_id, '共通')) ?? 0)
    const expTaxInclTax =
      (expTaxMap.get(expKey(inv.case_id, shigyoLabel)) ?? 0) +
      (expTaxMap.get(expKey(inv.case_id, '共通')) ?? 0)
    const expTotal = expNonTax + expTaxInclTax
    const total = rewardInclTax + expTotal
    const advance = advanceByCase.get(inv.case_id) ?? 0
    const billed = total - advance

    // 入金日：返金でない入金があれば最新の payment_date、無ければ未入金
    const pays = toArr<{ amount: number; payment_date: string; is_refund?: boolean }>(inv.payments)
      .filter(p => !p.is_refund)
      .sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1))
    const paidDate = pays.length ? pays[0].payment_date : null

    const row: SalesRow = {
      invoiceId: inv.id,
      caseId: inv.case_id,
      postedDate: inv.posted_date,
      issuedDate: inv.issued_date,
      caseNumber: c?.case_number ?? '',
      clientName: client?.name ?? c?.deceased_name ?? '',
      rewardInclTax,
      rewardTax: innerTax(rewardInclTax),
      expNonTax,
      expTaxInclTax,
      expTax: innerTax(expTaxInclTax),
      expTotal,
      dedNonTax: 0,
      dedTaxIncl: 0,
      dedTotal: 0,
      total,
      advance,
      billed,
      paidDate,
      note: inv.notes ?? '',
      teamName: team?.name ?? '',
      salesName: salesM?.name ?? '',
      managerName: managerM?.name ?? '',
      defect: '',
    }

    const sheetKey = `${division}__${bank}`
    const map = books[bookKey]
    if (!map.has(sheetKey)) {
      map.set(sheetKey, {
        key: sheetKey, division, bank,
        title: `${division}（${bank}入金）`,
        rows: [], totals: emptyTotals(),
      })
    }
    map.get(sheetKey)!.rows.push(row)
  }

  const result: SalesBook[] = (['gyosei', 'shiho'] as const).map(key => {
    const sheets = [...books[key].values()]
      .map(s => ({ ...s, totals: sumTotals(s.rows) }))
      .sort((a, b) => a.title.localeCompare(b.title, 'ja'))
    return { key, label: BOOK_LABEL[key], sheets }
  })
  return result
}

function emptyTotals(): SalesTotals {
  return { rewardInclTax: 0, rewardTax: 0, expNonTax: 0, expTaxInclTax: 0, expTax: 0, expTotal: 0, dedNonTax: 0, dedTaxIncl: 0, dedTotal: 0, total: 0, advance: 0, billed: 0 }
}

function sumTotals(rows: SalesRow[]): SalesTotals {
  const t = emptyTotals()
  for (const r of rows) {
    t.rewardInclTax += r.rewardInclTax; t.rewardTax += r.rewardTax
    t.expNonTax += r.expNonTax; t.expTaxInclTax += r.expTaxInclTax; t.expTax += r.expTax; t.expTotal += r.expTotal
    t.dedNonTax += r.dedNonTax; t.dedTaxIncl += r.dedTaxIncl; t.dedTotal += r.dedTotal
    t.total += r.total; t.advance += r.advance; t.billed += r.billed
  }
  return t
}
