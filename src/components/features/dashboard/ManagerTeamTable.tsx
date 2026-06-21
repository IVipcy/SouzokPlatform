import Link from 'next/link'
import UserAvatar from '@/components/ui/UserAvatar'
import type { ProgressKpiBundle } from '@/lib/dashboardMetrics'

// 受注担当の SalesTeamTable と同じ「チーム別／個人別＋チーム小計」構成の管理担当版。
// 指標は進捗KPI（担当件数／青／黄／赤／紫／完了割合／サイクル／請求件数）。

export type ManagerMemberRow = {
  id: string
  name: string
  avatarUrl?: string | null
  jobType: string | null
  kpis: ProgressKpiBundle
}

export type ManagerTeamGroup = {
  teamName: string
  teamKpis: ProgressKpiBundle
  members: ManagerMemberRow[]
}

export default function ManagerTeamTable({ groups, title = 'チーム別／個人別 進捗' }: {
  groups: ManagerTeamGroup[]
  title?: string
}) {
  const totalMembers = groups.reduce((s, g) => s + g.members.length, 0)
  if (totalMembers === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          管理担当のメンバーが登録されていません
        </div>
      </section>
    )
  }

  return (
    <section className="mb-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="text-[13px] border-collapse w-full table-auto">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 whitespace-nowrap">
              <th className="px-2.5 py-2 text-left font-semibold">所属チーム</th>
              <th className="px-2.5 py-2 text-left font-semibold">氏名</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="担当件数">担当</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="青件数（順調）">青</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="黄件数（要フォロー）">黄</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="赤件数（早急対応）">赤</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="紫件数（クレーム・最優先）">紫</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="完了割合（本日時点の完了／業完対象）">完了割合</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="平均サイクル（カ月）">サイクル</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="当月発行の請求件数">請求</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <TeamGroupRows key={g.teamName} group={g} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TeamGroupRows({ group }: { group: ManagerTeamGroup }) {
  return (
    <>
      {/* チーム小計 */}
      <tr className="bg-brand-50/50 border-b border-brand-100 font-semibold">
        <td className="px-2.5 py-2 text-gray-900">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px]">{group.teamName}</span>
            <span className="text-[12px] font-mono px-1.5 py-0.5 rounded bg-brand-200/60 text-brand-800">チーム合計</span>
            <span className="text-[13px] font-normal text-gray-500">（{group.members.length}人）</span>
          </div>
        </td>
        <td className="px-2.5 py-2 text-gray-400 text-[14px]">-</td>
        <KpiCells kpis={group.teamKpis} bold />
      </tr>

      {/* 個人行 */}
      {group.members.map(m => (
        <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50/50">
          <td className="px-2.5 py-2 text-gray-300 text-[14px]"></td>
          <td className="px-2.5 py-2">
            <Link href={`/profile/${m.id}`} className="flex items-center gap-1.5 pl-3 group/name" title={`${m.name} のプロフィール`}>
              <UserAvatar name={m.name} role="manager" url={m.avatarUrl} size="sm" />
              <span className="text-gray-700 group-hover/name:text-brand-700 group-hover/name:underline truncate max-w-[150px]">{m.name}</span>
            </Link>
          </td>
          <KpiCells kpis={m.kpis} />
        </tr>
      ))}
    </>
  )
}

function KpiCells({ kpis: k, bold }: { kpis: ProgressKpiBundle; bold?: boolean }) {
  const base = `px-2 py-2 text-right tabular-nums font-mono border-l border-gray-100 ${bold ? 'font-bold' : ''}`
  const dim = <span className="text-gray-300">-</span>
  const num = (n: number, color: string) => (n > 0 ? <span className={color}>{n}</span> : dim)
  return (
    <>
      <td className={`${base} text-gray-900`}>{k.totalAssigned > 0 ? k.totalAssigned : dim}</td>
      <td className={base}>{num(k.blueCount, 'text-blue-600')}</td>
      <td className={base}>{num(k.yellowCount, 'text-amber-600')}</td>
      <td className={base}>{num(k.redCount, 'text-red-600')}</td>
      <td className={base}>{num(k.purpleCount, 'text-purple-600')}</td>
      <td className={`${base} text-gray-700`}>
        {k.monthCompletionTarget > 0 ? `${k.monthCompleted}/${k.monthCompletionTarget}` : dim}
      </td>
      <td className={`${base} text-gray-700`}>{k.cycleMonths === null ? dim : k.cycleMonths.toFixed(1)}</td>
      <td className={`${base} text-gray-700`}>{k.invoiceCount > 0 ? k.invoiceCount : dim}</td>
    </>
  )
}
