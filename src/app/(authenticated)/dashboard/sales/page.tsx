import { createClient } from '@/lib/supabase/server'
import { Megaphone } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import SalesKpiTable from '@/components/features/dashboard/SalesKpiTable'
import SalesTeamTable, {
  type SalesTeamGroup,
  type SalesMemberRow,
} from '@/components/features/dashboard/SalesTeamTable'
import DashboardAchievementPopup from '@/components/features/dashboard/DashboardAchievementPopup'
import {
  computeSalesMetrics,
  EMPTY_SALES_TARGET,
  isSalesAchieved,
  type DashCase,
  type DashCaseMember,
  type DashProperty,
  type DashStatusChange,
  type SalesTargetRow,
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
    { data: propertiesRaw },
    { data: targetRaw },
    { data: memberTargetsRaw },
  ] = await Promise.all([
    supabase
      .from('cases')
      .select('id,status,order_received_date,completion_date,expected_completion_date,fee_total,total_revenue_estimate,tax_filing_required'),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase
      .from('members')
      .select('id,name,avatar_color,avatar_url,primary_role,job_type,joined_at,team_id')
      .eq('is_active', true)
      .eq('primary_role', 'sales'),
    supabase.from('teams').select('id,name,sort_order').eq('is_active', true).order('sort_order'),
    supabase
      .from('activity_log')
      .select('entity_id,old_value,new_value,created_at')
      .eq('entity_type', 'case')
      .eq('action', 'status_change')
      .gte('created_at', monthStart)
      .lt('created_at', nextMonthStart),
    supabase.from('real_estate_properties').select('case_id,appraisal_status'),
    supabase
      .from('sales_targets')
      .select('ym,meetings_count,new_orders_count,conversion_rate,avg_order_unit,tax_filing_count,property_appraisal_count')
      .eq('ym', ym)
      .maybeSingle(),
    supabase
      .from('member_targets')
      .select('member_id,new_orders_count')
      .eq('ym', ym),
  ])

  const cases = (casesRaw ?? []) as DashCase[]
  const caseMembers = (caseMembersRaw ?? []) as DashCaseMember[]
  const salesMembers = (membersRaw ?? []) as MemberRow[]
  const teams = (teamsRaw ?? []) as TeamRow[]
  const statusChanges = (changesRaw ?? []) as DashStatusChange[]
  const properties = (propertiesRaw ?? []) as DashProperty[]
  const memberTargets = (memberTargetsRaw ?? []) as Array<{ member_id: string; new_orders_count: number }>
  const memberTargetByMember = new Map(memberTargets.map(t => [t.member_id, t.new_orders_count]))

  // メンバーごとの担当案件IDセット
  const caseIdsByMember = new Map<string, Set<string>>()
  for (const cm of caseMembers) {
    if (cm.role !== 'sales') continue
    if (!caseIdsByMember.has(cm.member_id)) caseIdsByMember.set(cm.member_id, new Set())
    caseIdsByMember.get(cm.member_id)!.add(cm.case_id)
  }

  // ユーティリティ: 案件IDセットから対応する cases / statusChanges / properties を抽出
  const filterByIds = (caseIds: Set<string>) => ({
    cases: cases.filter(c => caseIds.has(c.id)),
    changes: statusChanges.filter(sc => caseIds.has(sc.entity_id)),
    properties: properties.filter(p => caseIds.has(p.case_id)),
  })

  // 部全体（受注担当の合算）の集計
  const allSalesCaseIds = new Set<string>()
  for (const set of caseIdsByMember.values()) for (const id of set) allSalesCaseIds.add(id)
  const overallScoped = filterByIds(allSalesCaseIds)
  const overall = computeSalesMetrics(overallScoped.cases, overallScoped.changes, ym, overallScoped.properties)

  // 目標値（未設定なら 0 埋め）
  const initialTarget: SalesTargetRow = targetRaw
    ? {
        ym: targetRaw.ym,
        meetings_count: targetRaw.meetings_count ?? 0,
        new_orders_count: targetRaw.new_orders_count ?? 0,
        conversion_rate: Number(targetRaw.conversion_rate ?? 0),
        avg_order_unit: Number(targetRaw.avg_order_unit ?? 0),
        tax_filing_count: targetRaw.tax_filing_count ?? 0,
        property_appraisal_count: targetRaw.property_appraisal_count ?? 0,
      }
    : { ym, ...EMPTY_SALES_TARGET }

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
    const teamMetrics = computeSalesMetrics(teamFiltered.cases, teamFiltered.changes, ym, teamFiltered.properties)

    const memberRows: SalesMemberRow[] = members
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      .map(m => {
        const myIds = caseIdsByMember.get(m.id) ?? new Set<string>()
        const my = filterByIds(myIds)
        const myMetrics = computeSalesMetrics(my.cases, my.changes, ym, my.properties)
        const myTarget = memberTargetByMember.get(m.id) ?? 0
        const achieved = myTarget > 0 && myMetrics.newOrdersCount >= myTarget
        return {
          id: m.id,
          name: m.name,
          avatarColor: m.avatar_color ?? '#6B7280',
          avatarUrl: m.avatar_url,
          jobType: m.job_type,
          joinedAt: m.joined_at,
          metrics: myMetrics,
          newOrdersTarget: myTarget,
          achieved,
        }
      })

    return {
      teamName: key === '__unassigned__' ? UNASSIGNED_TEAM : (teamNameById.get(key) ?? '不明'),
      teamMetrics,
      members: memberRows,
    }
  })

  // 達成判定（目標が1つでも設定されていればポップアップ表示）
  const achievement = isSalesAchieved(overall, initialTarget)

  return (
    <div>
      {achievement.hasTargets && (
        <DashboardAchievementPopup
          isAchieved={achievement.achieved}
          storageKey={`dash-popup-sales-${ym}`}
        />
      )}
      <PageHeader
        eyebrow="Sales · Monthly"
        title="受注担当ダッシュボード"
        icon={Megaphone}
        description="営業の月次成績・面談数・受注率・平均単価・相続税申告・不動産査定など"
      />
      <div className="space-y-3">
        <SalesKpiTable
          ym={ym}
          monthLabel={monthLabel}
          metrics={overall}
          initialTarget={initialTarget}
        />
        <SalesTeamTable groups={groups} today={today} ym={ym} />
      </div>
    </div>
  )
}
