import Link from 'next/link'
import {
  computeMetrics,
  casesForMember,
  monthHeaderLabel,
  tenureLabel,
  formatMan,
  type DashCase,
  type DashCaseMember,
} from '@/lib/dashboardMetrics'
import UserAvatar from '@/components/ui/UserAvatar'

export type MemberWithProfile = {
  id: string
  name: string
  avatar_color: string
  avatar_url?: string | null
  primary_role: 'sales' | 'manager'
  team_name: string | null
  job_type: string | null
  joined_at: string | null
}

type Props = {
  members: MemberWithProfile[]
  cases: DashCase[]
  caseMembers: DashCaseMember[]
  months: string[]   // 当月→過去 順
  today: Date
  // 達成中のメンバー（個人月間目標を満たしている、アバターにレインボーリング表示）
  achievedMemberIds?: Set<string>
  // 年度累計ビュー: 各月の左に「累計」列を表示する
  showCumulative?: boolean
}

// 指定月群にわたる累計メトリクス（新規・完了・完了金額は合算、サイクルは完了件数で加重平均、
// 管理は「現時点（最新月）」の値）
function cumulativeMetrics(myCases: DashCase[], months: string[]) {
  let newOrders = 0, completed = 0, completedAmount = 0, cycleSum = 0, cycleN = 0
  for (const ym of months) {
    const mm = computeMetrics(myCases, ym)
    newOrders += mm.newOrders
    completed += mm.completed
    completedAmount += mm.completedAmount
    if (mm.cycleMonths !== null) { cycleSum += mm.cycleMonths * mm.completed; cycleN += mm.completed }
  }
  const managing = months.length > 0 ? computeMetrics(myCases, months[0]).managing : 0
  return { newOrders, managing, completed, cycleMonths: cycleN > 0 ? cycleSum / cycleN : null, completedAmount }
}

// 左固定列の幅 (px)。CSSのleftオフセット計算に使うので合わせる。
const COL_W = { name: 140, team: 110, job: 80, tenure: 110 } as const
const LEFT_OFFSET = {
  name: 0,
  team: COL_W.name,
  job: COL_W.name + COL_W.team,
  tenure: COL_W.name + COL_W.team + COL_W.job,
}
const FIXED_TOTAL = COL_W.name + COL_W.team + COL_W.job + COL_W.tenure

export default function MemberPerformanceTable({
  members,
  cases,
  caseMembers,
  months,
  today,
  achievedMemberIds,
  showCumulative = false,
}: Props) {
  if (members.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">メンバー別 月次成績</h3>
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          受注担当・管理担当のメンバーが登録されていません
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">メンバー別 月次成績</h3>
        <p className="text-[14px] text-gray-400">
          左が最新（当月）、右に行くほど古い情報。年度（4月〜3月）の経過分を表示。
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="border-collapse text-[13px] w-max min-w-full">
          <colgroup>
            <col style={{ width: COL_W.name }} />
            <col style={{ width: COL_W.team }} />
            <col style={{ width: COL_W.job }} />
            <col style={{ width: COL_W.tenure }} />
            {showCumulative && [
              <col key="cum-n" style={{ width: 50 }} />,
              <col key="cum-m" style={{ width: 50 }} />,
              <col key="cum-c" style={{ width: 50 }} />,
              <col key="cum-y" style={{ width: 56 }} />,
            ]}
            {months.flatMap(m => [
              <col key={`${m}-n`} style={{ width: 50 }} />,
              <col key={`${m}-m`} style={{ width: 50 }} />,
              <col key={`${m}-c`} style={{ width: 50 }} />,
              <col key={`${m}-y`} style={{ width: 56 }} />,
            ])}
          </colgroup>

          <thead>
            {/* 月グループのヘッダ */}
            <tr className="bg-gray-50 border-b border-gray-200">
              <th
                className="sticky bg-gray-50 z-20 px-2 py-2 text-left font-semibold text-gray-600 border-r border-gray-200"
                style={{ left: LEFT_OFFSET.name, width: COL_W.name }}
                rowSpan={2}
              >
                氏名
              </th>
              <th
                className="sticky bg-gray-50 z-20 px-2 py-2 text-left font-semibold text-gray-600 border-r border-gray-200"
                style={{ left: LEFT_OFFSET.team, width: COL_W.team }}
                rowSpan={2}
              >
                所属チーム
              </th>
              <th
                className="sticky bg-gray-50 z-20 px-2 py-2 text-left font-semibold text-gray-600 border-r border-gray-200"
                style={{ left: LEFT_OFFSET.job, width: COL_W.job }}
                rowSpan={2}
              >
                職種
              </th>
              <th
                className="sticky bg-gray-50 z-20 px-2 py-2 text-left font-semibold text-gray-600 border-r-2 border-gray-300 shadow-[2px_0_0_0_rgba(0,0,0,0.04)]"
                style={{ left: LEFT_OFFSET.tenure, width: COL_W.tenure }}
                rowSpan={2}
              >
                在籍期間
              </th>
              {showCumulative && (
                <th colSpan={4} className="px-2 py-1.5 text-center font-semibold border-l border-gray-300 bg-amber-50 text-amber-800">
                  累計
                </th>
              )}
              {months.map((m, i) => (
                <th
                  key={m}
                  colSpan={4}
                  className={`px-2 py-1.5 text-center font-semibold border-l border-gray-300 ${
                    i === 0 && !showCumulative ? 'bg-brand-50 text-brand-800' : 'bg-gray-50 text-gray-700'
                  }`}
                >
                  {monthHeaderLabel(m, today)}
                </th>
              ))}
            </tr>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-brand-700">
              {showCumulative && <SubHeaderGroup highlight />}
              {months.map((m, i) => (
                <SubHeaderGroup key={m} highlight={i === 0 && !showCumulative} />
              ))}
            </tr>
          </thead>

          <tbody>
            {members.map((m, rowIdx) => {
              const myCases = casesForMember(cases, caseMembers, m.id, m.primary_role)
              const rowBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
              return (
                <tr key={m.id} className={`border-b border-gray-100 ${rowBg}`}>
                  <td
                    className={`sticky z-10 px-2 py-2 border-r border-gray-200 ${rowBg}`}
                    style={{ left: LEFT_OFFSET.name, width: COL_W.name }}
                  >
                    <Link
                      href={`/profile/${m.id}`}
                      className="flex items-center gap-1.5 group/name"
                      title={`${m.name} のプロフィール`}
                    >
                      <UserAvatar
                        name={m.name}
                        role={m.primary_role}
                        url={m.avatar_url}
                        size="sm"
                        achievedFrame={achievedMemberIds?.has(m.id) ?? false}
                      />
                      <span className="font-medium text-gray-900 group-hover/name:text-brand-700 group-hover/name:underline truncate">{m.name}</span>
                    </Link>
                  </td>
                  <td
                    className={`sticky z-10 px-2 py-2 border-r border-gray-200 text-gray-700 ${rowBg}`}
                    style={{ left: LEFT_OFFSET.team, width: COL_W.team }}
                  >
                    {m.team_name ?? <span className="text-gray-400">-</span>}
                  </td>
                  <td
                    className={`sticky z-10 px-2 py-2 border-r border-gray-200 text-gray-700 ${rowBg}`}
                    style={{ left: LEFT_OFFSET.job, width: COL_W.job }}
                  >
                    {m.job_type ?? <span className="text-gray-400">-</span>}
                  </td>
                  <td
                    className={`sticky z-10 px-2 py-2 border-r-2 border-gray-300 text-gray-700 shadow-[2px_0_0_0_rgba(0,0,0,0.04)] ${rowBg}`}
                    style={{ left: LEFT_OFFSET.tenure, width: COL_W.tenure }}
                  >
                    {tenureLabel(m.joined_at, today)}
                  </td>
                  {showCumulative && (
                    <MetricCells metrics={cumulativeMetrics(myCases, months)} highlight showAmount={false} />
                  )}
                  {months.map((ym, i) => {
                    const metrics = computeMetrics(myCases, ym)
                    return (
                      <MetricCells
                        key={ym}
                        metrics={metrics}
                        highlight={i === 0 && !showCumulative}
                        showAmount={false}
                      />
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[14px] text-gray-400 mt-2 ml-1" style={{ paddingLeft: FIXED_TOTAL }}>
        各メンバーの主たる役割（受注 or 管理）でアサインされた案件のみを集計。
      </div>
    </section>
  )
}

function SubHeaderGroup({ highlight }: { highlight: boolean }) {
  const baseCls = highlight ? 'bg-brand-50/60' : 'bg-gray-50'
  const cellCls = `px-1 py-1 text-center text-[14px] font-semibold border-l border-gray-200 ${baseCls}`
  return (
    <>
      <th className={cellCls + ' border-l-2 border-gray-300'}>新規</th>
      <th className={cellCls}>管理</th>
      <th className={cellCls}>完了</th>
      <th className={cellCls}>サイクル</th>
    </>
  )
}

function MetricCells({
  metrics,
  highlight,
  showAmount,
}: {
  metrics: { newOrders: number; managing: number; completed: number; cycleMonths: number | null; completedAmount: number }
  highlight: boolean
  showAmount: boolean
}) {
  const baseCls = highlight ? 'bg-brand-50/30' : ''
  const cellCls = `px-1.5 py-1.5 text-right font-mono tabular-nums border-l border-gray-100 ${baseCls}`

  const numOrDash = (n: number) => (n > 0 ? n.toLocaleString() : <span className="text-gray-300">-</span>)
  const cycleDisplay = metrics.cycleMonths === null
    ? <span className="text-gray-300">-</span>
    : metrics.cycleMonths.toFixed(1)

  return (
    <>
      <td className={cellCls + ' border-l-2 border-gray-300'}>{numOrDash(metrics.newOrders)}</td>
      <td className={cellCls}>{numOrDash(metrics.managing)}</td>
      <td className={cellCls}>{numOrDash(metrics.completed)}</td>
      <td className={cellCls}>{cycleDisplay}</td>
      {showAmount && (
        <td className={cellCls}>
          {metrics.completedAmount > 0
            ? formatMan(metrics.completedAmount)
            : <span className="text-gray-300">-</span>}
        </td>
      )}
    </>
  )
}
