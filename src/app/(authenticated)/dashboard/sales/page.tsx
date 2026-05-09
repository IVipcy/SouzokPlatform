import { createClient } from '@/lib/supabase/server'
import SalesKpis from '@/components/features/dashboard/SalesKpis'
import SalesTeamTable, {
  type SalesTeamGroup,
  type SalesMemberRow,
} from '@/components/features/dashboard/SalesTeamTable'
import {
  computeSalesMetrics,
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
type TeamRow = { id: string; name: string; sort_order: number }

const UNASSIGNED_TEAM = '未所属'

export default async function SalesDashboardPage() {
  const supabase = await createClient()
  const today = new Date()
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const monthLabel = `${today.getMonth() + 1}月`

  // 当月の月初〜月末（activity_log フィルタ用）
  const monthStart = `${ym}-01T00:00:00`
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const nextMonthStart = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01T00:00:00`

  const [
    { data: casesRaw },
    { data: caseMembersRaw },
    { data: membersRaw },
    { data: teamsRaw },
    { data: changesRaw },
  ] = await Promise.all([
    supabase.from('cases').select('id,status,order_received_date,completion_date,expected_completion_date,fee_total,total_revenue_estimate'),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase.from('members').select('id,name,avatar_color,primary_role,job_type,joined_at,team_id').eq('is_active', true).eq('primary_role', 'sales'),
    supabase.from('teams').select('id,name,sort_order').eq('is_active', true).order('sort_order'),
    supabase
      .from('activity_log')
      .select('entity_id,old_value,new_value,created_at')
      .eq('entity_type', 'case')
      .eq('action', 'status_change')
      .gte('created_at', monthStart)
      .lt('created_at', nextMonthStart),
  ])

  const cases = (casesRaw ?? []) as DashCase[]
  const caseMembers = (caseMembersRaw ?? []) as DashCaseMember[]
  const salesMembers = (membersRaw ?? []) as MemberRow[]
  const teams = (teamsRaw ?? []) as TeamRow[]
  const statusChanges = (changesRaw ?? []) as DashStatusChange[]

  // メンバーごとの担当案件IDセット
  const caseIdsByMember = new Map<string, Set<string>>()
  for (const cm of caseMembers) {
    if (cm.role !== 'sales') continue
    if (!caseIdsByMember.has(cm.member_id)) caseIdsByMember.set(cm.member_id, new Set())
    caseIdsByMember.get(cm.member_id)!.add(cm.case_id)
  }

  // ユーティリティ: 案件IDセットから対応する cases / statusChanges を抽出
  const filterByIds = (caseIds: Set<string>) => ({
    cases: cases.filter(c => caseIds.has(c.id)),
    changes: statusChanges.filter(sc => caseIds.has(sc.entity_id)),
  })

  // 部全体（受注担当の合算）の集計
  const allSalesCaseIds = new Set<string>()
  for (const set of caseIdsByMember.values()) for (const id of set) allSalesCaseIds.add(id)
  const overall = computeSalesMetrics(
    cases.filter(c => allSalesCaseIds.has(c.id)),
    statusChanges.filter(sc => allSalesCaseIds.has(sc.entity_id)),
    ym,
  )

  // チームごとにグループ化
  const teamSortOrder = new Map(teams.map(t => [t.id, t.sort_order]))
  const teamNameById = new Map(teams.map(t => [t.id, t.name]))

  const byTeam: Record<string, MemberRow[]> = {}
  for (const m of salesMembers) {
    const key = m.team_id ?? '__unassigned__'
    if (!byTeam[key]) byTeam[key] = []
    byTeam[key].push(m)
  }

  const groupKeys = Object.keys(byTeam).sort((a, b) => {
    if (a === '__unassigned__') return 1
    if (b === '__unassigned__') return -1
    return (teamSortOrder.get(a) ?? 999) - (teamSortOrder.get(b) ?? 999)
  })

  const groups: SalesTeamGroup[] = groupKeys.map(key => {
    const members = byTeam[key]
    const teamCaseIds = new Set<string>()
    for (const m of members) {
      const ids = caseIdsByMember.get(m.id)
      if (ids) for (const id of ids) teamCaseIds.add(id)
    }
    const teamFiltered = filterByIds(teamCaseIds)
    const teamMetrics = computeSalesMetrics(teamFiltered.cases, teamFiltered.changes, ym)

    const memberRows: SalesMemberRow[] = members
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      .map(m => {
        const myIds = caseIdsByMember.get(m.id) ?? new Set<string>()
        const my = filterByIds(myIds)
        return {
          id: m.id,
          name: m.name,
          avatarColor: m.avatar_color ?? '#6B7280',
          jobType: m.job_type,
          joinedAt: m.joined_at,
          metrics: computeSalesMetrics(my.cases, my.changes, ym),
        }
      })

    return {
      teamName: key === '__unassigned__' ? UNASSIGNED_TEAM : (teamNameById.get(key) ?? '不明'),
      teamMetrics,
      members: memberRows,
    }
  })

  return (
    <div>
      <SalesKpis monthLabel={monthLabel} metrics={overall} />
      <SalesTeamTable groups={groups} today={today} />
    </div>
  )
}
