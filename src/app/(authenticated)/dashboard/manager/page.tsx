import Link from 'next/link'
import { Compass } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import ProgressKpis from '@/components/features/dashboard/ProgressKpis'
import ProgressCaseTable, { type ProgressCaseRow } from '@/components/features/dashboard/ProgressCaseTable'
import MonthSelector from '@/components/features/dashboard/MonthSelector'
import ProgressViewTabs, { type ProgressView } from '@/components/features/dashboard/ProgressViewTabs'
import BillingStatusView, { type BillingViewRow, type BillingViewSummary } from '@/components/features/dashboard/BillingStatusView'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import type { TaskRow } from '@/types'
import { CASE_STATUSES } from '@/lib/constants'
import {
  computeProgressKpis,
  computeCaseFlag,
  monthRange,
  type CaseFlag,
  type DashCase,
  type DashTask,
} from '@/lib/dashboardMetrics'

/**
 * 管理担当 全体ダッシュボード
 * チーム別進捗管理ボードと同じ見た目で、全チーム（全管理担当）の案件を合算して表示する。
 */
type CaseFull = DashCase & { case_number: string; deal_name: string; client_id: string | null; order_route: string | null; order_route_detail: string | null }
type MemberRow = { id: string; name: string; avatar_color: string; avatar_url: string | null; primary_role: string | null; team_id: string | null }
type InvoiceFull = { id: string; case_id: string; invoice_number: string | null; amount: number; status: string; issued_date: string | null; invoice_type: string; expenses_amount: number | null; advance_deduction: number | null; notes: string | null; receipt_issued_date: string | null }

const FLAG_RANK: Record<CaseFlag, number> = { purple: 0, red: 1, yellow: 2, blue: 3 }
const ACTIVE = new Set(['受注', '対応中', '保留・長期'])
const INVOICE_PSTATUS = ['未請求', '作成済', '入金待ち', '入金済'] as const

type Props = { searchParams: Promise<{ month?: string; view?: string; member?: string; status?: string; pstatus?: string }> }

export default async function ManagerOverviewPage({ searchParams }: Props) {
  const { month, view: viewParam, status: statusParam, pstatus: pstatusParam } = await searchParams
  const supabase = await createClient()
  const today = new Date()
  const ymToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const selectedMonth: string | 'all' = month === 'all' ? 'all' : (month || ymToday)
  const selectedMonthForKpis: string | null = selectedMonth === 'all' ? null : selectedMonth
  const currentView: ProgressView = viewParam === 'billing' ? 'billing' : 'progress'
  const statusFilter = statusParam && CASE_STATUSES.some(s => s.key === statusParam) ? statusParam : null
  const pstatusFilter = pstatusParam && (INVOICE_PSTATUS as readonly string[]).includes(pstatusParam) ? pstatusParam : null

  const [{ data: membersRaw }, { data: caseMembersRaw }, { data: clientsRaw }] = await Promise.all([
    supabase.from('members').select('id,name,avatar_color,avatar_url,primary_role,team_id').eq('is_active', true),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase.from('clients').select('id,name'),
  ])

  const members = (membersRaw ?? []) as MemberRow[]
  const caseMembers = (caseMembersRaw ?? []) as Array<{ case_id: string; member_id: string; role: string }>
  const clients = (clientsRaw ?? []) as Array<{ id: string; name: string }>
  const memberById = new Map(members.map(m => [m.id, m]))
  const clientById = new Map(clients.map(c => [c.id, c.name]))

  // 全管理担当（メンバー切替は廃止。常に全体スコープ）
  const managers = members.filter(m => m.primary_role === 'manager' || m.primary_role === 'sub_manager')
  const scopeMemberIds = new Set(managers.map(m => m.id))

  // スコープ案件（管理担当として紐づく案件）
  const scopeCaseIds = new Set<string>()
  for (const cm of caseMembers) {
    if (cm.role === 'manager' && scopeMemberIds.has(cm.member_id)) scopeCaseIds.add(cm.case_id)
  }

  const basePath = '/dashboard/manager'
  const buildHref = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = {
      month: selectedMonth !== ymToday ? selectedMonth : undefined,
      view: currentView !== 'progress' ? currentView : undefined,
      status: statusFilter ?? undefined,
      pstatus: pstatusFilter ?? undefined,
      ...over,
    }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    const qs = p.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  const renderHeader = (kpis: Parameters<typeof ProgressKpis>[0]['metrics']) => (
    <>
      <PageHeader
        eyebrow="Manager · Overview"
        title="管理担当 全体ダッシュボード"
        icon={Compass}
        description="全チーム（全管理担当）を合算した進捗管理ボード"
      />
      <ProgressKpis scopeLabel="管理担当 全体" metrics={kpis} />
      <ProgressViewTabs basePath={basePath} currentView={currentView} extraParams={{ month: selectedMonth !== ymToday ? selectedMonth : undefined, status: statusFilter ?? undefined }} />
      <MonthSelector basePath={basePath} selectedMonth={selectedMonth} today={today} extraParams={{ view: currentView !== 'progress' ? currentView : undefined, status: statusFilter ?? undefined, pstatus: pstatusFilter ?? undefined }} />
    </>
  )

  const emptyKpis = { totalAssigned: 0, blueCount: 0, yellowCount: 0, redCount: 0, purpleCount: 0, monthCompletionTarget: 0, monthCompleted: 0, cycleMonths: null, invoiceCount: 0 }
  if (scopeCaseIds.size === 0) {
    return (
      <div>
        {renderHeader(emptyKpis)}
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">該当する案件がありません</div>
      </div>
    )
  }

  const currentUser = await getCurrentUser()
  const currentMemberId = currentUser?.memberId ?? null

  const caseIdArray = Array.from(scopeCaseIds)
  const [{ data: casesRaw }, { data: tasksRaw }, { data: invoicesRaw }] = await Promise.all([
    supabase.from('cases').select('id,case_number,deal_name,status,order_received_date,completion_date,expected_completion_date,fee_total,total_revenue_estimate,client_id,has_complaint,last_opened_at,created_at,procedure_type,order_route,order_route_detail').in('id', caseIdArray),
    supabase.from('tasks').select('case_id,status,due_date').in('case_id', caseIdArray),
    supabase.from('invoices').select('id,case_id,invoice_number,amount,status,issued_date,invoice_type,expenses_amount,advance_deduction,notes,receipt_issued_date').in('case_id', caseIdArray),
  ])
  const cases = (casesRaw ?? []) as CaseFull[]
  const tasks = (tasksRaw ?? []) as DashTask[]
  const invoices = (invoicesRaw ?? []) as InvoiceFull[]

  // チームタスク欄用: スコープ案件の未完了システムタスク（要対応のみ表示）
  let systemTasksRaw: unknown[] | null = null
  try {
    const { data } = await supabase
      .from('tasks')
      .select('*, cases(id, case_number, deal_name, status, meeting_executed_date, order_received_date, client_response_due_date, procedure_type), started_by_member:members!tasks_started_by_fkey(*)')
      .eq('task_kind', 'system')
      .neq('status', '完了')
      .in('case_id', caseIdArray)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(100)
    systemTasksRaw = data
  } catch { /* migration 046 未適用 → 空扱い */ }

  // 要対応（期限超過 or あと2日以内）に絞る
  const taskHorizon = new Date(today)
  taskHorizon.setDate(taskHorizon.getDate() + 2)
  const taskHorizonStr = todayJstYmd(taskHorizon)
  const urgentTeamTasks = ((systemTasksRaw ?? []) as TaskRow[])
    .filter(t => !!t.due_date && t.due_date <= taskHorizonStr)

  const kpis = computeProgressKpis(cases, tasks, selectedMonthForKpis, today, invoices)

  // 案件→管理担当 / 受注担当
  const managerByCase = new Map<string, MemberRow>()
  const salesByCase = new Map<string, MemberRow>()
  for (const cm of caseMembers) {
    if (!scopeCaseIds.has(cm.case_id)) continue
    const m = memberById.get(cm.member_id)
    if (!m) continue
    if (cm.role === 'manager' && !managerByCase.has(cm.case_id)) managerByCase.set(cm.case_id, m)
    if (cm.role === 'sales' && !salesByCase.has(cm.case_id)) salesByCase.set(cm.case_id, m)
  }

  const tasksByCase = new Map<string, DashTask[]>()
  for (const t of tasks) {
    if (!tasksByCase.has(t.case_id)) tasksByCase.set(t.case_id, [])
    tasksByCase.get(t.case_id)!.push(t)
  }

  const inSelectedMonth = (d: string | null | undefined): boolean => {
    if (!d) return false
    if (selectedMonth === 'all') return true
    return d.startsWith(selectedMonth)
  }

  const baseCases = statusFilter ? cases.filter(c => c.status === statusFilter) : cases.filter(c => ACTIVE.has(c.status))
  const allRows: ProgressCaseRow[] = baseCases.map(c => {
    const mgr = managerByCase.get(c.id) ?? null
    const sales = salesByCase.get(c.id) ?? null
    const flag = (c.has_complaint || c.expected_completion_date) ? computeCaseFlag(c, tasksByCase.get(c.id) ?? [], today) : null
    return {
      id: c.id,
      caseNumber: c.case_number,
      dealName: c.deal_name,
      salesId: sales?.id ?? null,
      salesName: sales?.name ?? null,
      salesAvatarUrl: sales?.avatar_url ?? null,
      managerId: mgr?.id ?? null,
      managerName: mgr?.name ?? null,
      managerAvatarColor: mgr?.avatar_color ?? null,
      managerAvatarUrl: mgr?.avatar_url ?? null,
      managerPrimaryRole: (mgr?.primary_role ?? 'manager') as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | null,
      procedureType: c.procedure_type ?? null,
      expectedCompletionDate: c.expected_completion_date ?? null,
      clientName: c.client_id ? clientById.get(c.client_id) ?? null : null,
      flag,
    }
  })
  const rowsWithFlag = allRows
    .filter(r => r.flag !== null && (statusFilter !== null || r.flag === 'purple' || inSelectedMonth(r.expectedCompletionDate)))
    .sort((a, b) => {
      const fa = FLAG_RANK[a.flag!]; const fb = FLAG_RANK[b.flag!]
      if (fa !== fb) return fa - fb
      return (a.expectedCompletionDate ?? '9999-12-31').localeCompare(b.expectedCompletionDate ?? '9999-12-31')
    })
  const rowsUnset = allRows.filter(r => r.flag === null)

  // 請求状況ビュー
  const billingRange = selectedMonth === 'all' ? null : monthRange(selectedMonth)
  const monthlyInvoices = invoices.filter(inv => {
    if (inv.status === '未請求') return true
    if (!inv.issued_date) return false
    if (!billingRange) return true
    return inv.issued_date >= billingRange.start && inv.issued_date <= billingRange.end
  })
  const paymentMap = new Map<string, number>()
  if (monthlyInvoices.length > 0) {
    const { data: paymentsRaw } = await supabase.from('payments').select('invoice_id,amount').in('invoice_id', monthlyInvoices.map(i => i.id))
    for (const p of ((paymentsRaw ?? []) as Array<{ invoice_id: string; amount: number }>)) {
      paymentMap.set(p.invoice_id, (paymentMap.get(p.invoice_id) ?? 0) + p.amount)
    }
  }
  const billingSummary: BillingViewSummary = { invoiceTotal: 0, invoiceTotalCount: 0, unbilled: 0, awaitingPayment: 0, paid: 0, partialPaid: 0 }
  for (const inv of monthlyInvoices) {
    const paid = paymentMap.get(inv.id) ?? 0
    if (inv.status === '未請求') { billingSummary.unbilled++; continue }
    billingSummary.invoiceTotal += inv.amount
    billingSummary.invoiceTotalCount++
    if (inv.status === '入金済' || paid >= inv.amount) billingSummary.paid++
    else if (inv.status === '入金待ち' || paid > 0) billingSummary.awaitingPayment++
    else if (inv.status === '作成済') billingSummary.partialPaid++
    else billingSummary.awaitingPayment++
  }
  const allBillingRows: BillingViewRow[] = monthlyInvoices
    .sort((a, b) => (b.issued_date ?? '').localeCompare(a.issued_date ?? ''))
    .map(inv => {
      const c = cases.find(c => c.id === inv.case_id)
      const mgr = managerByCase.get(inv.case_id) ?? null
      return {
        invoiceId: inv.id,
        caseId: inv.case_id,
        caseNumber: c?.case_number ?? '-',
        dealName: c?.deal_name ?? '-',
        managerName: mgr?.name ?? null,
        managerId: mgr?.id ?? null,
        managerAvatarColor: mgr?.avatar_color ?? null,
        managerAvatarUrl: mgr?.avatar_url ?? null,
        managerPrimaryRole: (mgr?.primary_role ?? 'manager') as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | null,
        status: inv.status,
        amount: inv.amount,
        issuedDate: inv.issued_date,
        hasPdf: inv.status !== '未請求',
        orderRoute: c?.order_route ?? null,
        orderRouteDetail: c?.order_route_detail ?? null,
        advance: inv.invoice_type === '前受金' ? inv.amount : (inv.advance_deduction ?? 0),
        expenses: inv.expenses_amount ?? 0,
        receiptIssuedDate: inv.receipt_issued_date ?? null,
        notes: inv.notes ?? null,
      }
    })
  const billingRows = pstatusFilter ? allBillingRows.filter(r => r.status === pstatusFilter) : allBillingRows

  return (
    <div>
      {renderHeader(kpis)}

      {currentView === 'progress' ? (
        <>
          {/* 案件ステータスフィルタ */}
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            <span className="text-[12px] font-semibold text-gray-500 mr-1">ステータス</span>
            <Link href={buildHref({ status: undefined })} className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${statusFilter === null ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>すべて</Link>
            {CASE_STATUSES.map(s => {
              const count = cases.filter(c => c.status === s.key).length
              return (
                <Link key={s.key} href={buildHref({ status: s.key })} className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${statusFilter === s.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {s.label}{count > 0 && <span className={`ml-1 text-[10px] font-mono ${statusFilter === s.key ? 'opacity-80' : 'opacity-50'}`}>{count}</span>}
                </Link>
              )
            })}
          </div>
          <ProgressCaseTable rowsWithFlag={rowsWithFlag} rowsUnset={rowsUnset} showRoleBadge={false} />
          {/* チームタスク欄（要対応のシステムタスク。担当区分ラベルで誘導・引き取りは全員可） */}
          {urgentTeamTasks.length > 0 && (
            <div className="mt-4">
              <SystemTaskList
                tasks={urgentTeamTasks}
                title="チームタスク（要対応）"
                emptyText="要対応のチームタスクはありません"
                showCase={true}
                includeCompleted={false}
                showAssignRole={true}
                teamMode={true}
                currentMemberId={currentMemberId ?? undefined}
                seeAllHref="/tasks?kind=system"
              />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            <span className="text-[12px] font-semibold text-gray-500 mr-1">入金ステータス</span>
            <Link href={buildHref({ pstatus: undefined })} className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${pstatusFilter === null ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>すべて</Link>
            {INVOICE_PSTATUS.map(st => {
              const count = allBillingRows.filter(r => r.status === st).length
              return (
                <Link key={st} href={buildHref({ pstatus: st })} className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${pstatusFilter === st ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {st}{count > 0 && <span className={`ml-1 text-[10px] font-mono ${pstatusFilter === st ? 'opacity-80' : 'opacity-50'}`}>{count}</span>}
                </Link>
              )
            })}
          </div>
          <BillingStatusView summary={billingSummary} rows={billingRows} />
        </>
      )}
    </div>
  )
}
