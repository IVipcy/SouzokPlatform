import { createClient } from '@/lib/supabase/server'
import { Building2 } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import DeptDashboardTabs from '@/components/features/dashboard/DeptDashboardTabs'
import MemberPerformanceTable, { type MemberWithProfile } from '@/components/features/dashboard/MemberPerformanceTable'
import SalesTeamTable, { type SalesTeamGroup, type SalesMemberRow } from '@/components/features/dashboard/SalesTeamTable'
import DashboardAchievementPopup from '@/components/features/dashboard/DashboardAchievementPopup'
import PeriodSwitcher from '@/components/features/dashboard/PeriodSwitcher'
import { parsePeriod } from '@/lib/dashboardPeriod'
import {
  computeMetrics,
  computeDailyMetrics,
  computeProcedureBreakdown,
  computeSalesMetrics,
  computeSalesMetricsForDay,
  formatMan,
  EMPTY_DEPT_TARGET,
  fiscalYearMonthsToDate,
  isDeptAchieved,
  type DashCase,
  type DashCaseMember,
  type DashStatusChange,
  type DeptTargetRow,
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await searchParams
  const currentPeriod = parsePeriod(period)
  const periodLabel = currentPeriod === 'today' ? '本日' : currentPeriod === 'month' ? '当月' : '年度累計'
  const supabase = await createClient()
  const today = new Date()
  const thisYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  // 当月の月初〜月末（activity_log フィルタ用 — 受注担当の達成判定に使う）
  const monthStart = `${thisYm}-01T00:00:00`
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const nextMonthStart = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01T00:00:00`

  const [
    { data: casesRaw },
    { data: caseMembersRaw },
    { data: membersRaw },
    { data: teamsRaw },
    { data: targetRaw },
    { data: memberTargetsRaw },
    { data: statusChangesRaw },
  ] = await Promise.all([
    supabase
      .from('cases')
      .select('id,status,order_received_date,completion_date,fee_total,total_revenue_estimate,procedure_type,meeting_executed_date'),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase
      .from('members')
      .select('id,name,avatar_color,avatar_url,primary_role,job_type,joined_at,team_id,is_active')
      .eq('is_active', true),
    supabase.from('teams').select('id,name').eq('is_active', true),
    supabase
      .from('dept_targets')
      .select('ym,new_orders,managing,completed,cycle_months,completed_amount')
      .eq('ym', thisYm)
      .maybeSingle(),
    supabase
      .from('member_targets')
      .select('member_id,new_orders_count')
      .eq('ym', thisYm),
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
  const members = (membersRaw ?? []) as MemberRow[]
  const teams = (teamsRaw ?? []) as TeamRow[]
  const statusChanges = (statusChangesRaw ?? []) as DashStatusChange[]
  const memberTargets = (memberTargetsRaw ?? []) as Array<{ member_id: string; new_orders_count: number }>
  const memberTargetByMember = new Map(memberTargets.map(t => [t.member_id, t.new_orders_count]))
  const teamMap: Record<string, string> = Object.fromEntries(teams.map(t => [t.id, t.name]))

  // 部全体・当月のKPI
  const summary = computeMetrics(cases, thisYm)

  // 当月の手続区分別 内訳
  const breakdown = computeProcedureBreakdown(cases, thisYm)

  // 目標値（未設定なら 0 埋め）
  const initialTarget: DeptTargetRow = targetRaw
    ? {
        ym: targetRaw.ym,
        new_orders: targetRaw.new_orders ?? 0,
        managing: targetRaw.managing ?? 0,
        completed: targetRaw.completed ?? 0,
        cycle_months: Number(targetRaw.cycle_months ?? 0),
        completed_amount: Number(targetRaw.completed_amount ?? 0),
      }
    : { ym: thisYm, ...EMPTY_DEPT_TARGET }

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

  // 本日 / 年度累計 用の部全体サマリ
  const dailyMetrics = computeDailyMetrics(cases, statusChanges, today)
  const ytdSummary = (() => {
    let newOrders = 0, completed = 0, completedAmount = 0, cycleSum = 0, cycleN = 0
    for (const m of months) {
      const mm = computeMetrics(cases, m)
      newOrders += mm.newOrders
      completed += mm.completed
      completedAmount += mm.completedAmount
      if (mm.cycleMonths !== null) { cycleSum += mm.cycleMonths * mm.completed; cycleN += mm.completed }
    }
    return { newOrders, managing: summary.managing, completed, completedAmount, cycleMonths: cycleN > 0 ? cycleSum / cycleN : null }
  })()

  // 受注担当の達成判定（個人月間目標 = 新規受注件数 を達成しているか）
  // → アバターにレインボーリングを表示するため
  const achievedMemberIds = new Set<string>()
  for (const m of members) {
    if (m.primary_role !== 'sales') continue
    const target = memberTargetByMember.get(m.id) ?? 0
    if (target <= 0) continue
    // この受注担当が role='sales' で紐づく案件
    const mySalesCaseIds = new Set(
      caseMembers
        .filter(cm => cm.role === 'sales' && cm.member_id === m.id)
        .map(cm => cm.case_id),
    )
    const myCases = cases.filter(c => mySalesCaseIds.has(c.id))
    const myChanges = statusChanges.filter(sc => mySalesCaseIds.has(sc.entity_id))
    const myMetrics = computeSalesMetrics(myCases, myChanges, thisYm)
    if (myMetrics.newOrdersCount >= target) {
      achievedMemberIds.add(m.id)
    }
  }

  // 本日ビュー用: 受注担当の「チーム別／個人別」テーブル（当月と同じ項目で本日分の数字）
  const salesCaseIdsByMember = new Map<string, Set<string>>()
  for (const cm of caseMembers) {
    if (cm.role !== 'sales') continue
    if (!salesCaseIdsByMember.has(cm.member_id)) salesCaseIdsByMember.set(cm.member_id, new Set())
    salesCaseIdsByMember.get(cm.member_id)!.add(cm.case_id)
  }
  const salesMembersForTable = members.filter(m => m.primary_role === 'sales')
  const byTeamSales = new Map<string, MemberRow[]>()
  for (const m of salesMembersForTable) {
    const key = m.team_id ?? '__unassigned__'
    if (!byTeamSales.has(key)) byTeamSales.set(key, [])
    byTeamSales.get(key)!.push(m)
  }
  const salesGroupKeys = [...byTeamSales.keys()].sort((a, b) => {
    if (a === '__unassigned__') return 1
    if (b === '__unassigned__') return -1
    return (teamMap[a] ?? '').localeCompare(teamMap[b] ?? '', 'ja')
  })
  const dailySalesGroups: SalesTeamGroup[] = salesGroupKeys.map(key => {
    const mem = byTeamSales.get(key)!
    const teamCaseIds = new Set<string>()
    for (const m of mem) {
      const s = salesCaseIdsByMember.get(m.id)
      if (s) for (const id of s) teamCaseIds.add(id)
    }
    const teamCases = cases.filter(c => teamCaseIds.has(c.id))
    const teamChanges = statusChanges.filter(sc => teamCaseIds.has(sc.entity_id))
    const teamMetrics = computeSalesMetricsForDay(teamCases, teamChanges, today)
    const memberRows: SalesMemberRow[] = mem
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      .map(m => {
        const ids = salesCaseIdsByMember.get(m.id) ?? new Set<string>()
        const myCases = cases.filter(c => ids.has(c.id))
        const myChanges = statusChanges.filter(sc => ids.has(sc.entity_id))
        return {
          id: m.id,
          name: m.name,
          avatarColor: m.avatar_color ?? '#6B7280',
          avatarUrl: m.avatar_url,
          jobType: m.job_type,
          joinedAt: m.joined_at,
          metrics: computeSalesMetricsForDay(myCases, myChanges, today),
          newOrdersTarget: memberTargetByMember.get(m.id) ?? 0,
          achieved: achievedMemberIds.has(m.id),
        }
      })
    return {
      teamName: key === '__unassigned__' ? '未所属' : (teamMap[key] ?? '不明'),
      teamMetrics,
      members: memberRows,
    }
  })

  // 達成判定（目標が1つでも設定されていればポップアップ表示）
  const achievement = isDeptAchieved(summary, initialTarget)

  return (
    <div>
      {currentPeriod === 'month' && achievement.hasTargets && (
        <DashboardAchievementPopup
          isAchieved={achievement.achieved}
          storageKey={`dash-popup-dept-${thisYm}`}
        />
      )}
      <PageHeader
        eyebrow="Department"
        title={`部全体ダッシュボード ${periodLabel}`}
        icon={Building2}
        description={`${today.getFullYear()}年度・相続事業部のサマリーとメンバー別成績`}
      />
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <PeriodSwitcher />
      </div>
      <div className="space-y-3">
        {currentPeriod === 'month' ? (
          <>
            <DeptDashboardTabs
              ym={thisYm}
              monthLabel={monthLabel}
              metrics={summary}
              initialTarget={initialTarget}
              breakdown={breakdown}
            />
            <MemberPerformanceTable
              members={tableMembers}
              cases={cases}
              caseMembers={caseMembers}
              months={[thisYm]}
              today={today}
              achievedMemberIds={achievedMemberIds}
            />
          </>
        ) : currentPeriod === 'today' ? (
          <>
            <DeptSummaryCards
              title="本日のサマリー"
              items={[
                { label: '新規受注', value: String(dailyMetrics.newOrders), unit: '件' },
                { label: '管理着手', value: String(dailyMetrics.startedManaging), unit: '件' },
                { label: '完了', value: String(dailyMetrics.completed), unit: '件' },
                { label: '完了金額', value: formatMan(dailyMetrics.completedAmount), unit: '万円' },
                { label: 'サイクル', value: dailyMetrics.cycleMonths === null ? '-' : dailyMetrics.cycleMonths.toFixed(1), unit: 'カ月/件' },
              ]}
            />
            <SalesTeamTable groups={dailySalesGroups} today={today} ym={thisYm} title="チーム別／個人別 本日成績" />
          </>
        ) : (
          <>
            <DeptSummaryCards
              title="年度累計のサマリー"
              items={[
                { label: '新規受注', value: String(ytdSummary.newOrders), unit: '件' },
                { label: '管理中', value: String(ytdSummary.managing), unit: '件' },
                { label: '完了', value: String(ytdSummary.completed), unit: '件' },
                { label: '完了金額', value: formatMan(ytdSummary.completedAmount), unit: '万円' },
                { label: 'サイクル', value: ytdSummary.cycleMonths === null ? '-' : ytdSummary.cycleMonths.toFixed(1), unit: 'カ月/件' },
              ]}
            />
            <MemberPerformanceTable
              members={tableMembers}
              cases={cases}
              caseMembers={caseMembers}
              months={months}
              today={today}
              achievedMemberIds={achievedMemberIds}
              showCumulative
            />
          </>
        )}
      </div>
    </div>
  )
}

function DeptSummaryCards({ title, items }: { title: string; items: { label: string; value: string; unit: string }[] }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900 mb-4">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map(k => (
          <div key={k.label} className="bg-white border border-gray-300 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-center">
              <div className="text-[13px] font-semibold text-gray-700">{k.label}</div>
            </div>
            <div className="px-3 py-4 text-center">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-[26px] font-extrabold leading-none text-gray-900 tracking-tight">{k.value}</span>
                <span className="text-[13px] font-bold text-gray-500">{k.unit}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
