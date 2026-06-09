import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import ProgressKpis from '@/components/features/dashboard/ProgressKpis'
import ProgressCaseTable, { type ProgressCaseRow } from '@/components/features/dashboard/ProgressCaseTable'
import TeamMemberNav, { type TeamNavMember } from '@/components/features/dashboard/TeamMemberNav'
import ProgressViewTabs, { type ProgressView } from '@/components/features/dashboard/ProgressViewTabs'
import BillingCaseTable from '@/components/features/billing/BillingCaseTable'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
import { buildBillingCaseRows } from '@/lib/billingCaseRows'
import {
  computeProgressKpis,
  computeCaseFlag,
  todayJstYmd,
  type DashCase,
  type DashInvoice,
  type DashTask,
} from '@/lib/dashboardMetrics'
import type { TaskRow } from '@/types'
type CaseFull = DashCase & {
  case_number: string
  deal_name: string
  client_id: string | null
  contract_type?: string | null
  advance_payment?: number | null
  fee_administrative?: number | null
  fee_judicial?: number | null
}
type CaseMemberRow = { case_id: string; member_id: string; role: string }
type MemberRow = {
  id: string
  name: string
  avatar_color: string
  avatar_url: string | null
  primary_role: string | null
  job_type: string | null
  joined_at: string | null
  team_id: string | null
}
type InvoiceFull = DashInvoice & {
  id: string
  invoice_number: string | null
  amount: number
  status: string
  invoice_type: string
  firm_type: string | null
}

type Props = {
  params: Promise<{ teamId: string }>
  searchParams: Promise<{ month?: string; view?: string; member?: string; status?: string }>
}

export default async function TeamProgressPage({ params, searchParams }: Props) {
  const { teamId } = await params
  const { month, view: viewParam, member: memberParam } = await searchParams
  const supabase = await createClient()
  const currentUser = await getCurrentUser()
  const currentMemberId = currentUser?.memberId ?? null
  const today = new Date()
  const ymToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  // 月パラメータの解決
  const selectedMonth: string | 'all' = month === 'all' ? 'all' : (month || ymToday)
  const selectedMonthForKpis: string | null = selectedMonth === 'all' ? null : selectedMonth
  const currentView: ProgressView = viewParam === 'billing' ? 'billing' : 'progress'

  const [
    { data: team },
    { data: teamMembersRaw },
    { data: allMembersRaw },
    { data: caseMembersRaw },
    { data: clientsRaw },
  ] = await Promise.all([
    supabase.from('teams').select('id,name').eq('id', teamId).eq('is_active', true).single(),
    supabase.from('members').select('id,name,avatar_color,avatar_url,primary_role,job_type,joined_at,team_id').eq('is_active', true).eq('team_id', teamId),
    supabase.from('members').select('id,name,avatar_color,avatar_url,primary_role'),
    supabase.from('case_members').select('case_id,member_id,role').in('role', ['sales', 'manager']),
    supabase.from('clients').select('id,name'),
  ])

  if (!team) notFound()

  const teamMembers = (teamMembersRaw ?? []) as MemberRow[]
  const allMembers = (allMembersRaw ?? []) as Array<{ id: string; name: string; avatar_color: string; avatar_url: string | null; primary_role: string | null }>
  const caseMembers = (caseMembersRaw ?? []) as CaseMemberRow[]
  const clients = (clientsRaw ?? []) as Array<{ id: string; name: string }>
  const memberById = new Map(allMembers.map(m => [m.id, m]))
  const clientById = new Map(clients.map(c => [c.id, c.name]))

  // メンバー切替パネル用（進捗管理は管理担当の仕事なので、管理担当のみ表示）
  // ※管理担当には個人目標を設定しないので、achieved は常に false
  const navMembers: TeamNavMember[] = teamMembers
    .filter(m => m.primary_role === 'manager')
    .map(m => ({
      id: m.id,
      name: m.name,
      avatarColor: m.avatar_color ?? '#6B7280',
      avatarUrl: m.avatar_url,
      primaryRole: m.primary_role as 'sales' | 'manager',
    }))

  // フィルタ対象のメンバーID集合
  // - member=xxx が指定されていれば、その管理担当が紐づく案件のみ
  // - 未指定なら、チームの管理担当全員が紐づく案件
  const focusMember = memberParam ? teamMembers.find(m => m.id === memberParam) ?? null : null
  const scopeMemberIds = focusMember
    ? new Set([focusMember.id])
    : new Set(teamMembers.filter(m => m.primary_role === 'manager').map(m => m.id))

  const scopeCaseIds = new Set<string>()
  for (const cm of caseMembers) {
    if (scopeMemberIds.has(cm.member_id)) scopeCaseIds.add(cm.case_id)
  }

  const basePath = `/dashboard/team/${teamId}/progress`
  const extraParams: Record<string, string | undefined> = {}
  if (currentView !== 'progress') extraParams.view = currentView
  if (memberParam) extraParams.member = memberParam

  // 空状態のレンダラ（早期 return 用、ヘッダー等は共通化）
  const renderEmpty = () => (
    <div>
      <PageHeader
        eyebrow="Team · Progress"
        title={`${team.name}・進捗管理`}
        icon={AlertTriangle}
        description="案件のフラグ（紫/赤/黄/青）でリスクを早期発見"
      />
      <ProgressKpis
        scopeLabel={focusMember ? focusMember.name : team.name}
        metrics={{ totalAssigned: 0, blueCount: 0, yellowCount: 0, redCount: 0, purpleCount: 0, monthCompletionTarget: 0, monthCompleted: 0, cycleMonths: null, invoiceCount: 0 }}
      />
      <TeamMemberNav
        teamId={teamId}
        teamName={team.name}
        members={navMembers}
        currentMemberId={memberParam}
        buildTeamHref={tid => {
          const p = new URLSearchParams()
          if (currentView !== 'progress') p.set('view', currentView)
          if (selectedMonth !== ymToday) p.set('month', selectedMonth)
          const qs = p.toString()
          return qs ? `/dashboard/team/${tid}/progress?${qs}` : `/dashboard/team/${tid}/progress`
        }}
        buildMemberHref={(mid, tid) => {
          const p = new URLSearchParams()
          p.set('member', mid)
          if (currentView !== 'progress') p.set('view', currentView)
          if (selectedMonth !== ymToday) p.set('month', selectedMonth)
          return `/dashboard/team/${tid}/progress?${p.toString()}`
        }}
      />
      <ProgressViewTabs basePath={basePath} currentView={currentView} extraParams={{ ...extraParams, month: selectedMonth !== ymToday ? selectedMonth : undefined }} />
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
        {focusMember ? `${focusMember.name} に紐づく案件がありません` : 'このチームに紐づく案件がありません'}
      </div>
    </div>
  )

  if (scopeCaseIds.size === 0) {
    return renderEmpty()
  }

  // スコープ内の案件・タスク・請求書を取得
  const caseIdArray = Array.from(scopeCaseIds)
  const [{ data: casesRaw }, { data: tasksRaw }, { data: invoicesRaw }] = await Promise.all([
    supabase
      .from('cases')
      .select('id,case_number,deal_name,status,order_received_date,completion_date,expected_completion_date,fee_total,total_revenue_estimate,client_id,has_complaint,last_opened_at,created_at,procedure_type,contract_type,advance_payment,fee_administrative,fee_judicial')
      .in('id', caseIdArray),
    supabase.from('tasks').select('case_id,status,due_date').in('case_id', caseIdArray),
    supabase
      .from('invoices')
      .select('id,case_id,invoice_number,amount,status,issued_date,invoice_type,firm_type')
      .in('case_id', caseIdArray),
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
  const taskHorizon = new Date(today)
  taskHorizon.setDate(taskHorizon.getDate() + 2)
  const taskHorizonStr = todayJstYmd(taskHorizon)
  const urgentTeamTasks = ((systemTasksRaw ?? []) as TaskRow[]).filter(t => !!t.due_date && t.due_date <= taskHorizonStr)

  // 入金額（請求タブの入金済額・差額）用に payments を取得
  let billingPayments: Array<{ invoice_id: string; amount: number }> = []
  if (invoices.length > 0) {
    const { data: payRaw } = await supabase
      .from('payments')
      .select('invoice_id,amount')
      .in('invoice_id', invoices.map(i => i.id))
    billingPayments = (payRaw ?? []) as Array<{ invoice_id: string; amount: number }>
  }

  // KPI計算
  const kpis = computeProgressKpis(cases, tasks, selectedMonthForKpis, today, invoices)

  // 案件IDごとに manager を引く（進捗テーブル表示用）
  const managerByCase = new Map<string, { id: string; name: string; avatar_color: string; avatar_url: string | null; primary_role: string | null }>()
  const salesByCase = new Map<string, { id: string; name: string; avatar_color: string; avatar_url: string | null; primary_role: string | null }>()
  for (const cm of caseMembers) {
    if (!scopeCaseIds.has(cm.case_id)) continue
    const m = memberById.get(cm.member_id)
    if (!m) continue
    if (cm.role === 'manager' && !managerByCase.has(cm.case_id)) managerByCase.set(cm.case_id, m)
    if (cm.role === 'sales' && !salesByCase.has(cm.case_id)) salesByCase.set(cm.case_id, m)
  }

  // タスクを case ごとにグルーピング（フォーカス時はスコープ内のみ）
  const tasksByCase = new Map<string, DashTask[]>()
  for (const t of tasks) {
    if (!tasksByCase.has(t.case_id)) tasksByCase.set(t.case_id, [])
    tasksByCase.get(t.case_id)!.push(t)
  }

  // 管理案件はすべて「対応中」。対応中の案件のみを表示する（期間・ステータスの絞り込みはしない）。
  const baseCases = cases.filter(c => c.status === '対応中')
  const allRows: ProgressCaseRow[] = baseCases
    .map(c => {
      const mgr = managerByCase.get(c.id) ?? null
      const sales = salesByCase.get(c.id) ?? null
      // クレームありは紫を最優先で返す（expected_completion_date 未設定でも紫扱い）
      const flag = (c.has_complaint || c.expected_completion_date)
        ? computeCaseFlag(c, tasksByCase.get(c.id) ?? [], today)
        : null
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

  // 完了予定日が早い順に並べる（未設定は末尾）
  const rowsWithFlag = allRows
    .filter(r => r.flag !== null)
    .sort((a, b) => {
      const ad = a.expectedCompletionDate ?? '9999-12-31'
      const bd = b.expectedCompletionDate ?? '9999-12-31'
      return ad.localeCompare(bd)
    })

  const rowsUnset = allRows.filter(r => r.flag === null)

  // ─── 請求タブ（案件ベース）用のデータ生成 ───
  // 当月の受託(受注)/当月完了予定の対応中/当月業務完了の完了 案件を抽出
  const billingCaseRows = buildBillingCaseRows(
    cases.filter(c => scopeCaseIds.has(c.id)),
    caseMembers,
    memberById,
    invoices,
    today,
    billingPayments,
  )

  return (
    <div>
      <PageHeader
        eyebrow="Team · Progress"
        title={`${team.name}・進捗管理`}
        icon={AlertTriangle}
        description="案件のフラグ（紫/赤/黄/青）でリスクを早期発見"
      />
      {/* サマリ・メンバー切替は進捗タブのみ（請求タブでは出さない） */}
      {currentView === 'progress' && (
        <>
          <ProgressKpis
            scopeLabel={focusMember ? focusMember.name : team.name}
            metrics={kpis}
          />
          <TeamMemberNav
            teamId={teamId}
            teamName={team.name}
            members={navMembers}
            currentMemberId={memberParam}
            buildTeamHref={tid => {
              const p = new URLSearchParams()
              if (currentView !== 'progress') p.set('view', currentView)
              if (selectedMonth !== ymToday) p.set('month', selectedMonth)
              const qs = p.toString()
              return qs ? `/dashboard/team/${tid}/progress?${qs}` : `/dashboard/team/${tid}/progress`
            }}
            buildMemberHref={(mid, tid) => {
              const p = new URLSearchParams()
              p.set('member', mid)
              if (currentView !== 'progress') p.set('view', currentView)
              if (selectedMonth !== ymToday) p.set('month', selectedMonth)
              return `/dashboard/team/${tid}/progress?${p.toString()}`
            }}
          />
        </>
      )}
      <ProgressViewTabs
        basePath={basePath}
        currentView={currentView}
        extraParams={{
          month: selectedMonth !== ymToday ? selectedMonth : undefined,
          member: memberParam,
        }}
      />
      {currentView === 'progress' ? (
        <>
          <ProgressCaseTable rowsWithFlag={rowsWithFlag} rowsUnset={rowsUnset} showRoleBadge={false} />
          {/* チームタスク欄（要対応のシステムタスク。管理担当の進捗管理でも表示） */}
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
        <BillingCaseTable rows={billingCaseRows} />
      )}
    </div>
  )
}
