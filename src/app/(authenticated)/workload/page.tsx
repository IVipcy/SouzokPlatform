import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { Gauge } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import WorkloadClient, { type WorkloadTeam, type WorkloadRow } from '@/components/features/workload/WorkloadClient'
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

  const [teamsRes, dtmRes, membersRes, cmRes] = await Promise.all([
    supabase.from('teams').select('id, name').eq('is_active', true).order('name'),
    supabase.from('dashboard_team_members').select('team_id, member_id'),
    supabase.from('members').select('*').eq('is_active', true).order('name'),
    supabase.from('case_members').select('member_id, role, cases(id, status, expected_completion_date)'),
  ])

  const teams = (teamsRes.data ?? []) as { id: string; name: string }[]
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
  for (const cm of cms) {
    const c = Array.isArray(cm.cases) ? cm.cases[0] : cm.cases
    if (!c) continue
    if (roleOf.get(cm.member_id) !== cm.role) continue
    if (!INACTIVE_CASE.has(c.status)) {
      activeByMember.set(cm.member_id, (activeByMember.get(cm.member_id) ?? 0) + 1)
    }
    if ((c.expected_completion_date ?? '').startsWith(ym) && c.status !== '完了') {
      monthByMember.set(cm.member_id, (monthByMember.get(cm.member_id) ?? 0) + 1)
    }
  }

  // チーム→メンバー（dashboard_team_members 優先、無ければ members.team_id）
  const dtmByTeam = new Map<string, Set<string>>()
  for (const r of dtm) {
    if (!dtmByTeam.has(r.team_id)) dtmByTeam.set(r.team_id, new Set())
    dtmByTeam.get(r.team_id)!.add(r.member_id)
  }
  const useDtm = dtm.length > 0
  const teamMembers = (teamId: string): MemberRow[] =>
    useDtm && dtmByTeam.has(teamId)
      ? members.filter(m => dtmByTeam.get(teamId)!.has(m.id))
      : members.filter(m => m.team_id === teamId)

  const yearsOf = (joined: string | null | undefined): number | null => {
    if (!joined) return null
    const y = nowYear - new Date(joined).getFullYear()
    return y >= 0 ? y : null
  }

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

  // デフォルトチーム＝現在ユーザーの所属
  let defaultTeamId = teams[0]?.id ?? null
  if (currentUser?.memberId) {
    if (useDtm) {
      const found = dtm.find(r => r.member_id === currentUser.memberId)
      if (found) defaultTeamId = found.team_id
    } else {
      const me = members.find(m => m.id === currentUser.memberId)
      if (me?.team_id) defaultTeamId = me.team_id
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workload"
        title="稼働状況一覧"
        icon={Gauge}
        description="チーム・担当区分ごとの稼働状況。管理担当の割り振りに使用します。"
      />
      <WorkloadClient teams={workloadTeams} defaultTeamId={defaultTeamId} assignCaseId={assignCaseId} />
    </div>
  )
}
