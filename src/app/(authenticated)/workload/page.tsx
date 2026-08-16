import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { Gauge } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import WorkloadClient, { type WorkloadTeam, type WorkloadRow, type ManagerCandidate, type UnassignedCaseRow } from '@/components/features/workload/WorkloadClient'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import type { MemberRow } from '@/types'

// 稼働状況一覧に出す担当区分（経理は除外）
const INCLUDED_ROLES = ['manager', 'sales', 'assistant'] as const
// 「担当案件」から除外する決着済みステータス
const INACTIVE_CASE = new Set(['完了', '失注'])

type Props = { searchParams: Promise<{ assignCaseId?: string }> }

export default async function WorkloadPage({ searchParams }: Props) {
  const sp = await searchParams
  const assignCaseId = sp.assignCaseId ?? null
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  const [teamsRes, dtmRes, membersRes, cmRes, jutakuRes] = await Promise.all([
    supabase.from('teams').select('id, name').eq('is_active', true).order('name'),
    supabase.from('dashboard_team_members').select('team_id, member_id'),
    supabase.from('members').select('*').eq('is_active', true).order('name'),
    supabase.from('case_members').select('member_id, role, cases(id, status, expected_completion_date)'),
    // 割り振り待ち: 受注系（受注/戻り受注/作業着手準備）案件。受注担当・難易度等も取得
    supabase.from('cases')
      .select('id, case_number, deal_name, status, order_received_date, order_date, difficulty, difficulty_reasons, difficulty_reason_other, service_category, service_category_2, order_sheet_completed_at, case_members(role, members(id, name, team_id))')
      .in('status', ['受注', '戻り受注', '作業着手準備']),
  ])

  const teams = (teamsRes.data ?? []) as { id: string; name: string }[]
  const teamNameById = new Map(teams.map(t => [t.id, t.name]))
  const dtm = (dtmRes.data ?? []) as { team_id: string; member_id: string }[]
  const members = (membersRes.data ?? []) as MemberRow[]
  const cms = (cmRes.data ?? []) as Array<{
    member_id: string
    role: string
    cases: { id: string; status: string; expected_completion_date: string | null } | { id: string; status: string; expected_completion_date: string | null }[] | null
  }>

  const ym = todayJstYmd(new Date()).slice(0, 7)
  const nowYear = new Date().getFullYear()

  // 「自分の担当区分（primary_role）での担当案件」だけを数える
  const roleOf = new Map(members.map(m => [m.id, m.primary_role ?? '']))
  const activeByMember = new Map<string, number>()
  const monthByMember = new Map<string, number>()
  const managerCaseIds = new Set<string>()  // 管理担当が既にいる案件
  for (const cm of cms) {
    const c = Array.isArray(cm.cases) ? cm.cases[0] : cm.cases
    if (!c) continue
    if (cm.role === 'manager') managerCaseIds.add(c.id)
    if (roleOf.get(cm.member_id) !== cm.role) continue
    if (!INACTIVE_CASE.has(c.status)) {
      activeByMember.set(cm.member_id, (activeByMember.get(cm.member_id) ?? 0) + 1)
    }
    if ((c.expected_completion_date ?? '').startsWith(ym) && c.status !== '完了') {
      monthByMember.set(cm.member_id, (monthByMember.get(cm.member_id) ?? 0) + 1)
    }
  }

  // 割り振り待ち: 受注系かつ管理担当が未設定の案件
  type JCM = { role: string; members: { id: string; name: string; team_id: string | null } | { id: string; name: string; team_id: string | null }[] | null }
  type JCase = {
    id: string; case_number: string; deal_name: string; status: string
    order_received_date: string | null; order_date: string | null
    difficulty: string | null; difficulty_reasons: string[] | null; difficulty_reason_other: string | null
    service_category: string | null; service_category_2: string | null
    order_sheet_completed_at: string | null
    case_members: JCM[] | null
  }
  const jutaku = (jutakuRes.data ?? []) as JCase[]
  const oneMember = (cm: JCM) => (Array.isArray(cm.members) ? cm.members[0] : cm.members) ?? null
  const unassignedJutaku = jutaku.filter(c => !managerCaseIds.has(c.id))
  const unassignedCases = unassignedJutaku
    .map(c => ({ id: c.id, caseNumber: c.case_number, dealName: c.deal_name, orderSheetReady: !!c.order_sheet_completed_at }))

  // 割り振り待ちテーブル用の行（受注日・経過日数・受注担当・チーム・難易度…）。経過日数の降順（放置が長い順）。
  const todayMs = Date.parse(todayJstYmd(new Date()))
  const elapsedOf = (d: string | null): number | null => {
    if (!d) return null
    const ms = Date.parse(d.slice(0, 10))
    return Number.isNaN(ms) ? null : Math.max(0, Math.floor((todayMs - ms) / 86400000))
  }
  const unassignedRows: UnassignedCaseRow[] = unassignedJutaku.map(c => {
    const salesCm = (c.case_members ?? []).find(x => x.role === 'sales')
    const salesM = salesCm ? oneMember(salesCm) : null
    const orderDate = c.order_received_date ?? c.order_date
    const teamId = salesM?.team_id ?? null
    const reasons = [...(c.difficulty_reasons ?? []), c.difficulty_reason_other].filter(Boolean) as string[]
    return {
      id: c.id,
      orderDate,
      elapsedDays: elapsedOf(orderDate),
      caseNumber: c.case_number,
      dealName: c.deal_name,
      status: c.status,
      teamId,
      teamName: teamId ? (teamNameById.get(teamId) ?? null) : null,
      salesName: salesM?.name ?? null,
      serviceCategory: [c.service_category, c.service_category_2].filter(Boolean).join(' / ') || null,
      difficulty: c.difficulty,
      difficultyReason: reasons.length ? reasons.join('・') : null,
    }
  }).sort((a, b) => (b.elapsedDays ?? -1) - (a.elapsedDays ?? -1))

  // 案件詳細の「割り振り」から来た案件は、ステータス（受注以外でも）・管理担当の有無にかかわらず必ず選べるようにする。
  if (assignCaseId && !unassignedCases.some(c => c.id === assignCaseId)) {
    const { data: target } = await supabase
      .from('cases')
      .select('id, case_number, deal_name, order_sheet_completed_at')
      .eq('id', assignCaseId)
      .maybeSingle()
    if (target) {
      const t = target as { id: string; case_number: string; deal_name: string; order_sheet_completed_at: string | null }
      unassignedCases.unshift({ id: t.id, caseNumber: t.case_number, dealName: t.deal_name, orderSheetReady: !!t.order_sheet_completed_at })
    }
  }

  // チーム→メンバー（dashboard_team_members 優先、無ければ members.team_id）
  const dtmByTeam = new Map<string, Set<string>>()
  for (const r of dtm) {
    if (!dtmByTeam.has(r.team_id)) dtmByTeam.set(r.team_id, new Set())
    dtmByTeam.get(r.team_id)!.add(r.member_id)
  }
  // ロスター(dashboard_team_members)に居ればそのチーム。居ないメンバーは members.team_id で補完する
  // （新規追加メンバーがロスター未登録でも稼働状況一覧に出るように）。
  const memberInAnyDtm = new Set(dtm.map(r => r.member_id))
  const teamMembers = (teamId: string): MemberRow[] =>
    members.filter(m =>
      (dtmByTeam.get(teamId)?.has(m.id) ?? false)
      || (!memberInAnyDtm.has(m.id) && m.team_id === teamId),
    )

  const yearsOf = (joined: string | null | undefined): number | null => {
    if (!joined) return null
    const y = nowYear - new Date(joined).getFullYear()
    return y >= 0 ? y : null
  }

  // 割り振り先候補（管理担当）＝ 全社の manager。所属チーム（複数可）と現在の担当案件数を持たせる。
  const teamsOfMember = (memberId: string): { id: string; name: string }[] =>
    teams.filter(t => teamMembers(t.id).some(m => m.id === memberId))
  const managers: ManagerCandidate[] = members
    .filter(m => m.primary_role === 'manager')
    .map(m => {
      const ts = teamsOfMember(m.id)
      return {
        memberId: m.id,
        name: m.name,
        teamIds: ts.map(t => t.id),
        teamNames: ts.map(t => t.name).join('・') || null,
        jobType: m.job_type ?? null,
        years: yearsOf(m.joined_at),
        activeCount: activeByMember.get(m.id) ?? 0,
      }
    })

  const workloadTeams: WorkloadTeam[] = teams.map(t => ({
    id: t.id,
    name: t.name,
    rows: teamMembers(t.id)
      .filter(m => (INCLUDED_ROLES as readonly string[]).includes(m.primary_role ?? ''))
      .map<WorkloadRow>(m => ({
        memberId: m.id,
        name: m.name,
        teamName: t.name,
        primaryRole: m.primary_role ?? '',
        jobType: m.job_type ?? null,
        years: yearsOf(m.joined_at),
        activeCount: activeByMember.get(m.id) ?? 0,
        thisMonthCount: monthByMember.get(m.id) ?? 0,
      })),
  }))

  // デフォルトチーム＝現在ユーザーの所属（ロスター優先、無ければ members.team_id）
  let defaultTeamId = teams[0]?.id ?? null
  if (currentUser?.memberId) {
    const dtmTeam = dtm.find(r => r.member_id === currentUser.memberId)?.team_id
    const me = members.find(m => m.id === currentUser.memberId)
    defaultTeamId = dtmTeam ?? me?.team_id ?? defaultTeamId
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workload"
        title="稼働状況一覧"
        icon={Gauge}
        description="チーム・担当区分ごとの稼働状況。管理担当の割り振りに使用します。"
      />
      <WorkloadClient teams={workloadTeams} defaultTeamId={defaultTeamId} assignCaseId={assignCaseId} unassignedCases={unassignedCases} unassignedRows={unassignedRows} managers={managers} />
    </div>
  )
}
