import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserCircle, ClipboardList, ListChecks, MessageSquare, Sparkles, ClipboardCheck, Receipt, Banknote } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import MyPageCasesTab from '@/components/features/my/MyPageCasesTab'
import ConsultationCasesTable, { type ConsultCase } from '@/components/features/my/ConsultationCasesTable'
import ReferralCasesTable from '@/components/features/my/ReferralCasesTable'
import ProgressReportManagerTab, { type ManagerProgressRow } from '@/components/features/my/ProgressReportManagerTab'
import ProgressReviewTab, { type ReviewProgressRow } from '@/components/features/my/ProgressReviewTab'
import PaymentCheckReviewTab, { type PayCheckReviewRow } from '@/components/features/my/PaymentCheckReviewTab'
import PaymentCheckSentTab, { type PayCheckSentRow } from '@/components/features/my/PaymentCheckSentTab'
import BillingCaseTable from '@/components/features/billing/BillingCaseTable'
import { buildBillingCaseRows } from '@/lib/billingCaseRows'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
import MyTaskCreateButton from '@/components/features/tasks/MyTaskCreateButton'
import ProgressKpis from '@/components/features/dashboard/ProgressKpis'
import {
  computeSalesMetrics,
  computeSalesMetricsForDay,
  computeProgressKpis,
  fiscalYearMonthsToDate,
  type DashCase,
  type DashTask,
  type DashStatusChange,
  type DashProperty,
  type SalesMetricsBundle,
} from '@/lib/dashboardMetrics'
import type { TaskRow, ProgressReportRow, PaymentCheckRequestRow } from '@/types'

/**
 * マイページ — 認証ユーザー本人のみ閲覧可能。
 *
 * 受注担当 (sales):
 *   - 当月面談（相談案件一覧）: 面談設定済/検討中/検討中（契約書待ち）/受託/不受託 の案件。期間切替・KPIサマリ付き
 *   - 管理案件一覧            : 受託後の進捗（対応中/完了）。進捗管理ダッシュボードと同じ見た目
 *   - 個別管理案件            : 紹介のみ/長期保留 の案件（戻り受注の可能性あり）
 *   - タスク                  : 自分宛のタスク
 * 管理担当 (manager) / その他: 管理案件一覧 + タスク
 */

type SearchParams = Promise<{ tab?: string; period?: string }>
type TabKey = 'meetings' | 'cases' | 'billing' | 'referrals' | 'progress' | 'reviews' | 'tasks' | 'pay_reviews' | 'pay_sent'

// 入金状況確認依頼（join付き）の生レコード型
type PayCheckRaw = PaymentCheckRequestRow & {
  invoices: { amount: number; due_date: string | null } | null
  cases: { case_number: string; deal_name: string } | null
}

// 相談案件 = 受注担当が受託に至るまで（長期保留・紹介のみは個別管理案件へ移管）
const CONSULT_STATUSES = new Set(['面談設定済', '検討中', '検討中（契約書待ち）', '受注', '失注'])
// 個別管理案件 = 紹介のみ・長期保留（戻り受注の可能性あり）
const REFERRAL_STATUSES = new Set(['紹介のみ', '保留・長期'])
// 管理担当のアラート対象スコープ（KPI/アラート用。一覧分類とは別概念）
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

  // 相談案件の期間切替（本日／当月／当期累計）。デフォルトは当月
  const fiscalMonths = fiscalYearMonthsToDate(today) // [当月, ...過去] の降順
  const selectedPeriod: string = (period === 'today' || period === 'all') ? period : ymToday

  // === 1st fetch ===
  const [{ data: myCaseRows }, { data: allCaseMembersRaw }, { data: allMembersRaw }, { data: clientsRaw }] = await Promise.all([
    supabase.from('case_members').select('case_id, role, cases(*)').eq('member_id', memberId),
    supabase.from('case_members').select('case_id, member_id, role'),
    supabase.from('members').select('id, name, avatar_url').eq('is_active', true),
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
    order_sheet_completed_at: string | null
    contract_type: string | null
    advance_payment: number | null
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
  const allMembersArr = (allMembersRaw ?? []) as Array<{ id: string; name: string; avatar_url: string | null }>
  const memberById = new Map<string, string>(allMembersArr.map(m => [m.id, m.name]))
  const memberObjById = new Map(allMembersArr.map(m => [m.id, m]))
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

  type BoardTask = { id: string; case_id: string; title: string; status: string; sort_order: number | null; due_date: string | null }
  let boardTasks: BoardTask[] = []
  let invoices: Array<{ id: string; case_id: string; invoice_type: string; status: string; amount: number; firm_type: string | null; issued_date: string | null; created_at: string | null }> = []
  let billingPayments: Array<{ invoice_id: string; amount: number }> = []
  let salesChanges: DashStatusChange[] = []
  let salesProps: DashProperty[] = []
  let roleTaskRows: TaskRow[] = []
  let allReports: ProgressReportRow[] = []
  let reviewReportsRaw: Array<ProgressReportRow & { cases: { case_number: string; deal_name: string } | null }> = []
  let payReviewRaw: PayCheckRaw[] = []   // 受注担当: 自分宛の入金確認依頼
  let paySentRaw: PayCheckRaw[] = []     // 管理担当: 自分が出した入金確認依頼
  let wonChanges: Array<{ entity_id: string; created_at: string }> = []
  let assigneeChanges: Array<{ entity_id: string; metadata: { op?: string; role?: string } | null }> = []
  let comms: Array<{ case_id: string; communicated_at: string | null; detail: string | null }> = []

  if (caseIdArray.length > 0) {
    try {
      const [tasksRes, invoicesRes, roleTaskRes, changesRes, propsRes, reportsRes, reviewReportsRes, wonRes, assigneeRes, commsRes, payReviewRes, paySentRes] = await Promise.all([
        supabase.from('tasks').select('id,case_id,title,status,sort_order,due_date').in('case_id', caseIdArray),
        supabase.from('invoices').select('id,case_id,invoice_type,status,amount,firm_type,issued_date,created_at').in('case_id', caseIdArray),
        // 担当者ベース: 自分が task_assignees に紐付く未完了タスク（システム/案件タスク共通）
        // started_by_member は「対応中（名前）」表示に使う
        supabase.from('tasks').select('*, cases(id, case_number, deal_name, status), started_by_member:members!tasks_started_by_fkey(*), task_assignees!inner(member_id, role)').eq('task_assignees.member_id', memberId).neq('status', '完了').order('due_date', { ascending: true, nullsFirst: false }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('activity_log').select('entity_id,old_value,new_value,created_at').eq('entity_type', 'case').eq('action', 'status_change').in('entity_id', salesCaseIdArray).gte('created_at', fiscalStart).lt('created_at', nextMonthStart)
          : Promise.resolve({ data: [] }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('real_estate_properties').select('case_id,appraisal_status').in('case_id', salesCaseIdArray)
          : Promise.resolve({ data: [] }),
        supabase.from('progress_reports').select('*').in('case_id', caseIdArray),
        supabase.from('progress_reports').select('*, cases(case_number, deal_name)').eq('confirmer_id', memberId).order('requested_date', { ascending: false }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('activity_log').select('entity_id,created_at').eq('entity_type', 'case').eq('action', 'status_change').eq('new_value', '受注').in('entity_id', salesCaseIdArray)
          : Promise.resolve({ data: [] }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('activity_log').select('entity_id,metadata').eq('entity_type', 'case').eq('action', 'assignee_change').in('entity_id', salesCaseIdArray)
          : Promise.resolve({ data: [] }),
        supabase.from('client_communications').select('case_id,communicated_at,detail').in('case_id', caseIdArray).order('communicated_at', { ascending: false }),
        // 入金状況確認依頼（受信＝自分が確認者 / 発信＝自分が依頼者）
        supabase.from('payment_check_requests').select('*, invoices(amount, due_date), cases(case_number, deal_name)').eq('confirmer_id', memberId).order('requested_date', { ascending: false }),
        supabase.from('payment_check_requests').select('*, invoices(amount, due_date), cases(case_number, deal_name)').eq('requester_id', memberId).order('requested_date', { ascending: false }),
      ])
      boardTasks = (tasksRes.data ?? []) as BoardTask[]
      invoices = (invoicesRes.data ?? []) as typeof invoices
      if (isManager && invoices.length > 0) {
        const { data: payRaw } = await supabase.from('payments').select('invoice_id,amount').in('invoice_id', invoices.map(i => i.id))
        billingPayments = (payRaw ?? []) as typeof billingPayments
      }
      roleTaskRows = (roleTaskRes.data ?? []) as TaskRow[]
      salesChanges = (changesRes.data ?? []) as DashStatusChange[]
      salesProps = (propsRes.data ?? []) as DashProperty[]
      allReports = (reportsRes.data ?? []) as ProgressReportRow[]
      reviewReportsRaw = (reviewReportsRes.data ?? []) as typeof reviewReportsRaw
      wonChanges = (wonRes.data ?? []) as Array<{ entity_id: string; created_at: string }>
      assigneeChanges = (assigneeRes.data ?? []) as Array<{ entity_id: string; metadata: { op?: string; role?: string } | null }>
      comms = (commsRes.data ?? []) as Array<{ case_id: string; communicated_at: string | null; detail: string | null }>
      payReviewRaw = (payReviewRes.data ?? []) as PayCheckRaw[]
      paySentRaw = (paySentRes.data ?? []) as PayCheckRaw[]
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
  // 一覧（MyPageCasesTab）は対応中のみ表示するため、サマリも対応中のみで集計して件数を揃える。
  // 完了割合・サイクルは scopedCases 全体（完了案件含む）で計算されるので影響しない。
  const boardKpis = computeProgressKpis(boardDashCases, boardTasks, ymToday, today, invoices, new Set(['対応中']))

  // タスクを案件ごとにグルーピング（進捗・次タスク算出用）
  const tasksByCase = new Map<string, BoardTask[]>()
  for (const t of boardTasks) {
    if (!tasksByCase.has(t.case_id)) tasksByCase.set(t.case_id, [])
    tasksByCase.get(t.case_id)!.push(t)
  }
  const isOpen = (s: string) => s !== '完了' && s !== 'キャンセル'
  // 案件ごと: 次の未完了タスク / 進捗(完了数・総数)
  const progressByCase = new Map<string, { nextTaskId: string | null; nextTaskTitle: string | null; done: number; total: number }>()
  for (const [cid, ts] of tasksByCase) {
    const sorted = [...ts].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const next = sorted.find(t => isOpen(t.status)) ?? null
    progressByCase.set(cid, {
      nextTaskId: next?.id ?? null,
      nextTaskTitle: next?.title ?? null,
      done: ts.filter(t => t.status === '完了').length,
      total: ts.length,
    })
  }

  // タスク期限超過: 未完了タスクで期限切れがある案件
  const overdueCaseIds = new Set<string>()
  for (const t of boardTasks) {
    if (t.due_date && t.due_date < todayStr && isOpen(t.status)) overdueCaseIds.add(t.case_id)
  }

  // 案件ごと: 週次報告状況（最新の進捗報告。確認済でも7日経過していれば「未対応」に戻す）
  const latestReportByCase = new Map<string, ProgressReportRow>()
  for (const pr of allReports) {
    const cur = latestReportByCase.get(pr.case_id)
    const isOpenReq = pr.status === '依頼中'
    if (!cur) { latestReportByCase.set(pr.case_id, pr); continue }
    if (isOpenReq && cur.status !== '依頼中') { latestReportByCase.set(pr.case_id, pr); continue }
    if ((pr.requested_date ?? '') > (cur.requested_date ?? '')) latestReportByCase.set(pr.case_id, pr)
  }
  const weeklyStatusOf = (cid: string): '未対応' | '依頼中' | '確認済' => {
    const pr = latestReportByCase.get(cid)
    if (!pr) return '未対応'
    if (pr.status === '依頼中') return '依頼中'
    // 確認済: 7日以内なら確認済、それ以降は未対応に戻す
    if (pr.confirmed_date) {
      const d = Math.floor((today.getTime() - new Date(pr.confirmed_date).getTime()) / 86_400_000)
      return d <= 7 ? '確認済' : '未対応'
    }
    return '未対応'
  }
  const reportConfirmedRecent = new Set<string>()
  for (const cid of latestReportByCase.keys()) {
    if (weeklyStatusOf(cid) === '確認済') reportConfirmedRecent.add(cid)
  }

  // 案件ごと: 直近の依頼者やり取り（最新1件）
  const lastCommByCase = new Map<string, { date: string | null; detail: string | null }>()
  for (const c of comms) {
    if (!lastCommByCase.has(c.case_id)) lastCommByCase.set(c.case_id, { date: c.communicated_at, detail: c.detail })
  }

  const myCasesEnriched = myCases.map(c => {
    // アラートは管理担当のマイページ（自分が管理担当の案件）にのみ表示
    const isMgrCase = isManager && managerCaseIds.has(c.id) && MGMT_ACTIVE_STATUSES.has(c.status)
    const prog = progressByCase.get(c.id)
    const lastComm = lastCommByCase.get(c.id)
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
      procedure_type: c.procedure_type,
      order_sheet_completed_at: c.order_sheet_completed_at,
      // 進捗（次の未完了タスク + 完了/総数）
      nextTaskId: prog?.nextTaskId ?? null,
      nextTaskTitle: prog?.nextTaskTitle ?? null,
      progressDone: prog?.done ?? 0,
      progressTotal: prog?.total ?? 0,
      // 週次報告状況
      weeklyStatus: weeklyStatusOf(c.id),
      // 直近お客様報告
      lastCommDate: lastComm?.date ?? null,
      lastCommDetail: lastComm?.detail ?? null,
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
      meeting_executed_date: c.meeting_executed_date,
    }))

  const salesMetrics = selectedPeriod === 'all'
    ? cumulativeSalesMetrics(fiscalMonths.map(m => computeSalesMetrics(salesDashCases, salesChanges, m, salesProps)))
    : selectedPeriod === 'today'
      ? computeSalesMetricsForDay(salesDashCases, salesChanges, today, salesProps)
      : computeSalesMetrics(salesDashCases, salesChanges, selectedPeriod, salesProps)

  let consultCasesArr = myCases.filter(c => salesCaseIds.has(c.id) && CONSULT_STATUSES.has(c.status))
  if (selectedPeriod === 'today') {
    consultCasesArr = consultCasesArr.filter(c =>
      c.meeting_date === todayStr || c.meeting_executed_date === todayStr,
    )
  } else if (selectedPeriod !== 'all') {
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
      order_sheet_completed_at: c.order_sheet_completed_at,
      newOrderUnassigned,
      assigneeChanged,
      assignOverdue: newOrderUnassigned && daysSinceWon !== null && daysSinceWon >= ASSIGN_DEADLINE_DAYS,
      meetingMemoMissing,
    }
  })

  // === 個別管理案件（紹介のみ・長期保留） ===
  const referralCases = myCases.filter(c => REFERRAL_STATUSES.has(c.status))

  // === 自分宛タスク（担当者ベース） ===
  // task_assignees で自分に紐付く未完了タスク（roleTaskRows は既にDB側で絞り込み済み）。
  // システムタスク・案件タスクを問わず「自分が担当のもの」を1リストに統合表示する。
  const roleTasks = roleTaskRows
  const roleTaskTitle = isSales ? '受注担当タスク' : isManager ? '管理担当タスク' : '自分のタスク'
  const taskTabCount = roleTasks.length


  // 期間切替の選択肢（本日／当月／当期累計）
  const periodOptions: Array<{ key: string; label: string }> = [
    { key: 'today', label: '本日' },
    { key: ymToday, label: '当月' },
    { key: 'all', label: '当期累計' },
  ]

  const meetingCount = consultCasesArr.length
  const referralCount = referralCases.length

  // === 進捗報告（管理担当タブ） ===
  // 案件ごとに最新の進捗報告を1件選ぶ（依頼中があれば優先、なければ依頼日が最新のもの）
  const reportsByCase = new Map<string, ProgressReportRow[]>()
  for (const pr of allReports) {
    if (!managerCaseIds.has(pr.case_id)) continue
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
  // 管理案件 = 対応中・完了（受託後に管理担当が引き継いだ案件）
  const MANAGEMENT_ACTIVE = new Set(['対応中', '完了'])
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

  // === 入金状況確認（受注担当＝受信 / 管理担当＝発信一覧） ===
  const payReviewRows: PayCheckReviewRow[] = payReviewRaw.map(r => ({
    requestId: r.id,
    invoice_id: r.invoice_id,
    case_id: r.case_id,
    case_number: r.cases?.case_number ?? '—',
    deal_name: r.cases?.deal_name ?? '—',
    amount: r.invoices?.amount ?? 0,
    due_date: r.invoices?.due_date ?? null,
    requesterId: r.requester_id,
    requesterName: memberById.get(r.requester_id) ?? null,
    requestedDate: r.requested_date,
    status: r.status,
    resultNote: r.result_note,
    confirmedDate: r.confirmed_date,
    autoClosed: r.auto_closed,
  }))
  const payReviewPendingCount = payReviewRows.filter(r => r.status === '依頼中').length

  const paySentRows: PayCheckSentRow[] = paySentRaw.map(r => ({
    requestId: r.id,
    case_id: r.case_id,
    case_number: r.cases?.case_number ?? '—',
    deal_name: r.cases?.deal_name ?? '—',
    amount: r.invoices?.amount ?? 0,
    confirmerName: memberById.get(r.confirmer_id) ?? null,
    requestedDate: r.requested_date,
    status: r.status,
    resultNote: r.result_note,
    confirmedDate: r.confirmed_date,
    autoClosed: r.auto_closed,
  }))
  const paySentPendingCount = paySentRows.filter(r => r.status === '依頼中').length

  // 請求タブ（管理担当）: 当月の受託(受注)/当月完了予定の対応中/当月業務完了の完了 案件
  const billingCaseRows = isManager
    ? buildBillingCaseRows(myCases.filter(c => managerCaseIds.has(c.id)), allCaseMembers, memberObjById, invoices, today, billingPayments)
    : []

  // === タブ構成（役割 + 確認依頼の有無で決定） ===
  const showProgress = isManager
  const showReviews = isSales || reviewRows.length > 0
  const showPaySent = isManager || paySentRows.length > 0       // 発信一覧（管理担当）
  const showPayReviews = isSales || payReviewRows.length > 0     // 受信（受注担当）
  const validTabs: TabKey[] = []
  if (isSales) validTabs.push('meetings')
  validTabs.push('cases')
  if (isManager) validTabs.push('billing')
  if (isSales) validTabs.push('referrals')
  if (showProgress) validTabs.push('progress')
  if (showPaySent) validTabs.push('pay_sent')
  validTabs.push('tasks')
  if (showReviews) validTabs.push('reviews')
  if (showPayReviews) validTabs.push('pay_reviews')
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
          <TabLink href="/my?tab=meetings" label={`相談案件一覧 (${meetingCount})`} Icon={MessageSquare} active={activeTab === 'meetings'} />
        )}
        <TabLink href="/my?tab=cases" label="管理案件一覧" Icon={ClipboardList} active={activeTab === 'cases'} />
        {isManager && (
          <TabLink href="/my?tab=billing" label={`請求 (${billingCaseRows.length})`} Icon={Receipt} active={activeTab === 'billing'} />
        )}
        {isSales && (
          <TabLink href="/my?tab=referrals" label={`個別管理案件 (${referralCount})`} Icon={Sparkles} active={activeTab === 'referrals'} />
        )}
        {showProgress && (
          <TabLink href="/my?tab=progress" label="進捗報告" Icon={ClipboardCheck} active={activeTab === 'progress'} />
        )}
        {showPaySent && (
          <TabLink href="/my?tab=pay_sent" label={`入金状況確認 (${paySentPendingCount})`} Icon={Banknote} active={activeTab === 'pay_sent'} />
        )}
        <TabLink href="/my?tab=tasks" label={`タスク (${taskTabCount})`} Icon={ListChecks} active={activeTab === 'tasks'} />
        {showReviews && (
          <TabLink href="/my?tab=reviews" label={`進捗確認依頼 (${reviewPendingCount})`} Icon={ClipboardCheck} active={activeTab === 'reviews'} />
        )}
        {showPayReviews && (
          <TabLink href="/my?tab=pay_reviews" label={`入金状況確認 (${payReviewPendingCount})`} Icon={Banknote} active={activeTab === 'pay_reviews'} />
        )}
      </div>

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

          <ConsultationCasesTable cases={consultRows} selectable />
        </div>
      )}

      {/* 管理案件一覧（進捗管理ダッシュボードと同じ見た目） */}
      {activeTab === 'cases' && (
        <div>
          <ProgressKpis scopeLabel={user.memberName ?? 'あなた'} metrics={boardKpis} />
          <MyPageCasesTab memberId={memberId} cases={myCasesEnriched} selectable />
        </div>
      )}

      {/* 請求（管理担当）: サマリ等は出さず、案件ベースの請求一覧のみ */}
      {activeTab === 'billing' && isManager && (
        <BillingCaseTable rows={billingCaseRows} />
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

      {/* 入金状況確認（管理担当＝発信一覧） */}
      {activeTab === 'pay_sent' && showPaySent && (
        <PaymentCheckSentTab rows={paySentRows} />
      )}

      {/* 入金状況確認（受注担当＝受信・確認結果入力） */}
      {activeTab === 'pay_reviews' && showPayReviews && (
        <PaymentCheckReviewTab rows={payReviewRows} currentMemberId={memberId} />
      )}

      {/* 個別管理案件（紹介のみ・長期保留） */}
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
          selectable
        />
      )}

      {/* タスク（担当者ベース: 自分が担当のタスク） */}
      {activeTab === 'tasks' && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <MyTaskCreateButton currentMemberId={memberId} />
          </div>
          <SystemTaskList
            tasks={roleTasks}
            title={roleTaskTitle}
            emptyText={`未完了の${roleTaskTitle}はありません`}
            showCase={true}
            includeCompleted={false}
            currentMemberId={memberId}
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
