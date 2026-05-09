import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DailyKpis from '@/components/features/dashboard/DailyKpis'
import DailyMemberTable, { type DailyMemberRow } from '@/components/features/dashboard/DailyMemberTable'
import {
  computeDailyMetrics,
  computeMetrics,
  todayJstYmd,
  type DashCase,
  type DashCaseMember,
  type DashStatusChange,
} from '@/lib/dashboardMetrics'

type MemberRow = {
  id: string
  name: string
  avatar_color: string
  primary_role: string | null
  job_type: string | null
  joined_at: string | null
  team_id: string | null
}

type Props = { params: Promise<{ teamId: string }> }

export default async function TeamTodayDashboard({ params }: Props) {
  const { teamId } = await params
  const supabase = await createClient()
  const today = new Date()
  const ymd = todayJstYmd(today)
  const ym = ymd.slice(0, 7)

  const dayStart = `${ymd}T00:00:00`
  const dayEnd = `${ymd}T23:59:59.999`

  const [
    { data: team },
    { data: casesRaw },
    { data: caseMembersRaw },
    { data: membersRaw },
    { data: changesRaw },
  ] = await Promise.all([
    supabase.from('teams').select('id,name').eq('id', teamId).eq('is_active', true).single(),
    supabase.from('cases').select('id,status,order_received_date,completion_date,expected_completion_date,fee_total,total_revenue_estimate'),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase.from('members').select('id,name,avatar_color,primary_role,job_type,joined_at,team_id').eq('is_active', true).eq('team_id', teamId),
    supabase
      .from('activity_log')
      .select('entity_id,old_value,new_value,created_at')
      .eq('entity_type', 'case')
      .eq('action', 'status_change')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd),
  ])

  if (!team) notFound()

  const cases = (casesRaw ?? []) as DashCase[]
  const caseMembers = (caseMembersRaw ?? []) as DashCaseMember[]
  const teamMembers = (membersRaw ?? []) as MemberRow[]
  const statusChanges = (changesRaw ?? []) as DashStatusChange[]

  // チームメンバー (sales/manager) のみ
  const tableMembers = teamMembers.filter(m => m.primary_role === 'sales' || m.primary_role === 'manager')

  // チームの担当案件IDセット（チームのsales/manager 全員の担当案件のunion）
  const teamCaseIds = new Set<string>()
  for (const m of tableMembers) {
    const role = m.primary_role as 'sales' | 'manager'
    for (const cm of caseMembers) {
      if (cm.member_id === m.id && cm.role === role) teamCaseIds.add(cm.case_id)
    }
  }
  const teamCases = cases.filter(c => teamCaseIds.has(c.id))
  const teamChanges = statusChanges.filter(sc => teamCaseIds.has(sc.entity_id))

  const teamDaily = computeDailyMetrics(teamCases, teamChanges, today)

  const rows: DailyMemberRow[] = tableMembers
    .map(m => {
      const role = m.primary_role as 'sales' | 'manager'
      const myCaseIds = new Set(
        caseMembers
          .filter(cm => cm.member_id === m.id && cm.role === role)
          .map(cm => cm.case_id),
      )
      const myCases = cases.filter(c => myCaseIds.has(c.id))
      const myChanges = statusChanges.filter(sc => myCaseIds.has(sc.entity_id))

      return {
        id: m.id,
        name: m.name,
        avatarColor: m.avatar_color ?? '#6B7280',
        teamName: team.name,
        jobType: m.job_type,
        joinedAt: m.joined_at,
        primaryRole: role,
        monthly: computeMetrics(myCases, ym),
        daily: computeDailyMetrics(myCases, myChanges, today),
      }
    })
    .sort((a, b) => {
      if (a.primaryRole !== b.primaryRole) return a.primaryRole === 'sales' ? -1 : 1
      return a.name.localeCompare(b.name, 'ja')
    })

  return (
    <div>
      <DailyKpis scopeLabel={team.name} metrics={teamDaily} />
      <DailyMemberTable rows={rows} today={today} showTeamColumn={false} />
    </div>
  )
}
