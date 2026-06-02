import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import ProgressKpis from '@/components/features/dashboard/ProgressKpis'
import ProgressCaseTable, { type ProgressCaseRow } from '@/components/features/dashboard/ProgressCaseTable'
import MonthSelector from '@/components/features/dashboard/MonthSelector'
import TeamMemberNav, { type TeamNavMember } from '@/components/features/dashboard/TeamMemberNav'
import ProgressViewTabs, { type ProgressView } from '@/components/features/dashboard/ProgressViewTabs'
import BillingStatusView, {
  type BillingViewRow,
  type BillingViewSummary,
} from '@/components/features/dashboard/BillingStatusView'
import {
  computeProgressKpis,
  computeCaseFlag,
  monthRange,
  type CaseFlag,
  type DashCase,
  type DashInvoice,
  type DashTask,
} from '@/lib/dashboardMetrics'
import { CASE_STATUSES } from '@/lib/constants'

type CaseFull = DashCase & {
  case_number: string
  deal_name: string
  client_id: string | null
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
}
type PaymentRow = { invoice_id: string; amount: number }

const FLAG_RANK: Record<CaseFlag, number> = { purple: 0, red: 1, yellow: 2, blue: 3 }

type Props = {
  params: Promise<{ teamId: string }>
  searchParams: Promise<{ month?: string; view?: string; member?: string; status?: string; pstatus?: string }>
}

const INVOICE_PSTATUS = ['未請求', '作成済', '入金待ち', '入金済'] as const

export default async function TeamProgressPage({ params, searchParams }: Props) {
  const { teamId } = await params
  const { month, view: viewParam, member: memberParam, status: statusParam, pstatus: pstatusParam } = await searchParams
  // 案件ステータスフィルタ（進捗タブ）。有効なステータスのみ採用
  const statusFilter = statusParam && CASE_STATUSES.some(s => s.key === statusParam) ? statusParam : null
  // 入金ステータスフィルタ（請求タブ）
  const pstatusFilter = pstatusParam && (INVOICE_PSTATUS as readonly string[]).includes(pstatusParam) ? pstatusParam : null
  const supabase = await createClient()
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
  if (statusFilter) extraParams.status = statusFilter
  if (pstatusFilter) extraParams.pstatus = pstatusFilter

  // 案件ステータスフィルタのリンク生成（month/view/member を維持）
  const buildStatusHref = (st: string | null) => {
    const p = new URLSearchParams()
    if (st) p.set('status', st)
    if (currentView !== 'progress') p.set('view', currentView)
    if (memberParam) p.set('member', memberParam)
    if (selectedMonth !== ymToday) p.set('month', selectedMonth)
    const qs = p.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }
  // 入金ステータスフィルタのリンク生成（請求タブ）
  const buildPStatusHref = (st: string | null) => {
    const p = new URLSearchParams()
    p.set('view', 'billing')
    if (st) p.set('pstatus', st)
    if (memberParam) p.set('member', memberParam)
    if (selectedMonth !== ymToday) p.set('month', selectedMonth)
    return `${basePath}?${p.toString()}`
  }

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
      <MonthSelector basePath={basePath} selectedMonth={selectedMonth} today={today} extraParams={extraParams} />
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
      .select('id,case_number,deal_name,status,order_received_date,completion_date,expected_completion_date,fee_total,total_revenue_estimate,client_id,has_complaint,last_opened_at,created_at')
      .in('id', caseIdArray),
    supabase.from('tasks').select('case_id,status,due_date').in('case_id', caseIdArray),
    supabase
      .from('invoices')
      .select('id,case_id,invoice_number,amount,status,issued_date,invoice_type')
      .in('case_id', caseIdArray),
  ])

  const cases = (casesRaw ?? []) as CaseFull[]
  const tasks = (tasksRaw ?? []) as DashTask[]
  const invoices = (invoicesRaw ?? []) as InvoiceFull[]

  // KPI計算
  const kpis = computeProgressKpis(cases, tasks, selectedMonthForKpis, today, invoices)

  // 案件IDごとに manager を引く（進捗テーブル表示用）
  const managerByCase = new Map<string, { id: string; name: string; avatar_color: string; avatar_url: string | null; primary_role: string | null }>()
  for (const cm of caseMembers) {
    if (cm.role !== 'manager') continue
    if (!scopeCaseIds.has(cm.case_id)) continue
    if (managerByCase.has(cm.case_id)) continue
    const m = memberById.get(cm.member_id)
    if (m) managerByCase.set(cm.case_id, m)
  }

  // 請求状況ビュー用の「チーム視点」担当者マップ。
  //   - 個人フィルタ中: その個人を表示
  //   - チーム全体: 優先順 [スコープ内の管理 > スコープ内の受注 > スコープ外の管理]
  // ※スコープ内＝チームメンバー（または focusMember）
  const teamAssigneeByCase = new Map<string, { id: string; name: string; avatar_color: string; avatar_url: string | null; primary_role: string | null }>()
  for (const cm of caseMembers) {
    if (!scopeCaseIds.has(cm.case_id)) continue
    const isInScope = scopeMemberIds.has(cm.member_id)
    if (!isInScope) continue
    const existing = teamAssigneeByCase.get(cm.case_id)
    const m = memberById.get(cm.member_id)
    if (!m) continue
    // 管理担当を優先（既に管理がいれば上書きしない、なければ受注でセット）
    if (cm.role === 'manager') {
      teamAssigneeByCase.set(cm.case_id, m)
    } else if (!existing) {
      teamAssigneeByCase.set(cm.case_id, m)
    }
  }

  // タスクを case ごとにグルーピング（フォーカス時はスコープ内のみ）
  const tasksByCase = new Map<string, DashTask[]>()
  for (const t of tasks) {
    if (!tasksByCase.has(t.case_id)) tasksByCase.set(t.case_id, [])
    tasksByCase.get(t.case_id)!.push(t)
  }

  // テーブル行を生成（選択月でフィルタ）
  const ACTIVE = new Set(['受注', '対応中', '保留・長期'])
  const inSelectedMonth = (d: string | null | undefined): boolean => {
    if (!d) return false
    if (selectedMonth === 'all') return true
    return d.startsWith(selectedMonth)
  }

  // ステータスフィルタ指定時はそのステータスの案件、未指定時は稼働中（受注/対応中/保留・長期）
  const baseCases = statusFilter ? cases.filter(c => c.status === statusFilter) : cases.filter(c => ACTIVE.has(c.status))
  const allRows: ProgressCaseRow[] = baseCases
    .map(c => {
      const mgr = managerByCase.get(c.id) ?? null
      // クレームありは紫を最優先で返す（expected_completion_date 未設定でも紫扱い）
      const flag = (c.has_complaint || c.expected_completion_date)
        ? computeCaseFlag(c, tasksByCase.get(c.id) ?? [], today)
        : null
      return {
        id: c.id,
        caseNumber: c.case_number,
        dealName: c.deal_name,
        managerId: mgr?.id ?? null,
        managerName: mgr?.name ?? null,
        managerAvatarColor: mgr?.avatar_color ?? null,
        managerAvatarUrl: mgr?.avatar_url ?? null,
        managerPrimaryRole: (mgr?.primary_role ?? 'manager') as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | null,
        expectedCompletionDate: c.expected_completion_date ?? null,
        clientName: c.client_id ? clientById.get(c.client_id) ?? null : null,
        flag,
      }
    })

  // 紫はクレームに紐づくので月フィルタの対象外（常に表示）。ステータス絞り込み時は月フィルタを外す
  const rowsWithFlag = allRows
    .filter(r => r.flag !== null && (statusFilter !== null || r.flag === 'purple' || inSelectedMonth(r.expectedCompletionDate)))
    .sort((a, b) => {
      const fa = FLAG_RANK[a.flag!]
      const fb = FLAG_RANK[b.flag!]
      if (fa !== fb) return fa - fb
      const ad = a.expectedCompletionDate ?? '9999-12-31'
      const bd = b.expectedCompletionDate ?? '9999-12-31'
      return ad.localeCompare(bd)
    })

  const rowsUnset = allRows.filter(r => r.flag === null)

  // ─── 請求状況ビュー用のデータ生成 ───
  const billingSummaryBase: BillingViewSummary = {
    invoiceTotal: 0,
    invoiceTotalCount: 0,
    unbilled: 0,
    awaitingPayment: 0,
    paid: 0,
    partialPaid: 0,
  }

  // 当月（or selectedMonth）に issued_date のある請求書、または「未請求」状態のものを表示
  // 未請求は invoices に対応行がない or status='未請求' のもの。
  // ここでは案件ごとの代表として、選択月の請求書 + 未請求status の請求書を含める
  const billingRange = selectedMonth === 'all' ? null : monthRange(selectedMonth)
  const monthlyInvoices = invoices.filter(inv => {
    if (inv.status === '未請求') return true
    if (!inv.issued_date) return false
    if (!billingRange) return true
    return inv.issued_date >= billingRange.start && inv.issued_date <= billingRange.end
  })

  // 支払い情報を取得（一部入金/入金済を補完するため）
  const paymentMap = new Map<string, number>()
  if (monthlyInvoices.length > 0) {
    const invIds = monthlyInvoices.map(i => i.id)
    const { data: paymentsRaw } = await supabase
      .from('payments')
      .select('invoice_id,amount')
      .in('invoice_id', invIds)
    for (const p of ((paymentsRaw ?? []) as PaymentRow[])) {
      paymentMap.set(p.invoice_id, (paymentMap.get(p.invoice_id) ?? 0) + p.amount)
    }
  }

  // 集計
  const billingSummary: BillingViewSummary = { ...billingSummaryBase }
  for (const inv of monthlyInvoices) {
    const paid = paymentMap.get(inv.id) ?? 0
    if (inv.status === '未請求') {
      billingSummary.unbilled++
      continue
    }
    billingSummary.invoiceTotal += inv.amount
    billingSummary.invoiceTotalCount++
    if (inv.status === '入金済' || paid >= inv.amount) {
      billingSummary.paid++
    } else if (inv.status === '入金待ち' || paid > 0) {
      billingSummary.awaitingPayment++
    } else if (inv.status === '作成済') {
      // 作成済（partialPaid 枠を「作成済」件数に流用）
      billingSummary.partialPaid++
    } else {
      billingSummary.awaitingPayment++
    }
  }

  // 請求行の担当者: 個人フィルタ中はその個人を表示。
  // チーム全体ではスコープ内メンバー優先（管理→受注）、いなければ管理担当を表示。
  const billingRows: BillingViewRow[] = monthlyInvoices
    .sort((a, b) => (b.issued_date ?? '').localeCompare(a.issued_date ?? ''))
    .map(inv => {
      const c = cases.find(c => c.id === inv.case_id)
      let displayMember = teamAssigneeByCase.get(inv.case_id) ?? null
      // フォールバック: チーム内担当が見つからなければ管理担当
      if (!displayMember) {
        displayMember = managerByCase.get(inv.case_id) ?? null
      }
      // 個人フィルタ中は強制的にそのメンバー（チーム外の管理担当を表示しないように）
      if (focusMember) {
        const fm = memberById.get(focusMember.id)
        if (fm) displayMember = fm
      }
      return {
        invoiceId: inv.id,
        caseId: inv.case_id,
        caseNumber: c?.case_number ?? '-',
        dealName: c?.deal_name ?? '-',
        managerName: displayMember?.name ?? null,
        managerId: displayMember?.id ?? null,
        managerAvatarColor: displayMember?.avatar_color ?? null,
        managerAvatarUrl: displayMember?.avatar_url ?? null,
        managerPrimaryRole: (displayMember?.primary_role ?? 'manager') as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | null,
        status: inv.status,
        amount: inv.amount,
        issuedDate: inv.issued_date,
        hasPdf: inv.status !== '未請求',
      }
    })

  return (
    <div>
      <PageHeader
        eyebrow="Team · Progress"
        title={`${team.name}・進捗管理`}
        icon={AlertTriangle}
        description="案件のフラグ（紫/赤/黄/青）でリスクを早期発見"
      />
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
      <ProgressViewTabs
        basePath={basePath}
        currentView={currentView}
        extraParams={{
          month: selectedMonth !== ymToday ? selectedMonth : undefined,
          member: memberParam,
        }}
      />
      <MonthSelector basePath={basePath} selectedMonth={selectedMonth} today={today} extraParams={extraParams} />

      {currentView === 'progress' ? (
        <>
          {/* 案件ステータスフィルタ */}
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            <span className="text-[12px] font-semibold text-gray-500 mr-1">ステータス</span>
            <a
              href={buildStatusHref(null)}
              className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${statusFilter === null ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              すべて
            </a>
            {CASE_STATUSES.map(s => {
              const count = cases.filter(c => c.status === s.key).length
              return (
                <a
                  key={s.key}
                  href={buildStatusHref(s.key)}
                  className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${statusFilter === s.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {s.key}
                  {count > 0 && <span className={`ml-1 text-[10px] font-mono ${statusFilter === s.key ? 'opacity-80' : 'opacity-50'}`}>{count}</span>}
                </a>
              )
            })}
          </div>
          <ProgressCaseTable rowsWithFlag={rowsWithFlag} rowsUnset={rowsUnset} showRoleBadge={false} />
        </>
      ) : (
        <>
          {/* 入金ステータスフィルタ */}
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            <span className="text-[12px] font-semibold text-gray-500 mr-1">入金ステータス</span>
            <a
              href={buildPStatusHref(null)}
              className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${pstatusFilter === null ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              すべて
            </a>
            {INVOICE_PSTATUS.map(st => {
              const count = billingRows.filter(r => r.status === st).length
              return (
                <a
                  key={st}
                  href={buildPStatusHref(st)}
                  className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${pstatusFilter === st ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {st}
                  {count > 0 && <span className={`ml-1 text-[10px] font-mono ${pstatusFilter === st ? 'opacity-80' : 'opacity-50'}`}>{count}</span>}
                </a>
              )
            })}
          </div>
          <BillingStatusView summary={billingSummary} rows={pstatusFilter ? billingRows.filter(r => r.status === pstatusFilter) : billingRows} />
        </>
      )}
    </div>
  )
}
