import Link from 'next/link'
import { tenureLabel, formatMan, type SalesMetricsBundle } from '@/lib/dashboardMetrics'
import UserAvatar from '@/components/ui/UserAvatar'

// 1列グループ = 累計 or 各月。各グループは 9 指標の小列を持つ。
export type MatrixColumn = { key: string; label: string; isCumulative: boolean }
export type MatrixCell = { metrics: SalesMetricsBundle; target: number | null }
export type MatrixMemberRow = {
  id: string
  name: string
  jobType: string | null
  joinedAt: string | null
  avatarUrl: string | null
  achieved: boolean
  cells: MatrixCell[]   // columns と同順
}
export type MatrixTeamGroup = {
  teamName: string
  teamCells: MatrixCell[]   // columns と同順
  members: MatrixMemberRow[]
}

type Props = {
  columns: MatrixColumn[]
  groups: MatrixTeamGroup[]
  today: Date
}

// 左固定列の幅 (px)
const COL_W = { team: 110, name: 150, job: 70, tenure: 90 } as const
const LEFT = {
  team: 0,
  name: COL_W.team,
  job: COL_W.team + COL_W.name,
  tenure: COL_W.team + COL_W.name + COL_W.job,
}
const SUB_W = 64 // 指標小列の幅

/**
 * 受注担当ダッシュボード 年度累計用の「チーム別／個人別」マトリクス。
 * 左に固定列（所属チーム/氏名/職種/在籍期間）、右に [累計][当月][先月]…の月グループを並べ、
 * 各グループは 当月テーブルと同じ 9 指標（面談数/新規受注/目標/受注率/平均単価/完了予定/完了/完了金額/サイクル）。
 * 横スクロールで過去月へ移動できる。
 */
export default function SalesYearMatrixTable({ columns, groups, today }: Props) {
  const totalMembers = groups.reduce((s, g) => s + g.members.length, 0)

  if (totalMembers === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">チーム別／個人別 月次成績（当期）</h3>
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          受注担当のメンバーが登録されていません
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">チーム別／個人別 月次成績（当期）</h3>
        <p className="text-[12px] text-gray-400">左が当期累計、右に行くほど過去月。横スクロールで移動できます。</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="border-collapse text-[13px] w-max">
          <colgroup>
            <col style={{ width: COL_W.team }} />
            <col style={{ width: COL_W.name }} />
            <col style={{ width: COL_W.job }} />
            <col style={{ width: COL_W.tenure }} />
            {columns.flatMap(c =>
              Array.from({ length: 9 }, (_, i) => <col key={`${c.key}-${i}`} style={{ width: SUB_W }} />),
            )}
          </colgroup>

          <thead>
            {/* 月グループのヘッダ */}
            <tr className="bg-gray-50 border-b border-gray-200">
              <StickyTh left={LEFT.team} width={COL_W.team} rowSpan={2}>所属チーム</StickyTh>
              <StickyTh left={LEFT.name} width={COL_W.name} rowSpan={2}>氏名</StickyTh>
              <StickyTh left={LEFT.job} width={COL_W.job} rowSpan={2}>職種</StickyTh>
              <StickyTh left={LEFT.tenure} width={COL_W.tenure} rowSpan={2} borderR>在籍期間</StickyTh>
              {columns.map(c => (
                <th
                  key={c.key}
                  colSpan={9}
                  className={`px-2 py-1.5 text-center font-semibold border-l-2 border-gray-300 ${
                    c.isCumulative ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-700'
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-brand-700">
              {columns.map(c => (
                <SubHeaderGroup key={c.key} highlight={c.isCumulative} />
              ))}
            </tr>
          </thead>

          <tbody>
            {groups.map(g => (
              <TeamGroupRows key={g.teamName} group={g} today={today} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[12px] text-gray-400 mt-2 ml-1">
        受注担当としてアサインされた案件のみを集計。「目標」は各月の個人目標（編集は当月タブ）。
      </div>
    </section>
  )
}

function StickyTh({
  children, left, width, rowSpan, borderR,
}: { children: React.ReactNode; left: number; width: number; rowSpan?: number; borderR?: boolean }) {
  return (
    <th
      className={`sticky bg-gray-50 z-20 px-2 py-2 text-left font-semibold text-gray-600 ${
        borderR ? 'border-r-2 border-gray-300 shadow-[2px_0_0_0_rgba(0,0,0,0.04)]' : 'border-r border-gray-200'
      }`}
      style={{ left, width }}
      rowSpan={rowSpan}
    >
      {children}
    </th>
  )
}

function SubHeaderGroup({ highlight }: { highlight: boolean }) {
  const base = highlight ? 'bg-amber-50/60' : 'bg-gray-50'
  const cell = `px-1 py-1 text-center text-[11px] font-semibold border-l border-gray-200 ${base}`
  return (
    <>
      <th className={cell + ' border-l-2 border-gray-300'}>面談</th>
      <th className={cell}>新規</th>
      <th className={cell}>目標</th>
      <th className={cell}>受注率</th>
      <th className={cell}>単価</th>
      <th className={cell}>完了予定</th>
      <th className={cell}>完了</th>
      <th className={cell}>完了額</th>
      <th className={cell}>サイクル</th>
    </>
  )
}

function TeamGroupRows({ group, today }: { group: MatrixTeamGroup; today: Date }) {
  return (
    <>
      {/* チーム小計 */}
      <tr className="bg-brand-50/50 border-b border-brand-100 font-semibold">
        <td
          className="sticky bg-brand-50 z-10 px-2.5 py-2 text-gray-900"
          style={{ left: LEFT.team, width: COL_W.team }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[13px]">{group.teamName}</span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-brand-200/60 text-brand-800">合計</span>
          </div>
        </td>
        <td className="sticky bg-brand-50 z-10 px-2.5 py-2 text-gray-500 text-[12px]" style={{ left: LEFT.name, width: COL_W.name }}>
          （{group.members.length}人）
        </td>
        <td className="sticky bg-brand-50 z-10 px-2.5 py-2 text-gray-300" style={{ left: LEFT.job, width: COL_W.job }}>-</td>
        <td className="sticky bg-brand-50 z-10 px-2.5 py-2 text-gray-300 border-r-2 border-gray-300 shadow-[2px_0_0_0_rgba(0,0,0,0.04)]" style={{ left: LEFT.tenure, width: COL_W.tenure }}>-</td>
        {group.teamCells.map((cell, i) => (
          <MetricCells key={i} cell={cell} bold showTarget={false} highlight={i === 0} />
        ))}
      </tr>

      {/* 個人行 */}
      {group.members.map((m, idx) => {
        const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
        return (
          <tr key={m.id} className={`border-b border-gray-100 ${rowBg}`}>
            <td className={`sticky z-10 px-2.5 py-2 ${rowBg}`} style={{ left: LEFT.team, width: COL_W.team }}></td>
            <td className={`sticky z-10 px-2.5 py-2 ${rowBg}`} style={{ left: LEFT.name, width: COL_W.name }}>
              <Link href={`/profile/${m.id}`} className="flex items-center gap-1.5 group/name" title={`${m.name} のプロフィール`}>
                <UserAvatar name={m.name} role="sales" url={m.avatarUrl} size="sm" achievedFrame={m.achieved} />
                <span className="text-gray-700 group-hover/name:text-brand-700 group-hover/name:underline truncate">{m.name}</span>
              </Link>
            </td>
            <td className={`sticky z-10 px-2.5 py-2 text-gray-700 ${rowBg}`} style={{ left: LEFT.job, width: COL_W.job }}>
              {m.jobType ?? <span className="text-gray-400">-</span>}
            </td>
            <td className={`sticky z-10 px-2.5 py-2 text-gray-700 border-r-2 border-gray-300 shadow-[2px_0_0_0_rgba(0,0,0,0.04)] ${rowBg}`} style={{ left: LEFT.tenure, width: COL_W.tenure }}>
              {tenureLabel(m.joinedAt, today)}
            </td>
            {m.cells.map((cell, i) => (
              <MetricCells key={i} cell={cell} showTarget highlight={i === 0} achieved={m.achieved} />
            ))}
          </tr>
        )
      })}
    </>
  )
}

function MetricCells({
  cell, bold, showTarget, highlight, achieved,
}: { cell: MatrixCell; bold?: boolean; showTarget: boolean; highlight?: boolean; achieved?: boolean }) {
  const m = cell.metrics
  const base = highlight ? 'bg-amber-50/30' : ''
  const cls = `px-1.5 py-1.5 text-right tabular-nums font-mono border-l border-gray-100 ${base} ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`
  const dim = <span className="text-gray-300">-</span>
  const newOrdersColor = showTarget && cell.target && cell.target > 0
    ? (achieved ? 'text-emerald-700 font-bold' : (m.newOrdersCount < cell.target ? 'text-red-600' : ''))
    : ''
  return (
    <>
      <td className={cls + ' border-l-2 border-gray-300'}>{m.meetingsCount > 0 ? m.meetingsCount : dim}</td>
      <td className={`${cls} ${newOrdersColor}`}>{m.newOrdersCount > 0 ? m.newOrdersCount : dim}</td>
      <td className={`${cls} bg-amber-50/20`}>{cell.target && cell.target > 0 ? cell.target : dim}</td>
      <td className={cls}>{m.conversionRate === null ? dim : `${Math.round(m.conversionRate * 100)}%`}</td>
      <td className={cls}>{m.avgOrderUnit === null ? dim : `${formatMan(m.avgOrderUnit)}万`}</td>
      <td className={cls}>{m.expectedCompletions > 0 ? m.expectedCompletions : dim}</td>
      <td className={cls}>{m.completedCount > 0 ? m.completedCount : dim}</td>
      <td className={cls}>{m.completedAmount > 0 ? `${formatMan(m.completedAmount)}万` : dim}</td>
      <td className={cls}>{m.avgCycleMonths === null ? dim : m.avgCycleMonths.toFixed(1)}</td>
    </>
  )
}
