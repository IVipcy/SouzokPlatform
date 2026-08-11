import { createClient } from '@/lib/supabase/server'
import ExpenseReportClient, { type ExpenseReportRow } from '@/components/features/billing/ExpenseReportClient'
import { fetchCaseExpenses } from '@/lib/caseExpenses'

// 経費表：お客様に請求しない自社負担の費用を案件別に並べる。
// いまの発生源は、戸籍・不動産資料の請求区分が「誤請求」の行（src/lib/caseExpenses.ts）。
export default async function ExpenseReportPage() {
  const supabase = await createClient()

  const { data: casesRaw } = await supabase
    .from('cases')
    .select('id, case_number, deal_name, deceased_name, clients(name), case_members(role, members(name))')
    .eq('intake_draft', false)

  type CaseLite = {
    id: string; case_number: string; deal_name: string; deceased_name: string | null
    clients: { name: string } | { name: string }[] | null
    case_members: Array<{ role: string; members: { name: string } | null }> | null
  }
  const cases = (casesRaw ?? []) as unknown as CaseLite[]
  const expenses = await fetchCaseExpenses(supabase, cases.map(c => c.id))

  const byCase = new Map(cases.map(c => [c.id, c]))
  const rows: ExpenseReportRow[] = expenses.map(e => {
    const c = byCase.get(e.caseId)
    const client = Array.isArray(c?.clients) ? c?.clients[0] : c?.clients
    const members = c?.case_members ?? []
    return {
      id: e.id,
      caseId: e.caseId,
      caseNumber: c?.case_number ?? '',
      clientName: client?.name ?? c?.deceased_name ?? c?.deal_name ?? '',
      kind: e.kind,
      label: e.label,
      date: e.date,
      amount: e.amount,
      salesName: members.find(m => m.role === 'sales')?.members?.name ?? '',
      managerName: members.find(m => m.role === 'manager')?.members?.name ?? '',
    }
  })

  return <ExpenseReportClient rows={rows} />
}
