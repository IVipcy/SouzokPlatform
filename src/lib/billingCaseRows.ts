// 請求タブ（管理担当ダッシュボード／マイページ）の案件ベース行ビルダー。
// 当月の「受託(受注) / 当月完了予定の対応中 / 当月業務完了の完了」案件を抽出し、
// 区分に応じた請求書（受託=前受金, 対応中/完了=確定請求）の状況を1行にまとめる。

export type BillingBucket = '受託' | '対応中' | '完了'

export type BillingCaseRow = {
  caseId: string
  caseNumber: string
  dealName: string
  contractType: string | null      // 行/司/連名 の色判定に使用
  procedureType: string[] | null   // 受注内容（手続区分）
  salesId: string | null
  salesName: string | null
  salesAvatarUrl: string | null
  managerId: string | null
  managerName: string | null
  managerAvatarUrl: string | null
  bucket: BillingBucket
  invoiceId: string | null
  invoiceStatus: string            // 請求(入金)ステータス。未発行は '未請求'
  amount: number
  issuedDate: string | null
}

type CaseLike = {
  id: string
  case_number: string
  deal_name: string
  status: string
  contract_type?: string | null
  procedure_type?: string[] | null
  expected_completion_date?: string | null
  completion_date?: string | null
  fee_total?: number | null
  fee_administrative?: number | null
  fee_judicial?: number | null
  advance_payment?: number | null
}
type CaseMemberLike = { case_id: string; member_id: string; role: string }
type MemberLike = { id: string; name: string; avatar_url?: string | null }
type InvoiceLike = {
  id: string
  case_id: string
  invoice_type: string
  status: string
  amount: number
  issued_date?: string | null
  created_at?: string | null
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
): BillingCaseRow[] {
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

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
    if (c.status === '受注') bucket = '受託'
    else if (c.status === '対応中' && c.expected_completion_date?.startsWith(ym)) bucket = '対応中'
    else if (c.status === '完了' && c.completion_date?.startsWith(ym)) bucket = '完了'
    if (!bucket) continue

    const wantType = bucket === '受託' ? '前受金' : '確定請求'
    const inv = invByCaseType.get(`${c.id}:${wantType}`) ?? null
    const feeTotal = c.fee_total ?? ((c.fee_administrative ?? 0) + (c.fee_judicial ?? 0))
    const estimate = bucket === '受託' ? (c.advance_payment ?? 0) : feeTotal
    const sales = salesByCase.get(c.id) ?? null
    const mgr = managerByCase.get(c.id) ?? null

    rows.push({
      caseId: c.id,
      caseNumber: c.case_number,
      dealName: c.deal_name,
      contractType: c.contract_type ?? null,
      procedureType: c.procedure_type ?? null,
      salesId: sales?.id ?? null,
      salesName: sales?.name ?? null,
      salesAvatarUrl: sales?.avatar_url ?? null,
      managerId: mgr?.id ?? null,
      managerName: mgr?.name ?? null,
      managerAvatarUrl: mgr?.avatar_url ?? null,
      bucket,
      invoiceId: inv?.id ?? null,
      invoiceStatus: inv?.status ?? '未請求',
      amount: inv?.amount ?? estimate,
      issuedDate: inv?.issued_date ?? null,
    })
  }
  return rows
}
