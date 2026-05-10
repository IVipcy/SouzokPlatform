import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
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
type MemberRow = {
  id: string
  name: string
  avatar_color: string
  avatar_url: string | null
  primary_role: string | null
  team_id: string | null
}

const FLAG_RANK: Record<CaseFlag, number> = { red: 0, yellow: 1, blue: 2 }

type Props = {
  params: Promise<{ teamId: string }>
  searchParams: Promise<{ month?: string }>
}

export default async function TeamProgressPage({ params, searchParams }: Props) {
  const { teamId } = await params
  const { month } = await searchParams
  const supabase = await createClient()
  const today = new Date()
  const ymToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  // 月パラメータの解決
  const selectedMonth: string | 'all' = month === 'all' ? 'all' : (month || ymToday)
  const selectedMonthForKpis: string | null = selectedMonth === 'all' ? null : selectedMonth

  const [
    { data: team },
    { data: teamMembersRaw },
    { data: allMembersRaw },
    { data: caseMembersRaw },
    { data: clientsRaw },
  ] = await Promise.all([
    supabase.from('teams').select('id,name').eq('id', teamId).eq('is_active', true).single(),
    supabase.from('members').select('id,name,avatar_color,avatar_url,primary_role,team_id').eq('is_active', true).eq('team_id', teamId),
    supabase.from('members').select('id,name,avatar_color,avatar_url'),
    supabase.from('case_members').select('case_id,member_id,role').in('role', ['sales', 'manager']),
    supabase.from('clients').select('id,name'),
  ])

  if (!team) notFound()

  const teamMembers = (teamMembersRaw ?? []) as MemberRow[]
  const allMembers = (allMembersRaw ?? []) as Array<{ id: string; name: string; avatar_color: string; avatar_url: string | null }>
  const caseMembers = (caseMembersRaw ?? []) as CaseMemberRow[]
  const clients = (clientsRaw ?? []) as Array<{ id: string; name: string }>
  const memberById = new Map(allMembers.map(m => [m.id, m]))
  const clientById = new Map(clients.map(c => [c.id, c.name]))

  // チームに関係する案件 = チーム員が sales or manager で紐づく case_ids
  const teamMemberIds = new Set(teamMembers.filter(m => m.primary_role === 'sales' || m.primary_role === 'manager').map(m => m.id))
  const teamCaseIds = new Set<string>()
  for (const cm of caseMembers) {
    if (teamMemberIds.has(cm.member_id)) teamCaseIds.add(cm.case_id)
  }

  // メンバー切替パネル用
  const navMembers: TeamNavMember[] = teamMembers
    .filter(m => m.primary_role === 'sales' || m.primary_role === 'manager')
    .map(m => ({
      id: m.id,
      name: m.name,
      avatarColor: m.avatar_color ?? '#6B7280',
      avatarUrl: m.avatar_url,
      primaryRole: m.primary_role as 'sales' | 'manager',
    }))

  if (teamCaseIds.size === 0) {
    return (
      <div>
        <ProgressKpis scopeLabel={team.name} metrics={{ totalAssigned: 0, blueCount: 0, yellowCount: 0, redCount: 0, monthCompletionTarget: 0, monthCompleted: 0, cycleMonths: null }} />
        <TeamMemberNav teamId={teamId} teamName={team.name} members={navMembers} />
        <MonthSelector basePath={`/dashboard/team/${teamId}/progress`} selectedMonth={selectedMonth} today={today} />
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          このチームに紐づく案件がありません
        </div>
      </div>
    )
  }

  // 関連する案件と、そのタスクを取得
  const caseIdArray = Array.from(teamCaseIds)
  const [{ data: casesRaw }, { data: tasksRaw }] = await Promise.all([
    supabase.from('cases').select('id,case_number,deal_name,status,order_received_date,completion_date,expected_completion_date,fee_total,total_revenue_estimate,client_id').in('id', caseIdArray),
    supabase.from('tasks').select('case_id,status,due_date').in('case_id', caseIdArray),
  ])

  const cases = (casesRaw ?? []) as CaseFull[]
  const tasks = (tasksRaw ?? []) as DashTask[]

  // KPI計算
  const kpis = computeProgressKpis(cases, tasks, selectedMonthForKpis, today)

  // 案件IDごとに manager を引く
  const managerByCase = new Map<string, { id: string; name: string; avatar_color: string; avatar_url: string | null }>()
  for (const cm of caseMembers) {
    if (cm.role !== 'manager') continue
    if (!teamCaseIds.has(cm.case_id)) continue
    if (managerByCase.has(cm.case_id)) continue
    const m = memberById.get(cm.member_id)
    if (m) managerByCase.set(cm.case_id, m)
  }

  // タスクを case ごとにグルーピング
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

  const allRows: ProgressCaseRow[] = cases
    .filter(c => ACTIVE.has(c.status))
    .map(c => {
      const mgr = managerByCase.get(c.id) ?? null
      const flag = c.expected_completion_date ? computeCaseFlag(c, tasksByCase.get(c.id) ?? [], today) : null
      return {
        id: c.id,
        caseNumber: c.case_number,
        dealName: c.deal_name,
        managerId: mgr?.id ?? null,
        managerName: mgr?.name ?? null,
        managerAvatarColor: mgr?.avatar_color ?? null,
        managerAvatarUrl: mgr?.avatar_url ?? null,
        expectedCompletionDate: c.expected_completion_date ?? null,
        clientName: c.client_id ? clientById.get(c.client_id) ?? null : null,
        flag,
      }
    })

  const rowsWithFlag = allRows
    .filter(r => r.flag !== null && inSelectedMonth(r.expectedCompletionDate))
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
      <ProgressKpis scopeLabel={team.name} metrics={kpis} />
      <TeamMemberNav teamId={teamId} teamName={team.name} members={navMembers} />
      <MonthSelector basePath={`/dashboard/team/${teamId}/progress`} selectedMonth={selectedMonth} today={today} />
      <ProgressCaseTable rowsWithFlag={rowsWithFlag} rowsUnset={rowsUnset} showRoleBadge={false} />
    </div>
  )
}
