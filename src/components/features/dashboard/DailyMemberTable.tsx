import {
  tenureLabel,
  type DailyMetricsBundle,
  type MetricsBundle,
} from '@/lib/dashboardMetrics'

export type DailyMemberRow = {
  id: string
  name: string
  avatarColor: string
  teamName: string | null
  jobType: string | null
  joinedAt: string | null
  primaryRole: 'sales' | 'manager'
  monthly: MetricsBundle
  daily: DailyMetricsBundle
}

type Props = {
  rows: DailyMemberRow[]
  today: Date
  showTeamColumn: boolean
}

const ROLE_BADGE: Record<'sales' | 'manager', { label: string; cls: string }> = {
  sales:   { label: '受注', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  manager: { label: '管理', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
}

export default function DailyMemberTable({ rows, today, showTeamColumn }: Props) {
  if (rows.length === 0) {
    return (
      <section>
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          表示対象のメンバーがいません
        </div>
      </section>
    )
  }

  const numCol = (n: number) =>
    n > 0 ? n.toLocaleString() : <span className="text-gray-300">-</span>
  const cycleCol = (c: number | null) =>
    c === null ? <span className="text-gray-300">-</span> : c.toFixed(1)

  return (
    <section>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <th className="px-2.5 py-2 text-left font-semibold w-[140px]" rowSpan={2}>氏名</th>
              {showTeamColumn && <th className="px-2.5 py-2 text-left font-semibold w-[110px]" rowSpan={2}>所属チーム</th>}
              <th className="px-2.5 py-2 text-left font-semibold w-[70px]" rowSpan={2}>職種</th>
              <th className="px-2.5 py-2 text-left font-semibold w-[90px]" rowSpan={2}>在籍期間</th>
              <th className="px-2 py-1.5 text-center font-semibold border-l-2 border-gray-300 bg-gray-100" colSpan={4}>当月累計</th>
              <th className="px-2 py-1.5 text-center font-semibold border-l-2 border-gray-300 bg-blue-50 text-blue-800" colSpan={4}>本日</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-[10px]">
              <SubColHeader highlight={false} />
              <SubColHeader highlight={true} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const role = ROLE_BADGE[r.primaryRole]
              const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
              return (
                <tr key={r.id} className={`border-b border-gray-100 ${rowBg}`}>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: r.avatarColor }}
                      >
                        {r.name.charAt(0)}
                      </span>
                      <span className="font-medium text-gray-900 truncate">{r.name}</span>
                      <span className={`text-[9px] font-mono px-1 py-0.5 rounded border flex-shrink-0 ${role.cls}`}>
                        {role.label}
                      </span>
                    </div>
                  </td>
                  {showTeamColumn && (
                    <td className="px-2.5 py-2 text-gray-700">
                      {r.teamName ?? <span className="text-gray-400">-</span>}
                    </td>
                  )}
                  <td className="px-2.5 py-2 text-gray-700">
                    {r.jobType ?? <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-2.5 py-2 text-gray-700">{tenureLabel(r.joinedAt, today)}</td>

                  {/* 当月累計 */}
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-gray-700 border-l-2 border-gray-300">{numCol(r.monthly.newOrders)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-gray-700 border-l border-gray-100">{numCol(r.monthly.managing)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-gray-700 border-l border-gray-100">{numCol(r.monthly.completed)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-gray-700 border-l border-gray-100">{cycleCol(r.monthly.cycleMonths)}</td>

                  {/* 本日 */}
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-gray-700 border-l-2 border-gray-300 bg-blue-50/30">{numCol(r.daily.newOrders)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-gray-700 border-l border-gray-100 bg-blue-50/30">{numCol(r.daily.startedManaging)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-gray-700 border-l border-gray-100 bg-blue-50/30">{numCol(r.daily.completed)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-gray-700 border-l border-gray-100 bg-blue-50/30">{cycleCol(r.daily.cycleMonths)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SubColHeader({ highlight }: { highlight: boolean }) {
  const cls = `px-1.5 py-1 text-center font-semibold border-l border-gray-200 ${highlight ? 'bg-blue-50/60' : 'bg-gray-50'}`
  return (
    <>
      <th className={cls + ' border-l-2 border-gray-300'}>新規</th>
      <th className={cls}>管理</th>
      <th className={cls}>完了</th>
      <th className={cls}>サイクル</th>
    </>
  )
}
