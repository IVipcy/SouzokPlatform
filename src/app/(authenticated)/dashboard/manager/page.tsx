import Link from 'next/link'
import { Compass, Users } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import PeriodSwitcher from '@/components/features/dashboard/PeriodSwitcher'
import { parsePeriod } from '@/lib/dashboardPeriod'
import { createClient } from '@/lib/supabase/server'
import { todayJstYmd } from '@/lib/dashboardMetrics'

type Team = { id: string; name: string; sort_order: number }

type Props = {
  searchParams: Promise<{ period?: string }>
}

/**
 * 管理担当 全体ダッシュボード
 *
 * 仕様（ユーザー指示）:
 * - 各チームへのリンク集ではなく、各チームの内容をすべて集計した内容を表示する
 * - 主KPI: 請求完了件数 + 担当案件数 + 対応中 + 完了
 * - 期間切替対応（本日/当月/年度累計/月別）
 * - チーム別の小計テーブルも表示
 */
export default async function ManagerOverviewPage({ searchParams }: Props) {
  const { period } = await searchParams
  const currentPeriod = parsePeriod(period)
  const supabase = await createClient()
  const today = new Date()
  const ymd = todayJstYmd(today)
  const ym = ymd.slice(0, 7)

  const [{ data: teamsRaw }, { data: casesRaw }, { data: caseMembersRaw }, { data: membersRaw }, { data: invoicesRaw }] = await Promise.all([
    supabase.from('teams').select('id,name,sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('cases').select('id,status'),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase.from('members').select('id,name,team_id,primary_role').eq('is_active', true),
    supabase.from('invoices').select('id,case_id,status,issued_date,amount'),
  ])

  // dashboard_team_members は migration 048 未適用環境でも動くよう try/catch
  let teamMembersRaw: Array<{ team_id: string; member_id: string; kind: 'member' | 'mentor' }> | null = null
  try {
    const { data } = await supabase.from('dashboard_team_members').select('team_id,member_id,kind')
    teamMembersRaw = (data ?? null) as typeof teamMembersRaw
  } catch { /* migration 048 未適用 → フォールバックロジックで対応 */ }

  const teams = (teamsRaw ?? []) as Team[]
  const cases = (casesRaw ?? []) as Array<{ id: string; status: string }>
  const caseMembers = (caseMembersRaw ?? []) as Array<{ case_id: string; member_id: string; role: string }>
  const members = (membersRaw ?? []) as Array<{ id: string; name: string; team_id: string | null; primary_role: string | null }>
  const invoices = (invoicesRaw ?? []) as Array<{ id: string; case_id: string; status: string; issued_date: string | null; amount: number }>
  const teamMembers = (teamMembersRaw ?? []) as Array<{ team_id: string; member_id: string; kind: 'member' | 'mentor' }>

  // 期間フィルタ
  const periodFilter = (issuedDate: string | null) => {
    if (!issuedDate) return false
    if (currentPeriod === 'today') return issuedDate === ymd
    if (currentPeriod === 'month') return issuedDate.startsWith(ym)
    if (currentPeriod === 'ytd') {
      const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
      const start = `${year}-04-01`
      return issuedDate >= start && issuedDate <= ymd
    }
    return issuedDate.startsWith(ym)
  }

  // チーム→管理担当メンバー（dashboard_team_members 経由、無ければ members.team_id フォールバック）
  const teamManagerMembers = new Map<string, Set<string>>()
  const hasTeamMembers = teamMembers.length > 0
  if (hasTeamMembers) {
    for (const tm of teamMembers) {
      if (tm.kind !== 'member') continue
      const m = members.find(mm => mm.id === tm.member_id)
      if (!m || (m.primary_role !== 'manager' && m.primary_role !== 'sub_manager')) continue
      if (!teamManagerMembers.has(tm.team_id)) teamManagerMembers.set(tm.team_id, new Set())
      teamManagerMembers.get(tm.team_id)!.add(tm.member_id)
    }
  } else {
    for (const m of members) {
      if (!m.team_id) continue
      if (m.primary_role !== 'manager' && m.primary_role !== 'sub_manager') continue
      if (!teamManagerMembers.has(m.team_id)) teamManagerMembers.set(m.team_id, new Set())
      teamManagerMembers.get(m.team_id)!.add(m.id)
    }
  }

  // チームごとの集計（カード+テーブル両方で使う）
  const teamSummaries = teams.map(t => {
    const managerIds = teamManagerMembers.get(t.id) ?? new Set()
    const teamCaseIds = new Set<string>()
    for (const cm of caseMembers) {
      if (cm.role === 'manager' && managerIds.has(cm.member_id)) {
        teamCaseIds.add(cm.case_id)
      }
    }
    const teamCases = cases.filter(c => teamCaseIds.has(c.id))
    const activeCases = teamCases.filter(c => c.status === '対応中' || c.status === '受注').length
    const completedCases = teamCases.filter(c => c.status === '完了').length
    const teamInvoices = invoices.filter(i => teamCaseIds.has(i.case_id))
    const paidInvoices = teamInvoices.filter(i => i.status === '入金済' && periodFilter(i.issued_date))
    return {
      team: t,
      managerCount: managerIds.size,
      paidCount: paidInvoices.length,
      paidAmount: paidInvoices.reduce((s, i) => s + i.amount, 0),
      activeCases,
      completedCases,
      totalCases: teamCases.length,
    }
  })

  // 全体集計（全チームの合算）
  const overall = {
    managerCount: teamSummaries.reduce((s, t) => s + t.managerCount, 0),
    paidCount:    teamSummaries.reduce((s, t) => s + t.paidCount, 0),
    paidAmount:   teamSummaries.reduce((s, t) => s + t.paidAmount, 0),
    activeCases:  teamSummaries.reduce((s, t) => s + t.activeCases, 0),
    completedCases: teamSummaries.reduce((s, t) => s + t.completedCases, 0),
    totalCases:   teamSummaries.reduce((s, t) => s + t.totalCases, 0),
  }

  const periodLabel = currentPeriod === 'today' ? '本日'
    : currentPeriod === 'month' ? '当月'
    : '年度累計'

  // 全管理担当メンバー一覧（チーム関係なく全員）
  const teamNameById = new Map(teams.map(t => [t.id, t.name]))
  const memberRows = members
    .filter(m => m.primary_role === 'manager' || m.primary_role === 'sub_manager')
    .map(m => {
      const myCaseIds = new Set(
        caseMembers.filter(cm => cm.role === 'manager' && cm.member_id === m.id).map(cm => cm.case_id),
      )
      const myCases = cases.filter(c => myCaseIds.has(c.id))
      const myInvoices = invoices.filter(i => myCaseIds.has(i.case_id) && i.status === '入金済' && periodFilter(i.issued_date))
      return {
        id: m.id,
        name: m.name,
        teamName: m.team_id ? teamNameById.get(m.team_id) ?? null : null,
        paidCount: myInvoices.length,
        paidAmount: myInvoices.reduce((s, i) => s + i.amount, 0),
        activeCases: myCases.filter(c => c.status === '対応中' || c.status === '受注').length,
        completedCases: myCases.filter(c => c.status === '完了').length,
        totalCases: myCases.length,
      }
    })
    .sort((a, b) => (a.teamName ?? 'zzz').localeCompare(b.teamName ?? 'zzz', 'ja') || a.name.localeCompare(b.name, 'ja'))

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard · Manager · Overview"
        title="管理担当 全体ダッシュボード"
        icon={Compass}
        description="各チームの管理担当の集計をまとめた全体ビュー。期間切替で本日/当月/年度累計の数値を確認できます。"
      />

      <div className="mb-3">
        <PeriodSwitcher />
      </div>

      {/* 全体集計 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label={`${periodLabel} 請求完了件数`}  value={overall.paidCount}     suffix="件" tone="purple" />
        <Kpi label={`${periodLabel} 完了金額`}      value={overall.paidAmount}    suffix="円" mono tone="purple" />
        <Kpi label="対応中案件 (現在)"             value={overall.activeCases}    suffix="件" tone="brand" />
        <Kpi label="完了案件 (累計)"               value={overall.completedCases} suffix="件" tone="green" />
      </div>
      <div className="text-[12px] text-gray-500 mb-4 ml-1">
        スコープ: <span className="font-semibold text-gray-700">全チーム（管理担当 {overall.managerCount}名 / 担当案件累計 {overall.totalCases}件）</span>
      </div>

      {/* チーム別集計テーブル */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-600" strokeWidth={2.25} />
          <h3 className="text-[14px] font-bold text-gray-900">チーム別 集計（{periodLabel}）</h3>
        </div>
        <table className="w-full text-[13px]">
          <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left font-bold">チーム</th>
              <th className="px-3 py-2 text-right font-bold">管理担当</th>
              <th className="px-3 py-2 text-right font-bold">請求完了件数</th>
              <th className="px-3 py-2 text-right font-bold">完了金額</th>
              <th className="px-3 py-2 text-right font-bold">対応中</th>
              <th className="px-3 py-2 text-right font-bold">完了</th>
              <th className="px-3 py-2 text-right font-bold">担当案件累計</th>
              <th className="px-3 py-2 text-center font-bold" style={{ width: 80 }}>詳細</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {teamSummaries.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[12px] text-gray-400">チームが登録されていません</td></tr>
            ) : teamSummaries.map(s => (
              <tr key={s.team.id} className="hover:bg-gray-50/60">
                <td className="px-3 py-2.5 font-semibold text-gray-800">{s.team.name}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-600">{s.managerCount}名</td>
                <td className="px-3 py-2.5 text-right font-mono text-purple-700 font-bold">{s.paidCount}</td>
                <td className="px-3 py-2.5 text-right font-mono text-purple-700">¥{s.paidAmount.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right font-mono text-brand-700">{s.activeCases}</td>
                <td className="px-3 py-2.5 text-right font-mono text-green-700">{s.completedCases}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-700">{s.totalCases}</td>
                <td className="px-3 py-2.5 text-center">
                  <Link href={`/dashboard/manager/${s.team.id}`} className="text-[12px] font-semibold text-brand-600 hover:text-brand-700 hover:underline">
                    開く →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          {teamSummaries.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold">
              <tr>
                <td className="px-3 py-2.5 text-gray-800">合計</td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-700">{overall.managerCount}名</td>
                <td className="px-3 py-2.5 text-right font-mono text-purple-700">{overall.paidCount}</td>
                <td className="px-3 py-2.5 text-right font-mono text-purple-700">¥{overall.paidAmount.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right font-mono text-brand-700">{overall.activeCases}</td>
                <td className="px-3 py-2.5 text-right font-mono text-green-700">{overall.completedCases}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-700">{overall.totalCases}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* 全管理担当メンバー一覧 */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mt-4">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-600" strokeWidth={2.25} />
          <h3 className="text-[14px] font-bold text-gray-900">管理担当メンバー一覧（{periodLabel}）</h3>
          <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{memberRows.length}名</span>
        </div>
        <table className="w-full text-[13px]">
          <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left font-bold">氏名</th>
              <th className="px-3 py-2 text-left font-bold">所属チーム</th>
              <th className="px-3 py-2 text-right font-bold">請求完了件数</th>
              <th className="px-3 py-2 text-right font-bold">完了金額</th>
              <th className="px-3 py-2 text-right font-bold">対応中</th>
              <th className="px-3 py-2 text-right font-bold">完了(累計)</th>
              <th className="px-3 py-2 text-right font-bold">担当案件累計</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {memberRows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[12px] text-gray-400">管理担当メンバーが登録されていません</td></tr>
            ) : memberRows.map(m => (
              <tr key={m.id} className="hover:bg-gray-50/60">
                <td className="px-3 py-2.5">
                  <Link href={`/profile/${m.id}`} className="font-semibold text-gray-800 hover:text-brand-700 hover:underline">{m.name}</Link>
                </td>
                <td className="px-3 py-2.5 text-gray-600">{m.teamName ?? <span className="text-gray-400">-</span>}</td>
                <td className="px-3 py-2.5 text-right font-mono text-purple-700 font-bold">{m.paidCount}</td>
                <td className="px-3 py-2.5 text-right font-mono text-purple-700">¥{m.paidAmount.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right font-mono text-brand-700">{m.activeCases}</td>
                <td className="px-3 py-2.5 text-right font-mono text-green-700">{m.completedCases}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-700">{m.totalCases}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
