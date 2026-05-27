import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Compass } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import TeamMemberTabs, { type TeamMemberEntry } from '@/components/features/dashboard/TeamMemberTabs'
import PeriodSwitcher from '@/components/features/dashboard/PeriodSwitcher'
import { parsePeriod } from '@/lib/dashboardPeriod'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import Badge from '@/components/ui/Badge'
import UserAvatar from '@/components/ui/UserAvatar'

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
  searchParams: Promise<{ member?: string; period?: string }>
}

/**
 * 管理担当 チーム別ダッシュボード
 *
 * 主KPI:
 *   - 請求完了件数 (invoices.status='入金済')
 *   - 担当案件数 (case_members.role='manager')
 *   - 対応中案件 / 完了案件
 *
 * メンバータブ (TeamMemberTabs) は管理担当・サブ管理担当のみ表示
 */
export default async function ManagerTeamDashboard({ params, searchParams }: Props) {
  const { teamId } = await params
  const { member: selectedMemberId, period } = await searchParams
  const currentPeriod = parsePeriod(period)
  const supabase = await createClient()
  const today = new Date()
  const ymd = todayJstYmd(today)
  const ym = ymd.slice(0, 7)

  const [
    { data: team },
    { data: casesRaw },
    { data: caseMembersRaw },
    { data: membersRaw },
    { data: invoicesRaw },
    { data: memberTargetsRaw },
  ] = await Promise.all([
    supabase.from('teams').select('id,name').eq('id', teamId).eq('is_active', true).single(),
    supabase.from('cases').select('id,case_number,deal_name,status,order_received_date,completion_date,expected_completion_date'),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase.from('members')
      .select('id,name,avatar_color,avatar_url,primary_role,job_type,joined_at,team_id')
      .eq('is_active', true),
    supabase.from('invoices').select('id,case_id,status,issued_date,amount,fee_amount'),
    supabase.from('member_targets').select('member_id,invoice_count').eq('ym', ym),
  ])

  // dashboard_team_members は migration 048 未適用環境でも動くよう try/catch
  let teamMembersRaw: Array<{ id: string; member_id: string; kind: 'member' | 'mentor' }> | null = null
  try {
    const { data } = await supabase.from('dashboard_team_members').select('id, member_id, kind').eq('team_id', teamId)
    teamMembersRaw = (data ?? null) as typeof teamMembersRaw
  } catch { /* migration 048 未適用 → フォールバックロジックで対応 */ }

  if (!team) notFound()

  const cases = (casesRaw ?? []) as Array<{ id: string; case_number: string; deal_name: string; status: string; order_received_date: string | null; completion_date: string | null; expected_completion_date: string | null }>
  const caseMembers = (caseMembersRaw ?? []) as Array<{ case_id: string; member_id: string; role: string }>
  const allActiveMembers = (membersRaw ?? []) as MemberRow[]
  const invoices = (invoicesRaw ?? []) as Array<{ id: string; case_id: string; status: string; issued_date: string | null; amount: number; fee_amount: number }>
  const memberTargetByMember = new Map(
    ((memberTargetsRaw ?? []) as Array<{ member_id: string; invoice_count: number }>)
      .map(t => [t.member_id, t.invoice_count]),
  )
  const teamMemberRows = (teamMembersRaw ?? []) as Array<{ id: string; member_id: string; kind: 'member' | 'mentor' }>
  const teamMemberMap = new Map(teamMemberRows.map(r => [r.member_id, r]))

  // dashboard_team_members 未マイグレーション時のフォールバック
  const teamMembers = teamMemberRows.length > 0
    ? allActiveMembers.filter(m => teamMemberMap.has(m.id))
    : allActiveMembers.filter(m => m.team_id === teamId)

  // 管理担当のみ（メンター除外、フォールバック時は kind='member' 扱い）
  const managerMembers = teamMembers.filter(m => {
    if (m.primary_role !== 'manager' && m.primary_role !== 'sub_manager') return false
    const tm = teamMemberMap.get(m.id)
    if (!tm) return true
    return tm.kind === 'member'
  })

  // フォーカスメンバー
  const focusedMember = selectedMemberId
    ? managerMembers.find(m => m.id === selectedMemberId) ?? null
    : null

  const scopeMembers = focusedMember ? [focusedMember] : managerMembers

  // スコープ案件ID（管理担当として割当られている）
  const scopeCaseIds = new Set<string>()
  for (const m of scopeMembers) {
    for (const cm of caseMembers) {
      if (cm.role === 'manager' && cm.member_id === m.id) scopeCaseIds.add(cm.case_id)
    }
  }

  // 集計（period に応じて期間を切り替え）
  const periodFilter = (issuedDate: string | null) => {
    if (!issuedDate) return false
    if (currentPeriod === 'today') return issuedDate === ymd
    if (currentPeriod === 'month') return issuedDate.startsWith(ym)
    if (currentPeriod === 'ytd') {
      // 当期初月 (4月) から本日まで
      const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
      const start = `${year}-04-01`
      return issuedDate >= start && issuedDate <= ymd
    }
    if (currentPeriod === 'by_month') return issuedDate.startsWith(ym)  // 簡略化（実装は次の改修で）
    return true
  }

  const scopedInvoices = invoices.filter(i => scopeCaseIds.has(i.case_id))
  const paidCount = scopedInvoices.filter(i => i.status === '入金済' && periodFilter(i.issued_date)).length
  const totalRevenue = scopedInvoices
    .filter(i => i.status === '入金済' && periodFilter(i.issued_date))
    .reduce((s, i) => s + i.amount, 0)
  const activeCases = cases.filter(c => scopeCaseIds.has(c.id) && (c.status === '対応中' || c.status === '受注')).length
  const completedCases = cases.filter(c => scopeCaseIds.has(c.id) && c.status === '完了').length

  // メンバータブ用エントリ
  const memberEntries: TeamMemberEntry[] = teamMembers
    .filter(m => m.primary_role === 'manager' || m.primary_role === 'sub_manager')
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
      }
    })

  // 追加候補（全アクティブメンバー、まだチーム未登録の管理担当）
  const candidateMembers = allActiveMembers
    .filter(m =>
      (m.primary_role === 'manager' || m.primary_role === 'sub_manager')
      && !teamMemberMap.has(m.id)
    )
    .map(m => ({
      id: m.id,
      name: m.name,
      avatar_color: m.avatar_color,
      avatar_url: m.avatar_url,
      primary_role: m.primary_role,
    }))

  // 個別メンバーの集計
  const memberStats = managerMembers
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map(m => {
      const myCaseIds = new Set(
        caseMembers.filter(cm => cm.role === 'manager' && cm.member_id === m.id).map(cm => cm.case_id),
      )
      const myPaid = invoices.filter(i => myCaseIds.has(i.case_id) && i.status === '入金済' && periodFilter(i.issued_date)).length
      const myActive = cases.filter(c => myCaseIds.has(c.id) && (c.status === '対応中' || c.status === '受注')).length
      const myCompleted = cases.filter(c => myCaseIds.has(c.id) && c.status === '完了').length
      const myTarget = memberTargetByMember.get(m.id) ?? 0
      return {
        member: m,
        paid: myPaid,
        active: myActive,
        completed: myCompleted,
        target: myTarget,
        total: myCaseIds.size,
      }
    })

  const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${['日','月','火','水','木','金','土'][today.getDay()]}）`
  const scopeLabel = focusedMember ? focusedMember.name : team.name

  const periodLabel = currentPeriod === 'today' ? '本日'
    : currentPeriod === 'month' ? '当月'
    : currentPeriod === 'ytd' ? '年度累計' : '月別'

  return (
    <div>
      <PageHeader
        eyebrow="Team · Manager"
        title={`${team.name}・管理担当 ${periodLabel}`}
        icon={Compass}
        description={`${dateLabel}・管理担当の${periodLabel}の動きとチーム成績`}
      />

      <div className="mb-3">
        <PeriodSwitcher />
      </div>

      <div className="space-y-3">
        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label={`${periodLabel} 請求完了件数`} value={paidCount} suffix="件" tone="purple" />
          <Kpi label={`${periodLabel} 完了金額`}    value={totalRevenue} suffix="円" mono tone="purple" />
          <Kpi label="対応中案件 (現在)"          value={activeCases}  suffix="件" tone="brand" />
          <Kpi label="完了案件 (累計)"            value={completedCases} suffix="件" tone="green" />
        </div>
        <div className="text-[12px] text-gray-500 ml-1">
          スコープ: <span className="font-semibold text-gray-700">{scopeLabel}</span>
        </div>

        {/* メンバータブ */}
        <TeamMemberTabs
          teamId={teamId}
          entries={memberEntries}
          candidates={candidateMembers}
          selectedMemberId={selectedMemberId}
          basePath={`/dashboard/manager/${teamId}`}
        />

        {/* メンバー別集計テーブル */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
            <h3 className="text-[14px] font-bold text-gray-900">メンバー別 集計（{periodLabel}）</h3>
          </div>
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">管理担当</th>
                <th className="px-3 py-2 text-right font-bold">請求完了 / 目標</th>
                <th className="px-3 py-2 text-right font-bold">対応中</th>
                <th className="px-3 py-2 text-right font-bold">完了</th>
                <th className="px-3 py-2 text-right font-bold">担当案件累計</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {memberStats.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-[12px] text-gray-400">管理担当メンバーがいません</td></tr>
              ) : memberStats.map(s => {
                const achieved = s.target > 0 && s.paid >= s.target
                return (
                  <tr key={s.member.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/dashboard/manager/${teamId}?member=${s.member.id}`}
                        className="inline-flex items-center gap-2 hover:text-brand-700"
                      >
                        <UserAvatar
                          name={s.member.name}
                          role={s.member.primary_role as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | undefined}
                          url={s.member.avatar_url}
                          size="sm"
                        />
                        <span className="font-semibold text-gray-800">{s.member.name}</span>
                        {achieved && (
                          <Badge label="目標達成" color="#9333EA" variant="solid" />
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-mono text-purple-700 font-bold">{s.paid}</span>
                      <span className="text-gray-400 font-mono"> / {s.target || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-brand-700">{s.active}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-green-700">{s.completed}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-700">{s.total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, suffix, mono, tone }: {
  label: string
  value: number
  suffix: string
  mono?: boolean
  tone: 'purple' | 'brand' | 'green' | 'gray'
}) {
  const colorMap: Record<string, string> = {
    purple: 'text-purple-700',
    brand:  'text-brand-700',
    green:  'text-green-700',
    gray:   'text-gray-700',
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm">
      <div className="text-[12px] font-semibold text-gray-500 mb-1">{label}</div>
      <div className={`text-[22px] font-extrabold tracking-tight ${colorMap[tone]}`}>
        {mono ? value.toLocaleString() : value}
        <span className="text-[12px] text-gray-400 ml-1 font-normal">{suffix}</span>
      </div>
    </div>
  )
}
