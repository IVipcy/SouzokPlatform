import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import SalesDailyKpis from '@/components/features/dashboard/SalesDailyKpis'
import SalesDailyTeamTable, {
  type SalesDailyTeamGroup,
  type SalesDailyMemberRow,
} from '@/components/features/dashboard/SalesDailyTeamTable'
import TeamMemberNav, { type TeamNavMember } from '@/components/features/dashboard/TeamMemberNav'
import {
  computeSalesDailyMetrics,
  computeSalesMetrics,
  todayJstYmd,
  type DashCase,
  type DashCaseMember,
  type DashProperty,
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

type Props = {
  params: Promise<{ teamId: string }>
  searchParams: Promise<{ member?: string }>
}

export default async function TeamTodayDashboard({ params, searchParams }: Props) {
  const { teamId } = await params
  const { member: selectedMemberId } = await searchParams
  const supabase = await createClient()
  const today = new Date()
  const ymd = todayJstYmd(today)
  const ym = ymd.slice(0, 7)

  // 当月の月初〜月末（activity_log フィルタ用）— 月次累計と本日集計の両方に必要
  const monthStart = `${ym}-01T00:00:00`
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const nextMonthStart = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01T00:00:00`

  const [
    { data: team },
    { data: casesRaw },
    { data: caseMembersRaw },
    { data: membersRaw },
    { data: changesRaw },
    { data: propertiesRaw },
    { data: memberTargetsRaw },
  ] = await Promise.all([
    supabase.from('teams').select('id,name').eq('id', teamId).eq('is_active', true).single(),
    supabase
      .from('cases')
      .select('id,status,order_received_date,completion_date,expected_completion_date,fee_total,total_revenue_estimate,tax_filing_required'),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase
      .from('members')
      .select('id,name,avatar_color,avatar_url,primary_role,job_type,joined_at,team_id')
      .eq('is_active', true)
      .eq('team_id', teamId),
    supabase
      .from('activity_log')
      .select('entity_id,old_value,new_value,created_at')
      .eq('entity_type', 'case')
      .eq('action', 'status_change')
      .gte('created_at', monthStart)
      .lt('created_at', nextMonthStart),
    supabase.from('real_estate_properties').select('case_id,appraisal_status'),
    supabase
      .from('member_targets')
      .select('member_id,new_orders_count')
      .eq('ym', ym),
  ])

  if (!team) notFound()

  const cases = (casesRaw ?? []) as DashCase[]
  const caseMembers = (caseMembersRaw ?? []) as DashCaseMember[]
  const teamMembers = (membersRaw ?? []) as MemberRow[]
  const statusChanges = (changesRaw ?? []) as DashStatusChange[]
  const properties = (propertiesRaw ?? []) as DashProperty[]
  const memberTargetByMember = new Map(
    ((memberTargetsRaw ?? []) as Array<{ member_id: string; new_orders_count: number }>)
      .map(t => [t.member_id, t.new_orders_count]),
  )

  // 受注担当のみ抽出（管理は除外）
  const salesMembers = teamMembers.filter(m => m.primary_role === 'sales')

  // 個人フィルタ: ?member= で指定された人がチームの受注担当に居れば、そのメンバーのみ対象
  const focusedMember = selectedMemberId
    ? salesMembers.find(m => m.id === selectedMemberId) ?? null
    : null

  // KPI スコープのメンバー集合（個人指定時はその1名、未指定時はチーム全員）
  const scopeMembers = focusedMember ? [focusedMember] : salesMembers

  // スコープ案件IDセット
  const scopeCaseIds = new Set<string>()
  for (const m of scopeMembers) {
    for (const cm of caseMembers) {
      if (cm.member_id === m.id && cm.role === 'sales') scopeCaseIds.add(cm.case_id)
    }
  }
  const scopeCases = cases.filter(c => scopeCaseIds.has(c.id))
  const scopeChanges = statusChanges.filter(sc => scopeCaseIds.has(sc.entity_id))
  const scopeProperties = properties.filter(p => scopeCaseIds.has(p.case_id))

  // TOP の本日 KPI
  const dailyMetrics = computeSalesDailyMetrics(scopeCases, scopeChanges, scopeProperties, today)

  // チーム合算（テーブル上部の小計）
  const teamCaseIds = new Set<string>()
  for (const m of salesMembers) {
    for (const cm of caseMembers) {
      if (cm.member_id === m.id && cm.role === 'sales') teamCaseIds.add(cm.case_id)
    }
  }
  const teamFilteredCases = cases.filter(c => teamCaseIds.has(c.id))
  const teamFilteredChanges = statusChanges.filter(sc => teamCaseIds.has(sc.entity_id))
  const teamFilteredProperties = properties.filter(p => teamCaseIds.has(p.case_id))
  const teamDailyMetrics = computeSalesDailyMetrics(teamFilteredCases, teamFilteredChanges, teamFilteredProperties, today)
  const teamMonthlyMetrics = computeSalesMetrics(teamFilteredCases, teamFilteredChanges, ym, teamFilteredProperties)

  // 個人別の本日成績（テーブルの個人行）
  const memberRows: SalesDailyMemberRow[] = salesMembers
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map(m => {
      const myCaseIds = new Set(
        caseMembers
          .filter(cm => cm.member_id === m.id && cm.role === 'sales')
          .map(cm => cm.case_id),
      )
      const myCases = cases.filter(c => myCaseIds.has(c.id))
      const myChanges = statusChanges.filter(sc => myCaseIds.has(sc.entity_id))
      const myProperties = properties.filter(p => myCaseIds.has(p.case_id))
      const myDaily = computeSalesDailyMetrics(myCases, myChanges, myProperties, today)
      const myMonthly = computeSalesMetrics(myCases, myChanges, ym, myProperties)
      const myTarget = memberTargetByMember.get(m.id) ?? 0
      const achieved = myTarget > 0 && myMonthly.newOrdersCount >= myTarget
      return {
        id: m.id,
        name: m.name,
        avatarUrl: m.avatar_url,
        jobType: m.job_type,
        joinedAt: m.joined_at,
        daily: myDaily,
        newOrdersTarget: myTarget,
        monthlyNewOrders: myMonthly.newOrdersCount,
        achieved,
      }
    })

  const tableGroup: SalesDailyTeamGroup = {
    teamName: team.name,
    teamDaily: teamDailyMetrics,
    teamMonthlyNewOrders: teamMonthlyMetrics.newOrdersCount,
    members: memberRows,
  }

  // メンバー切替ナビ（受注担当ダッシュボードなので、受注担当のみ表示）
  const achievedMemberIds = new Set(memberRows.filter(r => r.achieved).map(r => r.id))
  const navMembers: TeamNavMember[] = teamMembers
    .filter(m => m.primary_role === 'sales')
    .map(m => ({
      id: m.id,
      name: m.name,
      avatarColor: m.avatar_color ?? '#6B7280',
      avatarUrl: m.avatar_url,
      primaryRole: m.primary_role as 'sales' | 'manager',
      achieved: achievedMemberIds.has(m.id),
    }))

  const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${['日','月','火','水','木','金','土'][today.getDay()]}）`

  const scopeLabel = focusedMember ? focusedMember.name : `${team.name}`

  return (
    <div>
      <PageHeader
        eyebrow="Team · Sales · Today"
        title={`${team.name}・受注担当 本日`}
        icon={Users}
        description={`${dateLabel}・受注担当の本日の動きとチームの本日成績`}
      />

      <TeamMemberNav
        teamId={teamId}
        teamName={team.name}
        members={navMembers}
        currentMemberId={selectedMemberId}
        buildTeamHref={(tid) => `/dashboard/team/${tid}`}
        buildMemberHref={(mid, tid) => `/dashboard/team/${tid}?member=${mid}`}
      />

      <div className="space-y-3">
        <SalesDailyKpis scopeLabel={scopeLabel} metrics={dailyMetrics} />
        <SalesDailyTeamTable groups={[tableGroup]} today={today} ym={ym} />
      </div>
    </div>
  )
}
