import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserCircle, ClipboardList, ListChecks, MessageSquare, MessagesSquare, Sparkles, ClipboardCheck, Receipt, AlertTriangle, PenSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, canSeeMyPage, isSystemManager } from '@/lib/auth'
import MyPageCasesTab from '@/components/features/my/MyPageCasesTab'
import ConsultationCasesTable, { type ConsultCase } from '@/components/features/my/ConsultationCasesTable'
import ReferralCasesTable from '@/components/features/my/ReferralCasesTable'
import ProgressReportManagerTab, { type ManagerProgressRow } from '@/components/features/my/ProgressReportManagerTab'
import BillingClient from '@/components/features/billing/BillingClient'
import type { BillingRequestRow } from '@/components/features/billing/BillingRequestsPanel'
import MyAlertCenter from '@/components/features/my/MyAlertCenter'
import RankingBadges, { type RankBadge } from '@/components/features/dashboard/RankingBadges'
import MyTargetChip from '@/components/features/my/MyTargetChip'
import { buildRankings } from '@/lib/rankingMetrics'
import OverdueAttention, { type OverdueBill, type OverdueTaskItem } from '@/components/features/dashboard/OverdueAttention'
import { overdueSeverity, billOverdueSeverity, calDaysOverdue, type OverdueSeverity } from '@/lib/overdue'
import { fetchCaseAlertContexts } from '@/lib/caseAlertContext'
import { evaluateCaseAlerts, bannerOf } from '@/lib/alertRules'
import { computeUrgentReportAlerts, computeParcelArrivalAlerts } from '@/lib/caseStateAlerts'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
import HourenSouTable, { type HourenSouItem } from '@/components/features/my/HourenSouTable'
import MyTaskCreateButton from '@/components/features/tasks/MyTaskCreateButton'
import ProgressKpis from '@/components/features/dashboard/ProgressKpis'
import CaseReportInbox from '@/components/features/my/CaseReportInbox'
import {
  computeSalesMetrics,
  computeSalesMetricsForDay,
  computeProgressKpis,
  computeCaseFlag,
  fiscalYearMonthsToDate,
  applyReferralFlags,
  type DashCase,
  type DashTask,
  type DashStatusChange,
  type DashProperty,
  type DashReferral,
  type SalesMetricsBundle,
} from '@/lib/dashboardMetrics'
import type { TaskRow, ProgressReportRow, CaseReportStatus } from '@/types'

/**
 * マイページ — 認証ユーザー本人のみ閲覧可能。
 *
 * 受注担当 (sales):
 *   - 当月面談（相談案件一覧）: 面談設定済/検討中/検討中（契約書待ち）/受託/不受託 の案件。期間切替・KPIサマリ付き
 *   - 管理案件一覧            : 受託後の進捗（対応中/完了）。進捗管理ダッシュボードと同じ見た目
 *   - 個別管理案件            : 紹介のみ の案件（戻り受注の可能性あり）
 *   - タスク                  : 自分宛のタスク
 * 管理担当 (manager) / その他: 管理案件一覧 + タスク
 */

type SearchParams = Promise<{ tab?: string; period?: string; as?: string }>
type TabKey = 'meetings' | 'prep' | 'cases' | 'billing' | 'referrals' | 'progress' | 'hourensou' | 'hourensouAction' | 'complaints' | 'tasks'

// 相談案件 = 面談〜検討〜失注（受注前）。依頼確定待ち/受注/戻り受注/作業着手準備 は「未着手案件」へ移管。
const CONSULT_STATUSES = new Set(['面談設定済', '検討中', '失注'])
// 未着手案件 = 受注が見えてから作業進行中に入るまでの準備段階
const PREP_STATUSES = new Set(['検討中（契約書待ち）', '受注', '戻り受注', '作業着手準備'])
// 個別管理案件 = 紹介のみ
const REFERRAL_STATUSES = new Set(['紹介のみ'])
// 管理担当のアラート対象スコープ（KPI/アラート用。一覧分類とは別概念）
const MGMT_ACTIVE_STATUSES = new Set(['受注', '戻り受注', '作業着手準備', '対応中'])
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
  const { tab, period, as } = await searchParams

  const user = await getCurrentUser()
  if (!user?.memberId) {
    redirect('/login')
  }

  // マイページを持つのは 受注/管理/システム管理者のみ。事務管理・経理は持たない。
  if (!canSeeMyPage(user)) {
    redirect('/')
  }

  const memberId = user.memberId
  // システム管理者は受注/管理の2ビューを ?as= で切替（既定は管理）。それ以外は自分の主ロール。
  const sysMgr = isSystemManager(user)
  const viewRole = sysMgr ? (as === 'sales' ? 'sales' : 'manager') : user.primaryRole
  const role = viewRole
  const isSales = role === 'sales'
  const isManager = role === 'manager' || role === 'sub_manager'
  // システム管理者が受注ビューのとき、タブ遷移で as=sales を引き継ぐ
  const asSuffix = sysMgr && isSales ? '&as=sales' : ''

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
    supabase.from('members').select('id, name, avatar_url, team_id').eq('is_active', true),
    supabase.from('clients').select('id, name'),
  ])

  // === 月間ランキングのバッジ（自分の名前の右）===
  // 綜合1位＝月間MVP、各ランキング1位＝「◯◯ 1位」。受注担当=受注軸、管理担当=業完軸。
  const myBadges: RankBadge[] = []
  if (isSales || isManager) {
    const [{ data: rCases }, { data: rMembers }, { data: rTeams }] = await Promise.all([
      supabase.from('cases').select('id,order_received_date,completion_date,contract_type,fee_administrative,fee_judicial,fee_total'),
      supabase.from('members').select('id,name,avatar_color,avatar_url,team_id').eq('is_active', true),
      supabase.from('teams').select('id,name').eq('is_active', true),
    ])
    const ranking = buildRankings(
      (rCases ?? []) as Parameters<typeof buildRankings>[0],
      (allCaseMembersRaw ?? []) as Parameters<typeof buildRankings>[1],
      (rMembers ?? []) as Parameters<typeof buildRankings>[2],
      (rTeams ?? []) as Parameters<typeof buildRankings>[3],
      ymToday,
    )
    const axisRank = isSales ? ranking.sales : ranking.manager
    const tone: RankBadge['tone'] = isSales ? 'sales' : 'manager'
    for (const r of axisRank.rankings) {
      if (r.key === 'composite') {
        if (r.entries.some(e => e.id === memberId && e.rank === 1)) myBadges.unshift({ label: '月間MVP', tone: 'mvp' })
      } else {
        const e = r.entries.find(x => x.id === memberId)
        if (e && e.rank === 1) myBadges.push({ label: r.title.replace('ランキング', ' 1位'), tone })
      }
    }
  }

  type MyCase = {
    id: string
    case_number: string
    deal_name: string
    status: string
    expected_completion_date: string | null
    completion_date: string | null
    order_received_date: string | null
    manager_assign_skipped: boolean | null
    meeting_date: string | null
    meeting_executed_date: string | null
    client_response_due_date: string | null
    order_route: string | null
    order_route_detail: string | null
    procedure_type: string[] | null
    order_sheet_completed_at: string | null
    management_started_at: string | null
    contract_type: string | null
    billing_pattern: string | null
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
  const allMembersArr = (allMembersRaw ?? []) as Array<{ id: string; name: string; avatar_url: string | null; team_id?: string | null }>

  // === 同じチームの案件（案件報告をチームで拾えるようにするため） ===
  // 案件報告は受注担当ひとりに溜まりがちなので、受注担当・管理担当が同じチームの案件は
  // チームの誰のマイページにも出して、手が空いている人が確認できるようにする。
  const myTeamId = allMembersArr.find(m => m.id === memberId)?.team_id ?? null
  const teamMemberIds = new Set(
    myTeamId ? allMembersArr.filter(m => m.team_id === myTeamId).map(m => m.id) : [memberId],
  )
  const teamCaseIds = new Set<string>()
  for (const cm of ((allCaseMembersRaw ?? []) as Array<{ case_id: string; member_id: string; role: string }>)) {
    if ((cm.role === 'sales' || cm.role === 'manager') && teamMemberIds.has(cm.member_id)) teamCaseIds.add(cm.case_id)
  }
  const memberById = new Map<string, string>(allMembersArr.map(m => [m.id, m.name]))
  const clientById = new Map<string, string>(((clientsRaw ?? []) as Array<{ id: string; name: string }>).map(c => [c.id, c.name]))
  const allCaseMembers = (allCaseMembersRaw ?? []) as Array<{ case_id: string; member_id: string; role: string }>
  const salesByCase = new Map<string, string>()
  const managerByCase = new Map<string, string>()
  const subManagerByCase = new Map<string, string>()
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
    // サブ管理担当（引継ぎ・応援）。一覧では管理担当の列に並べて出す
    if (cm.role === 'sub_manager' && !subManagerByCase.has(cm.case_id)) subManagerByCase.set(cm.case_id, name)
  }

  // === 2nd fetch（KPI算出に必要なデータ。マイグレーション未適用環境でも落ちないよう try で保護） ===
  const caseIdArray = Array.from(myCaseIds)
  const salesCaseIdArray = Array.from(salesCaseIds)
  const managerCaseIdArray = Array.from(managerCaseIds)
  const earliestYm = fiscalMonths[fiscalMonths.length - 1] ?? ymToday
  const fiscalStart = `${earliestYm}-01T00:00:00`
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const nextMonthStart = `${nextMonthDate.getFullYear()}-${pad(nextMonthDate.getMonth() + 1)}-01T00:00:00`

  type BoardTask = { id: string; case_id: string; title: string; status: string; sort_order: number | null; due_date: string | null; task_kind: string | null }
  let boardTasks: BoardTask[] = []
  let invoices: Array<{ id: string; case_id: string; invoice_type: string; status: string; amount: number; firm_type: string | null; issued_date: string | null; created_at: string | null; expenses_amount: number | null; advance_deduction: number | null; notes: string | null; receipt_issued_date: string | null; due_date: string | null; needs_review: boolean | null }> = []
  let salesChanges: DashStatusChange[] = []
  let salesProps: DashProperty[] = []
  let salesReferrals: DashReferral[] = []
  let roleTaskRows: TaskRow[] = []
  let allReports: ProgressReportRow[] = []
  // チーム案件の案件報告（自分が担当していない案件の分）。案件名の表示用に cases も一緒に取る。
  let teamReports: Array<ProgressReportRow & { cases: { case_number: string; deal_name: string } | null }> = []
  let wonChanges: Array<{ entity_id: string; created_at: string }> = []
  let assigneeChanges: Array<{ entity_id: string; metadata: { op?: string; role?: string } | null }> = []
  let comms: Array<{ case_id: string; communicated_at: string | null; detail: string | null }> = []

  if (caseIdArray.length > 0) {
    try {
      const [tasksRes, invoicesRes, roleTaskRes, changesRes, propsRes, referralsRes, reportsRes, wonRes, assigneeRes, commsRes] = await Promise.all([
        supabase.from('tasks').select('id,case_id,title,status,sort_order,due_date,task_kind').in('case_id', caseIdArray),
        supabase.from('invoices').select('id,case_id,invoice_type,status,amount,firm_type,issued_date,created_at,expenses_amount,advance_deduction,notes,receipt_issued_date,due_date,needs_review').in('case_id', caseIdArray),
        // 担当者ベース: 自分が task_assignees に紐付く未完了タスク（システム/案件タスク共通）
        // started_by_member は「対応中（名前）」表示に使う
        supabase.from('tasks').select('*, cases(id, case_number, deal_name, status), started_by_member:members!tasks_started_by_fkey(*), task_assignees!inner(member_id, role)').eq('task_assignees.member_id', memberId).neq('status', '完了').order('due_date', { ascending: true, nullsFirst: false }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('activity_log').select('entity_id,old_value,new_value,created_at').eq('entity_type', 'case').eq('action', 'status_change').in('entity_id', salesCaseIdArray).gte('created_at', fiscalStart).lt('created_at', nextMonthStart)
          : Promise.resolve({ data: [] }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('real_estate_properties').select('case_id,appraisal_status').in('case_id', salesCaseIdArray)
          : Promise.resolve({ data: [] }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('case_referrals').select('case_id,partner_type,content').in('case_id', salesCaseIdArray)
          : Promise.resolve({ data: [] }),
        supabase.from('progress_reports').select('*').in('case_id', caseIdArray),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('activity_log').select('entity_id,created_at').eq('entity_type', 'case').eq('action', 'status_change').eq('new_value', '受注').in('entity_id', salesCaseIdArray)
          : Promise.resolve({ data: [] }),
        isSales && salesCaseIdArray.length > 0
          ? supabase.from('activity_log').select('entity_id,metadata').eq('entity_type', 'case').eq('action', 'assignee_change').in('entity_id', salesCaseIdArray)
          : Promise.resolve({ data: [] }),
        supabase.from('client_communications').select('case_id,communicated_at,detail').in('case_id', caseIdArray).order('communicated_at', { ascending: false }),
      ])
      boardTasks = (tasksRes.data ?? []) as BoardTask[]
      invoices = (invoicesRes.data ?? []) as typeof invoices
      roleTaskRows = (roleTaskRes.data ?? []) as TaskRow[]
      salesChanges = (changesRes.data ?? []) as DashStatusChange[]
      salesProps = (propsRes.data ?? []) as DashProperty[]
      salesReferrals = (referralsRes.data ?? []) as DashReferral[]
      allReports = (reportsRes.data ?? []) as ProgressReportRow[]
      wonChanges = (wonRes.data ?? []) as Array<{ entity_id: string; created_at: string }>
      assigneeChanges = (assigneeRes.data ?? []) as Array<{ entity_id: string; metadata: { op?: string; role?: string } | null }>
      comms = (commsRes.data ?? []) as Array<{ case_id: string; communicated_at: string | null; detail: string | null }>
    } catch { /* migration 未適用環境では空扱い */ }
  }

  // チーム案件のうち、自分が担当していない案件の案件報告を取る（チームで確認を回すため）
  const teamOnlyCaseIds = [...teamCaseIds].filter(id => !myCaseIds.has(id))
  if (teamOnlyCaseIds.length > 0) {
    try {
      const { data } = await supabase.from('progress_reports')
        .select('*, cases(case_number, deal_name)').in('case_id', teamOnlyCaseIds)
      teamReports = (data ?? []) as typeof teamReports
    } catch { /* migration 未適用環境では空扱い */ }
  }

  // === 受注担当向け クレーム報告(受信) === migration 201 未適用時は空扱い
  type SalesComplaintRow = {
    id: string
    case_id: string
    case_number: string
    deal_name: string
    requesterName: string | null
    requested_date: string | null
    severity: '少し不満' | '不満' | 'クレーム' | '大クレーム'
    contact_method: string | null
    detail: string | null
    action: '謝罪・即対応（完結）' | '謝罪・受注相談' | null
    status: '依頼中' | '確認済'
    confirmed_date: string | null
    confirmerName: string | null
  }
  let salesComplaintRows: SalesComplaintRow[] = []
  if (isSales && salesCaseIdArray.length > 0) {
    try {
      const { data: cRaw } = await supabase.from('case_complaints').select('*').in('case_id', salesCaseIdArray)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = (cRaw ?? []) as any[]
      salesComplaintRows = list.map(r => {
        const c = myCases.find(x => x.id === r.case_id)
        return {
          id: r.id, case_id: r.case_id,
          case_number: c?.case_number ?? '', deal_name: c?.deal_name ?? '',
          requesterName: r.requester_id ? memberById.get(r.requester_id) ?? null : (r.created_by ? memberById.get(r.created_by) ?? null : null),
          requested_date: r.requested_date ?? r.occurred_at ?? null,
          severity: r.severity, contact_method: r.contact_method, detail: r.detail, action: r.action,
          status: (r.status ?? '依頼中') as '依頼中' | '確認済',
          confirmed_date: r.confirmed_date ?? null,
          confirmerName: r.confirmer_id ? memberById.get(r.confirmer_id) ?? null : null,
        }
      }).sort((a, b) => {
        if (a.status !== b.status) return a.status === '依頼中' ? -1 : 1
        return (b.requested_date ?? '').localeCompare(a.requested_date ?? '')
      })
    } catch { /* migration 201 未適用時は空 */ }
  }
  const salesPendingComplaintsCount = salesComplaintRows.filter(r => r.status === '依頼中').length

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
  // 案件の色はアラートの最大深刻度で決める（要注意/要確認バナーとまったく同じ判定）。
  // 判定は alertRules.ts、判定材料の取得は caseAlertContext.ts の1か所ずつ。
  const alertCtx = await fetchCaseAlertContexts(supabase, caseIdArray, todayStr)
  const caseAlertHits = new Map(myCases.map(c => [c.id, evaluateCaseAlerts(c, alertCtx.get(c.id) ?? {}, todayStr)]))

  // 一覧（MyPageCasesTab）は対応中のみ表示するため、サマリも対応中のみで集計して件数を揃える。
  // 完了割合・サイクルは scopedCases 全体（完了案件含む）で計算されるので影響しない。
  const boardKpis = computeProgressKpis(boardDashCases, boardTasks, ymToday, today, invoices, new Set(['対応中']), caseAlertHits)

  // タスクを案件ごとにグルーピング（進捗・次タスク算出用）
  const tasksByCase = new Map<string, BoardTask[]>()
  for (const t of boardTasks) {
    if (!tasksByCase.has(t.case_id)) tasksByCase.set(t.case_id, [])
    tasksByCase.get(t.case_id)!.push(t)
  }
  const isOpen = (s: string) => s !== '完了' && s !== 'キャンセル'
  // 案件ごと: 次の未完了タスク / 進捗を task_kind 別(事務管理=case / 受注管理=system)に分けて集計
  type OverdueTaskLite = { id: string; title: string; due_date: string; over: number; severity: OverdueSeverity | null }
  const progressByCase = new Map<string, {
    nextCaseTaskId: string | null; nextCaseTaskTitle: string | null       // 事務管理側の次の未完了
    nextSystemTaskId: string | null; nextSystemTaskTitle: string | null   // 受注/管理側の次の未完了
    overdueCaseTasks: OverdueTaskLite[]                                   // 事務管理側の遅延タスク(古い順)
    overdueSystemTasks: OverdueTaskLite[]                                 // 受注/管理側の遅延タスク(古い順)
    done: number; total: number       // 総合(後方互換)
    doneCase: number; totalCase: number       // 事務管理タスク
    doneSystem: number; totalSystem: number   // 受注/管理担当タスク
  }>()
  // 期日超過(due_date < today) の未完了タスクを 全件 抽出。
  //   severity: 14日以上=chui(濃赤) / 5営業日以上=kakunin(琥珀) / それ未満=null(通常赤)
  //   ※ 進捗バーが赤くなる基準と揃えるため、軽微(1〜4営業日)超過も一覧に含める。
  const buildOverdueList = (ts: BoardTask[]): OverdueTaskLite[] => {
    const list: OverdueTaskLite[] = []
    for (const t of ts) {
      if (!isOpen(t.status) || !t.due_date) continue
      if (t.due_date >= todayStr) continue
      const sev = overdueSeverity(t.due_date, todayStr)
      list.push({ id: t.id, title: t.title, due_date: t.due_date, over: calDaysOverdue(t.due_date, todayStr), severity: sev })
    }
    return list.sort((a, b) => a.due_date.localeCompare(b.due_date))
  }
  for (const [cid, ts] of tasksByCase) {
    const sorted = [...ts].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const caseTs = ts.filter(t => t.task_kind === 'case')
    const systemTs = ts.filter(t => t.task_kind === 'system')
    const nextCase = sorted.find(t => t.task_kind === 'case' && isOpen(t.status)) ?? null
    const nextSystem = sorted.find(t => t.task_kind === 'system' && isOpen(t.status)) ?? null
    progressByCase.set(cid, {
      nextCaseTaskId: nextCase?.id ?? null,
      nextCaseTaskTitle: nextCase?.title ?? null,
      nextSystemTaskId: nextSystem?.id ?? null,
      nextSystemTaskTitle: nextSystem?.title ?? null,
      overdueCaseTasks: buildOverdueList(caseTs),
      overdueSystemTasks: buildOverdueList(systemTs),
      done: ts.filter(t => t.status === '完了').length,
      total: ts.length,
      doneCase: caseTs.filter(t => t.status === '完了').length,
      totalCase: caseTs.length,
      doneSystem: systemTs.filter(t => t.status === '完了').length,
      totalSystem: systemTs.length,
    })
  }

  // タスク期限超過: 未完了タスクで期限切れがある案件
  const overdueCaseIds = new Set<string>()
  for (const t of boardTasks) {
    if (t.due_date && t.due_date < todayStr && isOpen(t.status)) overdueCaseIds.add(t.case_id)
  }

  // 案件ごと: 週次報告状況（最新の進捗報告。確認済でも7日経過していれば「未対応」に戻す）
  //   ※ 案件再オープン等の kind は週次報告状況の判定には含めない
  const latestReportByCase = new Map<string, ProgressReportRow>()
  for (const pr of allReports) {
    if ((pr.kind ?? 'progress_check') !== 'progress_check') continue
    const cur = latestReportByCase.get(pr.case_id)
    const isOpenReq = pr.status === '依頼中'
    if (!cur) { latestReportByCase.set(pr.case_id, pr); continue }
    if (isOpenReq && cur.status !== '依頼中') { latestReportByCase.set(pr.case_id, pr); continue }
    if ((pr.requested_date ?? '') > (cur.requested_date ?? '')) latestReportByCase.set(pr.case_id, pr)
  }
  // 案件再オープン回数 (progress_reports.kind='case_reopen')
  const reopenCountByCase = new Map<string, number>()
  for (const pr of allReports) {
    if (pr.kind !== 'case_reopen') continue
    reopenCountByCase.set(pr.case_id, (reopenCountByCase.get(pr.case_id) ?? 0) + 1)
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

  // 案件行のアラートチップ用シグナル（前受金の状態は他の表示でも使う）
  const advanceStatusByCase = new Map<string, string>()
  for (const i of invoices) if (i.invoice_type === '前受金' && !advanceStatusByCase.has(i.case_id)) advanceStatusByCase.set(i.case_id, i.status)

  const myCasesEnriched = myCases.map(c => {
    // 案件行のアラートチップ。案件の状態そのものなので、受注担当ぶんも管理担当ぶんも同じに出す。
    const hits = caseAlertHits.get(c.id) ?? []
    const alertChips = hits.map(h => ({
      key: h.key,
      label: h.category,
      severity: h.severity,
      href: h.href ?? (h.tab ? `/cases/${c.id}?tab=${h.tab}` : `/cases/${c.id}`),
    }))
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
      sub_manager_name: subManagerByCase.get(c.id) ?? null,
      procedure_type: c.procedure_type,
      order_sheet_completed_at: c.order_sheet_completed_at,
      // 進捗（次の未完了タスク + 完了/総数）＋ task_kind別 進捗 + 期限超過フラグ
      nextTaskId: prog?.nextSystemTaskId ?? prog?.nextCaseTaskId ?? null,
      nextTaskTitle: prog?.nextSystemTaskTitle ?? prog?.nextCaseTaskTitle ?? null,
      nextCaseTaskId: prog?.nextCaseTaskId ?? null,
      nextCaseTaskTitle: prog?.nextCaseTaskTitle ?? null,
      nextSystemTaskId: prog?.nextSystemTaskId ?? null,
      nextSystemTaskTitle: prog?.nextSystemTaskTitle ?? null,
      overdueCaseTasks: prog?.overdueCaseTasks ?? [],
      overdueSystemTasks: prog?.overdueSystemTasks ?? [],
      progressDone: prog?.done ?? 0,
      progressTotal: prog?.total ?? 0,
      progressCaseDone: prog?.doneCase ?? 0,
      progressCaseTotal: prog?.totalCase ?? 0,
      progressSystemDone: prog?.doneSystem ?? 0,
      progressSystemTotal: prog?.totalSystem ?? 0,
      hasOverdueTask: overdueCaseIds.has(c.id),
      reopenCount: reopenCountByCase.get(c.id) ?? 0,
      // 週次報告状況
      weeklyStatus: weeklyStatusOf(c.id),
      // 直近お客様報告
      lastCommDate: lastComm?.date ?? null,
      lastCommDetail: lastComm?.detail ?? null,
      alertChips,
      flag: MGMT_ACTIVE_STATUSES.has(c.status) ? computeCaseFlag(c, hits) : null,
    }
  })

  // === 相談案件一覧（受注担当のみ） ===
  const salesDashCases: DashCase[] = applyReferralFlags(
    myCases
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
      })),
    salesReferrals,
  )

  const salesMetrics = selectedPeriod === 'all'
    ? cumulativeSalesMetrics(fiscalMonths.map(m => computeSalesMetrics(salesDashCases, salesChanges, m, salesProps)))
    : selectedPeriod === 'today'
      ? computeSalesMetricsForDay(salesDashCases, salesChanges, today, salesProps)
      : computeSalesMetrics(salesDashCases, salesChanges, selectedPeriod, salesProps)

  // === 月間目標（受注担当のみ・新規受注件数の1つだけ。管理担当に目標は無い）===
  // 期間切替に関係なく「当月」で判定する。先月ぶんは入力時の参考表示に使う。
  const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const prevYm = `${prevMonthDate.getFullYear()}-${pad(prevMonthDate.getMonth() + 1)}`
  let myTargetThis: number | null = null
  let myTargetPrev: number | null = null
  if (isSales) {
    const { data: mtRaw } = await supabase
      .from('member_targets')
      .select('ym,new_orders_count')
      .eq('member_id', memberId)
      .in('ym', [ymToday, prevYm])
    for (const r of (mtRaw ?? []) as Array<{ ym: string; new_orders_count: number | null }>) {
      if (r.ym === ymToday) myTargetThis = r.new_orders_count ?? null
      if (r.ym === prevYm) myTargetPrev = r.new_orders_count ?? null
    }
  }
  const monthSalesMetrics = isSales ? computeSalesMetrics(salesDashCases, salesChanges, ymToday, salesProps) : null
  // 先月は activity_log の取得範囲（年度初〜）に入っているときだけ出す
  const prevSalesMetrics = isSales && fiscalMonths.includes(prevYm)
    ? computeSalesMetrics(salesDashCases, salesChanges, prevYm, salesProps)
    : null
  const targetAchieved = !!(myTargetThis && myTargetThis > 0 && monthSalesMetrics && monthSalesMetrics.newOrdersCount >= myTargetThis)

  let consultCasesArr = myCases.filter(c => salesCaseIds.has(c.id) && CONSULT_STATUSES.has(c.status))
  // 集計基準日：面談実施日 → 面談予定日 → 案件作成日（面談日未入力の案件も期間から漏れないようにフォールバック）
  const consultBaseDate = (c: MyCase): string | null =>
    c.meeting_executed_date || c.meeting_date || (c.created_at ? c.created_at.slice(0, 10) : null)
  if (selectedPeriod === 'today') {
    consultCasesArr = consultCasesArr.filter(c => consultBaseDate(c) === todayStr)
  } else if (selectedPeriod !== 'all') {
    consultCasesArr = consultCasesArr.filter(c => consultBaseDate(c)?.startsWith(selectedPeriod))
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
  const buildConsultRow = (c: MyCase): ConsultCase => {
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
      sub_manager_name: subManagerByCase.get(c.id) ?? null,
      procedure_type: c.procedure_type,
      order_amount: c.fee_administrative && c.fee_administrative > 0 ? c.fee_administrative : (c.fee_judicial ?? null),
      order_sheet_completed_at: c.order_sheet_completed_at,
      newOrderUnassigned,
      assigneeChanged,
      assignOverdue: newOrderUnassigned && daysSinceWon !== null && daysSinceWon >= ASSIGN_DEADLINE_DAYS,
      meetingMemoMissing,
    }
  }
  const consultRows: ConsultCase[] = consultCasesArr.map(buildConsultRow)

  // === 未着手案件（依頼確定待ち/受注/戻り受注/作業着手準備）。受注担当・管理担当 両方のマイページに表示 ===
  const prepCasesArr = myCases.filter(c => PREP_STATUSES.has(c.status))
  const prepRows: ConsultCase[] = prepCasesArr.map(buildConsultRow)

  // === 個別管理案件（紹介のみ） ===
  const referralCases = myCases.filter(c => REFERRAL_STATUSES.has(c.status))

  // === 自分宛タスク（担当者ベース） ===
  // task_assignees で自分に紐付く未完了タスク（roleTaskRows は既にDB側で絞り込み済み）。
  // システムタスク・案件タスクを問わず「自分が担当のもの」を1リストに統合表示する。
  // 作成者名は既存のメンバー一覧から解決（migration191未適用でも created_by が無いだけで安全）
  const memberNameById = new Map((allMembersRaw ?? []).map(m => [m.id, m.name]))
  const roleTasks = roleTaskRows.map(t => ({
    ...t,
    created_by_member: t.created_by ? ({ name: memberNameById.get(t.created_by) ?? null } as TaskRow['created_by_member']) : null,
  }))
  const roleTaskTitle = isSales ? '受注担当タスク' : isManager ? '管理担当タスク' : '自分のタスク'
  const taskTabCount = roleTasks.length

  // === 要対応（入金期日・タスク期日の超過）===
  const normStatus = (s: string) => s === '未着手' ? '着手前' : (['Wチェック待ち', '保留'].includes(s) ? '対応中' : s === 'キャンセル' ? '完了' : s)
  const caseNameById = new Map(myCaseRowsArr.map(r => [r.case_id, ((r.cases as { deal_name?: string } | null)?.deal_name) ?? '']))
  const firmLabelOf = (f: string | null) => f === 'shiho' ? '司法' : f === 'gyosei' ? '行政' : ''
  const overdueBills: OverdueBill[] = invoices
    .map(inv => ({ inv, sev: inv.status === '入金待ち' ? billOverdueSeverity(inv.due_date, todayStr) : null }))
    .filter((x): x is { inv: typeof invoices[number]; sev: OverdueSeverity } => x.sev !== null)
    .map(({ inv, sev }) => ({
      id: inv.id, caseId: inv.case_id, caseName: caseNameById.get(inv.case_id) ?? '',
      typeLabel: inv.invoice_type ?? '', firmLabel: firmLabelOf(inv.firm_type ?? null),
      amount: inv.amount ?? 0, dueDate: inv.due_date as string,
      over: calDaysOverdue(inv.due_date as string, todayStr), severity: sev,
    }))
  const overdueTasks: OverdueTaskItem[] = roleTasks
    // 超急ぎの未完了タスクは期日超過してなくても要注意(chui)として常時バナーに出す。それ以外は期日超過で判定。
    .map(t => {
      if (!['着手前', '対応中'].includes(normStatus(t.status))) return { t, sev: null as OverdueSeverity | null }
      const sev: OverdueSeverity | null = t.priority === '超急ぎ' ? 'chui' : overdueSeverity(t.due_date, todayStr)
      return { t, sev }
    })
    .filter((x): x is { t: typeof roleTasks[number]; sev: OverdueSeverity } => x.sev !== null)
    .map(({ t, sev }) => ({ task: t, severity: sev, over: t.due_date ? Math.max(0, calDaysOverdue(t.due_date, todayStr)) : 0 }))

  // 案件アラート（管理担当 未アサイン等・レコード無しの計算アラート）。受注担当が持つ案件が対象。
  // チームの案件（自分の案件＋チームメンバーの案件）の表示名。案件報告アラートで使う。
  const teamCaseMeta = new Map<string, { case_number: string; deal_name: string }>([
    ...myCases.filter(c => teamCaseIds.has(c.id)).map(c => [c.id, { case_number: c.case_number, deal_name: c.deal_name }] as const),
    ...teamReports.map(r => [r.case_id, { case_number: r.cases?.case_number ?? '', deal_name: r.cases?.deal_name ?? '' }] as const),
  ])
  // 到着物あり（受注/管理宛の郵送物一式・未開封）→ 要確認バナー。自分が受注/管理担当の案件が対象。
  const myAllCaseIds = [...new Set([...salesCaseIds, ...managerCaseIds])]
  const { data: parcelRows } = myAllCaseIds.length
    ? await supabase.from('document_receipts').select('id, case_id, cases(case_number, deal_name)')
        .in('case_id', myAllCaseIds).eq('is_parcel', true).not('arrival_notified_at', 'is', null).is('opened_at', null)
    : { data: [] }
  const parcelAlerts = computeParcelArrivalAlerts(
    ((parcelRows ?? []) as unknown as Array<{ id: string; case_id: string; arrival_notified_at: string | null; cases: { case_number: string; deal_name: string } | null }>)
      .map(p => ({ id: p.id, case_id: p.case_id, case_number: p.cases?.case_number ?? '', deal_name: p.cases?.deal_name ?? '', notified_at: p.arrival_notified_at })),
    todayStr,
  )

  const bannerCaseAlerts = [
    // 案件アラート。案件の色（進捗管理ボードのフラグ）とまったく同じ判定・同じ材料を使う。
    // 判定は alertRules.ts、材料の取得は caseAlertContext.ts。ここで別に組み立てない。
    ...myCases.flatMap(c => (caseAlertHits.get(c.id) ?? []).flatMap(h => {
      const sev = bannerOf(h.severity)
      if (!sev) return []
      return [{
        caseId: c.id, caseNumber: c.case_number, dealName: c.deal_name,
        category: h.category, severity: sev, since: h.since, days: h.days, reason: h.reason,
        href: h.href ?? (h.tab ? `/cases/${c.id}?tab=${h.tab}` : undefined),
      }]
    })),
    // 案件報告「至急！！」（未確認）→ 要注意(赤)。受注担当の案件が対象。
    // 案件報告のアラートはチームの案件まで広げる。受注担当が確認できないまま3営業日たったものを
    // チーム全員の要確認バナーに出し、手が空いている人が代わりに確認できるようにする。
    ...computeUrgentReportAlerts(
      [...allReports.filter(r => teamCaseIds.has(r.case_id)), ...teamReports],
      teamCaseMeta,
      todayStr,
    ),
    // 到着物あり（未開封）→ 要確認(黄)
    ...parcelAlerts,
  ]


  // 期間切替の選択肢（本日／当月／当期累計）
  const periodOptions: Array<{ key: string; label: string }> = [
    { key: 'today', label: '本日' },
    { key: ymToday, label: '当月' },
    { key: 'all', label: '当期累計' },
  ]

  const meetingCount = consultCasesArr.length
  const prepCount = prepCasesArr.length
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
        confirmerName: rep?.confirmer_id ? memberById.get(rep.confirmer_id) ?? null : null,
        requestedDate: rep?.requested_date ?? null,
        confirmedDate: rep?.confirmed_date ?? null,
        reviewPoint: rep?.review_point ?? null,
        confirmComment: rep?.confirm_comment ?? null,
      }
    })
  // 確認者の候補（全アクティブメンバー）
  const confirmerCandidates = ((allMembersRaw ?? []) as Array<{ id: string; name: string }>)
    .map(m => ({ id: m.id, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  // === 受注担当向け 案件報告受信 (統一報告 4種類全部) ===
  // 自分が受注担当の案件で、届いている案件報告(依頼中=報告中の未確認 + 履歴)を一覧する。
  // kind: progress_check / work_complete / case_reopen / delivery_confirm
  type SalesProgressRow = {
    reportId: string
    case_id: string
    case_number: string
    deal_name: string
    requesterName: string | null
    requestedDate: string | null
    reviewPoint: string | null
    status: '依頼中' | '確認済'
    confirmedDate: string | null
    confirmerName: string | null
    kind: 'progress_check' | 'work_complete' | 'case_reopen' | 'delivery_confirm'
    /** own=自分が受注担当の案件 / team=同じチームの案件 */
    scope: 'own' | 'team'
  }
  const ownReportRows: SalesProgressRow[] = allReports
    .filter(r => salesCaseIds.has(r.case_id))
    .map(r => {
      const c = myCases.find(x => x.id === r.case_id)
      return {
        reportId: r.id, case_id: r.case_id,
        case_number: c?.case_number ?? '', deal_name: c?.deal_name ?? '',
        requesterName: r.requester_id ? memberById.get(r.requester_id) ?? null : null,
        requestedDate: r.requested_date ?? null,
        reviewPoint: r.review_point ?? null,
        status: (r.status ?? '依頼中') as '依頼中' | '確認済',
        confirmedDate: r.confirmed_date ?? null,
        confirmerName: r.confirmer_id ? memberById.get(r.confirmer_id) ?? null : null,
        kind: (r.kind ?? 'progress_check') as SalesProgressRow['kind'],
        scope: 'own' as const,
      }
    })
  // チームの案件（自分が担当していないもの）。確認は誰が押しても良いので同じ表に並べる。
  const teamReportRows: SalesProgressRow[] = teamReports.map(r => ({
    reportId: r.id, case_id: r.case_id,
    case_number: r.cases?.case_number ?? '', deal_name: r.cases?.deal_name ?? '',
    requesterName: r.requester_id ? memberById.get(r.requester_id) ?? null : null,
    requestedDate: r.requested_date ?? null,
    reviewPoint: r.review_point ?? null,
    status: (r.status ?? '依頼中') as '依頼中' | '確認済',
    confirmedDate: r.confirmed_date ?? null,
    confirmerName: r.confirmer_id ? memberById.get(r.confirmer_id) ?? null : null,
    kind: (r.kind ?? 'progress_check') as SalesProgressRow['kind'],
    scope: 'team' as const,
  }))
  const salesProgressRows: SalesProgressRow[] = [...ownReportRows, ...teamReportRows]
    .sort((a, b) => {
      // 報告中を上に → 自分の案件を先に → 日付の新しい順
      if (a.status !== b.status) return a.status === '依頼中' ? -1 : 1
      if (a.scope !== b.scope) return a.scope === 'own' ? -1 : 1
      return (b.requestedDate ?? '').localeCompare(a.requestedDate ?? '')
    })

  // 受注担当のタブバッジ用: 完了していない = 依頼中(=報告中)
  const salesPendingProgressCount = ownReportRows.filter(r => r.status === '依頼中').length
  // 管理担当のタブバッジ用: まだ報告していない or 相手が確認中 = 依頼中
  const managerPendingProgressCount = managerProgressRows.filter(r => r.status === '依頼中').length

  // === 報連相 受信（自分が通知先=recipient_ids に含まれる case_reports） ===
  // 案件報告(progress_reports)とは別テーブル。承認は無く「確認する」のみ。案件をまたいで横断表示。
  type CaseReportRaw = {
    id: string; case_id: string; kind: string
    requester_id: string | null; recipient_ids: string[] | null; message: string | null
    requested_date: string | null; status: CaseReportStatus; confirmer_id: string | null; confirmed_date: string | null
    cases: { case_number: string; deal_name: string } | null
  }
  let hourensouRaw: CaseReportRaw[] = []
  {
    const { data } = await supabase
      .from('case_reports')
      .select('id, case_id, kind, requester_id, recipient_ids, message, requested_date, status, confirmer_id, confirmed_date, cases(case_number, deal_name)')
      .contains('recipient_ids', [memberId])
      .order('requested_date', { ascending: false })
    hourensouRaw = (data ?? []) as unknown as CaseReportRaw[]
  }
  const hourensouRows: HourenSouItem[] = hourensouRaw
    .map(r => ({
      id: r.id, caseId: r.case_id,
      caseNumber: r.cases?.case_number ?? '', dealName: r.cases?.deal_name ?? '',
      kind: r.kind,
      personLabel: (r.requester_id ? memberById.get(r.requester_id) : null) ?? '',
      requestedDate: r.requested_date, message: r.message,
      status: r.status, confirmedDate: r.confirmed_date,
      confirmerName: r.confirmer_id ? memberById.get(r.confirmer_id) ?? null : null,
      isMine: r.requester_id === memberId,
    }))
    .sort((a, b) => (b.requestedDate ?? '').localeCompare(a.requestedDate ?? ''))
  // 情報共有＝見ておくもの／要対応＝回答が要るもの。タブを分ける。
  const shareRows = hourensouRows.filter(r => r.kind !== '要対応')
  const actionRows = hourensouRows.filter(r => r.kind === '要対応')
  // タブバッジ: 未回答（依頼中）かつ自分が送ったものでない
  const hourensouPendingCount = shareRows.filter(r => r.status === '依頼中' && !r.isMine).length
  const hourensouActionCount = actionRows.filter(r => r.status !== '確認済' && !r.isMine).length

  // 請求タブ: 自分が担当（受注/管理いずれか）として関与する全案件の請求を対象にする。
  //   （旧: 管理担当は managerCaseIds のみ → 自分が受注担当で持っている案件の請求が出ない不具合があった）
  const billingScopeIds = (isManager || isSales) ? myCaseIds : new Set<string>()

  // 請求タブは /billing（BillingClient）と同一UI・操作にする（CSV突合以外）。自分の案件にスコープ。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let billingInvoices: any[] = []
  let billingRequests: BillingRequestRow[] = []
  const billingCaseOptions = myCases.filter(c => billingScopeIds.has(c.id)).map(c => ({ id: c.id, case_number: c.case_number, deal_name: c.deal_name }))
  if ((isManager || isSales) && billingScopeIds.size > 0) {
    const scopeArr = Array.from(billingScopeIds)
    const [invRes, reqRes] = await Promise.all([
      supabase.from('invoices')
        .select('*, cases(id, case_number, deal_name, deceased_name, status, contract_type, billing_pattern, order_route, order_route_detail, clients(*), case_members(*, members(*))), payments(*), payment_check_requests(id, status, result_note, requested_date, confirmed_date, confirmer_id, auto_closed)')
        .in('case_id', scopeArr).order('created_at', { ascending: false }),
      supabase.from('payment_check_requests')
        .select('id, invoice_id, case_id, kind, status, requested_date, requester_id, request_note, result_note, resolution, reason_category, fee_bearer, refund_amount, approval_status, sales_approver_id, leader_approver_id, sales_approved_at, leader_approved_at, requester:members!payment_check_requests_requester_id_fkey(name), invoices(cases(case_number, deal_name))')
        .in('kind', ['confirm', 'refund']).neq('status', '完了').in('case_id', scopeArr),
    ])
    billingInvoices = invRes.data ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    billingRequests = ((reqRes.data ?? []) as any[]).map(r => {
      const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices
      const cs = inv && (Array.isArray(inv.cases) ? inv.cases[0] : inv.cases)
      return {
        id: r.id, invoice_id: r.invoice_id, case_id: r.case_id, kind: r.kind as 'confirm' | 'refund', status: r.status,
        requested_date: r.requested_date,
        requester_id: r.requester_id, request_note: r.request_note, result_note: r.result_note, resolution: r.resolution,
        reason_category: r.reason_category, fee_bearer: r.fee_bearer, refund_amount: r.refund_amount,
        approval_status: r.approval_status ?? null,
        sales_approver_id: r.sales_approver_id ?? null,
        leader_approver_id: r.leader_approver_id ?? null,
        sales_approved_at: r.sales_approved_at ?? null,
        leader_approved_at: r.leader_approved_at ?? null,
        requesterName: r.requester?.name ?? null,
        caseNumber: cs?.case_number ?? '', dealName: cs?.deal_name ?? '',
      }
    })
  }

  // 入金期日超過アラート（受注担当）: 自分の案件で、入金期日を過ぎた未入金の請求。
  const overdueInvoices = isSales
    ? invoices.filter(i => salesCaseIds.has(i.case_id) && i.due_date && i.due_date < todayStr && i.status !== '入金済')
    : []
  const overduePaymentCount = new Set(overdueInvoices.map(i => i.case_id)).size

  // === タブ構成（役割 + 確認依頼の有無で決定） ===
  const showProgress = isManager || isSales
  const progressBadgeCount = isManager ? managerPendingProgressCount : salesPendingProgressCount
  // 報連相 受信タブ：受注/管理担当に加え、報連相を受け取ったことのある人（相続登記チーム等）にも出す
  const showHourensou = isManager || isSales || hourensouRaw.length > 0
  const validTabs: TabKey[] = []
  if (isSales) validTabs.push('meetings')
  if (isSales || isManager) validTabs.push('prep')
  validTabs.push('cases')
  if (isManager || isSales) validTabs.push('billing')
  if (isSales) validTabs.push('referrals')
  if (showProgress) validTabs.push('progress')
  if (showHourensou) validTabs.push('hourensou')
  if (showHourensou) validTabs.push('hourensouAction')
  // クレーム報告受信タブ（受注担当のみ）
  if (isSales) validTabs.push('complaints')
  validTabs.push('tasks')
  const defaultTab: TabKey = isSales ? 'meetings' : 'cases'
  const activeTab: TabKey = (validTabs as string[]).includes(tab ?? '') ? (tab as TabKey) : defaultTab

  return (
    <div>
      {/* マイページ専用ヘッダー：氏名(左)と 要確認/要注意バナー を同じ行に置き、バナーは中央寄せ。面談登録(受注担当)は右端。 */}
      <div className="mb-5">
        <p className="text-xs font-medium text-brand-600 tracking-wider uppercase">My</p>
        <div className="flex items-center gap-4 mt-1 flex-wrap">
          {/* 氏名＋目標チップ＋アラート（左）。称号は名前の真上にアイコンだけ並べる。 */}
          <div className="flex items-end gap-2.5 flex-wrap flex-none">
            <div className="flex flex-col items-start">
              <div className="ml-8">
                <RankingBadges
                  badges={myBadges}
                  achieved={targetAchieved}
                  achievedTitle={`${today.getMonth() + 1}月の目標を達成！`}
                />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <UserCircle className="w-6 h-6 text-brand-600 flex-shrink-0" strokeWidth={2} />
                <span className="truncate">{user.memberName ?? 'マイページ'}</span>
              </h1>
            </div>
            {/* 月間目標は受注担当のみ（管理担当に目標は無い） */}
            {isSales && (
              <MyTargetChip
                memberId={memberId}
                ym={ymToday}
                monthLabel={`${today.getMonth() + 1}月`}
                target={myTargetThis}
                actual={monthSalesMetrics?.newOrdersCount ?? 0}
                lastMonth={prevSalesMetrics
                  ? { monthLabel: `${prevMonthDate.getMonth() + 1}月`, target: myTargetPrev, actual: prevSalesMetrics.newOrdersCount }
                  : null}
              />
            )}
            <MyAlertCenter />
          </div>
          {/* 要対応バナー（残りスペースの中央に、氏名と同じ行の高さで） */}
          {(isSales || isManager) && (
            <div className="flex-1 flex justify-center min-w-[280px]">
              <OverdueAttention bills={overdueBills} tasks={overdueTasks} caseAlerts={bannerCaseAlerts} currentMemberId={memberId} />
            </div>
          )}
          {/* 面談登録（受注担当のみ・右端） */}
          {isSales && (
            <Link href="/intake" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white bg-brand-600 border border-brand-600 hover:bg-brand-700 transition-colors flex-none">
              <PenSquare className="w-4 h-4" strokeWidth={2} />面談登録
            </Link>
          )}
        </div>
        <p className="text-[13px] text-gray-500 mt-1">{isSales ? '受注担当のマイページ — あなたのみ閲覧できます' : isManager ? '管理担当のマイページ — あなたのみ閲覧できます' : 'マイページ — あなたのみ閲覧できます'}</p>
      </div>

      {/* システム管理者: 受注ビュー / 管理ビュー の切替（2タブ分） */}
      {sysMgr && (
        <div className="flex gap-2 mb-4">
          <a
            href="/my?as=manager"
            className={`px-4 py-2 rounded-lg text-[13px] font-semibold border transition-colors ${isManager ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >管理担当ビュー</a>
          <a
            href="/my?as=sales"
            className={`px-4 py-2 rounded-lg text-[13px] font-semibold border transition-colors ${isSales ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >受注担当ビュー</a>
        </div>
      )}

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 flex-wrap">
        {isSales && (
          <TabLink href={`/my?tab=meetings${asSuffix}`} label={`相談案件一覧 (${meetingCount})`} Icon={MessageSquare} active={activeTab === 'meetings'} />
        )}
        {(isSales || isManager) && (
          <TabLink href={`/my?tab=prep${asSuffix}`} label={`未着手案件一覧 (${prepCount})`} Icon={ClipboardList} active={activeTab === 'prep'} />
        )}
        <TabLink href={`/my?tab=cases${asSuffix}`} label="管理案件一覧" Icon={ClipboardList} active={activeTab === 'cases'} />
        {isManager && (
          <TabLink href={`/my?tab=billing${asSuffix}`} label={`請求 (${billingInvoices.length})`} Icon={Receipt} active={activeTab === 'billing'} />
        )}
        {isSales && (
          <TabLink href={`/my?tab=referrals${asSuffix}`} label={`個別案件一覧 (${referralCount})`} Icon={Sparkles} active={activeTab === 'referrals'} />
        )}
        {isSales && (
          <TabLink href={`/my?tab=billing${asSuffix}`} label={`請求状況${overduePaymentCount > 0 ? ` (期日超過 ${overduePaymentCount})` : ''}`} Icon={Receipt} active={activeTab === 'billing'} />
        )}
        {showProgress && (
          <TabLink href={`/my?tab=progress${asSuffix}`} label={`案件報告${progressBadgeCount > 0 ? ` (${progressBadgeCount})` : ''}`} Icon={ClipboardCheck} active={activeTab === 'progress'} />
        )}
        {showHourensou && (
          <TabLink href={`/my?tab=hourensou${asSuffix}`} label={`報連相（情報共有）${hourensouPendingCount > 0 ? ` (${hourensouPendingCount})` : ''}`} Icon={MessagesSquare} active={activeTab === 'hourensou'} />
        )}
        {showHourensou && (
          <TabLink href={`/my?tab=hourensouAction${asSuffix}`} label={`報連相（要対応）${hourensouActionCount > 0 ? ` (${hourensouActionCount})` : ''}`} Icon={MessagesSquare} active={activeTab === 'hourensouAction'} />
        )}
        {isSales && (
          <TabLink href={`/my?tab=complaints${asSuffix}`} label={`クレーム報告${salesPendingComplaintsCount > 0 ? ` (${salesPendingComplaintsCount})` : ''}`} Icon={AlertTriangle} active={activeTab === 'complaints'} />
        )}
        <TabLink href={`/my?tab=tasks${asSuffix}`} label={`タスク (${taskTabCount})`} Icon={ListChecks} active={activeTab === 'tasks'} />
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
            {/* 目標は月単位なので「当月」を見ているときだけ添える */}
            <MeetingKpi
              label="受注数"
              value={salesMetrics.newOrdersCount}
              suffix="件"
              target={selectedPeriod === ymToday ? myTargetThis : null}
            />
            <MeetingKpi label="受注率" value={salesMetrics.conversionRate === null ? null : Math.round(salesMetrics.conversionRate * 1000) / 10} suffix="%" />
            <MeetingKpi label="受注単価" value={salesMetrics.avgOrderUnit === null ? null : Math.round(salesMetrics.avgOrderUnit / 10000)} suffix="万円" />
            <MeetingKpi label="不動産査定" value={salesMetrics.propertyAppraisalCount} suffix="件" />
          </div>

          <ConsultationCasesTable cases={consultRows} selectable statusFilters={['検討中', '失注']} />
        </div>
      )}

      {/* 未着手案件一覧（依頼確定待ち/受注/戻り受注/作業着手準備）。受注担当・管理担当 両方に表示 */}
      {activeTab === 'prep' && (isSales || isManager) && (
        <div className="space-y-4">
          <p className="text-[12px] text-gray-500">受注が見えてから作業進行中に入るまでの準備段階の案件（依頼確定待ち・受注・戻り受注・作業着手準備）。</p>
          <ConsultationCasesTable cases={prepRows} selectable statusFilters={['検討中（契約書待ち）', '受注', '戻り受注', '作業着手準備']} />
        </div>
      )}

      {/* 管理案件一覧（進捗管理ダッシュボードと同じ見た目） */}
      {activeTab === 'cases' && (
        <div>
          <ProgressKpis scopeLabel={user.memberName ?? 'あなた'} metrics={boardKpis} />
          <MyPageCasesTab memberId={memberId} cases={myCasesEnriched} selectable withStatusFilter />
        </div>
      )}

      {/* 請求（管理担当＝請求 / 受注担当＝請求状況）: 案件ベースの請求一覧 */}
      {activeTab === 'billing' && (isManager || isSales) && (
        <div className="space-y-4">
          {isSales && overduePaymentCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2.25} />
              <span>入金期日を超過した未入金の案件が <span className="font-bold">{overduePaymentCount}件</span> あります。お客様への確認・消込状況をご確認ください。</span>
            </div>
          )}
          {/* /billing と同一UI・操作（CSV突合は経理のみのため非表示）。自分の案件にスコープ。 */}
          <BillingClient invoices={billingInvoices} cases={billingCaseOptions} requests={billingRequests} currentMemberId={memberId} canReconcile={false} embedded />
        </div>
      )}

      {/* 案件報告（管理担当=送信側 / 受注担当=受信側） */}
      {activeTab === 'progress' && showProgress && (
        <div>
          <ProgressKpis scopeLabel={user.memberName ?? 'あなた'} metrics={boardKpis} />
          {isManager && (
            <ProgressReportManagerTab rows={managerProgressRows} candidates={confirmerCandidates} currentMemberId={memberId} />
          )}
          {/* 受信側。案件報告は管理担当→受注担当なので、受け取るのは受注担当だけ。
              自分が受注担当の案件に加え、同じチームの案件も出す（誰が確認しても良い）。 */}
          {isSales && !isManager && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <CaseReportInbox rows={salesProgressRows} pendingOwnCount={salesPendingProgressCount} />
            </div>
          )}
        </div>
      )}


      {/* 報連相（受信）。情報共有＝見ておくもの／要対応＝回答が要るもの でタブを分ける。
          どちらも 未回答／確認中／回答済 のサブタブつき。 */}
      {activeTab === 'hourensou' && showHourensou && (
        <HourenSouTable
          rows={shareRows}
          mode="received"
          title="報連相（情報共有）"
          note="見ておいてほしい共有です。確認したら「確認した」を押します（アラートには出ません）"
          todayStr={todayStr}
        />
      )}

      {activeTab === 'hourensouAction' && showHourensou && (
        <HourenSouTable
          rows={actionRows}
          mode="received"
          title="報連相（要対応）"
          note="回答が無いと相手の作業が止まります。1営業日で要確認・3営業日で要注意のアラートに出ます"
          todayStr={todayStr}
        />
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
      sub_manager_name: subManagerByCase.get(c.id) ?? null,
          }))}
          selectable
        />
      )}

      {/* クレーム報告(受信) — 受注担当のみ */}
      {activeTab === 'complaints' && isSales && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
            <AlertTriangle className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
            <h3 className="text-[14px] font-bold text-gray-900">クレーム報告（受信）</h3>
            <span className="text-[11px] text-gray-400 ml-2">報告中 {salesPendingComplaintsCount} 件</span>
            <span className="ml-auto text-[11px] text-gray-400">案件詳細画面で内容を確認→「確認する」を押します</span>
          </div>
          {salesComplaintRows.length === 0 ? (
            <div className="px-4 py-12 text-center text-[13px] text-gray-400">受信中のクレーム報告はありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]" style={{ minWidth: 1080 }}>
                <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">案件管理番号</th>
                    <th className="px-3 py-2 text-left font-medium">案件名</th>
                    <th className="px-3 py-2 text-left font-medium">報告者</th>
                    <th className="px-3 py-2 text-left font-medium">報告日</th>
                    <th className="px-3 py-2 text-left font-medium">状況</th>
                    <th className="px-3 py-2 text-left font-medium">報告内容</th>
                    <th className="px-3 py-2 text-left font-medium">対応内容</th>
                    <th className="px-3 py-2 text-left font-medium">ステータス</th>
                    <th className="px-3 py-2 text-left font-medium">確認者</th>
                    <th className="px-3 py-2 text-left font-medium">確認日</th>
                    <th className="px-3 py-2 w-32" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {salesComplaintRows.map(r => {
                    const sevCls = r.severity === '大クレーム' ? 'bg-red-600 text-white font-semibold'
                      : r.severity === 'クレーム' ? 'bg-red-100 text-red-800 border border-red-300 font-semibold'
                      : r.severity === '不満' ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                    const actCls = r.action === '謝罪・即対応（完結）' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : r.action === '謝罪・受注相談' ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : ''
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/60">
                        <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{r.case_number}</td>
                        <td className="px-3 py-2.5">
                          <Link href={`/cases/${r.case_id}?tab=progress&sub=complaint`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[220px]">{r.deal_name}</Link>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-gray-700">{r.requesterName || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{r.requested_date ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-[5px] text-[11px] whitespace-nowrap ${sevCls}`}>{r.severity}</span>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-gray-700 max-w-[240px] whitespace-pre-wrap">{r.detail || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5">
                          {r.action ? <span className={`inline-flex px-2 py-0.5 rounded-[5px] text-[11px] whitespace-nowrap ${actCls}`}>{r.action}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${r.status === '確認済' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{r.status === '依頼中' ? '報告中' : '確認済'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-gray-700">{r.confirmerName || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{r.confirmed_date ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-right">
                          {r.status === '依頼中' && (
                            <Link href={`/cases/${r.case_id}?tab=progress&sub=complaint`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50 whitespace-nowrap">確認する</Link>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
            groupTabs={true}
            statusChips={true}
            selectable
            bulkStatus
            showReadyReason
            showExecResult
            showRemain
          />
        </div>
      )}
    </div>
  )
}

function MeetingKpi({ label, value, suffix, target }: { label: string; value: number | null; suffix: string; target?: number | null }) {
  // target を渡したカードだけ、下に「目標 ◯件 ／ 達成率」を出す（当月ビューのみ）
  const showTarget = target !== null && target !== undefined && target > 0
  const rate = showTarget && value !== null ? Math.round((value / target) * 100) : null
  const achieved = rate !== null && rate >= 100
  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm ${achieved ? 'border-emerald-300' : 'border-gray-200'}`}>
      <div className="text-[12px] font-semibold text-gray-500 mb-1.5">{label}</div>
      <div className="text-[24px] font-extrabold tracking-tight text-brand-700 leading-none">
        {value === null ? '—' : value.toLocaleString()}
        <span className="text-[12px] text-gray-400 ml-1 font-normal">{suffix}</span>
      </div>
      {showTarget && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-[11.5px] text-gray-500">
          目標 <span className="font-semibold text-gray-700 tabular-nums">{target}</span>件 ／{' '}
          <span className={`font-semibold tabular-nums ${achieved ? 'text-emerald-600' : 'text-amber-600'}`}>{rate}%</span>
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
