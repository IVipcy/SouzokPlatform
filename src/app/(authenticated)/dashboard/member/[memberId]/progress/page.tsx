import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { User } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import ProgressKpis from '@/components/features/dashboard/ProgressKpis'
import ProgressCaseTable, { type ProgressCaseRow } from '@/components/features/dashboard/ProgressCaseTable'
import MonthSelector from '@/components/features/dashboard/MonthSelector'
import TeamMemberNav, { type TeamNavMember } from '@/components/features/dashboard/TeamMemberNav'
import {
  computeProgressKpis,
  computeCaseFlag,
  type CaseFlag,
  type DashCase,
  type DashTask,
} from '@/lib/dashboardMetrics'

type CaseFull = DashCase & {
  case_number: string
  deal_name: string
  client_id: string | null
}
type CaseMemberRow = { case_id: string; member_id: string; role: string }

const FLAG_RANK: Record<CaseFlag, number> = { purple: 0, red: 1, yellow: 2, blue: 3 }

type Props = {
  params: Promise<{ memberId: string }>
  searchParams: Promise<{ month?: string }>
}

export default async function MemberProgressPage({ params, searchParams }: Props) {
  const { memberId } = await params
  const { month } = await searchParams
  const supabase = await createClient()
  const today = new Date()
  const ymToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const selectedMonth: string | 'all' = month === 'all' ? 'all' : (month || ymToday)
  const selectedMonthForKpis: string | null = selectedMonth === 'all' ? null : selectedMonth

  const [
    { data: member },
    { data: allMembersRaw },
    { data: caseMembersRaw },
    { data: clientsRaw },
  ] = await Promise.all([
    supabase.from('members').select('id,name,avatar_color,avatar_url,primary_role,team_id').eq('id', memberId).eq('is_active', true).single(),
    supabase.from('members').select('id,name,avatar_color,avatar_url,primary_role,team_id').eq('is_active', true),
    supabase.from('case_members').select('case_id,member_id,role').in('role', ['sales', 'manager']),
    supabase.from('clients').select('id,name'),
  ])

  if (!member) notFound()

  const allMembers = (allMembersRaw ?? []) as Array<{ id: string; name: string; avatar_color: string; avatar_url: string | null; primary_role: string | null; team_id: string | null }>
  const caseMembers = (caseMembersRaw ?? []) as CaseMemberRow[]
  const clients = (clientsRaw ?? []) as Array<{ id: string; name: string }>
  const memberById = new Map(allMembers.map(m => [m.id, m]))
  const clientById = new Map(clients.map(c => [c.id, c.name]))

  // チームメンバー切替パネル用
  let teamForNav: { id: string; name: string } | null = null
  let navMembers: TeamNavMember[] = []
  if (member.team_id) {
    const { data: t } = await supabase.from('teams').select('id,name').eq('id', member.team_id).single()
    if (t) {
      teamForNav = t
      navMembers = allMembers
        .filter(m => m.team_id === member.team_id && (m.primary_role === 'sales' || m.primary_role === 'manager'))
        .map(m => ({
          id: m.id,
          name: m.name,
          avatarColor: m.avatar_color ?? '#6B7280',
          avatarUrl: m.avatar_url,
          primaryRole: m.primary_role as 'sales' | 'manager',
        }))
    }
  }

  // この人が sales or manager で紐づく case_ids
  const myCaseIds = new Set<string>()
  const myRolesPerCase = new Map<string, Set<'sales' | 'manager'>>()
  for (const cm of caseMembers) {
    if (cm.member_id !== memberId) continue
    myCaseIds.add(cm.case_id)
    if (!myRolesPerCase.has(cm.case_id)) myRolesPerCase.set(cm.case_id, new Set())
    myRolesPerCase.get(cm.case_id)!.add(cm.role as 'sales' | 'manager')
  }

  if (myCaseIds.size === 0) {
    return (
      <div>
        <PageHeader
          eyebrow="Member · Progress"
          title={`${member.name}・進捗管理`}
          icon={User}
          description="この担当者の受注／管理案件のフラグでリスクを早期発見"
        />
        <ProgressKpis scopeLabel={member.name} metrics={{ totalAssigned: 0, blueCount: 0, yellowCount: 0, redCount: 0, purpleCount: 0, monthCompletionTarget: 0, monthCompleted: 0, cycleMonths: null, invoiceCount: 0 }} />
        {teamForNav && (
          <TeamMemberNav teamId={teamForNav.id} teamName={teamForNav.name} members={navMembers} currentMemberId={memberId} />
        )}
        <MonthSelector basePath={`/dashboard/member/${memberId}/progress`} selectedMonth={selectedMonth} today={today} />
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          この担当者に紐づく案件がありません
        </div>
      </div>
    )
  }

  const caseIdArray = Array.from(myCaseIds)
  const [{ data: casesRaw }, { data: tasksRaw }, { data: invoicesRaw }] = await Promise.all([
    supabase.from('cases').select('id,case_number,deal_name,status,order_received_date,completion_date,expected_completion_date,fee_total,total_revenue_estimate,client_id,has_complaint,last_opened_at,created_at').in('id', caseIdArray),
    supabase.from('tasks').select('case_id,status,due_date').in('case_id', caseIdArray),
    supabase.from('invoices').select('case_id,issued_date').in('case_id', caseIdArray),
  ])

  const cases = (casesRaw ?? []) as CaseFull[]
  const tasks = (tasksRaw ?? []) as DashTask[]
  const invoices = (invoicesRaw ?? []) as Array<{ case_id: string; issued_date: string | null }>

  const kpis = computeProgressKpis(cases, tasks, selectedMonthForKpis, today, invoices)

  // case → manager マップ
  const managerByCase = new Map<string, { id: string; name: string; avatar_color: string; avatar_url: string | null; primary_role: string | null }>()
  for (const cm of caseMembers) {
    if (cm.role !== 'manager') continue
    if (!myCaseIds.has(cm.case_id)) continue
    if (managerByCase.has(cm.case_id)) continue
    const m = memberById.get(cm.member_id)
    if (m) managerByCase.set(cm.case_id, m)
  }

  const tasksByCase = new Map<string, DashTask[]>()
  for (const t of tasks) {
    if (!tasksByCase.has(t.case_id)) tasksByCase.set(t.case_id, [])
    tasksByCase.get(t.case_id)!.push(t)
  }

  const ACTIVE = new Set(['受注', '対応中', '保留・長期'])
  const inSelectedMonth = (d: string | null | undefined): boolean => {
    if (!d) return false
    if (selectedMonth === 'all') return true
    return d.startsWith(selectedMonth)
  }

  const allRows: ProgressCaseRow[] = cases
    .filter(c => ACTIVE.has(c.status))
    .map(c => {
      const mgr = managerByCase.get(c.id) ?? null
      // クレームありは紫を最優先（完了予定日未設定でも紫扱い）
      const flag = (c.has_complaint || c.expected_completion_date)
        ? computeCaseFlag(c, tasksByCase.get(c.id) ?? [], today)
        : null
      const myRoles = Array.from(myRolesPerCase.get(c.id) ?? [])
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
        myRolesOnCase: myRoles,
      }
    })

  const rowsWithFlag = allRows
    .filter(r => r.flag !== null && (r.flag === 'purple' || inSelectedMonth(r.expectedCompletionDate)))
    .sort((a, b) => {
      const fa = FLAG_RANK[a.flag!]
      const fb = FLAG_RANK[b.flag!]
      if (fa !== fb) return fa - fb
      const ad = a.expectedCompletionDate ?? '9999-12-31'
      const bd = b.expectedCompletionDate ?? '9999-12-31'
      return ad.localeCompare(bd)
    })

  const rowsUnset = allRows.filter(r => r.flag === null)

  return (
    <div>
      <PageHeader
        eyebrow="Member · Progress"
        title={`${member.name}・進捗管理`}
        icon={User}
        description="この担当者の受注／管理案件のフラグでリスクを早期発見"
      />
      <ProgressKpis scopeLabel={member.name} metrics={kpis} />
      {teamForNav && (
        <TeamMemberNav teamId={teamForNav.id} teamName={teamForNav.name} members={navMembers} currentMemberId={memberId} />
      )}
      <MonthSelector basePath={`/dashboard/member/${memberId}/progress`} selectedMonth={selectedMonth} today={today} />
      <ProgressCaseTable rowsWithFlag={rowsWithFlag} rowsUnset={rowsUnset} showRoleBadge={true} />
    </div>
  )
}
