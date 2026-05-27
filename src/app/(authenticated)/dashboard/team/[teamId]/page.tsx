import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import SalesDailyKpis from '@/components/features/dashboard/SalesDailyKpis'
import SalesDailyTeamTable, {
  type SalesDailyTeamGroup,
  type SalesDailyMemberRow,
} from '@/components/features/dashboard/SalesDailyTeamTable'
import TeamMemberTabs, { type TeamMemberEntry } from '@/components/features/dashboard/TeamMemberTabs'
import PeriodSwitcher from '@/components/features/dashboard/PeriodSwitcher'
import { parsePeriod } from '@/lib/dashboardPeriod'
import DashboardViewTabs from '@/components/features/dashboard/DashboardViewTabs'
import MonthlyMeetingsTable from '@/components/features/dashboard/MonthlyMeetingsTable'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
import type { TaskRow } from '@/types'
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
  searchParams: Promise<{ member?: string; period?: string; view?: string }>
}

export default async function TeamTodayDashboard({ params, searchParams }: Props) {
  const { teamId } = await params
  const { member: selectedMemberId, period, view } = await searchParams
  const currentPeriod = parsePeriod(period)
  const currentView: 'stats' | 'meetings' = view === 'meetings' ? 'meetings' : 'stats'
  const periodLabel = currentPeriod === 'today' ? '本日'
    : currentPeriod === 'month' ? '当月'
    : currentPeriod === 'ytd' ? '年度累計' : '月別'
  const supabase = await createClient()
  const today = new Date()
  const ymd = todayJstYmd(today)
  const ym = ymd.slice(0, 7)

  // 当月の月初〜月末（activity_log フィルタ用）— 月次累計と本日集計の両方に必要
  const monthStart = `${ym}-01T00:00:00`
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const nextMonthStart = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01T00:00:00`

  // 必須クエリ（既存テーブルのみ。これらが失敗するとページが開けない想定）
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
    // 安全のため * を使用（新カラム meeting_executed_date 等の migration 適用前でも動くように）
    supabase.from('cases').select('*'),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase
      .from('members')
      .select('id,name,avatar_color,avatar_url,primary_role,job_type,joined_at,team_id')
      .eq('is_active', true),
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

  // 新規追加テーブル系（migration 未適用でも安全にフォールバック）
  let systemTasksRaw: unknown[] | null = null
  try {
    const { data } = await supabase
      .from('tasks')
      .select('*, cases(id, case_number, deal_name, status)')
      .eq('task_kind', 'system')
      .neq('status', '完了')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(100)
    systemTasksRaw = data
  } catch { /* migration 046 未適用 → 空扱い */ }

  let teamMembersRaw: Array<{ id: string; member_id: string; kind: 'member' | 'mentor' }> | null = null
  try {
    const { data } = await supabase
      .from('dashboard_team_members')
      .select('id, member_id, kind')
      .eq('team_id', teamId)
    teamMembersRaw = (data ?? null) as typeof teamMembersRaw
  } catch { /* migration 048 未適用 → フォールバックロジックで対応 */ }

  if (!team) notFound()

  const cases = (casesRaw ?? []) as DashCase[]
  const caseMembers = (caseMembersRaw ?? []) as DashCaseMember[]
  const allActiveMembers = (membersRaw ?? []) as MemberRow[]
  // dashboard_team_members からチーム編成を読む（migration 048 未適用環境でも動くようフォールバック）
  const teamMemberRows = (teamMembersRaw ?? []) as Array<{ id: string; member_id: string; kind: 'member' | 'mentor' }>
  const teamMemberMap = new Map(teamMemberRows.map(r => [r.member_id, r]))
  // 「このチームのメンバー」
  //   - dashboard_team_members が存在 (≥1行) するなら、そこに登録されている人
  //   - 未マイグレーション or 未登録の場合は、members.team_id でフォールバック
  const teamMembers = teamMemberRows.length > 0
    ? allActiveMembers.filter(m => teamMemberMap.has(m.id))
    : allActiveMembers.filter(m => m.team_id === teamId)
  const statusChanges = (changesRaw ?? []) as DashStatusChange[]
  const properties = (propertiesRaw ?? []) as DashProperty[]
  const memberTargetByMember = new Map(
    ((memberTargetsRaw ?? []) as Array<{ member_id: string; new_orders_count: number }>)
      .map(t => [t.member_id, t.new_orders_count]),
  )

  // 受注担当のみ抽出（管理は除外）+ メンター(kind='mentor')は集計に含めない
  // dashboard_team_members に未登録 (フォールバック) の場合は kind は 'member' 扱い
  const salesMembers = teamMembers.filter(m => {
    if (m.primary_role !== 'sales') return false
    const tm = teamMemberMap.get(m.id)
    if (!tm) return true  // フォールバック: dashboard_team_members 不在の場合
    return tm.kind === 'member'
  })

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

  // メンバータブ用エントリ（受注担当ダッシュボードなので、受注担当のみ表示）
  const achievedMemberIds = new Set(memberRows.filter(r => r.achieved).map(r => r.id))
  const memberEntries: TeamMemberEntry[] = teamMembers
    .filter(m => m.primary_role === 'sales')
    .map(m => {
      const tm = teamMemberMap.get(m.id)
      return {
        id: tm?.id,
        member_id: m.id,
        name: m.name,
        avatar_color: m.avatar_color,
        avatar_url: m.avatar_url,
        primary_role: m.primary_role,
        kind: tm?.kind ?? 'member',
        achieved: achievedMemberIds.has(m.id),
      }
    })

  // メンバー追加候補（全アクティブメンバーから、まだチームに登録されていない受注担当）
  const candidateMembers = allActiveMembers
    .filter(m => m.primary_role === 'sales' && !teamMemberMap.has(m.id))
    .map(m => ({
      id: m.id,
      name: m.name,
      avatar_color: m.avatar_color,
      avatar_url: m.avatar_url,
      primary_role: m.primary_role,
    }))

  const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${['日','月','火','水','木','金','土'][today.getDay()]}）`

  const scopeLabel = focusedMember ? focusedMember.name : `${team.name}`

  return (
    <div>
      <PageHeader
        eyebrow="Team · Sales"
        title={`${team.name}・受注担当 ${periodLabel}`}
        icon={Users}
        description={`${dateLabel}・受注担当の${periodLabel}の動きとチーム成績`}
      />

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <PeriodSwitcher />
      </div>

      <div className="space-y-3">
        <SalesDailyKpis scopeLabel={scopeLabel} metrics={dailyMetrics} />

        {/* メンバータブ + 追加機能（サマリの下に配置） */}
        <TeamMemberTabs
          teamId={teamId}
          entries={memberEntries}
          candidates={candidateMembers}
          selectedMemberId={selectedMemberId}
          basePath={`/dashboard/team/${teamId}`}
        />

        {/* ビュー切替タブ（受注数値 / 面談一覧） */}
        {(() => {
          const monthlyMeetings = scopeCases
            .filter(c =>
              (c.meeting_date && c.meeting_date.startsWith(ym)) ||
              (c.meeting_executed_date && c.meeting_executed_date.startsWith(ym))
            )
            .map(c => ({
              id: c.id,
              case_number: c.case_number ?? '',
              deal_name: c.deal_name ?? '',
              status: c.status,
              meeting_date: c.meeting_date ?? null,
              meeting_executed_date: c.meeting_executed_date ?? null,
              client_response_due_date: c.client_response_due_date ?? null,
              meeting_place: c.meeting_place ?? null,
              lost_reason: c.lost_reason ?? null,
            }))
          return (
            <>
              <DashboardViewTabs
                current={currentView}
                tabs={[
                  { value: 'stats',    label: '受注数値' },
                  { value: 'meetings', label: '面談一覧', count: monthlyMeetings.length },
                ]}
              />
              {currentView === 'stats' ? (
                <SalesDailyTeamTable groups={[tableGroup]} today={today} ym={ym} />
              ) : (
                <MonthlyMeetingsTable
                  cases={monthlyMeetings}
                  title={`📅 ${ym} の面談一覧（${focusedMember ? focusedMember.name : team.name}チーム）`}
                />
              )}
            </>
          )
        })()}

        {/* システムタスク（フォーカスされたメンバー / チーム全体） */}
        {(() => {
          const allSystemTasks = (systemTasksRaw ?? []) as TaskRow[]
          // スコープ案件IDで絞り込み
          const scopedSystemTasks = allSystemTasks.filter(t => scopeCaseIds.has(t.case_id))
          if (scopedSystemTasks.length === 0) return null
          return (
            <SystemTaskList
              tasks={scopedSystemTasks}
              title={focusedMember
                ? `${focusedMember.name} さんのタスク`
                : `${team.name}チームのタスク`}
              emptyText="未完了のタスクはありません"
              showCase={true}
              includeCompleted={false}
              limit={15}
              seeAllHref="/tasks?kind=system"
            />
          )
        })()}
      </div>
    </div>
  )
}
