import { createClient } from '@/lib/supabase/server'
import { Building2 } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import DeptDashboardTabs from '@/components/features/dashboard/DeptDashboardTabs'
import MemberPerformanceTable, { type MemberWithProfile } from '@/components/features/dashboard/MemberPerformanceTable'
import DashboardAchievementPopup from '@/components/features/dashboard/DashboardAchievementPopup'
import {
  computeMetrics,
  computeProcedureBreakdown,
  computeSalesMetrics,
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

export default async function DashboardPage() {
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
      .select('id,status,order_received_date,completion_date,fee_total,total_revenue_estimate,procedure_type'),
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

  // 達成判定（目標が1つでも設定されていればポップアップ表示）
  const achievement = isDeptAchieved(summary, initialTarget)

  return (
    <div>
      {achievement.hasTargets && (
        <DashboardAchievementPopup
          isAchieved={achievement.achieved}
          storageKey={`dash-popup-dept-${thisYm}`}
        />
      )}
      <PageHeader
        eyebrow="Department · Monthly"
        title="部全体ダッシュボード"
        icon={Building2}
        description={`${today.getFullYear()}年度・相続事業部の月次サマリーとメンバー別成績`}
      />
      <div className="space-y-3">
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
          months={months}
          today={today}
          achievedMemberIds={achievedMemberIds}
        />
      </div>
    </div>
  )
}
