import Link from 'next/link'
import { Compass, Users } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/server'

type Team = { id: string; name: string; sort_order: number }

/**
 * 管理担当 全体ダッシュボード
 * - 各チームの集計値を一覧表示
 * - チーム別の詳細は /dashboard/manager/[teamId] に遷移
 *
 * 主KPI: 請求完了件数（invoices.status='入金済' の件数）+ 担当案件数
 */
export default async function ManagerOverviewPage() {
  const supabase = await createClient()
  const today = new Date()
  const ymd = today.toISOString().split('T')[0]
  const ym = ymd.slice(0, 7)

  const [{ data: teamsRaw }, { data: casesRaw }, { data: caseMembersRaw }, { data: membersRaw }, { data: invoicesRaw }, { data: teamMembersRaw }] = await Promise.all([
    supabase.from('teams').select('id,name,sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('cases').select('id,status'),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase.from('members').select('id,team_id,primary_role').eq('is_active', true),
    supabase.from('invoices').select('id,case_id,status,issued_date'),
    supabase.from('dashboard_team_members').select('team_id,member_id,kind'),
  ])

  const teams = (teamsRaw ?? []) as Team[]
  const cases = (casesRaw ?? []) as Array<{ id: string; status: string }>
  const caseMembers = (caseMembersRaw ?? []) as Array<{ case_id: string; member_id: string; role: string }>
  const members = (membersRaw ?? []) as Array<{ id: string; team_id: string | null; primary_role: string | null }>
  const invoices = (invoicesRaw ?? []) as Array<{ id: string; case_id: string; status: string; issued_date: string | null }>
  const teamMembers = (teamMembersRaw ?? []) as Array<{ team_id: string; member_id: string; kind: 'member' | 'mentor' }>

  // チーム→管理担当メンバーのマップ（dashboard_team_members 優先、kind='member'のみ）
  const teamManagerMembers = new Map<string, Set<string>>()
  for (const tm of teamMembers) {
    if (tm.kind !== 'member') continue
    const m = members.find(mm => mm.id === tm.member_id)
    if (!m) continue
    if (m.primary_role !== 'manager' && m.primary_role !== 'sub_manager') continue
    if (!teamManagerMembers.has(tm.team_id)) teamManagerMembers.set(tm.team_id, new Set())
    teamManagerMembers.get(tm.team_id)!.add(tm.member_id)
  }

  // チームごとの集計
  const teamSummaries = teams.map(t => {
    const managerIds = teamManagerMembers.get(t.id) ?? new Set()
    // 管理担当として割当られている案件
    const teamCaseIds = new Set<string>()
    for (const cm of caseMembers) {
      if (cm.role === 'manager' && managerIds.has(cm.member_id)) {
        teamCaseIds.add(cm.case_id)
      }
    }
    const teamCases = cases.filter(c => teamCaseIds.has(c.id))
    const activeCases = teamCases.filter(c => c.status === '対応中' || c.status === '受注').length
    const completedCases = teamCases.filter(c => c.status === '完了').length
    // 当月の請求完了件数（入金済）
    const paidInvoices = invoices.filter(i =>
      teamCaseIds.has(i.case_id) && i.status === '入金済' && (i.issued_date?.startsWith(ym) ?? false)
    ).length
    return {
      team: t,
      managerCount: managerIds.size,
      activeCases,
      completedCases,
      paidInvoices,
      totalCases: teamCases.length,
    }
  })

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard · Manager · Overview"
        title="管理担当 全体ダッシュボード"
        icon={Compass}
        description="各チームの管理担当の集計値。請求完了件数と担当案件数が主KPI。"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teamSummaries.map(s => (
          <Link
            key={s.team.id}
            href={`/dashboard/manager/${s.team.id}`}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-purple-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-purple-600" strokeWidth={2.25} />
              <h3 className="text-[15px] font-bold text-gray-900">{s.team.name}</h3>
              <span className="ml-auto text-[11px] font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                管理担当 {s.managerCount}名
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Stat label={`${ym} 請求完了`} value={s.paidInvoices} suffix="件" tone="purple" />
              <Stat label="対応中案件"        value={s.activeCases}  suffix="件" tone="brand" />
              <Stat label="完了案件 (累計)"    value={s.completedCases} suffix="件" tone="green" />
              <Stat label="担当案件 (累計)"    value={s.totalCases}    suffix="件" tone="gray" />
            </div>
            <div className="mt-3 text-[12px] text-purple-600 font-semibold">
              詳細を開く →
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, suffix, tone }: {
  label: string
  value: number
  suffix: string
  tone: 'purple' | 'brand' | 'green' | 'gray'
}) {
  const colorMap: Record<string, string> = {
    purple: 'text-purple-700',
    brand:  'text-brand-700',
    green:  'text-green-700',
    gray:   'text-gray-700',
  }
  return (
    <div>
      <div className="text-[11px] font-semibold text-gray-500">{label}</div>
      <div className={`text-[20px] font-extrabold tracking-tight ${colorMap[tone]}`}>
        {value}<span className="text-[12px] text-gray-400 ml-0.5 font-normal">{suffix}</span>
      </div>
    </div>
  )
}
