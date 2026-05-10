import { createClient } from '@/lib/supabase/server'
import SummaryKpis from '@/components/features/dashboard/SummaryKpis'
import MemberPerformanceTable, { type MemberWithProfile } from '@/components/features/dashboard/MemberPerformanceTable'
import {
  computeMetrics,
  fiscalYearMonthsToDate,
  type DashCase,
  type DashCaseMember,
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
  is_active: boolean
}

type TeamRow = { id: string; name: string }

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = new Date()
  const thisYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const [
    { data: casesRaw },
    { data: caseMembersRaw },
    { data: membersRaw },
    { data: teamsRaw },
  ] = await Promise.all([
    supabase.from('cases').select('id,status,order_received_date,completion_date,fee_total,total_revenue_estimate'),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase.from('members').select('id,name,avatar_color,avatar_url,primary_role,job_type,joined_at,team_id,is_active').eq('is_active', true),
    supabase.from('teams').select('id,name').eq('is_active', true),
  ])

  const cases = (casesRaw ?? []) as DashCase[]
  const caseMembers = (caseMembersRaw ?? []) as DashCaseMember[]
  const members = (membersRaw ?? []) as MemberRow[]
  const teams = (teamsRaw ?? []) as TeamRow[]
  const teamMap: Record<string, string> = Object.fromEntries(teams.map(t => [t.id, t.name]))

  // 部全体・当月のKPI
  const summary = computeMetrics(cases, thisYm)

  // 個人テーブルに並べる対象 = primary_role が 'sales' or 'manager'
  const tableMembers: MemberWithProfile[] = members
    .filter(m => m.primary_role === 'sales' || m.primary_role === 'manager')
    .map(m => ({
      id: m.id,
      name: m.name,
      avatar_color: m.avatar_color ?? '#6B7280',
      avatar_url: m.avatar_url,
      primary_role: m.primary_role as 'sales' | 'manager',
      team_name: m.team_id ? teamMap[m.team_id] ?? null : null,
      job_type: m.job_type,
      joined_at: m.joined_at,
    }))
    // 受注担当→管理担当 の順、同じ役割内は名前順
    .sort((a, b) => {
      if (a.primary_role !== b.primary_role) return a.primary_role === 'sales' ? -1 : 1
      return a.name.localeCompare(b.name, 'ja')
    })

  const months = fiscalYearMonthsToDate(today)
  const monthLabel = `${today.getMonth() + 1}月`

  return (
    <div className="space-y-2">
      <SummaryKpis monthLabel={monthLabel} metrics={summary} />
      <MemberPerformanceTable
        members={tableMembers}
        cases={cases}
        caseMembers={caseMembers}
        months={months}
        today={today}
      />
    </div>
  )
}
