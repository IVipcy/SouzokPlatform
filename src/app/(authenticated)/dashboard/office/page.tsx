import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import OfficeManagerDashboard, { type OfficeRow } from '@/components/features/dashboard/OfficeManagerDashboard'

// 事務管理担当ダッシュボード：作業着手待ち案件一覧（status=作業着手準備）。
// レコード＝作業着手準備になった案件。着手OK（全部済）で対応中へ→案件詳細でタスク生成。
export default async function OfficeDashboardPage() {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  const { data: casesData } = await supabase
    .from('cases')
    .select('id, case_number, deal_name, status, filing_status, order_sheet_completed_at, updated_at, order_received_date, case_members(role, members(name, team_id))')
    .eq('status', '作業着手準備')
    .order('order_received_date', { ascending: true })

  const cases = (casesData ?? []) as unknown as Array<{
    id: string; case_number: string; deal_name: string; filing_status: string | null
    order_sheet_completed_at: string | null; updated_at: string | null; order_received_date: string | null
    case_members?: { role: string; members: { name: string; team_id: string | null } | null }[] | null
  }>
  const caseIds = cases.map(c => c.id)

  // system判定：契約書類受領（契約区分の全書類が受領済＝arrival_dateあり）／前受金入金（前受金invoiceが入金済）
  const [docsRes, invRes, teamsRes] = await Promise.all([
    caseIds.length ? supabase.from('contract_documents').select('case_id, category, arrival_date').in('case_id', caseIds) : Promise.resolve({ data: [] }),
    caseIds.length ? supabase.from('invoices').select('case_id, invoice_type, status').in('case_id', caseIds) : Promise.resolve({ data: [] }),
    supabase.from('teams').select('id, name'),
  ])
  const docs = (docsRes.data ?? []) as Array<{ case_id: string; category: string | null; arrival_date: string | null }>
  const invs = (invRes.data ?? []) as Array<{ case_id: string; invoice_type: string; status: string }>
  const teamName = new Map(((teamsRes.data ?? []) as Array<{ id: string; name: string }>).map(t => [t.id, t.name]))

  const rows: OfficeRow[] = cases.map(c => {
    const sales = c.case_members?.find(m => m.role === 'sales')?.members ?? null
    const manager = c.case_members?.find(m => m.role === 'manager')?.members ?? null
    const contractDocs = docs.filter(d => d.case_id === c.id && d.category === '契約')
    const contractReceived = contractDocs.length > 0 && contractDocs.every(d => !!d.arrival_date)
    const advancePaid = invs.some(i => i.case_id === c.id && i.invoice_type === '前受金' && i.status === '入金済')
    return {
      caseId: c.id,
      caseNumber: c.case_number,
      dealName: c.deal_name,
      osUpdatedAt: (c.order_sheet_completed_at ?? c.updated_at ?? '')?.slice(0, 10) || null,
      teamName: sales?.team_id ? teamName.get(sales.team_id) ?? null : null,
      salesName: sales?.name ?? null,
      managerName: manager?.name ?? null,
      contractReceived,
      advancePaid,
      filingStatus: c.filing_status === '済' ? '済' : '未',
    }
  })

  return <OfficeManagerDashboard rows={rows} currentMemberId={currentUser?.memberId ?? null} currentMemberName={currentUser?.memberName ?? null} />
}
