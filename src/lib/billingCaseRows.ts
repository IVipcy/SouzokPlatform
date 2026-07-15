// 請求タブ（管理担当ダッシュボード／マイページ）の案件ベース行ビルダー。
// 当月の「受託(受注) / 当月完了予定の対応中 / 当月業務完了の完了」案件を抽出し、
// 区分に応じた請求書（受託=前受金, 対応中/完了=確定請求）の状況を1行にまとめる。

export type BillingBucket = '受託' | '対応中' | '完了'

export type BillingCaseRow = {
  caseId: string
  caseNumber: string
  dealName: string
  contractType: string | null      // 行/司/連名 の色判定に使用
  firmType: 'gyosei' | 'shiho' | null  // 行/司 集計用（請求書の発行法人、無ければ契約形態から推定）
  procedureType: string[] | null   // 受注内容（手続区分）
  salesId: string | null
  salesName: string | null
  salesAvatarUrl: string | null
  managerId: string | null
  managerName: string | null
  managerAvatarUrl: string | null
  bucket: BillingBucket
  invoiceId: string | null
  invoiceType: string              // 請求分類（前受金 / 確定請求）
  invoiceStatus: string            // 請求(入金)ステータス。未発行は '未請求'
  needsReview: boolean             // 要確認（CSV突合②③）
  billingPattern: string           // 請求パターン（staged/lump_expense/lump_only）
  amount: number                   // 請求金額
  paidAmount: number               // 入金済額
  issuedDate: string | null        // 請求日
  // 請求一覧と揃える表示用
  orderRoute: string | null
  orderRouteDetail: string | null
  advance: number                  // 前受金(前受金請求=請求額/確定請求=前受金控除)
  expenses: number                 // 立替実費
  receiptIssuedDate: string | null
  notes: string | null
}

type CaseLike = {
  id: string
  case_number: string
  deal_name: string
  status: string
  contract_type?: string | null
  billing_pattern?: string | null
  procedure_type?: string[] | null
  expected_completion_date?: string | null
  completion_date?: string | null
  fee_total?: number | null
  fee_administrative?: number | null
  fee_judicial?: number | null
  advance_payment?: number | null
  order_route?: string | null
  order_route_detail?: string | null
}
type CaseMemberLike = { case_id: string; member_id: string; role: string }
type MemberLike = { id: string; name: string; avatar_url?: string | null }
type InvoiceLike = {
  id: string
  case_id: string
  invoice_type: string
  status: string
  amount: number
  firm_type?: string | null
  issued_date?: string | null
  created_at?: string | null
  expenses_amount?: number | null
  advance_deduction?: number | null
  notes?: string | null
  receipt_issued_date?: string | null
  needs_review?: boolean | null
}

function firmFromContract(contractType: string | null | undefined): 'gyosei' | 'shiho' | null {
  switch (contractType) {
    case '司法書士法人単独': return 'shiho'
    case '行政書士法人単独':
    case '行・司連名': return 'gyosei'
    default: return null
  }
}

// 請求(入金)ステータスのソート順（未請求→作成済→入金待ち→入金済）
export const BILLING_STATUS_ORDER: Record<string, number> = {
  '未請求': 0, '作成済': 1, '入金待ち': 2, '入金済': 3,
}

export function buildBillingCaseRows(
  cases: CaseLike[],
  caseMembers: CaseMemberLike[],
  membersById: Map<string, MemberLike>,
  invoices: InvoiceLike[],
  today: Date,
  payments: Array<{ invoice_id: string; amount: number }> = [],
): BillingCaseRow[] {
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const paidByInvoice = new Map<string, number>()
  for (const p of payments) paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + p.amount)

  // 案件→受注担当/管理担当
  const salesByCase = new Map<string, MemberLike>()
  const managerByCase = new Map<string, MemberLike>()
  for (const cm of caseMembers) {
    const m = membersById.get(cm.member_id)
    if (!m) continue
    if (cm.role === 'sales' && !salesByCase.has(cm.case_id)) salesByCase.set(cm.case_id, m)
    if (cm.role === 'manager' && !managerByCase.has(cm.case_id)) managerByCase.set(cm.case_id, m)
  }

  // 案件→請求書（種別ごとに最新を引く）
  const invByCaseType = new Map<string, InvoiceLike>()
  for (const inv of invoices) {
    const key = `${inv.case_id}:${inv.invoice_type}`
    const cur = invByCaseType.get(key)
    if (!cur || (inv.created_at ?? '') > (cur.created_at ?? '')) invByCaseType.set(key, inv)
  }

  const rows: BillingCaseRow[] = []
  for (const c of cases) {
    let bucket: BillingBucket | null = null
    if (c.status === '受注' || c.status === '戻り受注') bucket = '受託'
    else if (c.status === '対応中' && c.expected_completion_date?.startsWith(ym)) bucket = '対応中'
    else if (c.status === '完了' && c.completion_date?.startsWith(ym)) bucket = '完了'

    // 当月バケットに該当しなくても、実際に請求書があれば「請求が反映されない」を防ぐため取り込む。
    const conf = invByCaseType.get(`${c.id}:確定請求`) ?? null
    const adv = invByCaseType.get(`${c.id}:前受金`) ?? null
    let wantType: string
    let inv: InvoiceLike | null
    if (bucket) {
      wantType = bucket === '受託' ? '前受金' : '確定請求'
      inv = invByCaseType.get(`${c.id}:${wantType}`) ?? null
    } else if (conf || adv) {
      inv = conf ?? adv
      wantType = inv!.invoice_type
      bucket = c.status === '完了' ? '完了' : c.status === '対応中' ? '対応中' : '受託'
    } else {
      continue
    }

    const feeTotal = c.fee_total ?? ((c.fee_administrative ?? 0) + (c.fee_judicial ?? 0))
    const estimate = wantType === '前受金' ? (c.advance_payment ?? 0) : feeTotal
    const sales = salesByCase.get(c.id) ?? null
    const mgr = managerByCase.get(c.id) ?? null
    const paid = inv
      ? (paidByInvoice.get(inv.id) ?? (inv.status === '入金済' ? inv.amount : 0))
      : 0

    rows.push({
      caseId: c.id,
      caseNumber: c.case_number,
      dealName: c.deal_name,
      contractType: c.contract_type ?? null,
      firmType: (inv?.firm_type as 'gyosei' | 'shiho' | null) ?? firmFromContract(c.contract_type),
      procedureType: c.procedure_type ?? null,
      salesId: sales?.id ?? null,
      salesName: sales?.name ?? null,
      salesAvatarUrl: sales?.avatar_url ?? null,
      managerId: mgr?.id ?? null,
      managerName: mgr?.name ?? null,
      managerAvatarUrl: mgr?.avatar_url ?? null,
      bucket,
      invoiceId: inv?.id ?? null,
      invoiceType: wantType,
      invoiceStatus: inv?.status ?? '未請求',
      needsReview: !!inv?.needs_review,
      billingPattern: c.billing_pattern ?? 'staged',
      amount: inv?.amount ?? estimate,
      paidAmount: paid,
      issuedDate: inv?.issued_date ?? null,
      orderRoute: c.order_route ?? null,
      orderRouteDetail: c.order_route_detail ?? null,
      advance: inv ? (inv.invoice_type === '前受金' ? inv.amount : (inv.advance_deduction ?? 0)) : 0,
      expenses: inv?.expenses_amount ?? 0,
      receiptIssuedDate: inv?.receipt_issued_date ?? null,
      notes: inv?.notes ?? null,
    })
  }
  return rows
}
