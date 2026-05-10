import { tenureLabel, formatMan, type SalesMetricsBundle } from '@/lib/dashboardMetrics'

export type SalesMemberRow = {
  id: string
  name: string
  avatarColor: string
  jobType: string | null
  joinedAt: string | null
  metrics: SalesMetricsBundle
}

export type SalesTeamGroup = {
  teamName: string
  teamMetrics: SalesMetricsBundle
  members: SalesMemberRow[]
}

type Props = {
  groups: SalesTeamGroup[]
  today: Date
}

export default function SalesTeamTable({ groups, today }: Props) {
  const totalMembers = groups.reduce((s, g) => s + g.members.length, 0)

  if (totalMembers === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">チーム別／個人別 月次成績</h3>
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          受注担当のメンバーが登録されていません
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">チーム別／個人別 月次成績</h3>
        <p className="text-[14px] text-gray-400">チーム合計の下にメンバーの内訳が並びます</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="text-[13px] border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 120 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 80 }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <th className="px-2.5 py-2 text-left font-semibold">所属チーム</th>
              <th className="px-2.5 py-2 text-left font-semibold">氏名</th>
              <th className="px-2.5 py-2 text-left font-semibold">職種</th>
              <th className="px-2.5 py-2 text-left font-semibold">在籍期間</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="当月面談数">面談数</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="当月新規受注件数">新規受注</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200">受注率</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200">平均単価</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="業務完了予定件数">完了予定</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="業務完了件数">完了</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="業務完了金額">完了金額</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="平均サイクル">サイクル</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <TeamGroupRows key={g.teamName} group={g} today={today} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TeamGroupRows({ group, today }: { group: SalesTeamGroup; today: Date }) {
  return (
    <>
      {/* チーム小計 */}
      <tr className="bg-brand-50/50 border-b border-brand-100 font-semibold">
        <td className="px-2.5 py-2 text-gray-900" colSpan={2}>
          <div className="flex items-center gap-1.5">
            <span className="text-[14px]">{group.teamName}</span>
            <span className="text-[13px] font-mono px-1.5 py-0.5 rounded bg-brand-200/60 text-brand-800">
              チーム合計
            </span>
            <span className="text-[14px] font-normal text-gray-500">（{group.members.length}人）</span>
          </div>
        </td>
        <td className="px-2.5 py-2 text-gray-400 text-[14px]">-</td>
        <td className="px-2.5 py-2 text-gray-400 text-[14px]">-</td>
        <MetricCells metrics={group.teamMetrics} bold />
      </tr>

      {/* 個人行 */}
      {group.members.map(m => (
        <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50/50">
          <td className="px-2.5 py-2 text-gray-300 text-[14px]"></td>
          <td className="px-2.5 py-2">
            <div className="flex items-center gap-1.5 pl-3">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                style={{ backgroundColor: m.avatarColor }}
              >
                {m.name.charAt(0)}
              </span>
              <span className="text-gray-700 truncate">{m.name}</span>
            </div>
          </td>
          <td className="px-2.5 py-2 text-gray-700">
            {m.jobType ?? <span className="text-gray-400">-</span>}
          </td>
          <td className="px-2.5 py-2 text-gray-700">{tenureLabel(m.joinedAt, today)}</td>
          <MetricCells metrics={m.metrics} />
        </tr>
      ))}
    </>
  )
}

function MetricCells({ metrics: m, bold }: { metrics: SalesMetricsBundle; bold?: boolean }) {
  const cls = `px-2 py-2 text-right tabular-nums font-mono border-l border-gray-100 ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`
  const dim = <span className="text-gray-300">-</span>

  return (
    <>
      <td className={cls}>{m.meetingsCount > 0 ? m.meetingsCount : dim}</td>
      <td className={cls}>{m.newOrdersCount > 0 ? m.newOrdersCount : dim}</td>
      <td className={cls}>
        {m.conversionRate === null ? dim : `${Math.round(m.conversionRate * 100)}%`}
      </td>
      <td className={cls}>{m.avgOrderUnit === null ? dim : `${formatMan(m.avgOrderUnit)}万`}</td>
      <td className={cls}>{m.expectedCompletions > 0 ? m.expectedCompletions : dim}</td>
      <td className={cls}>{m.completedCount > 0 ? m.completedCount : dim}</td>
      <td className={cls}>{m.completedAmount > 0 ? `${formatMan(m.completedAmount)}万` : dim}</td>
      <td className={cls}>{m.avgCycleMonths === null ? dim : m.avgCycleMonths.toFixed(1)}</td>
    </>
  )
}
