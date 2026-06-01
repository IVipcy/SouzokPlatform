import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserCircle, Target, ClipboardList, ListChecks, MessageSquare, Sparkles, ClipboardCheck } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { CASE_STATUSES } from '@/lib/constants'
import MyPageTargetInput from '@/components/features/my/MyPageTargetInput'
import MyPageCasesTab from '@/components/features/my/MyPageCasesTab'
import ConsultationCasesTable, { type ConsultCase } from '@/components/features/my/ConsultationCasesTable'
import ProgressReportManagerTab, { type ManagerProgressRow } from '@/components/features/my/ProgressReportManagerTab'
import ProgressReviewTab, { type ReviewProgressRow } from '@/components/features/my/ProgressReviewTab'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
import ProgressKpis from '@/components/features/dashboard/ProgressKpis'
import {
  computeSalesMetrics,
  computeProgressKpis,
  fiscalYearMonthsToDate,
  type DashCase,
  type DashTask,
  type DashStatusChange,
  type DashProperty,
  type SalesMetricsBundle,
} from '@/lib/dashboardMetrics'
import type { TaskRow, ProgressReportRow } from '@/types'

/**
 * マイページ — 認証ユーザー本人のみ閲覧可能。
 *
 * 受注担当 (sales):
 *   - 当月面談（相談案件一覧）: 面談設定済/検討中/受注/失注/保留・長期 の案件。期間切替・KPIサマリ付き
 *   - 管理案件一覧            : 受注後の進捗（対応中/完了）。進捗管理ダッシュボードと同じ見た目
 *   - 個別管理案件            : 「紹介のみ」ステータスの案件
 *   - タスク                  : 自分宛のタスク
 * 管理担当 (manager) / その他: 管理案件一覧 + タスク
 */

type SearchParams = Promise<{ tab?: string; period?: string }>
type TabKey = 'meetings' | 'cases' | 'referrals' | 'progress' | 'reviews' | 'tasks'

const CONSULT_STATUSES = new Set(['面談設定済', '検討中', '受注', '失注', '保留・長期'])
const MGMT_ACTIVE_STATUSES = new Set(['受注', '対応中', '保留・長期'])
const pad = (n: number) => String(n).padStart(2, '0')

// 相談案件の累計KPIを各月の集計から合成する（件数は合算、平均単価は件数で加重平均）
function cumulativeSalesMetrics(perMonth: SalesMetricsBundle[]): Pick<SalesMetricsBundle, 'meetingsCount' | 'newOrdersCount' | 'conversionRate' | 'avgOrderUnit' | 'propertyAppraisalCount'> {
  const meetingsCount = perMonth.reduce((s, m) => s + m.meetingsCount, 0)
  const newOrdersCount = perMonth.reduce((s, m) => s + m.newOrdersCount, 0)
  const unitWeighted = perMonth.reduce((s, m) => s + (m.avgOrderUnit ?? 0) * m.newOrdersCount, 0)
  return {
    meetingsCount,
    newOrdersCount,
    conversionRate: meetingsCount > 0 ? newOrdersCount / meetingsCount : null,
    avgOrderUnit: newOrdersCount > 0 ? unitWeighted / newOrdersCount : null,
    propertyAppraisalCount: perMonth.reduce((s, m) => s + m.propertyAppraisalCount, 0),
  }
}

export default async function MyPage({ searchParams }: { searchParams: SearchParams }) {
  const { tab, period } = await searchParams

  const user = await getCurrentUser()
  if (!user?.memberId) {
    redirect('/login')
  }

  const memberId = user.memberId
  const role = user.primaryRole
  const isSales = role === 'sales'
  const isManager = role === 'manager' || role === 'sub_manager'

  const supabase = await createClient()
  const today = new Date()
  const ymToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`
  const todayStr = `${ymToday}-${pad(today.getDate())}`

  // 相談案件の期間切替（当月／当期の過去月／当期累計）。デフォルトは当月
  const fiscalMonths = fiscalYearMonthsToDate(today) // [当月, ...過去] の降順
  const selectedPeriod: string = period === 'all' || (period && fiscalMonths.includes(period)) ? period! : ymToday

  // === 1st fetch ===
  const [{ data: myCaseRows }, { data: targetRow }, { data: allCaseMembersRaw }, { data: allMembersRaw }, { data: clientsRaw }] = await Promise.all([
    supabase.from('case_members').select('case_id, role, cases(*)').eq('member_id', memberId),
    supabase.from('member_targets').select('new_orders_count, invoice_count').eq('member_id', memberId).eq('ym', ymToday).maybeSingle(),
    supabase.from('case_members').select('case_id, member_id, role'),
    supabase.from('members').select('id, name').eq('is_active', true),
    supabase.from('clients').select('id, name'),
  ])

  type MyCase = {
    id: string
    case_number: string
    deal_name: string
    status: string
    expected_completion_date: string | null
    completion_date: string | null
    order_received_date: string | null
    meeting_date: string | null
    meeting_executed_date: string | null
    client_response_due_date: string | null
    order_route_detail: string | null
    procedure_type: string[] | null
    fee_administrative: number | null
    fee_judicial: number | null
    fee_total: number | null
    total_revenue_estimate: number | null
    tax_filing_required: string | null
    has_complaint: boolean | null
    last_opened_at: string | null
    created_at: string | null
    client_id: string | null
  }

  const myCaseRowsArr = (myCaseRows ?? []) as Array<{ case_id: string; role: string; cases: unknown }>
  const myCaseIds = new Set<string>(myCaseRowsArr.map(r => r.case_id))
  const salesCaseIds = new Set<string>(myCaseRowsArr.filter(r => r.role === 'sales').map(r => r.case_id))
  const managerCaseIds = new Set<string>(myCaseRowsArr.filter(r => r.role === 'manager' || r.role === 'sub_manager').map(r => r.case_id))

  // case_id 重複（複数ロール紐付け）を除いた案件配列
  const seenCaseId = new Set<string>()
  const myCases: MyCase[] = []
  for (const r of myCaseRowsArr) {
    const c = r.cases as MyCase | null
    if (!c || seenCaseId.has(c.id)) continue
    seenCaseId.add(c.id)
    myCases.push(c)
  }

  // 受注担当・管理担当・依頼者名を解決
  const memberById = new Map<string, string>(((allMembersRaw ?? []) as Array<{ id: string; name: string }>).map(m => [m.id, m.name]))
  const clientById = new Map<string, string>(((clientsRaw ?? []) as Array<{ id: string; name: string }>).map(c => [c.id, c.name]))
  const allCaseMembers = (allCaseMembersRaw ?? []) as Array<{ case_id: string; member_id: string; role: string }>
  const salesByCase = new Map<string, string>()
  const managerByCase = new Map<string, string>()
  const salesMemberIdByCase = new Map<string, string>()
  for (const cm of allCaseMembers) {
    if (!myCaseIds.has(cm.case_id)) continue
    const name = memberById.get(cm.member_id)
    if (!name) continue
    if (cm.role === 'sales' && !salesByCase.has(cm.case_id)) {
      salesByCase.set(cm.case_id, name)
      salesMemberIdByCase.set(cm.case_id, cm.member_id)
    }
    if (cm.role === 'manager' && !managerByCase.has(cm.case_id)) managerByCase.set(cm.case_id, name)
  }

  // === 2nd fetch（KPI算出に必要なデータ。マイグレーション未適用環境でも落ちないよう try で保護） ===
  const caseIdArray = Array.from(myCaseIds)
  const salesCaseIdArray = Array.from(salesCaseIds)
  const managerCaseIdArray = Array.from(managerCaseIds)
  const earliestYm = fiscalMonths[fiscalMonths.length - 1] ?? ymToday
  const fiscalStart = `${earliestYm}-01T00:00:00`
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const nextMonthStart = `${nextMonthDate.getFullYear()}-${pad(nextMonthDate.getMonth() + 1)}-01T00:00:00`

  let boardTasks: DashTask[] = []
  let invoices: Array<{ case_id: string; issued_date: string | null }> = []
  let salesChanges: DashStatusChange[] = []
  let salesProps: DashProperty[] = []
  let systemTaskRows: TaskRow[] = []
  let salesTaskRows: TaskRow[] = []
  let managerReports: ProgressReportRow[] = []
  let reviewReportsRaw: Array<ProgressReportRow & { cases: { case_number: string; deal_name: string } | null }> = []
  let wonChanges: Array<{ entity_id: string; created_at: string }> = []
  let assigneeChanges: Array<{ entity_id: string; metadata: { op?: string; role?: string } | null }> = []

  if (caseIdArray.length > 0) {
    try {
      const [tasksRes, invoicesRes, sysRes, salesTaskRes, changesRes, propsRes, mgrReportsRes, reviewReportsRes, wonRes, assigneeRes] = await Promise.all([
        supabase.from('tasks').select('case_id,status,due_date').in('case_id', caseIdArray),
        supabase.from('invoices').select('case_id,issued_date').in('case_id', caseIdArray),
        supabase.from('tasks').select('*, cases(id, case_number, deal_name, status)').in('case_id', caseIdArray).eq('task_kind', 'system').neq('status', '完了').order('due_date', { ascending: true, nullsFirst: false }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('tasks').select('*, cases(id, case_number, deal_name, status)').in('case_id', salesCaseIdArray).eq('work_role', 'sales').neq('status', '完了').order('due_date', { ascending: true, nullsFirst: false })
          : Promise.resolve({ data: [] }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('activity_log').select('entity_id,old_value,new_value,created_at').eq('entity_type', 'case').eq('action', 'status_change').in('entity_id', salesCaseIdArray).gte('created_at', fiscalStart).lt('created_at', nextMonthStart)
          : Promise.resolve({ data: [] }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('real_estate_properties').select('case_id,appraisal_status').in('case_id', salesCaseIdArray)
          : Promise.resolve({ data: [] }),
        managerCaseIdArray.length > 0
          ? supabase.from('progress_reports').select('*').in('case_id', managerCaseIdArray)
          : Promise.resolve({ data: [] }),
        supabase.from('progress_reports').select('*, cases(case_number, deal_name)').eq('confirmer_id', memberId).order('requested_date', { ascending: false }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('activity_log').select('entity_id,created_at').eq('entity_type', 'case').eq('action', 'status_change').eq('new_value', '受注').in('entity_id', salesCaseIdArray)
          : Promise.resolve({ data: [] }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('activity_log').select('entity_id,metadata').eq('entity_type', 'case').eq('action', 'assignee_change').in('entity_id', salesCaseIdArray)
          : Promise.resolve({ data: [] }),
      ])
      boardTasks = (tasksRes.data ?? []) as DashTask[]
      invoices = (invoicesRes.data ?? []) as Array<{ case_id: string; issued_date: string | null }>
      systemTaskRows = (sysRes.data ?? []) as TaskRow[]
      salesTaskRows = (salesTaskRes.data ?? []) as TaskRow[]
      salesChanges = (changesRes.data ?? []) as DashStatusChange[]
      salesProps = (propsRes.data ?? []) as DashProperty[]
      managerReports = (mgrReportsRes.data ?? []) as ProgressReportRow[]
      reviewReportsRaw = (reviewReportsRes.data ?? []) as typeof reviewReportsRaw
      wonChanges = (wonRes.data ?? []) as Array<{ entity_id: string; created_at: string }>
      assigneeChanges = (assigneeRes.data ?? []) as Array<{ entity_id: string; metadata: { op?: string; role?: string } | null }>
    } catch { /* migration 未適用環境では空扱い */ }
  }

  // === 管理案件一覧（進捗管理ボード）用 ===
  const boardDashCases: DashCase[] = myCases.map(c => ({
    id: c.id,
    status: c.status,
    order_received_date: c.order_received_date,
    completion_date: c.completion_date,
    expected_completion_date: c.expected_completion_date,
    fee_total: c.fee_total,
    total_revenue_estimate: c.total_revenue_estimate,
    has_complaint: c.has_complaint,
    last_opened_at: c.last_opened_at,
    created_at: c.created_at,
  }))
  const boardKpis = computeProgressKpis(boardDashCases, boardTasks, ymToday, today, invoices)

  // 管理担当向けアラート用の集合
  // タスク期限超過: 未完了タスクで期限切れがある案件
  const overdueCaseIds = new Set<string>()
  for (const t of boardTasks) {
    if (t.due_date && t.due_date < todayStr && t.status !== '完了' && t.status !== 'キャンセル') overdueCaseIds.add(t.case_id)
  }
  // 週次報告あり: 直近7日以内に確認済の進捗報告がある案件
  const reportConfirmedRecent = new Set<string>()
  for (const pr of managerReports) {
    if (pr.status === '確認済' && pr.confirmed_date) {
      const d = Math.floor((today.getTime() - new Date(pr.confirmed_date).getTime()) / 86_400_000)
      if (d <= 7) reportConfirmedRecent.add(pr.case_id)
    }
  }

  const myCasesEnriched = myCases.map(c => {
    // アラートは管理担当のマイページ（自分が管理担当の案件）にのみ表示
    const isMgrCase = isManager && managerCaseIds.has(c.id) && MGMT_ACTIVE_STATUSES.has(c.status)
    return {
      id: c.id,
      case_number: c.case_number,
      deal_name: c.deal_name,
      status: c.status,
      deceased_name: null,
      expected_completion_date: c.expected_completion_date,
      completion_date: c.completion_date,
      has_complaint: c.has_complaint,
      last_opened_at: c.last_opened_at,
      created_at: c.created_at,
      client_name: c.client_id ? clientById.get(c.client_id) ?? null : null,
      sales_name: salesByCase.get(c.id) ?? null,
      manager_name: managerByCase.get(c.id) ?? null,
      weeklyReportMissing: isMgrCase && !reportConfirmedRecent.has(c.id),
      taskOverdue: isMgrCase && overdueCaseIds.has(c.id),
    }
  })

  // === 相談案件一覧（受注担当のみ） ===
  const salesDashCases: DashCase[] = myCases
    .filter(c => salesCaseIds.has(c.id))
    .map(c => ({
      id: c.id,
      status: c.status,
      order_received_date: c.order_received_date,
      completion_date: c.completion_date,
      expected_completion_date: c.expected_completion_date,
      fee_total: c.fee_total,
      total_revenue_estimate: c.total_revenue_estimate,
      tax_filing_required: c.tax_filing_required,
    }))

  const salesMetrics = selectedPeriod === 'all'
    ? cumulativeSalesMetrics(fiscalMonths.map(m => computeSalesMetrics(salesDashCases, salesChanges, m, salesProps)))
    : computeSalesMetrics(salesDashCases, salesChanges, selectedPeriod, salesProps)

  let consultCasesArr = myCases.filter(c => salesCaseIds.has(c.id) && CONSULT_STATUSES.has(c.status))
  if (selectedPeriod !== 'all') {
    consultCasesArr = consultCasesArr.filter(c =>
      c.meeting_date?.startsWith(selectedPeriod) || c.meeting_executed_date?.startsWith(selectedPeriod),
    )
  }
  // 受注遷移時刻（案件ごと最新）。新規受注の担当アサイン期限・NEWマーク判定に使う
  const wonAtByCase = new Map<string, string>()
  for (const w of wonChanges) {
    const cur = wonAtByCase.get(w.entity_id)
    if (!cur || w.created_at > cur) wonAtByCase.set(w.entity_id, w.created_at)
  }
  // 担当(manager/sales)の削除履歴がある案件＝担当者変更が発生した案件
  const reassignedCaseIds = new Set<string>()
  for (const a of assigneeChanges) {
    const op = a.metadata?.op
    const role = a.metadata?.role
    if (op === 'remove' && (role === 'manager' || role === 'sales')) reassignedCaseIds.add(a.entity_id)
  }
  const ASSIGN_DEADLINE_DAYS = 3
  const consultRows: ConsultCase[] = consultCasesArr.map(c => {
    const wonAt = wonAtByCase.get(c.id) ?? null
    const hasManager = managerByCase.has(c.id)
    const daysSinceWon = wonAt ? Math.floor((today.getTime() - new Date(wonAt).getTime()) / 86_400_000) : null
    // 管理担当が未アサイン: 担当変更履歴があれば赤NEW(担当者変更)、無ければ青NEW(新規受注新規アサイン)
    const assigneeChanged = !hasManager && reassignedCaseIds.has(c.id)
    const newOrderUnassigned = !!wonAt && !hasManager && !assigneeChanged
    // 面談メモ未記載: 面談予定日を超過しているのに面談実施日(=メモ)が未記録
    let meetingMemoMissing: 'info' | 'yellow' | 'red' | null = null
    if (c.meeting_date && c.meeting_date < todayStr && !c.meeting_executed_date) {
      const d = Math.floor((today.getTime() - new Date(c.meeting_date).getTime()) / 86_400_000)
      meetingMemoMissing = d >= 7 ? 'red' : d >= 4 ? 'yellow' : 'info'
    }
    return {
      id: c.id,
      case_number: c.case_number,
      deal_name: c.deal_name,
      status: c.status,
      meeting_executed_date: c.meeting_executed_date,
      client_response_due_date: c.client_response_due_date,
      order_route_detail: c.order_route_detail,
      manager_name: managerByCase.get(c.id) ?? null,
      procedure_type: c.procedure_type,
      order_amount: c.fee_administrative && c.fee_administrative > 0 ? c.fee_administrative : (c.fee_judicial ?? null),
      newOrderUnassigned,
      assigneeChanged,
      assignOverdue: newOrderUnassigned && daysSinceWon !== null && daysSinceWon >= ASSIGN_DEADLINE_DAYS,
      meetingMemoMissing,
    }
  })

  // === 個別管理案件（紹介のみ） ===
  const referralCases = myCases.filter(c => c.status === '紹介のみ')

  // === 自分宛タスク ===
  // 受注担当のタスク = システムタスク + 受注担当タスク(work_role='sales') の2区分
  const mySystemTasks = systemTaskRows.filter(t => myCaseIds.has(t.case_id))
  const systemTaskIds = new Set(mySystemTasks.map(t => t.id))
  const mySalesTasks = salesTaskRows.filter(t => salesCaseIds.has(t.case_id) && !systemTaskIds.has(t.id))
  const taskTabCount = mySystemTasks.length + mySalesTasks.length

  const targetValue = isSales ? (targetRow?.new_orders_count ?? 0) : isManager ? (targetRow?.invoice_count ?? 0) : 0

  // 期間切替の選択肢
  const periodOptions: Array<{ key: string; label: string }> = [
    ...fiscalMonths.map(m => ({ key: m, label: m === ymToday ? '当月' : `${Number(m.split('-')[1])}月` })),
    { key: 'all', label: '当期累計' },
  ]

  const meetingCount = consultCasesArr.length
  const referralCount = referralCases.length

  // === 進捗報告（管理担当タブ） ===
  // 案件ごとに最新の進捗報告を1件選ぶ（依頼中があれば優先、なければ依頼日が最新のもの）
  const reportsByCase = new Map<string, ProgressReportRow[]>()
  for (const pr of managerReports) {
    if (!reportsByCase.has(pr.case_id)) reportsByCase.set(pr.case_id, [])
    reportsByCase.get(pr.case_id)!.push(pr)
  }
  const latestReport = (caseId: string): ProgressReportRow | null => {
    const list = reportsByCase.get(caseId)
    if (!list || list.length === 0) return null
    const open = list.find(r => r.status === '依頼中')
    if (open) return open
    return [...list].sort((a, b) => (b.requested_date ?? '').localeCompare(a.requested_date ?? ''))[0]
  }
  const MANAGEMENT_ACTIVE = new Set(['受注', '対応中', '保留・長期'])
  const managerProgressRows: ManagerProgressRow[] = myCases
    .filter(c => managerCaseIds.has(c.id) && MANAGEMENT_ACTIVE.has(c.status))
    .map(c => {
      const rep = latestReport(c.id)
      return {
        case_id: c.id,
        case_number: c.case_number,
        deal_name: c.deal_name,
        sales_name: salesByCase.get(c.id) ?? null,
        sales_member_id: salesMemberIdByCase.get(c.id) ?? null,
        reportId: rep?.id ?? null,
        status: (rep?.status ?? '未対応') as ManagerProgressRow['status'],
        confirmerId: rep?.confirmer_id ?? null,
        confirmerName: rep ? memberById.get(rep.confirmer_id) ?? null : null,
        requestedDate: rep?.requested_date ?? null,
        confirmedDate: rep?.confirmed_date ?? null,
      }
    })
  // 確認者の候補（全アクティブメンバー）
  const confirmerCandidates = ((allMembersRaw ?? []) as Array<{ id: string; name: string }>)
    .map(m => ({ id: m.id, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  // === 進捗確認依頼（確認者タブ） ===
  const reviewRows: ReviewProgressRow[] = reviewReportsRaw.map(pr => ({
    reportId: pr.id,
    case_id: pr.case_id,
    case_number: pr.cases?.case_number ?? '—',
    deal_name: pr.cases?.deal_name ?? '—',
    requesterId: pr.requester_id,
    requesterName: memberById.get(pr.requester_id) ?? null,
    requestedDate: pr.requested_date,
    status: pr.status,
    confirmedDate: pr.confirmed_date,
  }))
  const reviewPendingCount = reviewRows.filter(r => r.status === '依頼中').length

  // === タブ構成（役割 + 確認依頼の有無で決定） ===
  const showProgress = isManager
  const showReviews = isSales || reviewRows.length > 0
  const validTabs: TabKey[] = []
  if (isSales) validTabs.push('meetings')
  validTabs.push('cases')
  if (isSales) validTabs.push('referrals')
  if (showProgress) validTabs.push('progress')
  validTabs.push('tasks')
  if (showReviews) validTabs.push('reviews')
  const defaultTab: TabKey = isSales ? 'meetings' : 'cases'
  const activeTab: TabKey = (validTabs as string[]).includes(tab ?? '') ? (tab as TabKey) : defaultTab

  return (
    <div>
      <PageHeader
        eyebrow="My"
        title={`${user.memberName ?? 'マイページ'}`}
        icon={UserCircle}
        description={isSales ? '受注担当のマイページ — あなたのみ閲覧できます' : isManager ? '管理担当のマイページ — あなたのみ閲覧できます' : 'マイページ — あなたのみ閲覧できます'}
      />

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 flex-wrap">
        {isSales && (
          <TabLink href="/my?tab=meetings" label={`当月面談 (${meetingCount})`} Icon={MessageSquare} active={activeTab === 'meetings'} />
        )}
        <TabLink href="/my?tab=cases" label="管理案件一覧" Icon={ClipboardList} active={activeTab === 'cases'} />
        {isSales && (
          <TabLink href="/my?tab=referrals" label={`個別管理案件 (${referralCount})`} Icon={Sparkles} active={activeTab === 'referrals'} />
        )}
        {showProgress && (
          <TabLink href="/my?tab=progress" label="進捗報告" Icon={ClipboardCheck} active={activeTab === 'progress'} />
        )}
        <TabLink href="/my?tab=tasks" label={`タスク (${taskTabCount})`} Icon={ListChecks} active={activeTab === 'tasks'} />
        {showReviews && (
          <TabLink href="/my?tab=reviews" label={`進捗確認依頼 (${reviewPendingCount})`} Icon={ClipboardCheck} active={activeTab === 'reviews'} />
        )}
      </div>

      {/* 月間目標入力（受注/管理担当のみ・概要タブ廃止に伴いここへ移設） */}
      {(isSales || isManager) && (activeTab === 'meetings' || activeTab === 'cases') && (
        <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-4 max-w-md">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
            <h3 className="text-[14px] font-bold text-gray-900">
              {isSales ? '今月の新規受注件数 目標' : '今月の請求完了件数 目標'}
            </h3>
            <span className="text-[11px] text-gray-400 font-mono">{ymToday}</span>
          </div>
          <MyPageTargetInput
            memberId={memberId}
            ym={ymToday}
            field={isSales ? 'new_orders_count' : 'invoice_count'}
            initialValue={targetValue}
            label={isSales ? '新規受注件数 (件)' : '請求完了件数 (件)'}
          />
        </section>
      )}

      {/* 当月面談（相談案件一覧） */}
      {activeTab === 'meetings' && isSales && (
        <div className="space-y-4">
          {/* 期間切替 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-gray-500">期間</span>
            <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-md p-0.5 flex-wrap">
              {periodOptions.map(p => (
                <Link
                  key={p.key}
                  href={`/my?tab=meetings&period=${p.key}`}
                  className={`px-2.5 py-1 rounded text-[12px] font-medium whitespace-nowrap transition-colors ${
                    selectedPeriod === p.key ? 'bg-brand-600 text-white font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                  }`}
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </div>

          {/* KPIサマリ（選択期間） */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MeetingKpi label="面談数" value={salesMetrics.meetingsCount} suffix="件" />
            <MeetingKpi label="受注数" value={salesMetrics.newOrdersCount} suffix="件" />
            <MeetingKpi label="受注率" value={salesMetrics.conversionRate === null ? null : Math.round(salesMetrics.conversionRate * 1000) / 10} suffix="%" />
            <MeetingKpi label="受注単価" value={salesMetrics.avgOrderUnit === null ? null : Math.round(salesMetrics.avgOrderUnit / 10000)} suffix="万円" />
            <MeetingKpi label="不動産査定" value={salesMetrics.propertyAppraisalCount} suffix="件" />
          </div>

          <ConsultationCasesTable cases={consultRows} />
        </div>
      )}

      {/* 管理案件一覧（進捗管理ダッシュボードと同じ見た目） */}
      {activeTab === 'cases' && (
        <div>
          <ProgressKpis scopeLabel={user.memberName ?? 'あなた'} metrics={boardKpis} />
          <MyPageCasesTab memberId={memberId} cases={myCasesEnriched} />
        </div>
      )}

      {/* 進捗報告（管理担当） */}
      {activeTab === 'progress' && showProgress && (
        <div>
          <ProgressKpis scopeLabel={user.memberName ?? 'あなた'} metrics={boardKpis} />
          <ProgressReportManagerTab rows={managerProgressRows} candidates={confirmerCandidates} currentMemberId={memberId} />
        </div>
      )}

      {/* 進捗確認依頼（確認者） */}
      {activeTab === 'reviews' && showReviews && (
        <ProgressReviewTab rows={reviewRows} currentMemberId={memberId} />
      )}

      {/* 個別管理案件（紹介のみ） */}
      {activeTab === 'referrals' && isSales && (
        <ReferralCasesTable
          cases={referralCases.map(c => ({
            id: c.id,
            case_number: c.case_number,
            deal_name: c.deal_name,
            status: c.status,
            order_route_detail: c.order_route_detail,
            procedure_type: c.procedure_type,
            client_name: c.client_id ? clientById.get(c.client_id) ?? null : null,
            manager_name: managerByCase.get(c.id) ?? null,
          }))}
        />
      )}

      {/* タスク（受注担当タスク + システムタスク） */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {isSales && (
            <SystemTaskList
              tasks={mySalesTasks}
              title="受注担当タスク"
              emptyText="未完了の受注担当タスクはありません"
              showCase={true}
              includeCompleted={false}
            />
          )}
          <SystemTaskList
            tasks={mySystemTasks}
            title="システムタスク"
            emptyText="未完了のシステムタスクはありません"
            showCase={true}
            includeCompleted={false}
          />
        </div>
      )}
    </div>
  )
}

function MeetingKpi({ label, value, suffix }: { label: string; value: number | null; suffix: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="text-[12px] font-semibold text-gray-500 mb-1.5">{label}</div>
      <div className="text-[24px] font-extrabold tracking-tight text-brand-700 leading-none">
        {value === null ? '—' : value.toLocaleString()}
        <span className="text-[12px] text-gray-400 ml-1 font-normal">{suffix}</span>
      </div>
    </div>
  )
}

type ReferralRow = {
  id: string
  case_number: string
  deal_name: string
  status: string
  order_route_detail: string | null
  procedure_type: string[] | null
  client_name: string | null
  manager_name: string | null
}

function ReferralCasesTable({ cases }: { cases: ReferralRow[] }) {
  const statusDef = CASE_STATUSES.find(s => s.key === '紹介のみ')
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-cyan-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">個別管理案件（紹介のみ）</h3>
        <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
          {cases.length}件
        </span>
        <span className="ml-auto text-[11px] text-gray-400">受注に至らず紹介（税理士・不動産査定・遺品整理 等）のみ発生した案件</span>
      </div>
      {cases.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">「紹介のみ」の案件はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">案件管理番号</th>
                <th className="px-3 py-2 text-left font-bold">案件名</th>
                <th className="px-3 py-2 text-left font-bold">ステータス</th>
                <th className="px-3 py-2 text-left font-bold">送客元</th>
                <th className="px-3 py-2 text-left font-bold">紹介内容</th>
                <th className="px-3 py-2 text-left font-bold">管理担当</th>
                <th className="px-3 py-2 text-left font-bold">依頼者名</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cases.map(c => {
                const procedures = (c.procedure_type ?? []).filter(Boolean)
                return (
                  <tr key={c.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{c.case_number}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/cases/${c.id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[220px]">
                        {c.deal_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {statusDef ? <Badge label="紹介のみ" color={statusDef.color} /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.order_route_detail || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      {procedures.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {procedures.map(p => (
                            <span key={p} className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">{p}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{c.manager_name || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700 truncate">{c.client_name || <span className="text-gray-300">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TabLink({ href, label, Icon, active }: { href: string; label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; active: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${
        active
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'
      }`}
    >
      <Icon className="w-4 h-4" strokeWidth={active ? 2.25 : 1.75} />
      {label}
    </Link>
  )
}
