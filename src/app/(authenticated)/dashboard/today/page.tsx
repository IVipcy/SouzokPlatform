import { createClient } from '@/lib/supabase/server'
import { CalendarDays } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
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
  avatar_url: string | null
  primary_role: string | null
  job_type: string | null
  joined_at: string | null
  team_id: string | null
}
type TeamRow = { id: string; name: string }

export default async function DeptTodayDashboard() {
  const supabase = await createClient()
  const today = new Date()
  const ymd = todayJstYmd(today)
  const ym = ymd.slice(0, 7)

  // 当日の status_change のみ取得（活ログを絞ってDB負荷を下げる）
  const dayStart = `${ymd}T00:00:00`
  const dayEnd = `${ymd}T23:59:59.999`

  const [
    { data: casesRaw },
    { data: caseMembersRaw },
    { data: membersRaw },
    { data: teamsRaw },
    { data: changesRaw },
  ] = await Promise.all([
    supabase.from('cases').select('id,status,order_received_date,completion_date,expected_completion_date,fee_total,total_revenue_estimate'),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase.from('members').select('id,name,avatar_color,avatar_url,primary_role,job_type,joined_at,team_id').eq('is_active', true),
    supabase.from('teams').select('id,name').eq('is_active', true),
    supabase
      .from('activity_log')
      .select('entity_id,old_value,new_value,created_at')
      .eq('entity_type', 'case')
      .eq('action', 'status_change')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd),
  ])

  const cases = (casesRaw ?? []) as DashCase[]
  const caseMembers = (caseMembersRaw ?? []) as DashCaseMember[]
  const members = (membersRaw ?? []) as MemberRow[]
  const teams = (teamsRaw ?? []) as TeamRow[]
  const statusChanges = (changesRaw ?? []) as DashStatusChange[]
  const teamNameById = new Map(teams.map(t => [t.id, t.name]))

  // 部全体の本日KPI
  const overallDaily = computeDailyMetrics(cases, statusChanges, today)

  // 個人テーブル: sales/manager のみ
  const tableMembers = members.filter(m => m.primary_role === 'sales' || m.primary_role === 'manager')

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
        avatarUrl: m.avatar_url,
        teamName: m.team_id ? teamNameById.get(m.team_id) ?? null : null,
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

  const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${['日','月','火','水','木','金','土'][today.getDay()]}）`

  return (
    <div>
      <PageHeader
        eyebrow="Department · Today"
        title="本日のダッシュボード"
        icon={CalendarDays}
        description={`${dateLabel}・部全体の動きとメンバー別の累計／本日`}
      />
      <DailyKpis scopeLabel="相続事業部" metrics={overallDaily} />
      <DailyMemberTable rows={rows} today={today} showTeamColumn={true} />
    </div>
  )
}
